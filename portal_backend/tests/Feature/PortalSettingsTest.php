<?php

namespace Tests\Feature;

use App\Models\AuditEvent;
use App\Models\PortalSetting;
use App\Models\Role;
use App\Models\User;
use App\Services\AuditService;
use App\Services\NotificationService;
use Database\Seeders\RolesPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class PortalSettingsTest extends TestCase
{
    use RefreshDatabase;

    private function signInAs(string $roleCode): User
    {
        $this->seed(RolesPermissionsSeeder::class);

        $user = User::factory()->create([
            'is_active' => true,
            'status' => 'active',
        ]);

        $role = Role::query()->where('code', $roleCode)->firstOrFail();

        $user->roles()->attach($role->id, [
            'status' => 'active',
            'effective_from' => today(),
        ]);

        Sanctum::actingAs($user);

        return $user;
    }

    public function test_public_settings_use_defaults_without_inserting_rows_or_exposing_legacy_keys(): void
    {
        PortalSetting::query()->create([
            'key' => 'legacy_secret',
            'type' => 'text',
            'value' => 'never-public',
        ]);

        $response = $this->getJson('/api/v1/portal-settings/public');

        $response->assertOk();
        $response->assertJsonPath('data.portal_name', 'Viwanda Portal');
        $response->assertJsonPath('data.contact_email', null);
        $response->assertJsonPath('data.logo_url', null);
        $response->assertJsonPath('data.announcements_enabled', false);
        $response->assertJsonPath('data.announcements_limit', 5);
        $response->assertJsonPath('data.announcements', []);
        $response->assertDontSee('legacy_secret');
        $response->assertDontSee('never-public');
        $this->assertDatabaseCount('portal_settings', 1);
    }

    public function test_only_portal_manager_can_read_and_change_admin_settings(): void
    {
        $this->getJson('/api/v1/portal-settings')->assertUnauthorized();
        $this->putJson('/api/v1/portal-settings', [
            'settings' => [
                'portal_name' => 'New name',
            ],
        ])->assertUnauthorized();

        $this->signInAs('IA');

        $this->getJson('/api/v1/portal-settings')->assertForbidden();
        $this->putJson('/api/v1/portal-settings', [
            'settings' => [
                'portal_name' => 'New name',
            ],
        ])->assertForbidden();

        $this->signInAs('MOA');

        $this->getJson('/api/v1/portal-settings')
            ->assertOk()
            ->assertJsonPath('data.portal_name.value', 'Viwanda Portal');
    }

    public function test_partial_update_preserves_types_and_records_before_and_after_values(): void
    {
        $actor = $this->signInAs('MOA');

        $response = $this->putJson('/api/v1/portal-settings', [
            'settings' => [
                'portal_name' => 'Viwanda Data',
                'contact_email' => 'support@example.test',
                'announcements_enabled' => false,
                'announcements_limit' => 3,
                'announcements' => [
                    [
                        'title' => 'Notice',
                        'message' => 'System information',
                        'is_active' => true,
                    ],
                ],
            ],
        ]);

        $response->assertOk();
        $response->assertJsonPath('data.portal_name.value', 'Viwanda Data');
        $response->assertJsonPath('data.announcements_enabled.value', false);
        $response->assertJsonPath('data.announcements_enabled.type', 'boolean');
        $response->assertJsonPath('data.announcements_limit.value', 3);
        $response->assertJsonPath('data.announcements_limit.type', 'integer');
        $response->assertJsonPath('data.announcements.value.0.title', 'Notice');
        $this->assertDatabaseHas('portal_settings', [
            'key' => 'announcements_enabled',
            'type' => 'boolean',
            'value' => '0',
        ]);
        $this->assertSame(false, PortalSetting::getValue('announcements_enabled'));
        $this->assertSame(3, PortalSetting::getValue('announcements_limit'));
        $this->assertSame('Viwanda Data', PortalSetting::getValue('portal_name'));

        $audit = AuditEvent::query()->latest('id')->firstOrFail();
        $this->assertSame($actor->id, $audit->user_id);
        $this->assertSame('Viwanda Portal', $audit->old_values['portal_name']);
        $this->assertSame('Viwanda Data', $audit->new_values['portal_name']);
        $this->assertSame(false, $audit->new_values['announcements_enabled']);

        $this->putJson('/api/v1/portal-settings', [
            'settings' => [
                'contact_phone' => '+255 754 123 456',
            ],
        ])->assertOk();

        $this->assertSame('Viwanda Data', PortalSetting::getValue('portal_name'));
        $this->assertSame('+255 754 123 456', PortalSetting::getValue('contact_phone'));

        $this->getJson('/api/v1/portal-settings/public')
            ->assertOk()
            ->assertJsonPath('data.portal_name', 'Viwanda Data')
            ->assertJsonPath('data.announcements', []);
    }

    public function test_public_read_only_returns_active_announcements_without_internal_fields(): void
    {
        $this->signInAs('MOA');

        $this->putJson('/api/v1/portal-settings', [
            'settings' => [
                'announcements_enabled' => true,
                'announcements_limit' => 1,
                'announcements' => [
                    [
                        'title' => 'Open',
                        'message' => 'Available now',
                        'is_active' => true,
                    ],
                    [
                        'title' => 'Another open',
                        'message' => 'Limit should hide this',
                        'is_active' => true,
                    ],
                    [
                        'title' => 'Draft',
                        'message' => 'Not yet available',
                        'is_active' => false,
                    ],
                ],
            ],
        ])->assertOk();

        $this->app['auth']->forgetGuards();
        $response = $this->getJson('/api/v1/portal-settings/public');

        $response->assertOk();
        $response->assertJsonPath('data.announcements_enabled', true);
        $response->assertJsonPath('data.announcements.0.title', 'Open');
        $response->assertJsonCount(1, 'data.announcements');
        $response->assertDontSee('Not yet available');
        $response->assertDontSee('Limit should hide this');
        $response->assertDontSee('is_active');
        $response->assertDontSee('created_at');
    }

    public function test_invalid_keys_values_and_nested_announcement_fields_return_422_without_writes(): void
    {
        $this->signInAs('MOA');

        $response = $this->putJson('/api/v1/portal-settings', [
            'settings' => [
                'secret_key' => 'unapproved',
                'portal_name' => "Bad\nName",
                'contact_email' => 'not-an-email',
                'contact_phone' => '123',
                'announcements_enabled' => 'maybe',
                'announcements' => [
                    [
                        'title' => 'Visible',
                        'message' => 'Text',
                        'is_active' => true,
                        'html' => '<script>alert(1)</script>',
                    ],
                ],
            ],
        ]);

        $response->assertUnprocessable();
        $response->assertJsonValidationErrors([
            'settings',
            'settings.portal_name',
            'settings.contact_email',
            'settings.contact_phone',
            'settings.announcements_enabled',
            'settings.announcements.0',
        ]);
        $this->assertDatabaseCount('portal_settings', 0);
        $this->assertDatabaseCount('audit_events', 0);
    }

    public function test_logo_upload_replacement_and_removal_keep_storage_and_database_in_sync(): void
    {
        Storage::fake('public');
        $this->signInAs('MOA');

        $firstResponse = $this->post('/api/v1/portal-settings', [
            '_method' => 'PUT',
            'settings' => [
                'logo' => UploadedFile::fake()->image('first.png', 60, 60),
            ],
        ]);

        $firstResponse->assertOk();
        $firstPath = PortalSetting::getValue('logo');
        Storage::disk('public')->assertExists($firstPath);
        $firstResponse->assertJsonPath('data.logo.value', $firstPath);
        $this->assertStringStartsWith('http', $firstResponse->json('data.logo.url'));

        $secondResponse = $this->post('/api/v1/portal-settings', [
            '_method' => 'PUT',
            'settings' => [
                'logo' => UploadedFile::fake()->image('second.jpg', 80, 80),
            ],
        ]);

        $secondResponse->assertOk();
        $secondPath = PortalSetting::getValue('logo');
        $this->assertNotSame($firstPath, $secondPath);
        Storage::disk('public')->assertMissing($firstPath);
        Storage::disk('public')->assertExists($secondPath);

        $this->putJson('/api/v1/portal-settings', [
            'settings' => [
                'logo' => null,
            ],
        ])->assertOk();

        Storage::disk('public')->assertMissing($secondPath);
        $this->assertNull(PortalSetting::getValue('logo'));
        $this->getJson('/api/v1/portal-settings/public')
            ->assertJsonPath('data.logo_url', null);
    }

    public function test_non_image_logo_and_string_path_are_rejected(): void
    {
        Storage::fake('public');
        $this->signInAs('MOA');

        $this->putJson('/api/v1/portal-settings', [
            'settings' => [
                'logo' => 'portal/attacker.png',
            ],
        ])->assertUnprocessable()->assertJsonValidationErrors('settings.logo');

        $this->post('/api/v1/portal-settings', [
            '_method' => 'PUT',
            'settings' => [
                'logo' => UploadedFile::fake()->create('logo.svg', 5, 'image/svg+xml'),
            ],
        ])->assertUnprocessable()->assertJsonValidationErrors('settings.logo');

        $this->assertDatabaseCount('portal_settings', 0);
        $this->assertSame([], Storage::disk('public')->allFiles('portal'));
    }

    public function test_audit_failure_rolls_back_database_and_removes_only_new_logo(): void
    {
        Storage::fake('public');
        $this->signInAs('MOA');

        $this->post('/api/v1/portal-settings', [
            '_method' => 'PUT',
            'settings' => [
                'logo' => UploadedFile::fake()->image('original.png', 60, 60),
            ],
        ])->assertOk();

        $originalPath = PortalSetting::getValue('logo');
        $this->mock(AuditService::class, function ($mock): void {
            $mock->shouldReceive('record')->andThrow(new \RuntimeException('audit offline'));
        });

        $this->post('/api/v1/portal-settings', [
            '_method' => 'PUT',
            'settings' => [
                'logo' => UploadedFile::fake()->image('replacement.png', 70, 70),
            ],
        ])->assertInternalServerError();

        $this->assertSame($originalPath, PortalSetting::getValue('logo'));
        Storage::disk('public')->assertExists($originalPath);
        $this->assertCount(1, Storage::disk('public')->allFiles('portal'));
        $this->assertDatabaseCount('audit_events', 1);
    }

    public function test_model_reads_legacy_numeric_and_json_values_with_correct_types(): void
    {
        PortalSetting::query()->create([
            'key' => 'legacy_counter',
            'type' => 'integer',
            'value' => 12,
        ]);

        PortalSetting::query()->create([
            'key' => 'legacy_ratio',
            'type' => 'number',
            'value' => 1.25,
        ]);

        $this->assertSame(12, PortalSetting::getValue('legacy_counter'));
        $this->assertSame(1.25, PortalSetting::getValue('legacy_ratio'));
    }

    public function test_invalid_legacy_portal_name_falls_back_on_public_read_and_email(): void
    {
        PortalSetting::query()->create([
            'key' => 'portal_name',
            'type' => 'text',
            'value' => "Unsafe\r\nBcc: attacker@example.test",
        ]);

        $this->getJson('/api/v1/portal-settings/public')
            ->assertOk()
            ->assertJsonPath('data.portal_name', 'Viwanda Portal');

        $recipient = User::factory()->create();
        $sent = NotificationService::sendOtpEmail($recipient, '123456');

        $this->assertTrue($sent);

        $messages = Mail::mailer('array')->getSymfonyTransport()->messages();
        $this->assertSame(
            'Password Reset Code - Viwanda Portal',
            $messages->first()->getOriginalMessage()->getSubject()
        );
    }

    public function test_configured_name_is_used_in_password_reset_email(): void
    {
        $this->signInAs('MOA');

        $this->putJson('/api/v1/portal-settings', [
            'settings' => [
                'portal_name' => 'Wizara Data Portal',
            ],
        ])->assertOk();

        $recipient = User::factory()->create();
        $sent = NotificationService::sendOtpEmail($recipient, '123456');
        $activationSent = NotificationService::sendAccountActivationEmail($recipient, 'activation-token');
        $resetLinkSent = NotificationService::sendPasswordResetLinkEmail($recipient, 'reset-token');

        $this->assertTrue($sent);
        $this->assertTrue($activationSent);
        $this->assertTrue($resetLinkSent);

        $messages = Mail::mailer('array')->getSymfonyTransport()->messages();
        $this->assertCount(3, $messages);

        $message = $messages->first()->getOriginalMessage();
        $this->assertSame('Password Reset Code - Wizara Data Portal', $message->getSubject());
        $this->assertSame('Wizara Data Portal', $message->getFrom()[0]->getName());
        $this->assertStringContainsString('Your Wizara Data Portal password reset code', $message->getTextBody());
        $this->assertSame(
            'Activate your account - Wizara Data Portal',
            $messages->get(1)->getOriginalMessage()->getSubject()
        );
        $this->assertSame(
            'Set a new password - Wizara Data Portal',
            $messages->get(2)->getOriginalMessage()->getSubject()
        );
    }
}
