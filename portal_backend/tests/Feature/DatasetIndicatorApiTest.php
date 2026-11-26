<?php

namespace Tests\Feature;

use App\Models\AuditEvent;
use App\Models\DatasetDefinition;
use App\Models\Indicator;
use App\Models\Institution;
use App\Models\Role;
use App\Models\User;
use App\Services\AuditService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class DatasetIndicatorApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_nested_indicator_direction_is_saved_and_active_definition_is_protected(): void
    {
        [$user, $dataset] = $this->setupDataset();
        $payload = $this->payload();
        $payload['indicator']['performanceDirection'] = 'lower_is_better';
        $id = $this->postJson('/api/v1/datasets/'.$dataset->id.'/indicators', $payload)
            ->assertCreated()->assertJsonPath('data.indicator.performanceDirection', 'lower_is_better')->json('data.indicatorId');
        $dataset->update(['status' => 'active']);
        $this->patchJson('/api/v1/indicators/'.$id, ['performanceDirection' => 'higher_is_better'])->assertUnprocessable();
        $this->assertDatabaseHas('indicators', ['id' => $id, 'performance_direction' => 'lower_is_better']);
    }

    private function setupDataset(string $role = 'IDO'): array
    {
        $institution = Institution::firstOrCreate(['code' => 'TANTRADE'], ['name' => 'Tantrade', 'is_active' => true, 'status' => 'active']);
        $user = User::factory()->create(['institution_id' => $institution->id, 'is_active' => true, 'status' => 'active']);
        $roleModel = Role::firstOrCreate(['code' => $role], ['name' => $role]);
        $user->roles()->attach($roleModel->id, ['status' => 'active']);
        Sanctum::actingAs($user);
        $dataset = DatasetDefinition::create(['institution_id' => $institution->id, 'dataset_code' => 'DS-'.$user->id,
            'dataset_name' => 'Trade data', 'created_by' => $user->id]);

        return [$user, $dataset];
    }

    private function payload(): array
    {
        return ['indicator' => ['nameEn' => 'Permits issued', 'dataType' => 'integer', 'aggregationRule' => 'sum'],
            'isRequired' => true, 'displayOrder' => 1];
    }

    public function test_create_attach_update_detach_and_audit(): void
    {
        [$user, $dataset] = $this->setupDataset();
        $url = '/api/v1/datasets/'.$dataset->id.'/indicators';
        $id = $this->postJson($url, $this->payload())->assertCreated()
            ->assertJsonPath('data.indicator.indicatorCode', 'TANTRADE/IND/'.now()->year.'/0001')->json('data.indicatorId');
        $this->assertTrue($dataset->indicators()->whereKey($id)->exists());
        $this->getJson($url)->assertOk()->assertJsonPath('total', 1);
        $this->postJson($url, ['indicatorId' => $id])->assertStatus(409);
        $this->patchJson($url.'/'.$id, ['isRequired' => false, 'displayOrder' => 3])->assertOk()->assertJsonPath('data.isRequired', false);
        $this->deleteJson($url.'/'.$id)->assertOk();
        $this->assertDatabaseCount('indicators', 1);
        $this->assertDatabaseCount('dataset_indicators', 0);
        $this->assertDatabaseCount('audit_events', 4);
        $this->postJson($url, ['indicatorId' => $id])->assertCreated();
        $this->assertDatabaseCount('indicators', 1);
    }

    public function test_scope_draft_and_inactive_indicator_guards(): void
    {
        [$user, $dataset] = $this->setupDataset();
        $url = '/api/v1/datasets/'.$dataset->id.'/indicators';
        $this->postJson($url, $this->payload())->assertCreated();
        $indicator = Indicator::sole();
        $dataset->update(['status' => 'active']);
        $this->patchJson('/api/v1/indicators/'.$indicator->id, ['dataType' => 'decimal'])->assertUnprocessable();
        $this->deleteJson('/api/v1/indicators/'.$indicator->id)->assertUnprocessable();
        $this->deleteJson($url.'/'.$indicator->id)->assertUnprocessable();
        $this->postJson($url, $this->payload())->assertUnprocessable();
        $dataset->update(['status' => 'draft']);
        $other = Institution::create(['code' => 'CBE', 'name' => 'CBE', 'is_active' => true, 'status' => 'active']);
        $user->update(['institution_id' => $other->id]);
        $this->getJson($url)->assertNotFound();
        $this->postJson($url, $this->payload())->assertNotFound();
        $user->update(['institution_id' => $dataset->institution_id]);
        $this->deleteJson($url.'/'.$indicator->id)->assertOk();
        $indicator->update(['status' => 'inactive']);
        $this->postJson($url, ['indicatorId' => $indicator->id])->assertUnprocessable();
        $this->postJson($url, $this->payload() + ['indicatorId' => $indicator->id])->assertUnprocessable();
    }

    public function test_codes_preserve_legacy_and_increment_and_reject_manual_changes(): void
    {
        [$user, $dataset] = $this->setupDataset();
        $prefix = 'TANTRADE/IND/'.now()->year.'/';
        $legacy = new Indicator(['indicator_code' => $prefix.'0010', 'name_en' => 'Legacy', 'data_type' => 'integer']);
        $legacy->created_by = $user->id;
        $legacy->save();
        $url = '/api/v1/datasets/'.$dataset->id.'/indicators';
        $id = $this->postJson($url, $this->payload())->assertCreated()
            ->assertJsonPath('data.indicator.indicatorCode', $prefix.'0011')->json('data.indicatorId');
        $this->postJson($url, $this->payload())->assertCreated()->assertJsonPath('data.indicator.indicatorCode', $prefix.'0012');
        $this->patchJson('/api/v1/indicators/'.$id, ['indicatorCode' => 'MANUAL'])->assertUnprocessable();
        $this->assertSame($prefix.'0010', $legacy->fresh()->indicator_code);
        $nextYear = now()->year + 1;
        $this->travelTo(now()->addYear());
        $this->postJson($url, $this->payload())->assertCreated()
            ->assertJsonPath('data.indicator.indicatorCode', 'TANTRADE/IND/'.$nextYear.'/0001');
        $this->travelBack();
    }

    public function test_link_audit_failure_rolls_back_indicator_link_and_counter(): void
    {
        [$user, $dataset] = $this->setupDataset();
        $this->mock(AuditService::class, function ($mock) {
            $mock->shouldReceive('record')->once()->ordered()->andReturn(new AuditEvent);
            $mock->shouldReceive('record')->once()->ordered()->andThrow(new \RuntimeException('Audit failed'));
        });
        $this->postJson('/api/v1/datasets/'.$dataset->id.'/indicators', $this->payload())->assertStatus(500);
        $this->assertDatabaseCount('indicators', 0);
        $this->assertDatabaseCount('dataset_indicators', 0);
        $this->assertDatabaseCount('indicator_code_counters', 0);
    }
}
