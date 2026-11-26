<?php

namespace Tests\Feature;

use App\Models\ReferenceDataType;
use App\Models\ReferenceDataValue;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ReferenceDataUpdateTest extends TestCase
{
    use RefreshDatabase;

    public function test_create_type_and_value_record_actor_context_and_entity(): void
    {
        $this->loginManager();
        $response = $this->postJson('/api/v1/reference-data', [
            'dataTypeCode' => 'REGION', 'dataTypeNameEn' => 'Region', 'userId' => 999,
        ])->assertCreated();
        $typeId = $response->json('data.id');
        $value = $this->postJson('/api/v1/reference-data/'.$typeId.'/values', [
            'dataValueCode' => 'DODOMA', 'dataValueNameEn' => 'Dodoma',
        ])->assertCreated();
        $this->assertDatabaseCount('audit_events', 2);
        foreach (['reference_data_type' => $typeId, 'reference_data_value' => $value->json('data.id')] as $entityType => $entityId) {
            $audit = \App\Models\AuditEvent::where('entity_type', $entityType)->sole();
            $this->assertSame('reference_data_created', $audit->event_type);
            $this->assertEquals((string) $entityId, $audit->entity_id);
            $this->assertEquals(User::where('email', 'manager@example.test')->value('id'), $audit->user_id);
            $this->assertNotEmpty($audit->request_id);
            $this->assertNotEmpty($audit->new_values);
        }
    }

    public function test_create_rolls_back_when_audit_fails(): void
    {
        $this->loginManager();
        $type = ReferenceDataType::create(['data_type_code' => 'REGION', 'data_type_name_en' => 'Region']);
        $this->mock(\App\Services\AuditService::class, function ($mock) {
            $mock->shouldReceive('record')->twice()->andThrow(new \RuntimeException('Audit unavailable'));
        });
        $this->withoutExceptionHandling();
        foreach ([
            ['/api/v1/reference-data', ['dataTypeCode' => 'UNIT', 'dataTypeNameEn' => 'Unit']],
            ['/api/v1/reference-data/'.$type->id.'/values', ['dataValueCode' => 'DODOMA', 'dataValueNameEn' => 'Dodoma']],
        ] as [$url, $payload]) {
            try {
                $this->postJson($url, $payload);
                $this->fail('Audit failure must propagate.');
            } catch (\RuntimeException $exception) {
                $this->assertSame('Audit unavailable', $exception->getMessage());
            }
        }
        $this->assertDatabaseCount('reference_data_types', 1);
        $this->assertDatabaseCount('reference_data_values', 0);
        $this->assertDatabaseCount('audit_events', 0);
    }

    private function loginManager(): void
    {
        $user = new class extends User {
            public function canDo(string $permissionCode, ?\App\Models\Institution $targetInstitution = null): bool
            {
                return $permissionCode === 'reference_data.manage';
            }
        };
        $user->setTable('users');
        $user->fill(['name' => 'Manager', 'email' => 'manager@example.test', 'password' => 'test-password', 'is_active' => true, 'status' => 'active'])->save();
        Sanctum::actingAs($user);
    }

    public function test_partial_update_and_idempotent_deactivation_record_audit(): void
    {
        $this->loginManager();
        $type = ReferenceDataType::create(['data_type_code' => 'REGION', 'data_type_name_en' => 'Region', 'description_en' => 'Keep']);
        $url = '/api/v1/reference-data/'.$type->id;
        $this->patchJson($url, ['dataTypeNameSw' => 'Mkoa'])->assertOk();
        $this->assertSame('Keep', $type->fresh()->description_en);
        $this->deleteJson($url)->assertOk()->assertJsonPath('data.status', 'inactive');
        $this->deleteJson($url)->assertOk();
        $this->assertDatabaseCount('reference_data_types', 1);
        $this->assertDatabaseCount('audit_events', 2);
    }

    public function test_value_rejects_cycles_wrong_type_and_invalid_merged_dates(): void
    {
        $this->loginManager();
        $type = ReferenceDataType::create(['data_type_code' => 'REGION', 'data_type_name_en' => 'Region']);
        $other = ReferenceDataType::create(['data_type_code' => 'OTHER', 'data_type_name_en' => 'Other']);
        $parent = ReferenceDataValue::create(['data_type_id' => $type->id, 'data_value_code' => 'A', 'data_value_name_en' => 'A', 'effective_from' => '2026-01-01']);
        $child = ReferenceDataValue::create(['data_type_id' => $type->id, 'data_value_code' => 'B', 'data_value_name_en' => 'B', 'parent_id' => $parent->id]);
        $url = '/api/v1/reference-data/'.$type->id.'/values/'.$parent->id;
        $this->patchJson($url, ['parentId' => $child->id])->assertUnprocessable();
        $this->patchJson($url, ['effectiveTo' => '2025-12-31'])->assertUnprocessable();
        $this->deleteJson('/api/v1/reference-data/'.$other->id.'/values/'.$parent->id)->assertNotFound();
        $this->assertNull($parent->fresh()->parent_id);
        $this->assertDatabaseCount('audit_events', 0);
    }

    public function test_user_without_permission_cannot_update(): void
    {
        Sanctum::actingAs(User::factory()->create(['is_active' => true, 'status' => 'active']));
        $this->patchJson('/api/v1/reference-data/1', ['status' => 'inactive'])->assertForbidden();
    }
}
