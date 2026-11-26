<?php

namespace Tests\Feature;

use App\Models\AuditEvent;
use App\Models\Indicator;
use App\Models\ReferenceDataType;
use App\Models\ReferenceDataValue;
use App\Models\Role;
use App\Models\User;
use App\Services\AuditService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class IndicatorApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_performance_direction_is_validated_saved_and_editable(): void
    {
        $this->actor();
        $id = $this->postJson('/api/v1/indicators', $this->payload() + ['performanceDirection' => 'lower_is_better'])
            ->assertCreated()->assertJsonPath('data.performanceDirection', 'lower_is_better')->json('data.id');
        $this->patchJson('/api/v1/indicators/'.$id, ['performanceDirection' => 'neutral'])
            ->assertOk()->assertJsonPath('data.performanceDirection', 'neutral');
        $this->patchJson('/api/v1/indicators/'.$id, ['performanceDirection' => 'sideways'])->assertUnprocessable();
        $this->assertDatabaseHas('indicators', ['id' => $id, 'performance_direction' => 'neutral']);
    }

    private function actor(string $role = 'IDO'): User
    {
        $user = User::factory()->create(['is_active' => true, 'status' => 'active']);
        $roleModel = Role::firstOrCreate(['code' => $role], ['name' => $role]);
        $user->roles()->attach($roleModel->id, ['status' => 'active']);
        Sanctum::actingAs($user);

        return $user;
    }

    private function payload(): array
    {
        return ['nameEn' => 'Students', 'nameSw' => 'Wanafunzi',
            'dataType' => 'integer', 'aggregationRule' => 'sum'];
    }

    public function test_crud_preserves_partial_fields_and_records_audit(): void
    {
        $actor = $this->actor();
        $id = $this->postJson('/api/v1/indicators', $this->payload())
            ->assertCreated()->assertJsonPath('data.createdBy', $actor->id)->json('data.id');
        $this->getJson('/api/v1/indicators/'.$id)->assertOk();
        $this->getJson('/api/v1/indicators?dataType=integer')->assertOk()->assertJsonPath('total', 1);
        $this->patchJson('/api/v1/indicators/'.$id, ['nameSw' => null])
            ->assertOk()->assertJsonPath('data.nameSw', null)->assertJsonPath('data.nameEn', 'Students');
        $this->deleteJson('/api/v1/indicators/'.$id)->assertOk()->assertJsonPath('data.status', 'inactive');
        $this->deleteJson('/api/v1/indicators/'.$id)->assertOk();
        $this->assertDatabaseCount('indicators', 1);
        $this->assertDatabaseCount('audit_events', 3);
        $audit = AuditEvent::where('event_type', 'indicator_created')->sole();
        $this->assertSame($actor->id, $audit->user_id);
        $this->assertNotEmpty($audit->request_id);
    }

    public function test_permissions_and_creator_ownership(): void
    {
        $this->getJson('/api/v1/indicators')->assertUnauthorized();
        $this->actor();
        $id = $this->postJson('/api/v1/indicators', $this->payload())->assertCreated()->json('data.id');
        $this->actor('DDO');
        $this->getJson('/api/v1/indicators/'.$id)->assertOk();
        $this->patchJson('/api/v1/indicators/'.$id, ['nameEn' => 'Changed'])->assertForbidden();
        $this->deleteJson('/api/v1/indicators/'.$id)->assertForbidden();
        $this->actor('MOA');
        $this->patchJson('/api/v1/indicators/'.$id, ['nameEn' => 'Changed'])->assertOk();
        $this->actor('IM');
        $this->postJson('/api/v1/indicators', $this->payload())->assertForbidden();
    }

    public function test_validates_combined_configuration_and_unit_type(): void
    {
        $this->actor();
        $id = $this->postJson('/api/v1/indicators', $this->payload())->assertCreated()->json('data.id');
        $this->postJson('/api/v1/indicators', $this->payload() + ['indicatorCode' => 'MANUAL'])->assertUnprocessable();
        $this->patchJson('/api/v1/indicators/'.$id, ['dataType' => 'text'])->assertUnprocessable();
        $this->assertSame('integer', Indicator::findOrFail($id)->data_type);
        $type = ReferenceDataType::create(['data_type_code' => 'REGION', 'data_type_name_en' => 'Region']);
        $unit = ReferenceDataValue::create(['data_type_id' => $type->id, 'data_value_code' => 'TZS', 'data_value_name_en' => 'TZS']);
        $this->patchJson('/api/v1/indicators/'.$id, ['unitId' => $unit->id])->assertUnprocessable();
        $type->update(['data_type_code' => 'UNIT']);
        $this->patchJson('/api/v1/indicators/'.$id, ['unitId' => $unit->id])->assertOk();
        $unit->update(['status' => 'inactive']);
        $this->deleteJson('/api/v1/indicators/'.$id)->assertOk();
        $this->patchJson('/api/v1/indicators/'.$id, ['status' => 'active'])->assertUnprocessable();
    }

    public function test_audit_failure_rolls_back_creation(): void
    {
        $this->actor();
        $this->mock(AuditService::class)->shouldReceive('record')->once()->andThrow(new \RuntimeException('Audit failed'));
        $this->postJson('/api/v1/indicators', $this->payload())->assertStatus(500);
        $this->assertDatabaseCount('indicators', 0);
        $this->assertDatabaseCount('audit_events', 0);
    }
}
