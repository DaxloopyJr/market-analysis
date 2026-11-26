<?php

namespace Tests\Feature;

use App\DTOs\AuditEventData;
use App\Models\DatasetDefinition;
use App\Models\Institution;
use App\Models\Role;
use App\Models\User;
use App\Services\AuditService;
use Database\Seeders\RolesPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class InstitutionAuditorsTest extends TestCase
{
    use RefreshDatabase;

    private function actor(string $code, Institution $institution): User
    {
        $user = User::factory()->create(['institution_id' => $institution->id, 'is_active' => true, 'status' => 'active']);
        $user->roles()->attach(Role::where('code', $code)->firstOrFail()->id, ['status' => 'active']);
        Sanctum::actingAs($user);

        return $user;
    }

    public function test_image_upload_replacement_removal_and_scope(): void
    {
        Storage::fake('public');
        $this->seed(RolesPermissionsSeeder::class);
        $a = Institution::create(['name' => 'CBE', 'code' => 'CBE']);
        $b = Institution::create(['name' => 'FCC', 'code' => 'FCC']);
        $this->actor('IA', $a);
        // Real PNG bytes avoid depending on a local graphics extension.
        $image = fn () => UploadedFile::fake()->createWithContent('logo.png', base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII='));
        $url = '/api/v1/institutions/'.$a->id.'/profile-image';
        $this->postJson('/api/v1/institutions/'.$b->id.'/profile-image', ['profileImage' => $image()])->assertForbidden();
        $this->postJson($url, ['profileImage' => UploadedFile::fake()->create('bad.txt', 1, 'text/plain')])->assertUnprocessable();
        $first = $this->postJson($url, ['profileImage' => $image()])->assertOk()->json('data.profile_image_path');
        Storage::disk('public')->assertExists($first);
        $this->getJson('/api/v1/me')->assertOk()->assertJsonPath('data.institution.profile_image_url', Storage::disk('public')->url($first));
        $second = $this->postJson($url, ['profileImage' => $image()])->assertOk()->json('data.profile_image_path');
        Storage::disk('public')->assertMissing($first);
        Storage::disk('public')->assertExists($second);
        $this->postJson($url, ['profileImage' => null])->assertOk()->assertJsonPath('data.profile_image_url', null);
        Storage::disk('public')->assertMissing($second);
        $this->actor('IAU', $a);
        $this->postJson($url, ['profileImage' => $image()])->assertForbidden();
    }

    public function test_auditors_read_only_and_institution_audit_scope_survives_actor_transfer(): void
    {
        $this->seed(RolesPermissionsSeeder::class);
        $a = Institution::create(['name' => 'CBE', 'code' => 'CBE', 'is_active' => true, 'status' => 'active']);
        $b = Institution::create(['name' => 'MIT', 'code' => 'MIT', 'is_active' => true, 'status' => 'active']);
        $admin = $this->actor('MOA', $b);
        $dataset = DatasetDefinition::create(['institution_id' => $a->id, 'dataset_name' => 'CBE data', 'dataset_code' => 'CBE/1', 'created_by' => $admin->id]);
        $own = app(AuditService::class)->record(new AuditEventData(eventType: 'dataset_created', userId: $admin->id, entityType: 'dataset_definition', entityId: (string) $dataset->id));
        $foreign = app(AuditService::class)->record(new AuditEventData(eventType: 'institution_updated', userId: $admin->id, entityType: 'institutions', entityId: (string) $b->id));
        $admin->update(['institution_id' => $a->id]);
        $this->actor('IAU', $a);
        $this->getJson('/api/v1/audit-events')->assertOk()->assertJsonPath('meta.total', 1)->assertJsonPath('data.0.id', $own->id);
        $this->getJson('/api/v1/audit-events/'.$foreign->id)->assertNotFound();
        $this->getJson('/api/v1/datasets/'.$dataset->id)->assertOk();
        $this->patchJson('/api/v1/datasets/'.$dataset->id, ['datasetName' => 'Forbidden'])->assertForbidden();
        $this->postJson('/api/v1/institutions', ['name' => 'Forbidden', 'code' => 'NO'])->assertForbidden();
        $this->getJson('/api/v1/institutions')->assertOk()->assertJsonPath('data.total', 1);
        $this->actor('MAU', $b);
        $this->getJson('/api/v1/audit-events')->assertOk()->assertJsonPath('meta.total', 2);
        $this->getJson('/api/v1/audit-events/'.$foreign->id)->assertOk();
        $this->getJson('/api/v1/datasets/'.$dataset->id)->assertOk();
        $this->patchJson('/api/v1/datasets/'.$dataset->id, ['datasetName' => 'Forbidden'])->assertForbidden();
        $this->actor('IAU', $b);
        $this->getJson('/api/v1/datasets/'.$dataset->id)->assertNotFound();
        $this->getJson('/api/v1/audit-events/'.$own->id)->assertNotFound();
    }

    public function test_image_failure_rolls_back_file_and_database(): void
    {
        Storage::fake('public');
        $this->seed(RolesPermissionsSeeder::class);
        $institution = Institution::create(['name' => 'CBE', 'code' => 'CBE']);
        $this->actor('IA', $institution);
        $this->mock(AuditService::class)->shouldReceive('record')->andThrow(new \RuntimeException('audit unavailable'));
        $image = UploadedFile::fake()->createWithContent('logo.png', base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII='));
        $this->postJson('/api/v1/institutions/'.$institution->id.'/profile-image', ['profileImage' => $image])->assertServerError();
        $this->assertNull($institution->fresh()->profile_image_path);
        $this->assertSame([], Storage::disk('public')->allFiles());
    }
}
