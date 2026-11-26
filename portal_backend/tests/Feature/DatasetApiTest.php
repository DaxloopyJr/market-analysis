<?php

namespace Tests\Feature;

use App\Models\AuditEvent;
use App\Models\DatasetDefinition;
use App\Models\Department;
use App\Models\Institution;
use App\Models\ReferenceDataType;
use App\Models\ReferenceDataValue;
use App\Models\Role;
use App\Models\User;
use App\Services\AuditService;
use Database\Seeders\RolesPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class DatasetApiTest extends TestCase
{
    use RefreshDatabase;

    private function actor(string $role, Institution $institution, ?Department $department = null): User
    {
        $user = User::factory()->create([
            'institution_id' => $institution->id, 'department_id' => $department?->id,
            'is_active' => true, 'status' => 'active',
        ]);
        $roleModel = Role::firstOrCreate(['code' => $role], ['name' => $role]);
        $user->roles()->attach($roleModel->id, ['status' => 'active', 'effective_from' => now()->toDateString()]);
        Sanctum::actingAs($user);

        return $user;
    }

    private function institution(string $code): Institution
    {
        return Institution::create(['code' => $code, 'name' => $code, 'is_active' => true, 'status' => 'active']);
    }

    private function payload(Institution $institution): array
    {
        $officer = auth()->user();
        if ((int) $officer->institution_id !== $institution->id || ! $officer->hasRole('IDO', 'DDO')) {
            $officer = User::factory()->create(['institution_id' => $institution->id, 'is_active' => true, 'status' => 'active']);
            $role = Role::firstOrCreate(['code' => 'IDO'], ['name' => 'Officer']);
            $officer->roles()->attach($role->id, ['status' => 'active', 'effective_from' => '2020-01-01']);
        }
        $type = ReferenceDataType::firstOrCreate(['data_type_code' => 'SECTOR'], ['data_type_name_en' => 'Sector']);
        $sector = ReferenceDataValue::firstOrCreate(['data_type_id' => $type->id, 'data_value_code' => 'TRADE'], ['data_value_name_en' => 'Trade']);

        return ['responsibleUserId' => $officer->id, 'sectors' => [['sectorId' => $sector->id]], 'institutionId' => $institution->id,
            'datasetName' => 'Students', 'description' => 'Keep', 'frequencies' => ['quarterly', 'annual']];
    }

    public function test_ido_creates_updates_and_deactivates_with_audit(): void
    {
        $institution = $this->institution('CBE');
        $user = $this->actor('IDO', $institution);
        $response = $this->postJson('/api/v1/datasets', $this->payload($institution))
            ->assertCreated()->assertJsonPath('data.status', 'draft')->assertJsonPath('data.createdBy', $user->id);
        $id = $response->json('data.id');
        $originalName = $user->name;
        $response->assertJsonPath('data.creator.name', $originalName);
        $user->update(['name' => 'Changed Creator']);
        $this->getJson('/api/v1/datasets/'.$id)->assertOk()->assertJsonPath('data.creator.name', $originalName);
        $this->assertDatabaseCount('dataset_frequencies', 2);
        $audit = AuditEvent::sole();
        $this->assertSame('dataset_created', $audit->event_type);
        $this->assertNotEmpty($audit->request_id);
        $this->patchJson('/api/v1/datasets/'.$id, ['datasetName' => 'Updated', 'frequencies' => ['annual']])
            ->assertOk()->assertJsonPath('data.description', 'Keep')->assertJsonPath('data.frequencies', ['annual']);
        $this->assertDatabaseCount('dataset_frequencies', 1);
        $this->patchJson('/api/v1/datasets/'.$id, ['status' => 'active'])->assertUnprocessable();
        $this->deleteJson('/api/v1/datasets/'.$id)->assertOk()->assertJsonPath('data.status', 'inactive');
        $this->deleteJson('/api/v1/datasets/'.$id)->assertOk();
        $this->assertDatabaseCount('dataset_definitions', 1);
        $this->assertDatabaseCount('audit_events', 3);
    }

    public function test_institution_scope_and_privileged_access(): void
    {
        $a = $this->institution('CBE');
        $b = $this->institution('FCC');
        $this->actor('IDO', $a);
        $id = $this->postJson('/api/v1/datasets', $this->payload($a))->assertCreated()->json('data.id');
        $this->postJson('/api/v1/datasets', $this->payload($b))->assertForbidden();
        $this->actor('IA', $b);
        $this->getJson('/api/v1/datasets')->assertOk()->assertJsonCount(0, 'data');
        $this->getJson('/api/v1/datasets/'.$id)->assertNotFound();
        $this->patchJson('/api/v1/datasets/'.$id, ['datasetName' => 'Other'])->assertNotFound();
        $this->deleteJson('/api/v1/datasets/'.$id)->assertNotFound();
        $this->actor('MOA', $b);
        $this->getJson('/api/v1/datasets/'.$id)->assertOk();
        $this->actor('IM', $b);
        $this->getJson('/api/v1/datasets')->assertForbidden();
    }

    public function test_ddo_is_limited_to_own_department(): void
    {
        $ministry = $this->institution('MIT');
        $a = Department::create(['code' => 'A', 'name' => 'A', 'is_active' => true, 'status' => 'active']);
        $b = Department::create(['code' => 'B', 'name' => 'B', 'is_active' => true, 'status' => 'active']);
        $this->actor('DDO', $ministry, $a);
        $payload = $this->payload($ministry);
        $this->postJson('/api/v1/datasets', $payload)->assertForbidden();
        $this->postJson('/api/v1/datasets', $payload + ['departmentId' => $b->id])->assertForbidden();
        $id = $this->postJson('/api/v1/datasets', $payload + ['departmentId' => $a->id])->assertCreated()->json('data.id');
        $this->actor('DDO', $ministry, $b);
        $this->getJson('/api/v1/datasets/'.$id)->assertNotFound();
        $this->getJson('/api/v1/datasets')->assertJsonCount(0, 'data');
    }

    public function test_mdo_and_mdd_can_read_all_active_institution_and_department_datasets(): void
    {
        $this->seed(RolesPermissionsSeeder::class);
        $ministry = $this->institution('MIT');
        $institution = $this->institution('CBE');
        $department = Department::create(['code' => 'PLAN', 'name' => 'Planning', 'is_active' => true, 'status' => 'active']);
        $creator = User::factory()->create(['institution_id' => $institution->id, 'is_active' => true, 'status' => 'active']);

        $institutionDataset = DatasetDefinition::create([
            'institution_id' => $institution->id, 'dataset_code' => 'CBE/2026/001',
            'dataset_name' => 'Institution dataset', 'created_by' => $creator->id, 'status' => 'active',
        ]);
        $departmentDataset = DatasetDefinition::create([
            'institution_id' => $ministry->id, 'department_id' => $department->id,
            'dataset_code' => 'MIT/2026/001', 'dataset_name' => 'Department dataset',
            'created_by' => $creator->id, 'status' => 'active',
        ]);
        $draftDataset = DatasetDefinition::create([
            'institution_id' => $institution->id, 'dataset_code' => 'CBE/2026/002',
            'dataset_name' => 'Draft dataset', 'created_by' => $creator->id, 'status' => 'draft',
        ]);
        $inactiveDataset = DatasetDefinition::create([
            'institution_id' => $ministry->id, 'department_id' => $department->id,
            'dataset_code' => 'MIT/2026/002', 'dataset_name' => 'Inactive dataset',
            'created_by' => $creator->id, 'status' => 'inactive',
        ]);

        foreach (['MDO', 'MDD'] as $role) {
            $this->actor($role, $ministry, $department);
            $this->getJson('/api/v1/datasets')->assertOk()->assertJsonCount(2, 'data')
                ->assertJsonFragment(['id' => $institutionDataset->id])
                ->assertJsonFragment(['id' => $departmentDataset->id])
                ->assertJsonMissing(['id' => $draftDataset->id])
                ->assertJsonMissing(['id' => $inactiveDataset->id]);
            $this->getJson('/api/v1/datasets?status=draft')->assertOk()->assertJsonCount(2, 'data');
            $this->getJson('/api/v1/datasets/'.$institutionDataset->id)->assertOk();
            $this->getJson('/api/v1/datasets/'.$draftDataset->id)->assertNotFound();
            $this->patchJson('/api/v1/datasets/'.$institutionDataset->id, ['datasetName' => 'Changed'])->assertForbidden();
        }
    }

    public function test_audit_failure_rolls_back_dataset_and_frequencies(): void
    {
        $institution = $this->institution('CBE');
        $this->actor('IDO', $institution);
        $this->mock(AuditService::class, function ($mock) {
            $mock->shouldReceive('record')->once()->andThrow(new \RuntimeException('audit failed'));
        });
        $this->withoutExceptionHandling();
        try {
            $this->postJson('/api/v1/datasets', $this->payload($institution));
            $this->fail('Expected audit failure.');
        } catch (\RuntimeException $exception) {
            $this->assertSame('audit failed', $exception->getMessage());
        }
        $this->assertDatabaseCount('dataset_definitions', 0);
        $this->assertDatabaseCount('dataset_code_counters', 0);
        $this->assertDatabaseCount('dataset_frequencies', 0);
        $this->assertDatabaseCount('audit_events', 0);
    }

    public function test_validation_and_missing_authentication(): void
    {
        $this->getJson('/api/v1/datasets')->assertUnauthorized();
        $institution = $this->institution('CBE');
        $this->actor('IDO', $institution);
        $payload = $this->payload($institution);
        $this->postJson('/api/v1/datasets', array_replace($payload, ['frequencies' => ['annual', 'annual']]))->assertUnprocessable();
        $this->postJson('/api/v1/datasets', $payload)->assertCreated();
        $this->postJson('/api/v1/datasets', $payload + ['datasetCode' => 'MANUAL'])->assertUnprocessable();
    }

    public function test_codes_follow_institution_year_and_existing_sequence(): void
    {
        $this->travelTo(Carbon::parse('2026-10-18 12:00:00'));
        $institution = $this->institution('TANTRADE');
        $user = $this->actor('MOA', $institution);
        DatasetDefinition::create([
            'institution_id' => $institution->id, 'dataset_code' => 'TANTRADE/2026/0007',
            'dataset_name' => 'Existing', 'created_by' => $user->id,
        ]);
        $payload = $this->payload($institution);
        $first = $this->postJson('/api/v1/datasets', $payload)
            ->assertCreated()->assertJsonPath('data.datasetCode', 'TANTRADE/2026/0008');
        $this->postJson('/api/v1/datasets', $payload)
            ->assertCreated()->assertJsonPath('data.datasetCode', 'TANTRADE/2026/0009');
        $id = $first->json('data.id');
        $this->patchJson('/api/v1/datasets/'.$id, ['datasetCode' => 'CHANGED'])->assertUnprocessable();
        $this->patchJson('/api/v1/datasets/'.$id, ['datasetName' => 'Renamed'])
            ->assertOk()->assertJsonPath('data.datasetCode', 'TANTRADE/2026/0008');
        $other = $this->institution('CBE');
        $this->postJson('/api/v1/datasets', $this->payload($other))
            ->assertCreated()->assertJsonPath('data.datasetCode', 'CBE/2026/0001');
        $this->travelTo(Carbon::parse('2027-01-01 12:00:00'));
        $this->postJson('/api/v1/datasets', $payload)
            ->assertCreated()->assertJsonPath('data.datasetCode', 'TANTRADE/2027/0001');
        $this->assertDatabaseHas('dataset_definitions', ['dataset_code' => 'TANTRADE/2026/0007']);
        $this->travelBack();
    }
}
