<?php

namespace Tests\Feature;

use App\Models\DatasetDefinition;
use App\Models\DatasetReportingCalendar;
use App\Models\Institution;
use App\Models\ReferenceDataType;
use App\Models\ReferenceDataValue;
use App\Models\ReportingPeriod;
use App\Models\Role;
use App\Models\User;
use App\Services\AuditService;
use Database\Seeders\RolesPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class PeriodsAndTargetsApiTest extends TestCase
{
    use RefreshDatabase;

    private function setupUser(): array
    {
        $this->seed(RolesPermissionsSeeder::class);
        $institution = Institution::create(['code' => 'TANTRADE', 'name' => 'Tantrade', 'is_active' => true, 'status' => 'active']);
        $user = User::factory()->create(['institution_id' => $institution->id, 'is_active' => true, 'status' => 'active']);
        $user->roles()->attach(Role::where('code', 'MOA')->value('id'), ['status' => 'active']);
        Sanctum::actingAs($user);

        return [$user, $institution];
    }

    private function annual(int $institutionId): array
    {
        return ['periodType' => 'annual', 'yearType' => 'financial',
            'startDate' => '2026-07-01', 'endDate' => '2027-06-30', 'deadline' => '2027-07-31'];
    }

    public function test_all_dataset_frequencies_have_bounded_reporting_periods(): void
    {
        [$user, $institution] = $this->setupUser();
        $parent = $this->postJson('/api/v1/reporting-periods', $this->annual($institution->id))->assertCreated()->json('data.id');
        foreach ([
            ['monthly', 2, '2026-08-01', '2026-08-31'],
            ['semiannual', 2, '2027-01-01', '2027-06-30'],
            ['weekly', 53, '2027-06-30', '2027-06-30'],
            ['daily', 365, '2027-06-30', '2027-06-30'],
        ] as [$type, $number, $start, $end]) {
            $payload = ['periodType' => $type, 'parentId' => $parent,
                'periodNumber' => $number, 'deadline' => '2027-07-31'];
            $this->postJson('/api/v1/reporting-periods', $payload)->assertCreated()
                ->assertJsonPath('data.startDate', $start)->assertJsonPath('data.endDate', $end);
            $this->postJson('/api/v1/reporting-periods', $payload)->assertStatus(409);
        }
        $this->postJson('/api/v1/reporting-periods', ['periodType' => 'daily',
            'parentId' => $parent, 'periodNumber' => 366, 'deadline' => '2027-07-31'])->assertUnprocessable();
        $this->deleteJson('/api/v1/reporting-periods/'.$parent)->assertOk();
        $this->postJson('/api/v1/reporting-periods', ['periodType' => 'monthly',
            'parentId' => $parent, 'periodNumber' => 3, 'deadline' => '2027-07-31'])->assertUnprocessable();
    }

    private function fixture(): array
    {
        [$user, $institution] = $this->setupUser();
        $annual = $this->postJson('/api/v1/reporting-periods', $this->annual($institution->id))->assertCreated()->json('data.id');
        $quarter = $this->postJson('/api/v1/reporting-periods', [
            'periodType' => 'quarterly', 'parentId' => $annual, 'quarter' => 1, 'deadline' => '2026-10-31'])
            ->assertCreated()->assertJsonPath('data.startDate', '2026-07-01')->assertJsonPath('data.endDate', '2026-09-30')->json('data.id');
        $dataset = DatasetDefinition::create(['institution_id' => $institution->id, 'dataset_code' => 'DS1', 'dataset_name' => 'Trade', 'created_by' => $user->id]);
        $dataset->frequencies()->createMany([['frequency' => 'annual'], ['frequency' => 'quarterly']]);
        $officer = User::factory()->create(['institution_id' => $institution->id, 'status' => 'active', 'is_active' => true]);
        $officer->roles()->attach(Role::where('code', 'IDO')->value('id'), ['status' => 'active']);
        foreach ([$annual, $quarter] as $periodId) {
            DatasetReportingCalendar::create(['dataset_definition_id' => $dataset->id,
                'reporting_period_id' => $periodId, 'responsible_user_id' => $officer->id,
                'deadline_days' => 15, 'deadline' => ReportingPeriod::findOrFail($periodId)->end_date->addDays(15),
                'reminder_days' => [], 'created_by' => $user->id]);
        }
        $type = ReferenceDataType::create(['data_type_code' => 'SECTOR', 'data_type_name_en' => 'Sector']);
        $sector = ReferenceDataValue::create(['data_type_id' => $type->id, 'data_value_code' => 'TRADE', 'data_value_name_en' => 'Trade']);
        $regionType = ReferenceDataType::create(['data_type_code' => 'REGION', 'data_type_name_en' => 'Region']);
        $region = ReferenceDataValue::create(['data_type_id' => $regionType->id, 'data_value_code' => 'DAR', 'data_value_name_en' => 'Dar']);
        $url = '/api/v1/datasets/'.$dataset->id;
        $dataset->sectors()->attach($sector->id);
        $indicator = $this->postJson($url.'/indicators', ['indicator' => ['nameEn' => 'Permits', 'dataType' => 'integer']])->assertCreated()->json('data.indicatorId');
        $dimension = $this->postJson($url.'/dimensions', ['dimension' => ['dimensionCode' => 'REGION', 'nameEn' => 'Region',
            'dataType' => 'reference', 'referenceTypeId' => $regionType->id]])->assertCreated()->json('data.dimensionId');
        $version = $this->postJson($url.'/activate')->assertCreated()->json('data.id');

        return compact('user', 'institution', 'annual', 'quarter', 'dataset', 'indicator', 'dimension', 'region', 'version', 'url');
    }

    private function target(array $fixture): array
    {
        return ['indicatorId' => $fixture['indicator'], 'reportingPeriodId' => $fixture['quarter'],
            'templateVersionId' => $fixture['version'], 'targetValue' => '100', 'targetScope' => 'total'];
    }

    public function test_manual_dimension_targets_use_frozen_options_and_indicator_scope(): void
    {
        $f = $this->fixture();
        $url = $f['url'];
        $this->postJson($url.'/draft')->assertOk();
        $other = $this->postJson($url.'/indicators', ['indicator' => ['nameEn' => 'Other', 'dataType' => 'integer']])->assertCreated()->json('data.indicatorId');
        $manual = $this->postJson($url.'/dimensions', ['indicatorIds' => [$f['indicator']], 'isRequired' => true,
            'dimension' => ['dimensionCode' => 'DIRECTION', 'nameEn' => 'Direction', 'dataType' => 'reference',
                'options' => [['code' => 'IN', 'nameEn' => 'Incoming']]]])->assertCreated()->json('data');
        $version = $this->postJson($url.'/activate')->assertCreated()->json('data.id');
        $payload = array_replace($this->target($f), ['templateVersionId' => $version, 'targetScope' => 'dimensions',
            'dimensionValues' => [['dimensionId' => $f['dimension'], 'value' => $f['region']->id]]]);
        $this->postJson($url.'/targets', $payload)->assertUnprocessable();
        $payload['dimensionValues'][] = ['dimensionId' => $manual['dimensionId'], 'value' => 999999];
        $this->postJson($url.'/targets', $payload)->assertUnprocessable();
        $payload['dimensionValues'][1]['value'] = $manual['dimension']['options'][0]['id'];
        $this->postJson($url.'/targets', $payload)->assertCreated();
        $payload['indicatorId'] = $other;
        $this->postJson($url.'/targets', $payload)->assertUnprocessable();
        array_pop($payload['dimensionValues']);
        $this->postJson($url.'/targets', $payload)->assertCreated();
    }

    public function test_period_dates_permissions_duplicates_and_closing(): void
    {
        [$user, $institution] = $this->setupUser();
        $payload = $this->annual($institution->id);
        $id = $this->postJson('/api/v1/reporting-periods', $payload)->assertCreated()->json('data.id');
        $this->postJson('/api/v1/reporting-periods', $payload)->assertStatus(409);
        $this->postJson('/api/v1/reporting-periods', array_replace($payload, ['startDate' => '2027-07-01', 'endDate' => '2028-05-31', 'deadline' => '2028-07-31']))->assertUnprocessable();
        $this->postJson('/api/v1/reporting-periods', array_replace($payload, ['yearType' => 'calendar']))->assertUnprocessable();
        $quarterPayload = ['periodType' => 'quarterly', 'parentId' => $id, 'quarter' => 4, 'deadline' => '2027-07-15'];
        $quarter = $this->postJson('/api/v1/reporting-periods', $quarterPayload)->assertCreated()->assertJsonPath('data.startDate', '2027-04-01')->json('data.id');
        $this->postJson('/api/v1/reporting-periods', $quarterPayload)->assertStatus(409);
        $this->patchJson('/api/v1/reporting-periods/'.$id, ['deadline' => '2026-12-01'])->assertUnprocessable();
        $this->patchJson('/api/v1/reporting-periods/'.$id, ['startDate' => '2025-07-01'])->assertUnprocessable();
        $this->deleteJson('/api/v1/reporting-periods/'.$id)->assertOk()->assertJsonPath('data.status', 'closed');
        $this->getJson('/api/v1/reporting-periods/'.$quarter)->assertOk()->assertJsonPath('data.isOpen', false);
        $this->patchJson('/api/v1/reporting-periods/'.$quarter, ['status' => 'open'])->assertUnprocessable();
        $this->patchJson('/api/v1/reporting-periods/'.$id, ['status' => 'open'])->assertOk();
        $other = Institution::create(['code' => 'OTHER', 'name' => 'Other', 'is_active' => true, 'status' => 'active']);
        $this->postJson('/api/v1/reporting-periods', $this->annual($other->id))->assertStatus(409);
        $user->roles()->sync([Role::where('code', 'IDO')->value('id') => ['status' => 'active']]);
        $this->getJson('/api/v1/reporting-periods')->assertOk();
        $this->patchJson('/api/v1/reporting-periods/'.$id, ['status' => 'closed'])->assertForbidden();
    }

    public function test_total_and_dimension_targets_are_separate_and_canonical(): void
    {
        $f = $this->fixture();
        $payload = $this->target($f);
        $id = $this->postJson($f['url'].'/targets', $payload)->assertCreated()->assertJsonPath('data.targetValue', '100.000000')->json('data.id');
        $this->postJson($f['url'].'/targets', $payload)->assertStatus(409);
        $breakdown = array_replace($payload, ['targetScope' => 'dimensions', 'targetValue' => '25',
            'dimensionValues' => [['dimensionId' => $f['dimension'], 'value' => $f['region']->id]]]);
        $this->postJson($f['url'].'/targets', $breakdown)->assertCreated();
        $breakdown['dimensionValues'][0]['value'] = (string) $f['region']->id;
        $this->postJson($f['url'].'/targets', $breakdown)->assertStatus(409);
        $this->postJson($f['url'].'/targets', array_replace($payload, ['reportingPeriodId' => $f['annual'], 'targetValue' => '400']))->assertCreated();
        $this->getJson($f['url'].'/targets?reportingPeriodId='.$f['quarter'])->assertOk()->assertJsonPath('total', 2);
        $this->patchJson($f['url'].'/targets/'.$id, ['targetValue' => '120', 'notes' => 'Updated plan'])->assertOk()->assertJsonPath('data.targetValue', '120.000000');
        $this->patchJson($f['url'].'/targets/'.$id, ['reportingPeriodId' => $f['annual']])->assertUnprocessable();
        $this->deleteJson($f['url'].'/targets/'.$id)->assertOk()->assertJsonPath('data.status', 'inactive');
        $this->patchJson($f['url'].'/targets/'.$id, ['status' => 'active', 'notes' => null])->assertOk();
        $this->assertDatabaseCount('indicator_targets', 3);
    }

    public function test_target_validation_uses_snapshot_and_closed_parent(): void
    {
        $f = $this->fixture();
        $payload = $this->target($f);
        $this->postJson($f['url'].'/targets', array_replace($payload, ['targetValue' => '1.5']))->assertUnprocessable();
        $this->postJson($f['url'].'/targets', array_replace($payload, ['targetValue' => '1e8']))->assertUnprocessable();
        $this->postJson($f['url'].'/targets', array_replace($payload, ['indicatorId' => 999]))->assertUnprocessable();
        $this->postJson($f['url'].'/targets', array_replace($payload, ['templateVersionId' => 999]))->assertNotFound();
        $this->postJson($f['url'].'/targets', array_replace($payload, ['targetScope' => 'dimensions']))->assertUnprocessable();
        $this->postJson($f['url'].'/targets', array_replace($payload, ['targetScope' => 'dimensions', 'dimensionValues' => [
            ['dimensionId' => $f['dimension'], 'value' => 999]]]))->assertUnprocessable();
        // Reference ya sasa ikibadilika, target ya version ya zamani hutumia values za snapshot yake.
        $f['region']->update(['status' => 'inactive']);
        $id = $this->postJson($f['url'].'/targets', array_replace($payload, ['targetScope' => 'dimensions', 'dimensionValues' => [
            ['dimensionId' => $f['dimension'], 'value' => $f['region']->id]]]))->assertCreated()->json('data.id');
        $this->deleteJson('/api/v1/reporting-periods/'.$f['annual'])->assertOk();
        $this->patchJson($f['url'].'/targets/'.$id, ['targetValue' => '30'])->assertUnprocessable();
        $this->postJson($f['url'].'/targets', $payload)->assertUnprocessable();
        $this->getJson($f['url'].'/targets/'.$id)->assertOk();
    }

    public function test_target_scope_and_frequency(): void
    {
        $f = $this->fixture();
        $other = Institution::create(['code' => 'OTHER', 'name' => 'Other', 'is_active' => true, 'status' => 'active']);
        $foreignPeriod = ReportingPeriod::create(['institution_id' => $other->id, 'period_type' => 'annual', 'year_type' => 'calendar',
            'period_code' => 'CY-2026', 'label' => '2026', 'start_date' => '2026-01-01', 'end_date' => '2026-12-31', 'deadline' => '2027-01-31', 'created_by' => $f['user']->id]);
        $this->postJson($f['url'].'/targets', array_replace($this->target($f), ['reportingPeriodId' => $foreignPeriod->id]))->assertNotFound();
        $this->getJson('/api/v1/reporting-periods/'.$foreignPeriod->id)->assertNotFound();
        $f['user']->roles()->sync([Role::where('code', 'IA')->value('id') => ['status' => 'active']]);
        $f['user']->update(['institution_id' => $other->id]);
        $this->postJson($f['url'].'/targets', $this->target($f))->assertNotFound();
        $f['user']->update(['institution_id' => $f['institution']->id]);
        $this->postJson($f['url'].'/draft')->assertOk();
        $f['dataset']->frequencies()->where('frequency', 'quarterly')->delete();
        // Calendar isiyoendana na frequency mpya huondolewa kwenye fixture ya draft.
        DatasetReportingCalendar::where('dataset_definition_id', $f['dataset']->id)
            ->where('reporting_period_id', $f['quarter'])->delete();
        $version = $this->postJson($f['url'].'/activate')->assertCreated()->json('data.id');
        $this->postJson($f['url'].'/targets', array_replace($this->target($f), ['templateVersionId' => $version]))->assertUnprocessable();
    }

    public function test_target_and_period_audit_failures_roll_back(): void
    {
        $f = $this->fixture();
        $this->mock(AuditService::class)->shouldReceive('record')->twice()->andThrow(new \RuntimeException('Audit failed'));
        $this->postJson($f['url'].'/targets', $this->target($f))->assertStatus(500);
        $this->assertDatabaseCount('indicator_targets', 0);
        $this->patchJson('/api/v1/reporting-periods/'.$f['annual'], ['status' => 'closed'])->assertStatus(500);
        $this->assertSame('open', ReportingPeriod::findOrFail($f['annual'])->status);
    }

    public function test_decimal_targets_dimension_order_and_required_fields(): void
    {
        $f = $this->fixture();
        $this->postJson($f['url'].'/draft')->assertOk();
        $indicator = $this->postJson($f['url'].'/indicators', ['indicator' => ['nameEn' => 'Sales', 'dataType' => 'decimal']])->assertCreated()->json('data.indicatorId');
        $dimension = $this->postJson($f['url'].'/dimensions', ['dimension' => ['dimensionCode' => 'SIZE', 'nameEn' => 'Size', 'dataType' => 'text']])->assertCreated()->json('data.dimensionId');
        $version = $this->postJson($f['url'].'/activate')->assertCreated()->json('data.id');
        $payload = array_replace($this->target($f), ['indicatorId' => $indicator, 'templateVersionId' => $version,
            'targetScope' => 'dimensions', 'targetValue' => '1234567.123456', 'dimensionValues' => [
                ['dimensionId' => $f['dimension'], 'value' => $f['region']->id], ['dimensionId' => $dimension, 'value' => 'Small'],
            ]]);
        $this->postJson($f['url'].'/targets', $payload)->assertCreated()->assertJsonPath('data.targetValue', '1234567.123456');
        $payload['dimensionValues'] = array_reverse($payload['dimensionValues']);
        $this->postJson($f['url'].'/targets', $payload)->assertStatus(409);
        $payload['dimensionValues'] = [['dimensionId' => $dimension, 'value' => 'Large']];
        $this->postJson($f['url'].'/targets', $payload)->assertUnprocessable();
        $this->postJson($f['url'].'/targets', array_replace($this->target($f), ['indicatorId' => $indicator, 'templateVersionId' => $version,
            'targetValue' => '1.1234567']))->assertUnprocessable();
    }

    public function test_calendar_leap_year_and_invalid_quarter_deadline(): void
    {
        [$user, $institution] = $this->setupUser();
        $year = $this->postJson('/api/v1/reporting-periods', ['periodType' => 'annual',
            'yearType' => 'calendar', 'startDate' => '2028-01-01', 'endDate' => '2028-12-31', 'deadline' => '2029-01-31'])
            ->assertCreated()->json('data.id');
        $quarter = ['periodType' => 'quarterly', 'parentId' => $year, 'quarter' => 1, 'deadline' => '2028-03-30'];
        $this->postJson('/api/v1/reporting-periods', $quarter)->assertUnprocessable();
        $quarter['deadline'] = '2028-04-15';
        $this->postJson('/api/v1/reporting-periods', $quarter)->assertCreated()->assertJsonPath('data.endDate', '2028-03-31');
        $quarter['quarter'] = 5;
        $this->postJson('/api/v1/reporting-periods', $quarter)->assertUnprocessable();
    }
}
