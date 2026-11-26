<?php

namespace App\Services;

use App\DTOs\NotificationData;
use App\Models\Notification;
use App\Models\User;
use Illuminate\Mail\Message;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;

class NotificationService
{
    // Huhifadhi taarifa ya ndani; kutuma email kutasimamiwa na njia tofauti.
    // Mpokeaji na audit event huchaguliwa na backend, si request ya mtumiaji.
    public function notifyUser(NotificationData $data): Notification
    {
        return Notification::create([
            'user_id' => $data->userId,
            'audit_event_id' => $data->auditEventId,
            'type' => $data->type,
            'message' => $data->message,
            'is_read' => $data->isRead,
            'sent_at' => $data->sentAt,
        ]);
    }

    /** Send a branded password-reset or sign-in OTP by email. */
    public static function sendOtpEmail(User $user, string $code, string $purpose = 'password reset'): bool
    {
        try {
            $portalName = self::branding()['portalName'];
            $isLogin = $purpose === 'sign-in verification';
            $subject = ($isLogin ? 'Sign-in Verification Code' : 'Password Reset Code').' - '.$portalName;
            $intro = "Your {$portalName} {$purpose} code is";

            self::sendBrandedEmail($user, $subject, 'emails.otp', 'emails.otp_text', [
                'heading' => $isLogin ? 'Verify your sign-in' : 'Your password reset code',
                'intro' => $intro,
                'code' => $code,
                'preheader' => 'Your six-digit security code expires in 10 minutes.',
            ]);

            return true;
        } catch (\Throwable $e) {
            Log::error('OTP email failed: '.$e->getMessage());

            return false;
        }
    }

    /** Send an application-generated OTP through Beem; acceptance is not delivery confirmation. */
    public static function sendOtpSms(User $user, string $code, string $purpose = 'reset'): bool
    {
        $settings = config('services.beem');
        if (! ($settings['enabled'] ?? false)) {
            Log::warning('Beem OTP SMS is disabled.');

            return false;
        }

        foreach (['url', 'api_key', 'secret_key', 'sender_id'] as $key) {
            if (empty($settings[$key])) {
                Log::error('Beem OTP SMS configuration is incomplete.', ['setting' => $key]);

                return false;
            }
        }

        $phone = preg_replace('/[\s()+-]+/', '', $user->phone ?? '');
        if (strlen($phone) === 10 && str_starts_with($phone, '0')) {
            $phone = '255'.substr($phone, 1);
        } elseif (strlen($phone) === 9) {
            $phone = '255'.$phone;
        }

        if (! preg_match('/^[1-9][0-9]{7,14}$/D', $phone)) {
            Log::warning('Beem OTP SMS destination is invalid.');

            return false;
        }

        try {
            $portalName = self::branding()['portalName'];
            // No automatic retry: a timeout can occur after Beem accepted the SMS.
            $response = Http::withBasicAuth($settings['api_key'], $settings['secret_key'])
                ->acceptJson()->asJson()->connectTimeout(3)->timeout(10)
                ->withOptions(['allow_redirects' => false])
                ->post($settings['url'], [
                    'source_addr' => $settings['sender_id'],
                    'encoding' => 0,
                    'schedule_time' => '',
                    'message' => "{$portalName} {$purpose} code: {$code}. Expires in 10 minutes.",
                    'recipients' => [['recipient_id' => '1', 'dest_addr' => $phone]],
                ]);

            if (! $response->successful() || $response->json('successful') !== true
                || (int) $response->json('code') !== 100) {
                // Response bodies can contain sensitive information; log only HTTP status.
                Log::warning('Beem rejected OTP SMS.', ['http_status' => $response->status()]);

                return false;
            }

            return true;
        } catch (\Throwable $e) {
            Log::error('Beem OTP SMS failed.', ['exception_type' => get_class($e)]);

            return false;
        }
    }

    /** Email with an account-activation link (new user sets their own password). */
    public static function sendAccountActivationEmail(User $user, string $token): bool
    {
        $url = self::actionUrl($user, $token);
        try {
            $portalName = self::branding()['portalName'];
            self::sendBrandedEmail($user, 'Activate your account - '.$portalName, 'emails.action', 'emails.action_text', [
                'heading' => 'Welcome to '.$portalName,
                'intro' => "An account has been created for you on the {$portalName}. Activate your account and create your password to get started.",
                'actionUrl' => $url,
                'actionText' => 'Activate your account',
                'actionInstruction' => 'activate your account and create your password',
                'preheader' => 'Activate your portal account and create your password.',
            ]);

            return true;
        } catch (\Throwable $e) {
            Log::error('Activation email failed: '.$e->getMessage());

            return false;
        }
    }

    /** Email with a password-reset link (admin-triggered). */
    public static function sendPasswordResetLinkEmail(User $user, string $token): bool
    {
        $url = self::actionUrl($user, $token);
        try {
            $portalName = self::branding()['portalName'];
            self::sendBrandedEmail($user, 'Set a new password - '.$portalName, 'emails.action', 'emails.action_text', [
                'heading' => 'Set a new password',
                'intro' => "Your password on the {$portalName} was reset by an administrator. Use the secure link below to create a new password.",
                'actionUrl' => $url,
                'actionText' => 'Create a new password',
                'actionInstruction' => 'create a new password',
                'preheader' => 'Your administrator has requested a password reset.',
            ]);

            return true;
        } catch (\Throwable $e) {
            Log::error('Reset-link email failed: '.$e->getMessage());

            return false;
        }
    }

    private static function actionUrl(User $user, string $token): string
    {
        return rtrim(env('FRONTEND_URL', 'http://127.0.0.1:5173'), '/')
            .'/activate?login='.urlencode($user->email).'&token='.$token;
    }

    private static function sendBrandedEmail(User $user, string $subject, string $htmlView, string $textView, array $data): void
    {
        $branding = self::branding();
        Mail::send(['html' => $htmlView, 'text' => $textView], $data + $branding + [
            'user' => $user,
            'subjectLine' => $subject,
        ], function (Message $message) use ($user, $subject, $branding): void {
            $message->to($user->email);
            $message->subject($subject);
            $message->from(config('mail.from.address'), $branding['portalName']);
        });
    }

    private static function branding(): array
    {
        $settings = app(PortalSettingsService::class)->publicSettings();

        return [
            'portalName' => $settings['portal_name'],
            'institutionName' => 'Ministry of Industry and Trade',
            'logoUrl' => $settings['logo_url'] ?: url('/images/crest.png'),
            'contactEmail' => $settings['contact_email'] ?: config('mail.from.address'),
            'contactPhone' => $settings['contact_phone'],
            'contactAddress' => $settings['contact_address'],
        ];
    }

    /** Create a single-use activation/reset token stored in password_reset_codes. */
    public static function issueToken(User $user, string $method, int $ttlHours = 24): string
    {
        $token = Str::random(48);
        DB::table('password_reset_codes')->updateOrInsert(
            ['user_id' => $user->id, 'method' => $method],
            [
                'destination' => $user->email,
                'code' => Hash::make($token),
                'attempts' => 0,
                'expires_at' => now()->addHours($ttlHours),
                'used_at' => null,
                'created_at' => now(),
                'updated_at' => now(),
            ]
        );

        return $token;
    }

    /** Mask a destination for display: hidden middle characters. */
    public static function mask(string $destination, string $method): string
    {
        if ($method === 'email') {
            [$local, $domain] = array_pad(explode('@', $destination, 2), 2, '');

            return substr($local, 0, 2).str_repeat('*', max(strlen($local) - 2, 3)).'@'.$domain;
        }
        $d = preg_replace('/\D+/', '', $destination);

        return substr($d, 0, 4).'****'.substr($d, -3);
    }
}
