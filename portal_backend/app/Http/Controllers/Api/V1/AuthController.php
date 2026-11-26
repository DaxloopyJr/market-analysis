<?php

namespace App\Http\Controllers\Api\V1;

use App\DTOs\AuditEventData;
use App\Events\AuditEventOccurred;
use App\Http\Controllers\Concerns\RecordsAuditChanges;
use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\NotificationService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    use RecordsAuditChanges;

    public function login(Request $request)
    {

        $request->validate([
            'login' => ['required_without:email', 'string'],
            'email' => ['required_without:login', 'string'],
            'password' => ['required'],
            'device' => ['nullable', 'string', 'max:80'],
        ]);

        $login = $request->string('login')->toString() ?: $request->string('email')->toString();
        $user = User::where('email', $login)->orWhere('username', $login)->first();

        // Lockout: 3 failed attempts -> locked for 30 minutes
        if ($user?->isLocked()) {
            $this->recordFailedLogin($request, $user, 'account_locked');
            throw ValidationException::withMessages([
                'login' => 'Account locked until '.$user->locked_until->format('d M Y H:i').' after 3 failed attempts. Contact your administrator to unlock sooner.',
            ]);
        }

        if (! $user || ! Hash::check($request->password, $user->password)) {
            if ($user) {
                $user->increment('failed_attempts');
                if ($user->failed_attempts >= 3) {
                    $user->update(['failed_attempts' => 0, 'locked_until' => now()->addMinutes(30)]);
                    $this->recordFailedLogin($request, $user, 'lockout_threshold_reached');
                    throw ValidationException::withMessages([
                        'login' => 'Too many failed attempts. Your account has been locked for 30 minutes, or contact your administrator for activation.',
                    ]);
                }
                $this->recordFailedLogin($request, $user, 'invalid_credentials');
                throw ValidationException::withMessages(['login' => 'Invalid credentials. '.(3 - $user->failed_attempts).' attempt(s) remaining before lockout.']);
            }
            $this->recordFailedLogin($request, null, 'invalid_credentials');
            throw ValidationException::withMessages(['login' => 'Invalid credentials.']);
        }

        $user->update(['failed_attempts' => 0, 'locked_until' => null]);
        if (! $user->is_active || $user->status !== 'active') {
            $this->recordFailedLogin($request, $user, 'account_inactive');
            abort(403, 'Account is deactivated. Contact the administrator.');
        }

        if ($user->mfa_enabled) {
            return $this->beginMfaLogin($user);
        }

        return $this->completeLogin($request, $user);
    }

    /** Passwords alone never issue a token when MFA is enabled. */
    private function beginMfaLogin(User $user)
    {
        [$challengeId, $challenge, $code] = $this->issueMfaChallenge($user);
        $sent = $this->sendMfaCode($user, $challenge, $code);
        if (! $sent) {
            return response()->json([
                'status' => 'error',
                'message' => 'Your password was accepted, but the verification code could not be sent. Try again or contact the administrator.',
            ], 502);
        }

        return response()->json([
            'status' => 'success',
            'message' => 'Enter the verification code sent to your registered destination.',
            'data' => $this->mfaChallengeResponse($challengeId, $challenge, $code),
        ], 202);
    }

    public function verifyMfa(Request $request)
    {
        $data = $request->validate([
            'challenge_id' => ['required', 'string', 'size:64'],
            'code' => ['required', 'digits:6'],
            'device' => ['nullable', 'string', 'max:80'],
        ]);

        $user = DB::transaction(function () use ($data) {
            $challenge = DB::table('mfa_challenges')
                ->where('token_hash', hash('sha256', $data['challenge_id']))
                ->lockForUpdate()
                ->first();

            if (! $challenge || $challenge->used_at || strtotime((string) $challenge->expires_at) < now()->getTimestamp()) {
                throw ValidationException::withMessages(['code' => 'Invalid or expired verification challenge. Sign in again.']);
            }
            if ($challenge->attempts >= 5) {
                throw ValidationException::withMessages(['code' => 'Too many attempts. Sign in again to request a new code.']);
            }
            if (! Hash::check($data['code'], $challenge->code)) {
                DB::table('mfa_challenges')->where('id', $challenge->id)->increment('attempts');

                return null;
            }

            $user = User::find($challenge->user_id);
            abort_unless($user && $user->is_active && $user->status === 'active' && $user->mfa_enabled, 403, 'This verification challenge is no longer valid.');

            DB::table('mfa_challenges')->where('id', $challenge->id)->update([
                'used_at' => now(),
                'updated_at' => now(),
            ]);

            return $user;
        });
        if (! $user) {
            throw ValidationException::withMessages(['code' => 'Invalid verification code.']);
        }

        return $this->completeLogin($request, $user);
    }

    public function resendMfa(Request $request)
    {
        $data = $request->validate(['challenge_id' => ['required', 'string', 'size:64']]);
        $challenge = DB::table('mfa_challenges')
            ->where('token_hash', hash('sha256', $data['challenge_id']))
            ->whereNull('used_at')
            ->where('expires_at', '>=', now())
            ->first();
        if (! $challenge) {
            throw ValidationException::withMessages(['challenge_id' => 'This verification challenge has expired. Sign in again.']);
        }

        $user = User::find($challenge->user_id);
        abort_unless($user && $user->is_active && $user->status === 'active' && $user->mfa_enabled, 403, 'This verification challenge is no longer valid.');

        $code = $this->newOtp();
        DB::table('mfa_challenges')->where('id', $challenge->id)->update([
            'code' => Hash::make($code),
            'attempts' => 0,
            'expires_at' => now()->addMinutes(10),
            'updated_at' => now(),
        ]);
        $challenge = DB::table('mfa_challenges')->find($challenge->id);

        if (! $this->sendMfaCode($user, $challenge, $code)) {
            return response()->json(['status' => 'error', 'message' => 'Could not resend the verification code. Try again shortly.'], 502);
        }

        return response()->json([
            'status' => 'success',
            'message' => 'A new verification code has been sent.',
            'data' => $this->mfaChallengeResponse($data['challenge_id'], $challenge, $code),
        ]);
    }

    private function issueMfaChallenge(User $user): array
    {
        $method = $user->mfa_method ?: 'email';
        $destination = $method === 'email' ? $user->email : $user->phone;
        abort_if($method === 'sms' && ! $destination, 422, 'No mobile number is registered for MFA. Choose email or contact the administrator.');

        $challengeId = Str::random(64);
        $code = $this->newOtp();
        $id = DB::table('mfa_challenges')->insertGetId([
            'user_id' => $user->id,
            'token_hash' => hash('sha256', $challengeId),
            'method' => $method,
            'destination' => $destination,
            'code' => Hash::make($code),
            'attempts' => 0,
            'expires_at' => now()->addMinutes(10),
            'used_at' => null,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return [$challengeId, DB::table('mfa_challenges')->find($id), $code];
    }

    private function sendMfaCode(User $user, object $challenge, string $code): bool
    {
        return $challenge->method === 'email'
            ? NotificationService::sendOtpEmail($user, $code, 'sign-in verification')
            : NotificationService::sendOtpSms($user, $code, 'sign-in');

    }

    private function mfaChallengeResponse(string $challengeId, object $challenge, string $code): array
    {
        $response = [
            'mfa_required' => true,
            'challenge_id' => $challengeId,
            'method' => $challenge->method,
            'masked_destination' => NotificationService::mask($challenge->destination, $challenge->method),
            'expires_at' => $challenge->expires_at,
        ];
        if (! app()->environment('production')) {
            $response['dev_code'] = $code;
        }

        return $response;
    }

    private function newOtp(): string
    {
        return str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);
    }

    private function completeLogin(Request $request, User $user)
    {
        $user->update(['last_login_at' => now()]);
        $token = $user->createToken($request->device ?? 'portal', ['*'], now()->addHours(12));

        AuditEventOccurred::dispatch(new AuditEventData(
            eventType: 'login',
            userId: $user->id,
            entityType: 'user',
            entityId: (string) $user->id,
            ipAddress: $request->attributes->get('auditIpAddress', $request->ip()),
            requestId: $request->attributes->get('auditRequestId'),
            reason: 'Mtumiaji ameingia kwenye mfumo.',
        ));

        return response()->json([
            'status' => 'success',
            'data' => [
                'token' => $token->plainTextToken,
                'token_type' => 'Bearer',
                'expires_at' => $token->accessToken->expires_at,
                'user' => $this->profile($user),
            ],
        ]);
    }

    private function recordFailedLogin(Request $request, ?User $target, string $reason): void
    {
        // Akaunti inayolengwa si uthibitisho wa aliyefanya jaribio; actor hubaki anonymous.
        // Usinakili request body, credentials au token kwenye audit.
        AuditEventOccurred::dispatch(new AuditEventData(
            eventType: 'loginFailed',
            actorType: 'anonymous',
            entityType: $target === null ? null : 'user',
            entityId: $target === null ? null : (string) $target->id,
            ipAddress: $request->attributes->get('auditIpAddress', $request->ip()),
            requestId: $request->attributes->get('auditRequestId'),
            reason: $reason,
        ));
    }

    public function me(Request $request)
    {
        return response()->json(['status' => 'success', 'data' => $this->profile($request->user())]);
    }

    public function logout(Request $request)
    {
        $user = $request->user();
        $request->user()->currentAccessToken()?->delete();

        // $this->auditChange('logout', "{$user->email} logged out", $user, 'auth');
        AuditEventOccurred::dispatch(new AuditEventData(
            eventType: 'logout',
            userId: $user->id,
            entityType: 'user',
            entityId: (string) $user->id,
            ipAddress: $request->attributes->get('auditIpAddress', $request->ip()),
            requestId: $request->attributes->get('auditRequestId'),
            reason: 'Mtumiaji ametoka kwenye mfumo.',
        ));

        return response()->json(['status' => 'success', 'message' => 'Logged out.']);
    }

    public function changePassword(Request $request)
    {
        $data = $request->validate([
            'current_password' => ['required'],
            'password' => ['required', 'confirmed', 'min:8'],
        ]);
        $user = $request->user();
        abort_unless(Hash::check($data['current_password'], $user->password), 422, 'Current password is incorrect.');
        $user->update(['password' => $data['password']]);
        // $this->auditChange('edit', "{$user->email} changed password", $user, 'auth');
        AuditEventOccurred::dispatch(new AuditEventData(
            eventType: 'change_password',
            userId: $user->id,
            entityType: 'user',
            entityId: (string) $user->id,
            ipAddress: $request->attributes->get('auditIpAddress', $request->ip()),
            requestId: $request->attributes->get('auditRequestId'),
            reason: 'Mtumiaji amechange password yake.',
        ));

        return response()->json(['status' => 'success', 'message' => 'Password updated.']);
    }

    private function profile(User $user): array
    {
        return [
            'id' => $user->id,
            'name' => $user->name,
            'username' => $user->username,
            'email' => $user->email,
            'phone' => $user->phone,
            'mfa_enabled' => $user->mfa_enabled,
            'mfa_method' => $user->mfa_method,
            'institution_id' => $user->institution_id,
            'department_id' => $user->department_id,
            'institution' => $user->institution?->only('id', 'name', 'code', 'profile_image_url'),
            'department' => $user->department?->only('id', 'name', 'code'),
            'roles' => $user->roles()->select('code', 'name')->get(),
            'permissions' => $user->permissionCodes(),
            'delegated_roles' => $user->delegatedRoleCodes(),
            'last_login_at' => $user->last_login_at,
            'menu' => $this->menuFor($user),
        ];
    }

    /** Dynamic navigation menu filtered by the user's permissions (drives the React sidebar). */
    private function menuFor(User $user): array
    {
        $perms = $user->permissionCodes();
        $can = fn (string ...$codes) => (bool) array_intersect($codes, $perms);

        $menu = [];
        if ($can('dashboard.view')) {
            $menu[] = ['key' => 'dashboard', 'label' => 'Dashboard', 'path' => '/dashboard', 'icon' => 'Dashboard'];
        }
        if ($can('submissions.create', 'submissions.view.scope', 'submissions.view.approved', 'submissions.review', 'submissions.approve', 'submissions.publish')) {
            $menu[] = ['key' => 'submissions', 'label' => 'Submissions', 'path' => '/submissions', 'icon' => 'UploadFile'];
        }
        if ($can('datasets.configure', 'datasets.view', 'datasets.view.ministry', 'data_consumers.configure', 'submission_periods.configure')) {
            $children = [];
            if ($can('datasets.configure', 'datasets.view', 'datasets.view.ministry')) {
                $children[] = ['key' => 'datasets', 'label' => 'Datasets', 'path' => '/dataset-management/datasets'];
            }
            if ($can('data_consumers.configure')) {
                $children[] = ['key' => 'data-consumers', 'label' => 'Data Consumers', 'path' => '/dataset-management/consumers'];
            }
            if ($can('submission_periods.configure', 'submission_periods.view')) {
                $children[] = ['key' => 'submission-periods', 'label' => 'Submission Periods', 'path' => '/dataset-management/periods'];
            }
            $menu[] = ['key' => 'dataset-management', 'label' => 'Dataset Management', 'icon' => 'Database', 'children' => $children];
        }
        if ($can('institutions.manage', 'institutions.view.ministry', 'departments.view', 'users.manage.ministry', 'roles.manage', 'portal_settings.manage', 'approval_circle.manage.ministry', 'users.manage.institution', 'approval_circle.manage.institution')) {
            $children = [];
            if ($can('institutions.manage', 'institutions.view.own', 'institutions.view.ministry')) {
                $children[] = ['key' => 'institutions', 'label' => 'Institutions', 'path' => '/administration/institutions'];
            }
            if ($can('departments.manage', 'departments.view')) {
                $children[] = ['key' => 'departments', 'label' => 'Ministry Departments', 'path' => '/administration/departments'];
            }
            if ($can('institutional_admins.manage')) {
                $children[] = ['key' => 'institutional-admins', 'label' => 'Institutional Admins', 'path' => '/administration/institutional-admins'];
            }
            if ($can('users.manage.ministry', 'users.manage.institution')) {
                $children[] = ['key' => 'users', 'label' => 'Users', 'path' => '/administration/users'];
            }
            if ($can('roles.manage')) {
                $children[] = ['key' => 'roles', 'label' => 'Roles & Permissions', 'path' => '/administration/roles'];
            }
            if ($can('portal_settings.manage')) {
                $children[] = ['key' => 'portal-settings', 'label' => 'Portal Settings', 'path' => '/administration/settings'];
            }
            if ($can('approval_circle.manage.ministry', 'approval_circle.manage.institution')) {
                $children[] = ['key' => 'approval-circle', 'label' => 'Approval Circle', 'path' => '/administration/approval-circle'];
            }
            if ($can('roles.manage')) {
                $children[] = ['key' => 'delegations', 'label' => 'Delegations', 'path' => '/administration/delegations'];
            }
            $menu[] = ['key' => 'administration', 'label' => 'Administration', 'icon' => 'Settings', 'children' => $children];
        }
        if ($can('analytics.view.ministry', 'analytics.view.institution', 'analytics.view.own')) {
            $menu[] = ['key' => 'analytics', 'label' => 'Institution Analytics', 'path' => '/analytics', 'icon' => 'Insights'];
        }
        $genericReportPermissions = ['reports.view.ministry', 'reports.view.institution', 'reports.view.own'];
        if ($user->hasRole('MOA') || collect($perms)->contains(fn (string $code) => str_starts_with($code, 'reports.view.')
            && ! in_array($code, $genericReportPermissions, true))) {
            $menu[] = ['key' => 'reports', 'label' => 'Reports', 'path' => '/reports', 'icon' => 'Assessment'];
        }
        if ($can('audit_logs.view.ministry', 'audit_logs.view.institution')) {
            $menu[] = ['key' => 'audit-logs', 'label' => 'Audit Logs', 'path' => '/audit-logs', 'icon' => 'History'];
        }

        return $menu;
    }

    /** Update own profile (name, username, email, phone). */
    public function updateProfile(Request $request)
    {
        $user = $request->user();
        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:160'],
            'username' => ['nullable', 'string', 'max:60', Rule::unique('users', 'username')->ignore($user->id)],
            'email' => ['sometimes', 'email', Rule::unique('users', 'email')->ignore($user->id)],
            'phone' => ['nullable', 'string', 'max:20'],
        ]);
        abort_if($user->mfa_enabled && $user->mfa_method === 'sms'
            && array_key_exists('phone', $data) && empty($data['phone']),
            422, 'A phone number is required while SMS MFA is enabled.');
        $old = $user->only(['name', 'username', 'email', 'phone']);
        $user->update($data);
        $this->auditChange('edit', "{$user->email} updated their profile", $user, 'profile', $old, $user->only(['name', 'username', 'email', 'phone']));

        return response()->json(['status' => 'success', 'message' => 'Profile updated.', 'data' => $this->profile($user->refresh())]);
    }

    /** Opt in or out of MFA. Password confirmation protects this security setting. */
    public function updateMfa(Request $request)
    {
        $user = $request->user();
        abort_unless($user->hasRole('MOA') || ($user->hasRole('IA') && $user->institution_id !== null), 403, 'Only the Ministry Overall Administrator or Institution Administrator can manage MFA.');
        $data = $request->validate([
            'current_password' => ['required', 'string'],
            'mfa_enabled' => ['required', 'boolean'],
            'mfa_method' => ['nullable', Rule::in(['email', 'sms'])],
        ]);
        abort_unless(Hash::check($data['current_password'], $user->password), 422, 'Current password is incorrect.');

        $enabled = $request->boolean('mfa_enabled');
        $method = $enabled ? ($data['mfa_method'] ?? 'email') : null;
        abort_if($enabled && $method === 'sms' && ! $user->phone, 422, 'Add a phone number to your profile before enabling SMS MFA.');

        $old = $user->only(['mfa_enabled', 'mfa_method']);
        $user->update(['mfa_enabled' => $enabled, 'mfa_method' => $method]);
        DB::table('mfa_challenges')->where('user_id', $user->id)->whereNull('used_at')->update(['used_at' => now(), 'updated_at' => now()]);
        $this->auditChange('configure', "{$user->email} updated their MFA preference", $user, 'profile', $old, $user->only(['mfa_enabled', 'mfa_method']));

        return response()->json([
            'status' => 'success',
            'message' => $enabled ? 'Multi-factor authentication enabled.' : 'Multi-factor authentication disabled.',
            'data' => $this->profile($user->refresh()),
        ]);
    }

    /** Preview the masked destination for a login+method WITHOUT sending anything. */
    public function resetDestinationLookup(Request $request)
    {
        $data = $request->validate([
            'login' => ['required', 'string'],
            'method' => ['required', Rule::in(['email', 'sms'])],
        ]);
        $user = User::where('email', $data['login'])->orWhere('username', $data['login'])->first();

        if (! $user) {
            return response()->json(['status' => 'success', 'masked_destination' => null, 'has_destination' => false]);
        }
        $destination = $data['method'] === 'email' ? $user->email : $user->phone;
        if (! $destination) {
            return response()->json(['status' => 'success', 'masked_destination' => null, 'has_destination' => false]);
        }

        return response()->json([
            'status' => 'success',
            'masked_destination' => NotificationService::mask($destination, $data['method']),
            'has_destination' => true,
        ]);
    }

    /**
     * Forgot password - choose reset method (email or SMS). Sends a 6-digit OTP.
     * Wire the send via your mailer/SMS gateway in the notifier hook below.
     */
    public function forgotPassword(Request $request)
    {
        $data = $request->validate([
            'login' => ['required', 'string'],
            'method' => ['required', Rule::in(['email', 'sms'])],
        ]);

        $user = User::where('email', $data['login'])->orWhere('username', $data['login'])->first();

        // Generic response - never reveal whether the account exists
        $generic = ['status' => 'success', 'message' => 'If the account exists, a reset code has been sent via '.$data['method'].'.'];
        if (! $user) {
            return response()->json($generic);
        }
        if ($data['method'] === 'sms' && ! $user->phone) {
            return response()->json(['status' => 'error', 'message' => 'No mobile number on record for this account. Use email or contact the administrator.'], 422);
        }

        $code = str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);
        $destination = $data['method'] === 'email' ? $user->email : $user->phone;

        DB::table('password_reset_codes')->updateOrInsert(
            ['user_id' => $user->id, 'method' => $data['method']],
            [
                'destination' => $destination,
                'code' => Hash::make($code),
                'attempts' => 0,
                'expires_at' => now()->addMinutes(10),
                'used_at' => null,
                'created_at' => now(),
                'updated_at' => now(),
            ]
        );

        // Send via the chosen channel (SMTP/Mailtrap for email, Beem HTTP API for SMS)
        $sent = $data['method'] === 'email'
            ? NotificationService::sendOtpEmail($user, $code)
            : NotificationService::sendOtpSms($user, $code);
        if (! $sent) {
            return response()->json(['status' => 'error', 'message' => 'Could not send the reset code via '.$data['method'].'. Try the other method or contact the administrator.'], 502);
        }
        $this->auditChange('create', "Password reset code sent via {$data['method']}", $user, 'auth');

        $masked = NotificationService::mask($destination, $data['method']);
        if (app()->environment('production')) {
            return response()->json($generic + ['masked_destination' => $masked]);
        }

        // Development aid only - remove when going live
        return response()->json($generic + ['masked_destination' => $masked, 'dev_code' => $code]);
    }

    /** Reset password with the received OTP. */
    public function resetPassword(Request $request)
    {
        $data = $request->validate([
            'login' => ['required', 'string'],
            'method' => ['required', Rule::in(['email', 'sms'])],
            'code' => ['required', 'digits:6'],
            'password' => ['required', 'confirmed', 'min:8'],
        ]);

        $user = User::where('email', $data['login'])->orWhere('username', $data['login'])->first();
        $rec = $user ? DB::table('password_reset_codes')
            ->where('user_id', $user->id)->where('method', $data['method'])
            ->whereNull('used_at')->where('expires_at', '>=', now())->first() : null;

        if (! $user || ! $rec || ! Hash::check($data['code'], $rec->code)) {
            if ($rec) {
                DB::table('password_reset_codes')->where('id', $rec->id)->increment('attempts');
            }
            throw ValidationException::withMessages(['code' => 'Invalid or expired reset code.']);
        }
        if ($rec->attempts >= 5) {
            throw ValidationException::withMessages(['code' => 'Too many attempts. Request a new code.']);
        }

        DB::table('password_reset_codes')->where('id', $rec->id)->update(['used_at' => now()]);
        $user->update(['password' => $data['password'], 'failed_attempts' => 0, 'locked_until' => null]);
        $user->tokens()->delete(); // force re-login everywhere
        $this->auditChange('edit', "Password reset via {$data['method']} OTP", $user, 'auth');

        return response()->json(['status' => 'success', 'message' => 'Password reset successfully. Please sign in with your new password.']);
    }

    /** Set a new password via an activation/reset link token (public). */
    public function activate(Request $request)
    {
        $data = $request->validate([
            'login' => ['required', 'string'],
            'token' => ['required', 'string'],
            'password' => ['required', 'confirmed', 'min:8'],
        ]);

        $user = User::where('email', $data['login'])->orWhere('username', $data['login'])->first();
        $rec = $user ? DB::table('password_reset_codes')
            ->where('user_id', $user->id)->whereIn('method', ['activation', 'reset-link'])
            ->whereNull('used_at')->where('expires_at', '>=', now())->first() : null;

        if (! $user || ! $rec || ! Hash::check($data['token'], $rec->code)) {
            throw ValidationException::withMessages(['token' => 'Invalid or expired link. Ask your administrator for a new one.']);
        }
        if ($rec->attempts >= 5) {
            throw ValidationException::withMessages(['token' => 'Link exhausted. Request a new one.']);
        }

        DB::table('password_reset_codes')->where('id', $rec->id)->update(['used_at' => now()]);
        $user->update(['password' => $data['password'], 'failed_attempts' => 0, 'locked_until' => null]);
        $user->tokens()->delete();
        $this->auditChange('edit', 'Account activated / password set via link', $user, 'auth');

        return response()->json(['status' => 'success', 'message' => 'Password set successfully. You can now sign in.']);
    }
}
