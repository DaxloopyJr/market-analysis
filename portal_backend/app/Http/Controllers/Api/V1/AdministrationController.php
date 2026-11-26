<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Concerns\RecordsAuditChanges;
use App\Http\Controllers\Controller;
use App\Models\ApprovalCircleStep;
use App\Models\DatasetDefinition;
use App\Models\Delegation;
use App\Models\Department;
use App\Models\Institution;
use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use App\Services\DashboardService;
use App\Services\NotificationService;
use App\Services\SubmissionService;
use App\Services\WorkflowConfigurationService;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * Administration module: Institutions, Ministry Departments, Institutional Admins,
 * Users, Roles & Permissions, Portal Settings, Approval Circle.
 */
class AdministrationController extends Controller
{
    use RecordsAuditChanges;

    /* ---------------- Institutions ---------------- */

    public function institutions(Request $request)
    {
        $q = Institution::withCount('users');
        if ($request->user()->hasRole('IA', 'IAU') && ! $request->user()->hasRole('MOA', 'MAU')) {
            $q->where('id', $request->user()->institution_id); // IA sees own record only
        }

        return $this->organisationListing($request, $q, 'institutions', 'institution_id');
    }

    public function storeInstitution(Request $request)
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:160'],
            'code' => ['required', 'string', 'max:20', 'unique:institutions,code'],
            'type' => [Rule::in(['institution', 'agency', 'commission'])],
            'description' => ['nullable', 'string'],
        ]);
        $inst = Institution::create($data + ['is_active' => true]);
        $this->auditChange('create', "Institution [{$inst->name}] added", $inst, 'institutions');

        return response()->json(['status' => 'success', 'data' => $inst], 201);
    }

    public function updateInstitution(Request $request, Institution $institution)
    {
        $old = $institution->only(['name', 'code', 'description', 'is_active', 'status']);
        $institution->update($request->validate([
            'name' => ['sometimes', 'string', 'max:160'],
            'code' => ['sometimes', 'string', 'max:20', Rule::unique('institutions', 'code')->ignore($institution->id)],
            'description' => ['nullable', 'string'],
            'is_active' => ['boolean'],
            'status' => ['nullable', 'in:active,inactive'],
        ]));
        $this->auditChange('edit', "Institution [{$institution->name}] updated", $institution, 'institutions', $old, $institution->only(['name', 'code', 'description', 'is_active']));

        return response()->json(['status' => 'success', 'data' => $institution->refresh()]);
    }

    /* ---------------- Ministry Departments ---------------- */

    public function institutionProfileImage(Request $request, Institution $institution): JsonResponse
    {
        $actor = $request->user();
        abort_unless($actor->is_active && $actor->status === 'active'
            && ($actor->hasRole('MOA') || ($actor->hasRole('IA') && (int) $actor->institution_id === (int) $institution->id)), 403);
        $request->validate(['profileImage' => ['present', 'nullable', 'image', 'mimes:jpg,jpeg,png,webp', 'max:2048', 'dimensions:max_width=2000,max_height=2000']]);
        $newPath = null;
        $oldPath = null;
        try {
            DB::transaction(function () use ($request, $institution, &$newPath, &$oldPath) {
                $locked = Institution::lockForUpdate()->findOrFail($institution->id);
                $oldPath = $locked->profile_image_path;
                if ($request->hasFile('profileImage')) {
                    $newPath = $request->file('profileImage')->store('institutions/'.$institution->id, 'public');
                    if (! is_string($newPath)) {
                        throw new \RuntimeException('Institution image could not be stored.');
                    }
                }
                $locked->profile_image_path = $newPath;
                $locked->save();
                $this->auditChange('institution_profile_image_updated', 'Institution profile image updated', $locked, 'institutions',
                    ['profile_image_path' => $oldPath], ['profile_image_path' => $newPath]);
            });
        } catch (\Throwable $exception) {
            if (is_string($newPath)) {
                Storage::disk('public')->delete($newPath);
            }
            throw $exception;
        }
        if ($oldPath && $oldPath !== $newPath) {
            Storage::disk('public')->delete($oldPath);
        }

        return response()->json(['status' => 'success', 'data' => $institution->refresh()]);
    }

    public function departments(Request $request)
    {
        return $this->organisationListing($request, Department::withCount('users'), 'departments', 'department_id');
    }

    private function organisationListing(Request $request, Builder $query, string $table, string $ownerColumn): JsonResponse
    {
        $user = $request->user();
        $ministry = $user->institution?->code === 'MIT' && $user->institution->is_active && $user->institution->status === 'active';
        if (! $user->hasRole('MOA') && $user->hasRole('MDO', 'MDD', 'MAU')) {
            abort_unless($ministry && $user->canDo('datasets.view.ministry'), 403);
        }
        $filters = $request->validate([
            'search' => ['sometimes', 'nullable', 'string', 'max:160'],
            'perPage' => ['sometimes', 'integer', 'between:1,100'],
            'page' => ['sometimes', 'integer', 'min:1'],
        ]);
        $datasets = DatasetDefinition::where('status', 'active')
            ->whereColumn($ownerColumn, $table.'.id')->selectRaw('COUNT(*)');
        $pending = app(DashboardService::class)->pending(app(SubmissionService::class)->query($user), $user, $ministry)
            ->whereHas('calendar.dataset', fn ($q) => $q->whereColumn($ownerColumn, $table.'.id'))
            ->selectRaw('COUNT(*)');
        $query->addSelect(['active_datasets_count' => $datasets, 'pending_review_count' => $pending])
            ->withCasts(['active_datasets_count' => 'integer', 'pending_review_count' => 'integer']);
        if (filled($filters['search'] ?? null)) {
            $search = '%'.mb_strtolower($filters['search']).'%';
            $query->where(fn ($q) => $q->whereRaw('LOWER(name) LIKE ?', [$search])->orWhereRaw('LOWER(code) LIKE ?', [$search]));
        }

        return response()->json(['status' => 'success', 'data' => $query->orderBy('name')->orderBy('id')
            ->paginate($filters['perPage'] ?? 20)->appends($filters)]);
    }

    public function storeDepartment(Request $request)
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:160'],
            'code' => ['required', 'string', 'max:20', 'unique:departments,code'],
            'parent_department_id' => ['nullable', 'exists:departments,id'],
            'description' => ['nullable', 'string'],
        ]);
        $dept = Department::create($data + ['is_active' => true]);
        $this->auditChange('create', "Ministry department [{$dept->name}] added", $dept, 'departments');

        return response()->json(['status' => 'success', 'data' => $dept], 201);
    }

    public function updateDepartment(Request $request, Department $department)
    {
        $department->update($request->validate([
            'name' => ['sometimes', 'string', 'max:160'],
            'parent_department_id' => ['nullable', 'exists:departments,id'],
            'description' => ['nullable', 'string'],
            'is_active' => ['boolean'],
            'status' => ['nullable', 'in:active,inactive'],
        ]));
        $this->auditChange('edit', "Ministry department [{$department->name}] updated", $department, 'departments');

        return response()->json(['status' => 'success', 'data' => $department->refresh()]);
    }

    /* ---------------- Users (ministry + institutional) ---------------- */

    public function users(Request $request)
    {
        $user = $request->user();
        $q = User::with(['institution:id,name', 'department:id,name', 'roles:id,code,name,is_system'])
            ->filter($request->only(['search', 'role', 'institution_id', 'department_id']));
        if ($user->hasRole('IA') && ! $user->hasRole('MOA')) {
            $q->where('institution_id', $user->institution_id); // scoped visibility
        }

        return response()->json(['status' => 'success', 'data' => $q->paginate(20)]);
    }

    public function Singleuser(Request $request, $id)
    {
        $user = User::findorFail($id);
        $this->authorizeUserScope($request->user(), $user);

        return response()->json(['status' => 'success', 'data' => $user->load(['institution:id,name', 'department:id,name', 'roles:id,code,name,is_system'])]);
    }

    public function storeUser(Request $request)
    {
        $user = $request->user();
        $data = $request->validate([
            'name' => ['required', 'string', 'max:160'],
            'username' => ['nullable', 'string', 'max:60', 'unique:users,username'],
            'email' => ['required', 'email', 'unique:users,email'],
            'phone' => ['nullable', 'string', 'max:20'],
            'password' => ['nullable', 'min:8'],   // omitted -> activation email is sent instead
            'institution_id' => ['nullable', 'exists:institutions,id'],
            'department_id' => ['nullable', 'exists:departments,id'],
            'status' => ['nullable', 'in:active,inactive'],
            'role_ids' => ['required', 'array', 'min:1'],
            'role_ids.*' => ['exists:roles,id'],
            'mfa_enabled' => ['sometimes', 'boolean'],
            'mfa_method' => ['nullable', Rule::in(['email', 'sms'])],
        ]);
        $data = $this->prepareMfaData($data);
        if ($user->hasRole('IA') && ! $user->hasRole('MOA')) {
            $data['institution_id'] = $user->institution_id; // IA can only add own institution users
            $data['department_id'] = null;
        }
        $this->authorizeMfaManagement($user, $request, null, $data['institution_id'] ?? null);
        $this->authorizeRoleAssignments($user, $data['role_ids'], $data['institution_id'] ?? null);
        abort_if($user->hasRole('DDO') || $user->hasRole('IA') && $data['institution_id'] === null && ! $user->hasRole('MOA'), 403);

        $sendActivation = empty($data['password']);
        $newUser = DB::transaction(function () use ($data, $sendActivation) {
            if ($sendActivation) {
                $data['password'] = Str::random(48); // unguessable until the user sets their own
            }
            $u = User::create(collect($data)->except('role_ids')->all());
            $u->roles()->syncWithPivotValues($data['role_ids'], [
                'institution_id' => $u->institution_id,
                'department_id' => $u->department_id,
                'effective_from' => now(),
                'status' => 'active',
            ]);

            return $u;
        });

        $message = 'User created.';
        if ($sendActivation) {
            $token = NotificationService::issueToken($newUser, 'activation');
            NotificationService::sendAccountActivationEmail($newUser, $token);
            $message = 'User created. An activation link was sent to '.$newUser->email.' to set their password.';
        }
        $this->auditChange('create', "User [{$newUser->email}] created".($sendActivation ? ' (activation email)' : ''), $newUser, 'users');

        return response()->json(['status' => 'success', 'message' => $message, 'data' => $newUser->load(['roles', 'institution', 'department'])], 201);
    }

    public function updateUser(Request $request, User $user)
    {
        $actor = $request->user();
        $this->authorizeUserScope($actor, $user);
        $this->authorizeMfaManagement($actor, $request, $user);
        abort_if($actor->hasRole('IA') && ! $actor->hasRole('MOA') && $user->institution_id !== $actor->institution_id, 403, 'Outside your institution scope.');
        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:160'],
            'username' => ['nullable', 'string', 'max:60', Rule::unique('users', 'username')->ignore($user->id)],
            'phone' => ['nullable', 'string', 'max:20'],
            'is_active' => ['boolean'],
            'status' => ['nullable', 'in:active,inactive'],
            'role_ids' => ['sometimes', 'array'],
            'role_ids.*' => ['exists:roles,id'],
            'password' => ['nullable', 'min:8'],
            'mfa_enabled' => ['sometimes', 'boolean'],
            'mfa_method' => ['nullable', Rule::in(['email', 'sms'])],
        ]);
        $data = $this->prepareMfaData($data, $user);
        if (isset($data['role_ids'])) {
            $this->authorizeRoleAssignments($actor, $data['role_ids'], $user->institution_id);
        }
        if (isset($data['password'])) {
            $data['password'] = Hash::make($data['password']);
        }
        DB::transaction(function () use ($user, $data) {
            if (isset($data['status'])) {
                $data['is_active'] = $data['status'] === 'active';
            }
            if (isset($data['is_active'])) {
                $data['status'] = $data['is_active'] ? 'active' : 'inactive';
            }
            $user->update(collect($data)->except('role_ids')->toArray());
            if (array_key_exists('mfa_enabled', $data) || array_key_exists('mfa_method', $data)) {
                DB::table('mfa_challenges')->where('user_id', $user->id)->whereNull('used_at')->update(['used_at' => now(), 'updated_at' => now()]);
            }
            if (isset($data['role_ids'])) {
                $user->roles()->syncWithPivotValues($data['role_ids'], [
                    'institution_id' => $user->institution_id,
                    'department_id' => $user->department_id,
                    'effective_from' => now(),
                    'status' => 'active',
                ]);
            }
        });
        $this->auditChange('edit', "User [{$user->email}] updated", $user, 'users');

        return response()->json(['status' => 'success', 'data' => $user->refresh()->load('roles')]);
    }

    /* ---------------- Roles & Permissions ---------------- */

    public function roles(Request $request)
    {
        return response()->json(['status' => 'success', 'data' => Role::with('permissions')->get()]);
    }

    public function permissions(Request $request)
    {
        return response()->json(['status' => 'success', 'data' => Permission::orderBy('code')->get()]);
    }

    public function storeRole(Request $request)
    {
        $data = $request->validate([
            'code' => ['required', 'string', 'max:20', 'unique:roles,code'],
            'name' => ['required', 'string', 'max:120'],
            'level' => [Rule::in(['ministry', 'institution'])],
            'permission_ids' => ['array'],
            'permission_ids.*' => ['exists:permissions,id'],
        ]);
        $role = Role::create(collect($data)->except('permission_ids')->all() + ['is_active' => true, 'status' => 'active', 'is_system' => false]);
        $role->permissions()->sync($data['permission_ids'] ?? []);
        $this->auditChange('configure', "Role [{$role->code}] created with permissions", $role, 'roles');

        return response()->json(['status' => 'success', 'data' => $role->load('permissions')], 201);
    }

    public function updateRole(Request $request, Role $role)
    {
        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:120'],
            'description' => ['nullable', 'string'],
            'is_active' => ['boolean'],
            'permission_ids' => ['sometimes', 'array'],
            'permission_ids.*' => ['exists:permissions,id'],
        ]);
        abort_if($role->is_system && ($request->filled('is_active') || $request->filled('status')) && ! ($request->boolean('is_active') ?? true), 403, 'System roles cannot be deactivated.');
        DB::transaction(function () use ($role, $data) {
            $role->update(collect($data)->except('permission_ids')->toArray());
            if (isset($data['permission_ids'])) {
                $role->permissions()->sync($data['permission_ids']);
            }
        });
        $this->auditChange('configure', "Role [{$role->code}] permissions updated", $role, 'roles');

        return response()->json(['status' => 'success', 'data' => $role->refresh()->load('permissions')]);
    }

    /* ---------------- Approval Circle ---------------- */

    public function approvalCircles(Request $request)
    {
        return app(WorkflowConfigurationController::class)->index($request, app(WorkflowConfigurationService::class));
    }

    public function storeApprovalCircle(Request $request)
    {
        return app(WorkflowConfigurationController::class)->store($request, app(WorkflowConfigurationService::class));
    }

    public function updateApprovalCircleStep(Request $request, ApprovalCircleStep $step)
    {
        return app(WorkflowConfigurationController::class)->updateStep($request, $step->id, app(WorkflowConfigurationService::class));
    }

    /* ---------------- Delegations ---------------- */

    public function delegations(Request $request)
    {
        return response()->json(['status' => 'success', 'data' => Delegation::with([
            'delegator:id,name,email', 'delegate:id,name,email', 'role:id,code,name', 'department:id,name,code',
        ])->latest()->paginate(20)]);
    }

    public function storeDelegation(Request $request)
    {
        $data = $request->validate([
            'delegate_user_id' => ['required', 'exists:users,id'],
            'role_id' => ['required', 'exists:roles,id'],
            'department_id' => ['nullable', 'exists:departments,id'],
            'effective_from' => ['required', 'date'],
            'effective_to' => ['nullable', 'date', 'after:effective_from'],
        ]);
        abort_if($data['delegate_user_id'] === $request->user()->id, 422, 'You cannot delegate to yourself.');
        $delegation = Delegation::create($data + ['delegator_user_id' => $request->user()->id, 'status' => 'active']);
        $this->auditChange('configure', "Role {$delegation->role?->code} delegated to user #{$data['delegate_user_id']}", $delegation, 'delegations');

        return response()->json(['status' => 'success', 'data' => $delegation->load(['delegate:id,name', 'role:id,code,name'])], 201);
    }

    public function revokeDelegation(Request $request, Delegation $delegation)
    {
        $delegation->update(['status' => 'revoked']);
        $this->auditChange('deactivate', "Delegation #{$delegation->id} revoked", $delegation, 'delegations');

        return response()->json(['status' => 'success', 'message' => 'Delegation revoked.']);
    }

    /** Unlock an account locked by failed login attempts. */
    public function unlockUser(Request $request, User $user)
    {
        $this->authorizeUserScope($request->user(), $user);
        $user->update(['failed_attempts' => 0, 'locked_until' => null]);
        $this->auditChange('configure', "Account {$user->email} unlocked by {$request->user()->email}", $user, 'users');

        return response()->json(['status' => 'success', 'message' => 'Account unlocked.', 'data' => $user->only('id', 'email', 'locked_until')]);
    }

    /** Send a password-reset link to a user's email (admin action). */
    public function sendResetLink(Request $request, User $user)
    {
        $this->authorizeUserScope($request->user(), $user);
        $token = NotificationService::issueToken($user, 'reset-link');
        $sent = NotificationService::sendPasswordResetLinkEmail($user, $token);
        $this->auditChange('configure', "Password reset link sent to {$user->email}", $user, 'users');

        return $sent
            ? response()->json(['status' => 'success', 'message' => 'Reset link sent to '.$user->email])
            : response()->json(['status' => 'error', 'message' => 'Could not send the reset email. Check mail configuration.'], 502);
    }

    private function authorizeMfaManagement(User $actor, Request $request, ?User $target = null, ?int $targetInstitutionId = null): void
    {
        if ($request->exists('mfa_enabled') || $request->exists('mfa_method')) {
            abort_unless($actor->hasRole('MOA') || $actor->hasRole('IA'), 403, 'Only the Ministry Overall Administrator or Institution Administrator can manage MFA.');
            if (! $actor->hasRole('MOA')) {
                $institutionId = $target?->institution_id ?? $targetInstitutionId;
                abort_unless($actor->institution_id !== null && $institutionId !== null
                    && (int) $actor->institution_id === (int) $institutionId, 403, 'Outside your institution scope.');
                abort_if($target && $target->roles()->where('level', 'ministry')->exists(), 403);
            }
        }
    }

    private function prepareMfaData(array $data, ?User $target = null): array
    {
        if (! array_key_exists('mfa_enabled', $data) && ! array_key_exists('mfa_method', $data)) {
            return $data;
        }

        $enabled = array_key_exists('mfa_enabled', $data)
            ? (bool) $data['mfa_enabled']
            : (bool) $target?->mfa_enabled;
        $method = $enabled
            ? ($data['mfa_method'] ?? $target?->mfa_method ?? 'email')
            : null;
        $phone = array_key_exists('phone', $data) ? $data['phone'] : $target?->phone;
        abort_if($enabled && $method === 'sms' && ! $phone, 422, 'A phone number is required before enabling SMS MFA.');

        $data['mfa_enabled'] = $enabled;
        $data['mfa_method'] = $method;

        return $data;
    }

    private function authorizeUserScope(User $actor, User $target): void
    {
        // Scope hukaguliwa kwa rekodi husika, si uwepo wa permission pekee.
        if ($actor->hasRole('MOA') || $actor->canDo('users.manage.ministry')) {
            return;
        }
        abort_unless($actor->canDo('users.manage.institution') && $actor->institution_id !== null
            && (int) $actor->institution_id === (int) $target->institution_id, 403, 'Outside your institution scope.');
        // Account yenye role ya ministry haiwezi kuhaririwa kupitia mamlaka ya institution.
        abort_if($target->roles()->where('level', 'ministry')->exists(), 403);
    }

    private function authorizeRoleAssignments(User $actor, array $roleIds, ?int $institutionId): void
    {
        $roles = Role::whereIn('id', $roleIds)->get();
        abort_if($roles->contains(fn ($role) => ! $role->is_active || $role->status !== 'active'), 422, 'Role haiko active.');
        if (! $actor->hasRole('MOA') && ! $actor->canDo('users.manage.ministry')) {
            // IA may assign only institution roles, even when a custom ministry role uses an institution label.
            abort_unless($actor->hasRole('IA'), 403);
            $allowed = ['IA', 'IDO', 'IHOD', 'AO', 'IM', 'IAU'];
            abort_if($roles->contains(fn ($role) => $role->level !== 'institution' || ! in_array($role->code, $allowed, true)
                || $role->permissions()->where('scope', 'ministry')->exists()), 403, 'Role iko nje ya mamlaka ya taasisi.');
        }
        // Check the recipient, not the administrator granting the role. Custom roles cannot bypass this permission boundary.
        if ($roles->contains(fn ($role) => $role->code === 'PREVIEW'
            || $role->permissions()->where('code', 'analytics.view.published')->exists())) {
            $eligible = Institution::whereKey($institutionId)->where('code', 'MIT')
                ->where('is_active', true)->where('status', 'active')->exists();
            if (! $eligible) {
                throw ValidationException::withMessages([
                    'role_ids' => 'PREVIEW is restricted to users of the active MIT institution.',
                ]);
            }
        }
    }
}
