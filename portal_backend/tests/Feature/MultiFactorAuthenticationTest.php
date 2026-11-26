<?php

namespace Tests\Feature;

use App\Models\Institution;
use App\Models\Role;
use App\Models\User;
use App\Services\NotificationService;
use Database\Seeders\RolesPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

class MultiFactorAuthenticationTest extends TestCase
{
    use RefreshDatabase;

    public function test_mfa_login_withholds_token_until_valid_single_use_otp(): void
    {
        $user = User::factory()->create([
            'password' => 'password',
            'mfa_enabled' => true,
            'mfa_method' => 'email',
        ]);

        $response = $this->postJson('/api/v1/login', [
            'login' => $user->email,
            'password' => 'password',
        ])->assertStatus(202)->assertJsonPath('data.mfa_required', true)->assertJsonMissingPath('data.token');

        $challenge = $response->json('data');
        $this->assertDatabaseCount('personal_access_tokens', 0);
        $stored = DB::table('mfa_challenges')->first();
        $this->assertNotSame($challenge['challenge_id'], $stored->token_hash);
        $this->assertTrue(Hash::check($challenge['dev_code'], $stored->code));

        $this->postJson('/api/v1/mfa/login/verify', [
            'challenge_id' => $challenge['challenge_id'],
            'code' => '000000',
        ])->assertUnprocessable();

        $verified = $this->postJson('/api/v1/mfa/login/verify', [
            'challenge_id' => $challenge['challenge_id'],
            'code' => $challenge['dev_code'],
        ])->assertOk()->assertJsonPath('data.user.mfa_enabled', true);

        $token = $verified->json('data.token');
        $this->assertNotEmpty($token);
        $this->withHeader('Authorization', 'Bearer '.$token)->getJson('/api/v1/me')->assertOk();

        $this->postJson('/api/v1/mfa/login/verify', [
            'challenge_id' => $challenge['challenge_id'],
            'code' => $challenge['dev_code'],
        ])->assertUnprocessable();
        $this->assertDatabaseCount('personal_access_tokens', 1);
    }

    public function test_mfa_challenge_expires_and_limits_attempts(): void
    {
        $user = User::factory()->create([
            'password' => 'password',
            'mfa_enabled' => true,
            'mfa_method' => 'email',
        ]);
        $challenge = $this->postJson('/api/v1/login', [
            'login' => $user->email,
            'password' => 'password',
        ])->assertStatus(202)->json('data');

        foreach (range(1, 5) as $attempt) {
            $this->postJson('/api/v1/mfa/login/verify', [
                'challenge_id' => $challenge['challenge_id'],
                'code' => '000000',
            ])->assertUnprocessable();
        }
        $this->postJson('/api/v1/mfa/login/verify', [
            'challenge_id' => $challenge['challenge_id'],
            'code' => $challenge['dev_code'],
        ])->assertUnprocessable();
        $this->assertDatabaseCount('personal_access_tokens', 0);

        $other = User::factory()->create([
            'password' => 'password',
            'mfa_enabled' => true,
            'mfa_method' => 'email',
        ]);
        $expired = $this->postJson('/api/v1/login', [
            'login' => $other->email,
            'password' => 'password',
        ])->assertStatus(202)->json('data');
        $this->travel(11)->minutes();
        $this->postJson('/api/v1/mfa/login/verify', [
            'challenge_id' => $expired['challenge_id'],
            'code' => $expired['dev_code'],
        ])->assertUnprocessable();
    }

    public function test_institution_admin_can_opt_into_sms_mfa_with_current_password(): void
    {
        $this->seed(RolesPermissionsSeeder::class);
        $institution = Institution::create(['name' => 'Test Institution', 'code' => 'TI', 'type' => 'institution', 'is_active' => true, 'status' => 'active']);
        $user = $this->userWithRole('IA');
        $user->update(['institution_id' => $institution->id]);
        $this->withHeader('Authorization', 'Bearer '.$user->createToken('test')->plainTextToken);

        $this->putJson('/api/v1/profile/mfa', [
            'current_password' => 'wrong',
            'mfa_enabled' => true,
            'mfa_method' => 'email',
        ])->assertUnprocessable();

        $this->putJson('/api/v1/profile/mfa', [
            'current_password' => 'password',
            'mfa_enabled' => true,
            'mfa_method' => 'sms',
        ])->assertUnprocessable();

        $this->putJson('/api/v1/profile', ['phone' => '+255712345678'])->assertOk();
        $this->putJson('/api/v1/profile/mfa', [
            'current_password' => 'password',
            'mfa_enabled' => true,
            'mfa_method' => 'sms',
        ])->assertOk()->assertJsonPath('data.mfa_enabled', true)->assertJsonPath('data.mfa_method', 'sms');
    }

    public function test_regular_user_cannot_change_own_mfa(): void
    {
        $user = User::factory()->create(['password' => 'password']);
        $this->withHeader('Authorization', 'Bearer '.$user->createToken('test')->plainTextToken)
            ->putJson('/api/v1/profile/mfa', [
                'current_password' => 'password',
                'mfa_enabled' => true,
                'mfa_method' => 'email',
            ])->assertForbidden();
        $this->assertFalse($user->refresh()->mfa_enabled);
    }

    public function test_moa_can_administer_mfa_for_other_users(): void
    {
        $this->seed(RolesPermissionsSeeder::class);
        $moa = $this->userWithRole('MOA');
        $institution = Institution::create(['name' => 'Test Institution', 'code' => 'TI', 'type' => 'institution', 'is_active' => true, 'status' => 'active']);
        $target = User::factory()->create(['phone' => '+255712345678', 'institution_id' => $institution->id]);

        $this->withHeader('Authorization', 'Bearer '.$moa->createToken('test')->plainTextToken)->putJson('/api/v1/users/'.$target->id, [
            'mfa_enabled' => true,
            'mfa_method' => 'sms',
        ])->assertOk()->assertJsonPath('data.mfa_enabled', true)->assertJsonPath('data.mfa_method', 'sms');
    }

    public function test_institution_admin_can_manage_mfa_for_users_in_their_institution(): void
    {
        $this->seed(RolesPermissionsSeeder::class);
        $institution = Institution::create(['name' => 'Test Institution', 'code' => 'TI', 'type' => 'institution', 'is_active' => true, 'status' => 'active']);
        $target = User::factory()->create(['institution_id' => $institution->id, 'mfa_enabled' => true, 'mfa_method' => 'email']);
        $otherAdmin = $this->userWithRole('IA');
        $otherAdmin->update(['institution_id' => $institution->id]);

        $this->withHeader('Authorization', 'Bearer '.$otherAdmin->createToken('test')->plainTextToken)->putJson('/api/v1/users/'.$target->id, [
            'mfa_enabled' => false,
        ])->assertOk()->assertJsonPath('data.mfa_enabled', false);
        $this->assertFalse($target->refresh()->mfa_enabled);
    }

    public function test_institution_admin_cannot_manage_mfa_outside_their_institution(): void
    {
        $this->seed(RolesPermissionsSeeder::class);
        $institution = Institution::create(['name' => 'Test Institution', 'code' => 'TI', 'type' => 'institution', 'is_active' => true, 'status' => 'active']);
        $otherInstitution = Institution::create(['name' => 'Other Institution', 'code' => 'OI', 'type' => 'institution', 'is_active' => true, 'status' => 'active']);
        $target = User::factory()->create(['institution_id' => $otherInstitution->id, 'mfa_enabled' => true, 'mfa_method' => 'email']);
        $admin = $this->userWithRole('IA');
        $admin->update(['institution_id' => $institution->id]);

        $this->withHeader('Authorization', 'Bearer '.$admin->createToken('test')->plainTextToken)->putJson('/api/v1/users/'.$target->id, [
            'mfa_enabled' => false,
        ])->assertForbidden();
        $this->assertTrue($target->refresh()->mfa_enabled);
    }

    public function test_password_reset_code_leads_to_new_password_login(): void
    {
        $user = User::factory()->create(['password' => 'password']);
        $response = $this->postJson('/api/v1/forgot-password', [
            'login' => $user->email,
            'method' => 'email',
        ])->assertOk();

        $this->postJson('/api/v1/reset-password', [
            'login' => $user->email,
            'method' => 'email',
            'code' => $response->json('dev_code'),
            'password' => 'NewPassword@123',
            'password_confirmation' => 'NewPassword@123',
        ])->assertOk();

        $this->postJson('/api/v1/login', [
            'login' => $user->email,
            'password' => 'NewPassword@123',
        ])->assertOk()->assertJsonStructure(['data' => ['token', 'user']]);
    }

    public function test_account_email_contains_branded_html_and_contact_footer(): void
    {
        config(['mail.from.address' => 'support@example.test']);
        $user = User::factory()->create();
        $this->assertTrue(NotificationService::sendOtpEmail($user, '123456'));

        $message = Mail::mailer('array')->getSymfonyTransport()->messages()->first()->getOriginalMessage();
        $html = $message->getHtmlBody();
        $this->assertStringContainsString('Viwanda Portal', $html);
        $this->assertStringContainsString('Ministry of Industry and Trade', $html);
        $this->assertStringContainsString('/images/crest.png', $html);
        $this->assertStringContainsString('support@example.test', $html);
        $this->assertStringContainsString('123456', $html);
        $this->assertStringContainsString('Your Viwanda Portal password reset code is: 123456', $message->getTextBody());
    }

    private function userWithRole(string $code): User
    {
        $user = User::factory()->create(['password' => 'password']);
        $role = Role::where('code', $code)->firstOrFail();
        $user->roles()->sync([$role->id => [
            'effective_from' => now(),
            'status' => 'active',
        ]]);

        return $user;
    }
}
