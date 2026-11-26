<?php

namespace Tests\Feature;

use App\Models\AuditEvent;
use App\Models\DatasetDefinition;
use App\Models\DatasetReportingCalendar;
use App\Models\Department;
use App\Models\Institution;
use App\Models\ReferenceDataType;
use App\Models\ReferenceDataValue;
use App\Models\ReportingPeriod;
use App\Models\Role;
use App\Models\Submission;
use App\Models\TemplateVersion;
use App\Models\User;
use App\Services\AuditService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class DatasetConfigurationApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_legacy_draft_targets_are_adopted_explicitly_after_master_activation(): void
    {
        [$user, $dataset, $sector, $subsector] = $this->setupDataset();
        $this->configure($dataset, $sector, $subsector);
        $url = '/api/v1/datasets/'.$dataset->id;
        $period = ReportingPeriod::firstOrFail();
        $payload = ['indicatorId' => $dataset->indicators()->firstOrFail()->id, 'reportingPeriodId' => $period->id,
            'targetValue' => '20', 'targetScope' => 'total'];
        $targetId = $this->postJson($url.'/targets', $payload)->assertCreated()
            ->assertJsonPath('data.templateVersionId', null)->assertJsonPath('data.phase', 'draft')->json('data.id');
        $this->getJson($url.'/configuration-progress')->assertOk()->assertJsonPath('data.canActivate', true);
        $version = $this->postJson($url.'/activate')->assertCreated()->json('data.id');
        $this->assertDatabaseHas('indicator_targets', ['id' => $targetId, 'template_version_id' => null]);
        $this->patchJson($url.'/targets/'.$targetId, ['targetValue' => '20'])->assertOk();
        $this->assertDatabaseHas('indicator_targets', ['id' => $targetId, 'template_version_id' => $version]);
        $this->assertDatabaseHas('audit_events', ['event_type' => 'indicator_target_updated', 'entity_id' => (string) $targetId]);
        $this->getJson($url.'/configuration-progress')->assertOk()->assertJsonPath('data.canActivate', false);
        $snapshot = TemplateVersion::findOrFail($version)->template_content;
        $this->assertArrayNotHasKey('reportingCalendar', $snapshot);
        $this->postJson($url.'/draft')->assertOk();
        $this->patchJson($url.'/targets/'.$targetId, ['targetValue' => '99'])->assertUnprocessable();
        $this->postJson($url.'/targets', $payload)->assertStatus(409);
        $newVersion = $this->postJson($url.'/activate')->assertCreated()->json('data.id');
        $this->assertDatabaseHas('indicator_targets', ['id' => $targetId, 'template_version_id' => $newVersion, 'target_value' => 20]);
        $this->assertDatabaseHas('submission_template_archives', ['from_template_version_id' => $version, 'to_template_version_id' => $newVersion]);
        $this->assertSame($snapshot, TemplateVersion::findOrFail($version)->template_content);
    }

    public function test_reporting_plan_is_not_required_for_targets_or_master_activation(): void
    {
        [$user, $dataset, $sector, $subsector] = $this->setupDataset();
        $this->configure($dataset, $sector, $subsector);
        $url = '/api/v1/datasets/'.$dataset->id;
        DatasetReportingCalendar::query()->delete();
        $this->getJson($url.'/configuration-progress')->assertOk()
            ->assertJsonMissingPath('data.steps.reportingPlan')->assertJsonPath('data.canActivate', true);
        $this->postJson($url.'/targets', ['indicatorId' => $dataset->indicators()->firstOrFail()->id,
            'reportingPeriodId' => ReportingPeriod::firstOrFail()->id, 'targetValue' => '20'])->assertCreated();
        $this->postJson($url.'/activate')->assertCreated();
        $this->assertDatabaseCount('template_versions', 1);
        $other = User::factory()->create(['institution_id' => null, 'status' => 'active', 'is_active' => true]);
        Sanctum::actingAs($other);
        $this->getJson($url.'/configuration-progress')->assertForbidden();
    }

    public function test_old_dimension_targets_do_not_block_master_activation(): void
    {
        [$user, $dataset, $sector, $subsector] = $this->setupDataset();
        $this->configure($dataset, $sector, $subsector);
        $url = '/api/v1/datasets/'.$dataset->id;
        $indicatorId = $dataset->indicators()->firstOrFail()->id;
        $dimension = $this->postJson($url.'/dimensions', ['indicatorIds' => [$indicatorId],
            'dimension' => ['dimensionCode' => 'DIR', 'nameEn' => 'Direction', 'dataType' => 'reference',
                'options' => [['code' => 'IN', 'nameEn' => 'Incoming']]]])->assertCreated()->json('data');
        $targetId = $this->postJson($url.'/targets', ['indicatorId' => $indicatorId,
            'reportingPeriodId' => ReportingPeriod::firstOrFail()->id, 'targetValue' => '20',
            'targetScope' => 'dimensions', 'dimensionValues' => [['dimensionId' => $dimension['dimensionId'],
                'value' => $dimension['dimension']['options'][0]['id']]]])->assertCreated()->json('data.id');
        $this->deleteJson($url.'/dimensions/'.$dimension['dimensionId'])->assertOk();
        $this->getJson($url.'/configuration-progress')->assertOk()->assertJsonPath('data.canActivate', true);
        $this->postJson($url.'/activate')->assertCreated();
        $this->assertDatabaseCount('template_versions', 1);
        $this->postJson($url.'/draft')->assertOk();
        $this->deleteJson($url.'/targets/'.$targetId)->assertOk();
        $this->postJson($url.'/activate')->assertCreated();
    }

    public function test_activation_audit_failure_rolls_back_target_version_binding(): void
    {
        [$user, $dataset, $sector, $subsector] = $this->setupDataset();
        $this->configure($dataset, $sector, $subsector);
        $url = '/api/v1/datasets/'.$dataset->id;
        $targetId = $this->postJson($url.'/targets', ['indicatorId' => $dataset->indicators()->firstOrFail()->id,
            'reportingPeriodId' => ReportingPeriod::firstOrFail()->id, 'targetValue' => '20'])->assertCreated()->json('data.id');
        $this->mock(AuditService::class)->shouldReceive('record')->andThrow(new \RuntimeException('Audit failure'));
        $this->postJson($url.'/activate')->assertStatus(500);
        $this->assertDatabaseCount('template_versions', 0);
        $this->assertDatabaseHas('indicator_targets', ['id' => $targetId, 'template_version_id' => null]);
        $this->assertDatabaseHas('dataset_definitions', ['id' => $dataset->id, 'status' => 'draft']);
    }

    public function test_stale_draft_target_can_be_deactivated_after_period_closes(): void
    {
        [$user, $dataset, $sector, $subsector] = $this->setupDataset();
        $this->configure($dataset, $sector, $subsector);
        $url = '/api/v1/datasets/'.$dataset->id;
        $period = ReportingPeriod::firstOrFail();
        $targetId = $this->postJson($url.'/targets', ['indicatorId' => $dataset->indicators()->firstOrFail()->id,
            'reportingPeriodId' => $period->id, 'targetValue' => '20'])->assertCreated()->json('data.id');
        $period->update(['status' => 'closed', 'automatic_status' => false]);
        $this->getJson($url.'/configuration-progress')->assertOk()->assertJsonPath('data.canActivate', true);
        $this->deleteJson($url.'/targets/'.$targetId)->assertOk()->assertJsonPath('data.status', 'inactive');
        $this->assertDatabaseHas('indicator_targets', ['id' => $targetId, 'template_version_id' => null, 'status' => 'inactive']);
    }

    public function test_manual_options_are_scoped_fetched_and_frozen_in_versions(): void
    {
        [$user, $dataset, $sector, $subsector] = $this->setupDataset();
        $this->configure($dataset, $sector, $subsector);
        $url = '/api/v1/datasets/'.$dataset->id;
        $indicatorId = $dataset->indicators()->firstOrFail()->id;
        $otherId = $this->postJson($url.'/indicators', ['indicator' => ['nameEn' => 'Companies', 'dataType' => 'integer']])->assertCreated()->json('data.indicatorId');
        $payload = ['indicatorIds' => [$indicatorId], 'isRequired' => true, 'dimension' => [
            'dimensionCode' => 'EVENT_DIRECTION', 'nameEn' => 'Event Direction', 'dataType' => 'reference',
            'options' => [['code' => 'INCOMING', 'nameEn' => 'Incoming'], ['code' => 'OUTGOING', 'nameEn' => 'Outgoing']],
        ]];
        $created = $this->postJson($url.'/dimensions', $payload)->assertCreated()->assertJsonCount(2, 'data.dimension.options');
        $dimensionId = $created->json('data.dimensionId');
        $this->getJson($url.'/dimensions?indicatorId='.$indicatorId)->assertOk()->assertJsonCount(1, 'data');
        $this->getJson($url.'/dimensions?indicatorId='.$otherId)->assertOk()->assertJsonCount(0, 'data');
        $this->assertDatabaseCount('reference_data_types', 1);
        $this->deleteJson($url.'/indicators/'.$indicatorId)->assertUnprocessable();
        $versionId = $this->postJson($url.'/activate')->assertCreated()->json('data.id');
        $snapshot = TemplateVersion::findOrFail($versionId)->template_content;
        $this->assertSame([$indicatorId], $snapshot['dimensions'][0]['indicatorIds']);
        $this->assertCount(2, $snapshot['dimensions'][0]['options']);
        $this->assertSame('manual', $snapshot['dimensions'][0]['optionSource']);
        $this->deleteJson($url.'/dimensions/'.$dimensionId)->assertUnprocessable();
        $this->postJson($url.'/draft')->assertOk();
        $this->deleteJson($url.'/dimensions/'.$dimensionId)->assertOk();
        $this->assertSame($snapshot, TemplateVersion::findOrFail($versionId)->template_content);
    }

    public function test_manual_options_reject_invalid_links_duplicates_and_rollback_on_audit_failure(): void
    {
        [$user, $dataset, $sector, $subsector] = $this->setupDataset();
        $this->configure($dataset, $sector, $subsector);
        $url = '/api/v1/datasets/'.$dataset->id.'/dimensions';
        $payload = ['indicatorIds' => [999999], 'dimension' => ['dimensionCode' => 'LOCAL', 'nameEn' => 'Local',
            'dataType' => 'reference', 'options' => [['code' => 'A', 'nameEn' => 'First']]]];
        $this->postJson($url, $payload)->assertUnprocessable();
        $this->assertDatabaseCount('dimension_options', 0);
        $this->assertDatabaseCount('dimension_definitions', 0);
        $payload['indicatorIds'] = [$dataset->indicators()->firstOrFail()->id];
        $payload['dimension']['options'][] = ['code' => 'A', 'nameEn' => 'Duplicate'];
        $this->postJson($url, $payload)->assertUnprocessable();
        array_pop($payload['dimension']['options']);
        $this->mock(AuditService::class, fn ($mock) => $mock->shouldReceive('record')->andThrow(new \RuntimeException('Audit failed')));
        $this->postJson($url, $payload)->assertStatus(500);
        $this->assertDatabaseCount('dimension_options', 0);
        $this->assertDatabaseCount('dimension_definitions', 0);
        $this->assertDatabaseCount('dataset_dimension_indicators', 0);
    }

    private function setupDataset(): array
    {
        $institution = Institution::create(['code' => 'MIT', 'name' => 'Ministry', 'status' => 'active', 'is_active' => true]);
        $user = User::factory()->create(['institution_id' => $institution->id, 'status' => 'active', 'is_active' => true]);
        $role = Role::create(['code' => 'IDO', 'name' => 'Data Officer']);
        $user->roles()->attach($role->id, ['status' => 'active']);
        Sanctum::actingAs($user);
        $dataset = DatasetDefinition::create(['institution_id' => $institution->id, 'dataset_code' => 'TEST/1', 'dataset_name' => 'Trade', 'created_by' => $user->id]);
        $dataset->frequencies()->create(['frequency' => 'quarterly']);
        // Activation sasa inahitaji reporting plan yenye mpokeaji halali.
        $period = ReportingPeriod::create(['institution_id' => $institution->id,
            'period_type' => 'quarterly', 'year_type' => 'financial', 'quarter' => 1,
            'period_code' => 'FY-2026-Q1', 'label' => '2026/2027 Q1', 'start_date' => '2026-07-01',
            'end_date' => '2026-09-30', 'deadline' => '2026-10-15', 'created_by' => $user->id]);
        DatasetReportingCalendar::create(['dataset_definition_id' => $dataset->id,
            'reporting_period_id' => $period->id, 'responsible_user_id' => $user->id,
            'deadline_days' => 15, 'deadline' => '2026-10-15', 'reminder_days' => [7, 1], 'created_by' => $user->id]);
        $type = ReferenceDataType::create(['data_type_code' => 'SECTOR', 'data_type_name_en' => 'Sector']);
        $sector = ReferenceDataValue::create(['data_type_id' => $type->id, 'data_value_code' => 'TRADE', 'data_value_name_en' => 'Trade']);
        $subsector = ReferenceDataValue::create(['data_type_id' => $type->id, 'data_value_code' => 'RETAIL', 'data_value_name_en' => 'Retail', 'parent_id' => $sector->id]);

        return [$user, $dataset, $sector, $subsector];
    }

    private function configure(DatasetDefinition $dataset, ReferenceDataValue $sector, ReferenceDataValue $subsector): void
    {
        $url = '/api/v1/datasets/'.$dataset->id;
        $dataset->sectors()->attach($sector->id);
        $dataset->subsectors()->attach($subsector->id);
        $this->postJson($url.'/indicators', ['indicator' => ['nameEn' => 'Permits', 'dataType' => 'integer']])->assertCreated();
    }

    public function test_sectors_are_selected_at_creation_and_can_be_updated_while_draft(): void
    {
        [$user, $dataset, $sector, $subsector] = $this->setupDataset();
        $payload = ['responsibleUserId' => $user->id, 'institutionId' => $dataset->institution_id, 'datasetName' => 'New trade',
            'frequencies' => ['monthly'], 'sectors' => [['sectorId' => $sector->id, 'subsectorIds' => [$subsector->id]]]];
        $id = $this->postJson('/api/v1/datasets', $payload)->assertCreated()
            ->assertJsonPath('data.sectorIds', [$sector->id])
            ->assertJsonPath('data.subsectorIds', [$subsector->id])->json('data.id');
        $this->getJson('/api/v1/datasets/'.$id.'/sectors')->assertOk()->assertJsonCount(1, 'data');
        $other = ReferenceDataValue::create(['data_type_id' => $sector->data_type_id, 'data_value_code' => 'INDUSTRY', 'data_value_name_en' => 'Industry']);
        $this->patchJson('/api/v1/datasets/'.$id, ['sectors' => [['sectorId' => $other->id, 'subsectorIds' => []]]])->assertOk()
            ->assertJsonPath('data.id', $id)->assertJsonPath('data.datasetName', 'New trade')
            ->assertJsonPath('data.sectorIds', [$other->id])->assertJsonPath('data.subsectorIds', []);
        $this->assertDatabaseCount('dataset_sectors', 1);
        $this->assertDatabaseHas('dataset_sectors', ['dataset_definition_id' => $id, 'sector_id' => $other->id]);
        $this->patchJson('/api/v1/datasets/'.$id.'/sectors', ['sectors' => [['sectorId' => $sector->id, 'subsectorIds' => [$subsector->id]]]])->assertOk();
        $this->assertDatabaseHas('dataset_sectors', ['dataset_definition_id' => $id, 'sector_id' => $sector->id]);
        $this->assertDatabaseCount('dataset_definitions', 2);
        $this->assertDatabaseCount('dataset_code_counters', 1);
        $this->assertDatabaseCount('audit_events', 3);
        $payload['sectors'][0]['sectorId'] = $other->id;
        $payload['sectors'][0]['subsectorIds'] = [];
        $this->postJson('/api/v1/datasets', $payload)->assertCreated();
        $payload['sectors'] = [];
        $this->postJson('/api/v1/datasets', $payload)->assertUnprocessable();
        unset($payload['sectors']);
        $this->postJson('/api/v1/datasets', $payload)->assertUnprocessable();
    }

    public function test_invalid_sector_rolls_back_metadata_frequencies_and_audit(): void
    {
        [$user, $dataset, $sector, $subsector] = $this->setupDataset();
        $this->configure($dataset, $sector, $subsector);
        $other = ReferenceDataValue::create(['data_type_id' => $sector->data_type_id, 'data_value_code' => 'INDUSTRY', 'data_value_name_en' => 'Industry']);
        $auditCount = AuditEvent::count();
        $this->patchJson('/api/v1/datasets/'.$dataset->id, [
            'datasetName' => 'Must roll back', 'frequencies' => ['monthly'],
            'sectors' => [['sectorId' => $other->id, 'subsectorIds' => [$subsector->id]]],
        ])->assertUnprocessable();
        $this->assertSame('Trade', $dataset->fresh()->dataset_name);
        $this->assertSame(['quarterly'], $dataset->frequencies()->pluck('frequency')->all());
        $this->assertSame([$sector->id], $dataset->sectors()->pluck('reference_data_values.id')->all());
        $this->assertSame($auditCount, AuditEvent::count());
    }

    public function test_sector_version_change_preserves_submitted_history(): void
    {
        [$user, $dataset, $sector, $subsector] = $this->setupDataset();
        $this->configure($dataset, $sector, $subsector);
        $url = '/api/v1/datasets/'.$dataset->id;
        $v1 = $this->postJson($url.'/activate')->assertCreated()->json('data.id');
        $calendar = DatasetReportingCalendar::where('dataset_definition_id', $dataset->id)->firstOrFail();
        $calendar->update(['template_version_id' => $v1, 'submitted_at' => now()]);
        $submission = Submission::create(['reference' => 'SECTOR-HISTORY', 'reporting_calendar_id' => $calendar->id,
            'template_version_id' => $v1, 'created_by' => $user->id, 'status' => 'submitted', 'attempt' => 1, 'submitted_at' => now()]);
        $original = TemplateVersion::findOrFail($v1)->template_content;
        $other = ReferenceDataValue::create(['data_type_id' => $sector->data_type_id, 'data_value_code' => 'INDUSTRY', 'data_value_name_en' => 'Industry']);
        $payload = ['sectors' => [['sectorId' => $other->id, 'subsectorIds' => []]]];
        $this->patchJson($url.'/sectors', $payload)->assertUnprocessable();
        $this->patchJson($url, $payload)->assertUnprocessable();
        $this->postJson($url.'/draft')->assertOk();
        $this->patchJson($url.'/sectors', $payload)->assertOk()->assertJsonPath('data.0.sectorId', $other->id);
        $v2 = $this->postJson($url.'/activate')->assertCreated()->json('data.id');
        $this->assertNotEquals($v1, $v2);
        $this->assertEquals($v1, $submission->fresh()->template_version_id);
        $this->assertEquals($v1, $calendar->fresh()->template_version_id);
        $this->assertSame($original, TemplateVersion::findOrFail($v1)->template_content);
        $this->assertEquals($other->id, TemplateVersion::findOrFail($v2)->template_content['sectors'][0]['sectorId']);
    }

    public function test_dimensions_versions_and_reactivation_preserve_history(): void
    {
        [$user, $dataset, $sector, $subsector] = $this->setupDataset();
        $this->configure($dataset, $sector, $subsector);
        $url = '/api/v1/datasets/'.$dataset->id;
        $type = ReferenceDataType::create(['data_type_code' => 'REGION', 'data_type_name_en' => 'Region']);
        $region = ReferenceDataValue::create(['data_type_id' => $type->id, 'data_value_code' => 'DAR', 'data_value_name_en' => 'Dar es Salaam']);
        $dimensionId = $this->postJson($url.'/dimensions', ['dimension' => [
            'dimensionCode' => 'REGION', 'nameEn' => 'Region', 'dataType' => 'reference', 'referenceTypeId' => $type->id,
        ], 'isRequired' => true])->assertCreated()->json('data.dimensionId');
        $this->postJson($url.'/dimensions', ['dimensionId' => $dimensionId])->assertStatus(409);
        $this->patchJson($url.'/dimensions/'.$dimensionId, ['displayOrder' => 2])->assertOk()->assertJsonPath('data.isRequired', true);
        $this->getJson($url.'/dimensions')->assertOk()->assertJsonPath('total', 1);
        $v1 = $this->postJson($url.'/activate')->assertCreated()->assertJsonPath('data.version_number', 1)->json('data.id');
        $original = TemplateVersion::findOrFail($v1)->template_content;
        $this->assertSame('Dar es Salaam', $original['dimensions'][0]['referenceValues'][0]['data_value_name_en']);
        $this->postJson($url.'/activate')->assertUnprocessable();
        $this->putJson($url.'/sectors', ['sectors' => []])->assertStatus(405);
        $this->deleteJson($url.'/dimensions/'.$dimensionId)->assertUnprocessable();
        $this->postJson($url.'/draft')->assertOk()->assertJsonPath('data.status', 'draft');
        $region->update(['data_value_name_en' => 'Dar']);
        $this->postJson($url.'/indicators', ['indicator' => ['nameEn' => 'Markets', 'dataType' => 'integer']])->assertCreated();
        $v2 = $this->postJson($url.'/activate')->assertCreated()->assertJsonPath('data.version_number', 2)->json('data.id');
        $this->assertSame($original, TemplateVersion::findOrFail($v1)->template_content);
        $this->assertCount(2, TemplateVersion::findOrFail($v2)->template_content['indicators']);
        $this->getJson($url.'/template-versions')->assertOk()->assertJsonPath('total', 2);
        $this->getJson($url.'/template-versions/'.$v1)->assertOk()->assertJsonPath('data.version_number', 1);
        $this->getJson($url)->assertOk()->assertJsonPath('data.latestTemplateVersionId', $v2);
        $this->postJson($url.'/draft')->assertOk();
        $this->deleteJson($url.'/dimensions/'.$dimensionId)->assertOk();
        $this->assertDatabaseCount('dimension_definitions', 1);
    }

    public function test_activation_rejects_missing_and_expired_configuration(): void
    {
        [$user, $dataset, $sector, $subsector] = $this->setupDataset();
        $url = '/api/v1/datasets/'.$dataset->id;
        $this->postJson($url.'/activate')->assertUnprocessable();
        $dataset->sectors()->attach($sector->id);
        $this->postJson($url.'/activate')->assertUnprocessable();
        $this->postJson($url.'/indicators', ['indicator' => ['nameEn' => 'Permits', 'dataType' => 'integer']])->assertCreated();
        $sector->update(['effective_to' => today()->subDay()]);
        $this->postJson($url.'/activate')->assertUnprocessable();
        $sector->update(['effective_to' => null]);
        $dataset->frequencies()->delete();
        $this->postJson($url.'/activate')->assertUnprocessable();
        $this->assertDatabaseCount('template_versions', 0);
        $this->assertSame('draft', $dataset->fresh()->status);
    }

    public function test_dimension_validation_and_activation_audit_rollback(): void
    {
        [$user, $dataset, $sector, $subsector] = $this->setupDataset();
        $this->configure($dataset, $sector, $subsector);
        $url = '/api/v1/datasets/'.$dataset->id;
        $this->postJson($url.'/dimensions', ['dimension' => ['dimensionCode' => 'BAD', 'nameEn' => 'Bad', 'dataType' => 'reference']])->assertUnprocessable();
        $this->assertDatabaseCount('dimension_definitions', 0);
        $this->mock(AuditService::class, function ($mock) {
            $mock->shouldReceive('record')->once()->ordered()->andReturn(new AuditEvent);
            $mock->shouldReceive('record')->once()->ordered()->andThrow(new \RuntimeException('Audit failed'));
        });
        $this->postJson($url.'/activate')->assertStatus(500);
        $this->assertDatabaseCount('template_versions', 0);
        $this->assertSame('draft', $dataset->fresh()->status);
    }

    public function test_template_model_rejects_mutation(): void
    {
        [$user, $dataset, $sector, $subsector] = $this->setupDataset();
        $this->configure($dataset, $sector, $subsector);
        $id = $this->postJson('/api/v1/datasets/'.$dataset->id.'/activate')->assertCreated()->json('data.id');
        $this->expectException(\LogicException::class);
        TemplateVersion::findOrFail($id)->update(['template_content' => []]);
    }

    public function test_dimension_catalogue_permissions_and_active_usage(): void
    {
        [$user, $dataset, $sector, $subsector] = $this->setupDataset();
        $this->configure($dataset, $sector, $subsector);
        $url = '/api/v1/datasets/'.$dataset->id;
        $dimensionId = $this->postJson($url.'/dimensions', ['dimension' => [
            'dimensionCode' => 'NOTE', 'nameEn' => 'Category note', 'dataType' => 'text',
        ]])->assertCreated()->json('data.dimensionId');
        $this->getJson('/api/v1/dimensions')->assertOk()->assertJsonPath('total', 1);
        $this->getJson('/api/v1/dimensions/'.$dimensionId)->assertOk();
        $other = User::factory()->create(['institution_id' => $user->institution_id, 'status' => 'active', 'is_active' => true]);
        $other->roles()->attach(Role::where('code', 'IDO')->value('id'), ['status' => 'active']);
        Sanctum::actingAs($other);
        $this->patchJson('/api/v1/dimensions/'.$dimensionId, ['nameEn' => 'Changed'])->assertForbidden();
        Sanctum::actingAs($user);
        $this->patchJson('/api/v1/dimensions/'.$dimensionId, ['nameSw' => 'Maelezo'])->assertOk()->assertJsonPath('data.nameEn', 'Category note');
        $this->postJson($url.'/activate')->assertCreated();
        $this->deleteJson('/api/v1/dimensions/'.$dimensionId)->assertUnprocessable();
        $this->postJson($url.'/draft')->assertOk();
        $this->deleteJson('/api/v1/dimensions/'.$dimensionId)->assertOk()->assertJsonPath('data.status', 'inactive');
        $this->postJson($url.'/activate')->assertUnprocessable();
        $this->patchJson('/api/v1/dimensions/'.$dimensionId, ['status' => 'active'])->assertOk();
        $this->postJson($url.'/activate')->assertCreated();
    }

    public function test_ddo_department_scope_and_moa_override(): void
    {
        [$user, $dataset, $sector, $subsector] = $this->setupDataset();
        $department = Department::create(['code' => 'TRADE', 'name' => 'Trade', 'is_active' => true, 'status' => 'active']);
        $otherDepartment = Department::create(['code' => 'IND', 'name' => 'Industry', 'is_active' => true, 'status' => 'active']);
        $dataset->update(['department_id' => $department->id]);
        $ddo = Role::create(['code' => 'DDO', 'name' => 'DDO']);
        $user->roles()->sync([$ddo->id => ['status' => 'active']]);
        $user->update(['department_id' => $otherDepartment->id]);
        $url = '/api/v1/datasets/'.$dataset->id;
        $this->getJson($url.'/dimensions')->assertNotFound();
        $this->postJson($url.'/activate')->assertNotFound();
        $user->update(['department_id' => $department->id]);
        $this->configure($dataset, $sector, $subsector);
        $versionId = $this->postJson($url.'/activate')->assertCreated()->json('data.id');
        $user->update(['department_id' => $otherDepartment->id]);
        $this->getJson($url.'/template-versions/'.$versionId)->assertNotFound();
        $moa = Role::create(['code' => 'MOA', 'name' => 'MOA']);
        $user->roles()->sync([$moa->id => ['status' => 'active']]);
        $this->getJson($url.'/template-versions/'.$versionId)->assertOk();
    }
}
