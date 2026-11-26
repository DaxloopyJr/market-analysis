<?php

namespace Tests\Feature;

use App\Models\DatasetDefinition;
use App\Models\DatasetReportingCalendar;
use App\Models\Department;
use App\Models\Indicator;
use App\Models\Institution;
use App\Models\ReportingPeriod;
use App\Models\Role;
use App\Models\Submission;
use App\Models\User;
use Database\Seeders\RolesPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use PHPUnit\Framework\Attributes\TestWith;
use Tests\TestCase;

class DatasetAnalyticsTest extends TestCase
{
    use RefreshDatabase;

    #[TestWith(['lower_is_better', '80', '60', '100', '50.00', false])]
    #[TestWith(['lower_is_better', '50', '60', '100', '125.00', true])]
    #[TestWith(['lower_is_better', '110', '60', '100', '-25.00', false])]
    #[TestWith(['lower_is_better', '0', '0', '100', '100.00', true])]
    #[TestWith(['lower_is_better', '5', '10', null, null, true])]
    #[TestWith(['lower_is_better', '5', '10', '10', null, true])]
    #[TestWith(['neutral', '80', '60', '100', null, null])]
    #[TestWith(['higher_is_better', '80', '100', null, '80.00', false])]
    #[TestWith(['higher_is_better', '0', '0', null, null, true])]
    public function test_direction_controls_target_evaluation_using_frozen_baseline(string $direction, string $actual, string $target, ?string $baseline, ?string $percent, ?bool $met): void
    {
        $f = $this->fixture('latest', $direction);
        $submission = $this->submission($f, 0, $actual, target: $target);
        $snapshot = $submission->annual_targets_snapshot;
        $snapshot[0]['baselineValue'] = $baseline;
        $submission->update(['annual_targets_snapshot' => $snapshot]);
        // Changing the live catalogue must not reinterpret published definitions.
        $f['indicator']->update(['performance_direction' => 'neutral']);
        $this->getJson($this->url($f))->assertOk()
            ->assertJsonPath('data.indicators.0.performanceDirection', $direction)
            ->assertJsonPath('data.indicators.0.summary.achievementPercent', $percent)
            ->assertJsonPath('data.indicators.0.summary.targetMet', $met)
            ->assertJsonPath('data.indicators.0.summary.performanceStatus', $met === null ? 'neutral' : ($met ? 'target_met' : 'target_not_met'));
    }

    public function test_direction_change_splits_series_and_missing_actual_is_not_evaluated(): void
    {
        $f = $this->fixture('latest');
        $this->submission($f, 0, '10');
        $content = $f['template']->template_content;
        $content['indicators'][0]['performance_direction'] = 'lower_is_better';
        $f['template'] = $f['dataset']->templateVersions()->create(['version_number' => 2, 'template_format' => 'json',
            'created_by' => $f['user']->id, 'effective_from' => now(), 'template_content' => $content]);
        $this->submission($f, 1, null);
        $response = $this->getJson($this->url($f))->assertOk()->assertJsonCount(2, 'data.indicators');
        $series = collect($response->json('data.indicators'))->firstWhere('performanceDirection', 'lower_is_better');
        $this->assertNull($series['summary']['targetMet']);
        $this->assertSame('not_evaluable', $series['summary']['performanceStatus']);
    }

    public function test_conflicting_frozen_baselines_do_not_produce_reduction_percentage(): void
    {
        $f = $this->fixture('latest', 'lower_is_better');
        foreach (['100', '120'] as $index => $baseline) {
            $submission = $this->submission($f, $index, '50', target: '60');
            $snapshot = $submission->annual_targets_snapshot;
            $snapshot[0]['baselineValue'] = $baseline;
            $submission->update(['annual_targets_snapshot' => $snapshot]);
        }
        $this->getJson($this->url($f))->assertOk()
            ->assertJsonPath('data.indicators.0.summary.achievementPercent', null)
            ->assertJsonPath('data.indicators.0.summary.baselineStatus', 'inconsistent_snapshots')
            ->assertJsonPath('data.indicators.0.summary.targetMet', true);
    }

    private function fixture(string $rule = 'sum', string $direction = 'higher_is_better'): array
    {
        $this->seed(RolesPermissionsSeeder::class);
        $institution = Institution::create(['code' => 'CBE', 'name' => 'CBE', 'is_active' => true, 'status' => 'active']);
        $other = Institution::create(['code' => 'OTHER', 'name' => 'Other', 'is_active' => true, 'status' => 'active']);
        $user = User::factory()->create(['institution_id' => $institution->id, 'is_active' => true, 'status' => 'active']);
        $user->roles()->attach(Role::where('code', 'IA')->firstOrFail()->id, ['status' => 'active']);
        $indicator = Indicator::forceCreate(['indicator_code' => 'TEST', 'name_en' => 'Activities', 'data_type' => 'decimal',
            'aggregation_rule' => $rule, 'performance_direction' => $direction, 'created_by' => $user->id]);
        $dataset = DatasetDefinition::create(['institution_id' => $institution->id, 'dataset_code' => 'DS1',
            'dataset_name' => 'Unpublished edited title', 'created_by' => $user->id, 'status' => 'draft']);
        $template = $dataset->templateVersions()->create(['version_number' => 1, 'template_format' => 'json',
            'created_by' => $user->id, 'effective_from' => now(), 'template_content' => [
                'datasetName' => 'Published activities', 'datasetCode' => 'DS1', 'reportingPurpose' => 'operational',
                'indicators' => [$indicator->toArray()], 'dimensions' => [],
            ]]);
        $year = ReportingPeriod::create(['institution_id' => null, 'period_type' => 'annual', 'year_type' => 'financial',
            'period_code' => 'FY2026', 'label' => '2026/2027', 'start_date' => '2026-07-01', 'end_date' => '2027-06-30',
            'deadline' => '2027-07-07', 'created_by' => $user->id]);
        $periods = [];
        foreach ([1, 2, 3, 4] as $quarter) {
            $start = $year->start_date->copy()->addMonths(($quarter - 1) * 3);
            $periods[] = ReportingPeriod::create(['institution_id' => null, 'parent_id' => $year->id,
                'period_type' => 'quarterly', 'year_type' => 'financial', 'period_code' => 'Q'.$quarter,
                'quarter' => $quarter, 'label' => 'Q'.$quarter, 'start_date' => $start,
                'end_date' => $start->copy()->addMonths(3)->subDay(), 'deadline' => '2027-07-07', 'created_by' => $user->id]);
        }
        Sanctum::actingAs($user);

        return compact('institution', 'other', 'user', 'indicator', 'dataset', 'template', 'year', 'periods');
    }

    private function submission(array $f, int $periodIndex, ?string $value, string $status = 'published', ?string $target = '100'): Submission
    {
        $calendar = DatasetReportingCalendar::create(['dataset_definition_id' => $f['dataset']->id,
            'reporting_period_id' => $f['periods'][$periodIndex]->id, 'responsible_user_id' => $f['user']->id,
            'deadline_days' => 7, 'deadline' => '2027-07-07', 'reminder_days' => [], 'created_by' => $f['user']->id]);
        $submission = Submission::create(['reference' => 'SUB-'.$calendar->id, 'reporting_calendar_id' => $calendar->id,
            'template_version_id' => $f['template']->id, 'created_by' => $f['user']->id, 'status' => $status,
            'published_at' => $status === 'published' ? now() : null,
            'annual_targets_snapshot' => $target === null ? [] : [['indicatorId' => $f['indicator']->id,
                'reportingYearId' => $f['year']->id, 'targetValue' => $target]]]);
        if ($value !== null) {
            $submission->values()->create(['indicator_id' => $f['indicator']->id, 'dimension_values' => [],
                'dimension_key' => 'total', 'data_type' => 'decimal', 'value_numeric' => $value]);
        }

        return $submission;
    }

    private function url(array $f): string
    {
        return '/api/v1/analytics/datasets/'.$f['dataset']->id.'?reportingYearId='.$f['year']->id.'&frequency=quarterly';
    }

    public function test_only_published_values_are_used_and_missing_is_not_zero(): void
    {
        $f = $this->fixture();
        $this->submission($f, 0, '0');
        $this->submission($f, 1, '25');
        $this->submission($f, 2, '900', 'approved');
        $this->submission($f, 3, '800', 'draft');
        $data = $this->getJson($this->url($f))->assertOk()->assertJsonPath('data.publishedPeriods', 2)
            ->assertJsonPath('data.datasetName', 'Published activities')->json('data.indicators.0');
        $this->assertSame('25.000000', $data['summary']['actual']);
        $this->assertSame('25.00', $data['summary']['achievementPercent']);
        $this->assertFalse($data['summary']['complete']);
        $this->assertSame('0.000000', $data['points'][0]['value']);
        $this->assertNull($data['points'][1]['changePercent']);
        $this->assertNull($data['points'][2]['value']);
        $this->assertSame('not_published', $data['points'][2]['status']);
        $this->getJson('/api/v1/analytics/datasets')->assertOk()->assertJsonPath('data.0.datasetName', 'Published activities');
        $this->getJson('/api/v1/analytics/organisations?type=institution')->assertOk()->assertJsonPath('data.0.publishedDatasetCount', 1);
    }

    #[TestWith(['sum', '100.000000'])]
    #[TestWith(['average', '25.000000'])]
    #[TestWith(['min', '10.000000'])]
    #[TestWith(['max', '40.000000'])]
    #[TestWith(['latest', '40.000000'])]
    #[TestWith(['none', null])]
    public function test_numeric_aggregation_respects_indicator_rule(string $rule, ?string $expected): void
    {
        $f = $this->fixture($rule);
        foreach (['10', '20', '30', '40'] as $index => $value) {
            $this->submission($f, $index, $value);
        }
        $this->getJson($this->url($f))->assertOk()->assertJsonPath('data.indicators.0.summary.actual', $expected)
            ->assertJsonPath('data.indicators.0.summary.complete', true)
            ->assertJsonPath('data.indicators.0.points.1.changePercent', '100.00');
    }

    public function test_preview_crosses_institution_scope_without_exposing_drafts_or_granting_write_access(): void
    {
        $f = $this->fixture();
        $this->submission($f, 0, '10');
        $foreign = User::factory()->create(['institution_id' => $f['other']->id, 'is_active' => true, 'status' => 'active']);
        $foreign->roles()->attach(Role::where('code', 'IDO')->firstOrFail()->id, ['status' => 'active']);
        Sanctum::actingAs($foreign);
        $this->getJson($this->url($f))->assertNotFound();
        $this->getJson('/api/v1/analytics/organisations?type=institution')->assertOk()->assertJsonCount(0, 'data');
        $foreign->roles()->attach(Role::where('code', 'PREVIEW')->firstOrFail()->id, ['status' => 'active']);
        $foreign->unsetRelation('roles');
        $this->getJson($this->url($f))->assertForbidden();
        $ministry = Institution::create(['code' => 'MIT', 'name' => 'Ministry', 'is_active' => true, 'status' => 'active']);
        $foreign->update(['institution_id' => $ministry->id]);
        $foreign->unsetRelation('institution');
        $this->getJson($this->url($f))->assertOk();
        $foreign->roles()->detach(Role::where('code', 'IDO')->firstOrFail()->id);
        $foreign->unsetRelation('roles');
        $this->assertFalse($foreign->canDo('submissions.submit'));
        $this->assertFalse($foreign->canDo('submissions.review'));
        $this->postJson('/api/v1/datasets', [])->assertForbidden();
        $foreign->update(['is_active' => false]);
        $this->getJson($this->url($f))->assertForbidden();
    }

    public function test_department_reader_is_scoped_until_given_preview(): void
    {
        $f = $this->fixture();
        $f['institution']->update(['code' => 'MIT']);
        $first = Department::create(['code' => 'ICT', 'name' => 'ICT', 'is_active' => true, 'status' => 'active']);
        $second = Department::create(['code' => 'MEU', 'name' => 'M&E', 'is_active' => true, 'status' => 'active']);
        $f['dataset']->update(['department_id' => $first->id]);
        $this->submission($f, 0, '10');
        $reader = User::factory()->create(['institution_id' => $f['institution']->id, 'department_id' => $second->id,
            'is_active' => true, 'status' => 'active']);
        $reader->roles()->attach(Role::where('code', 'DDO')->firstOrFail()->id, ['status' => 'active']);
        Sanctum::actingAs($reader);
        $this->getJson($this->url($f))->assertNotFound();
        $reader->roles()->attach(Role::where('code', 'PREVIEW')->firstOrFail()->id, ['status' => 'active']);
        $reader->unsetRelation('roles');
        $this->getJson('/api/v1/analytics/organisations?type=department')->assertOk()->assertJsonPath('data.0.id', $first->id);
        $this->getJson($this->url($f))->assertOk();
    }

    public function test_dropped_fields_and_breakdowns_come_from_each_published_template(): void
    {
        $f = $this->fixture();
        $old = $this->submission($f, 0, '20');
        $old->values()->first()->update(['breakdowns' => [['dimensionId' => 7, 'optionId' => 8, 'value' => '20']]]);
        $f['template'] = $f['dataset']->templateVersions()->create(['version_number' => 2, 'template_format' => 'json',
            'created_by' => $f['user']->id, 'effective_from' => now(), 'template_content' => [
                'datasetName' => 'Published revision', 'indicators' => [], 'dimensions' => [],
            ]]);
        $this->submission($f, 1, null);
        $this->getJson($this->url($f))->assertOk()->assertJsonPath('data.indicators.0.points.0.rows.0.breakdowns.0.value', '20')
            ->assertJsonPath('data.indicators.0.points.1.status', 'not_in_template')
            ->assertJsonPath('data.indicators.0.points.1.rows', []);
    }

    public function test_incompatible_templates_are_separate_series_and_targets_are_not_taken_from_live_plan(): void
    {
        $f = $this->fixture();
        $this->submission($f, 0, '10', target: '100');
        $content = $f['template']->template_content;
        $content['indicators'][0]['aggregation_rule'] = 'latest';
        $f['template'] = $f['dataset']->templateVersions()->create(['version_number' => 2, 'template_format' => 'json',
            'created_by' => $f['user']->id, 'effective_from' => now(), 'template_content' => $content]);
        $this->submission($f, 1, '20', target: null);
        $this->getJson($this->url($f))->assertOk()->assertJsonCount(2, 'data.indicators')
            ->assertJsonPath('data.indicators.0.summary.actual', '10.000000')
            ->assertJsonPath('data.indicators.1.summary.annualTarget', null)
            ->assertJsonPath('data.indicators.1.summary.achievementPercent', null);
    }

    public function test_conflicting_targets_and_dimensional_rows_are_not_silently_aggregated(): void
    {
        $f = $this->fixture();
        $this->submission($f, 0, '10', target: '100');
        $this->submission($f, 1, '20', target: '200');
        $dimensional = $this->submission($f, 2, '30');
        $dimensional->values()->first()->update(['dimension_values' => [['dimensionId' => 1, 'value' => 3]]]);
        $this->getJson($this->url($f))->assertOk()
            ->assertJsonPath('data.indicators.0.summary.actual', '30.000000')
            ->assertJsonPath('data.indicators.0.summary.targetStatus', 'inconsistent_snapshots')
            ->assertJsonPath('data.indicators.0.summary.achievementPercent', null)
            ->assertJsonPath('data.indicators.0.points.2.status', 'dimensional_rows')
            ->assertJsonPath('data.indicators.0.points.2.value', null);
    }

    public function test_unpublished_dataset_and_invalid_filters_do_not_return_analytics(): void
    {
        $f = $this->fixture();
        $this->submission($f, 0, '99', 'under_review');
        $this->getJson($this->url($f))->assertNotFound();
        $this->getJson('/api/v1/analytics/datasets')->assertOk()->assertJsonCount(0, 'data');
        $this->getJson('/api/v1/analytics/datasets/'.$f['dataset']->id.'?frequency=all')->assertUnprocessable();
        $this->getJson('/api/v1/analytics/organisations?type=unknown')->assertUnprocessable();
    }

    public function test_options_separate_calendar_and_financial_years(): void
    {
        $f = $this->fixture();
        $this->submission($f, 0, '10');
        $this->getJson('/api/v1/analytics/datasets/'.$f['dataset']->id.'/options')->assertOk()
            ->assertJsonPath('data.years.0.id', $f['year']->id)
            ->assertJsonPath('data.years.0.yearType', 'financial')
            ->assertJsonPath('data.years.0.frequencies', ['quarterly']);
    }

    public function test_unauthenticated_analytics_is_denied(): void
    {
        $this->getJson('/api/v1/analytics/organisations?type=institution')->assertUnauthorized();
    }

    public function test_preview_assignment_requires_mit_recipient_on_create_and_update(): void
    {
        $f = $this->fixture();
        $ministry = Institution::create(['code' => 'MIT', 'name' => 'Ministry', 'is_active' => true, 'status' => 'active']);
        $admin = User::factory()->create(['institution_id' => $ministry->id, 'is_active' => true, 'status' => 'active']);
        $admin->roles()->attach(Role::where('code', 'MOA')->firstOrFail()->id, ['status' => 'active']);
        Sanctum::actingAs($admin);
        $preview = Role::where('code', 'PREVIEW')->firstOrFail()->id;
        $payload = ['name' => 'Preview Reader', 'email' => 'preview@example.test', 'password' => 'Password@123',
            'institution_id' => $f['institution']->id, 'role_ids' => [$preview]];
        $this->postJson('/api/v1/users', $payload)->assertUnprocessable()->assertJsonValidationErrors('role_ids');
        $this->assertDatabaseMissing('users', ['email' => 'preview@example.test']);
        $this->putJson('/api/v1/users/'.$f['user']->id, ['role_ids' => [$preview]])
            ->assertUnprocessable()->assertJsonValidationErrors('role_ids');
        $this->assertFalse($f['user']->hasRole('PREVIEW'));
        $payload['institution_id'] = $ministry->id;
        $id = $this->postJson('/api/v1/users', $payload)->assertCreated()->json('data.id');
        $this->putJson('/api/v1/users/'.$id, ['role_ids' => [$preview, Role::where('code', 'DDO')->firstOrFail()->id]])->assertOk();
        $ministry->update(['is_active' => false]);
        Sanctum::actingAs(User::findOrFail($id));
        $this->getJson('/api/v1/analytics/organisations?type=institution')->assertForbidden();
    }

    private function earlierYear(array $f, int $startYear = 2025, string $yearType = 'financial'): array
    {
        $year = $f['year']->replicate();
        $year->fill(['year_type' => $yearType, 'period_code' => $yearType.$startYear,
            'label' => $startYear.'/'.($startYear + 1), 'start_date' => $startYear.'-07-01',
            'end_date' => ($startYear + 1).'-06-30']);
        $year->save();
        $periods = [];
        foreach ($f['periods'] as $index => $original) {
            $period = $original->replicate();
            $start = $year->start_date->copy()->addMonths($index * 3);
            $period->fill(['parent_id' => $year->id, 'year_type' => $yearType,
                'period_code' => $yearType.$startYear.'Q'.($index + 1), 'start_date' => $start,
                'end_date' => $start->copy()->addMonths(3)->subDay()]);
            $period->save();
            $periods[] = $period;
        }
        $f['year'] = $year;
        $f['periods'] = $periods;

        return $f;
    }

    public function test_trends_preserve_missing_years_and_do_not_label_partial_totals_as_annual(): void
    {
        $f = $this->fixture();
        $older = $this->earlierYear($f, 2024);
        foreach (['10', '20', '30', '40'] as $index => $value) {
            $this->submission($older, $index, $value);
        }
        $this->submission($f, 1, '20');
        $this->submission($f, 2, '900', 'approved');
        $this->getJson('/api/v1/analytics/datasets/'.$f['dataset']->id.'/trends?startYear=2024&endYear=2026&yearType=financial&frequency=quarterly')
            ->assertOk()->assertJsonCount(3, 'data.years')
            ->assertJsonPath('data.indicators.0.points.0.value', '100.000000')
            ->assertJsonPath('data.indicators.0.points.1.value', null)
            ->assertJsonPath('data.indicators.0.points.1.status', 'year_not_registered')
            ->assertJsonPath('data.indicators.0.points.2.status', 'partial')
            ->assertJsonPath('data.indicators.0.points.2.value', null)
            ->assertJsonPath('data.indicators.0.points.2.availableActual', '20.000000');
    }

    #[TestWith(['sum', '30.000000', '60.000000'])]
    #[TestWith(['average', '15.000000', '30.000000'])]
    #[TestWith(['latest', '20.000000', '40.000000'])]
    #[TestWith(['min', '10.000000', '20.000000'])]
    #[TestWith(['max', '20.000000', '40.000000'])]
    #[TestWith(['none', null, null])]
    public function test_comparison_aggregates_only_matching_periods(string $rule, ?string $previous, ?string $current): void
    {
        $f = $this->fixture($rule);
        $older = $this->earlierYear($f);
        foreach (['10', '20', '900', '900'] as $index => $value) {
            $this->submission($older, $index, $value);
        }
        $this->submission($f, 0, '20');
        $this->submission($f, 1, '40');
        $this->getJson('/api/v1/analytics/datasets/'.$f['dataset']->id.'/comparison?reportingYearId='.$f['year']->id.'&comparisonYearId='.$older['year']->id.'&frequency=quarterly')
            ->assertOk()->assertJsonPath('data.indicators.0.summary.matchedPeriodNumbers', [1, 2])
            ->assertJsonPath('data.indicators.0.summary.previousActual', $previous)
            ->assertJsonPath('data.indicators.0.summary.currentActual', $current)
            ->assertJsonPath('data.indicators.0.summary.changePercent', $rule === 'none' ? null : '100.00')
            ->assertJsonPath('data.indicators.0.periods.2.change', null)
            ->assertJsonPath('data.indicators.0.recommendedChart', 'grouped_bar');
    }

    public function test_comparison_zero_baseline_and_sparse_periods_are_not_misaligned(): void
    {
        $f = $this->fixture();
        $older = $this->earlierYear($f);
        $this->submission($older, 1, '0');
        $this->submission($f, 1, '20');
        $older['periods'][0]->delete();
        $this->getJson('/api/v1/analytics/datasets/'.$f['dataset']->id.'/comparison?reportingYearId='.$f['year']->id.'&comparisonYearId='.$older['year']->id.'&frequency=quarterly')
            ->assertOk()->assertJsonPath('data.indicators.0.summary.matchedPeriodNumbers', [2])
            ->assertJsonPath('data.indicators.0.summary.change', '20.000000')
            ->assertJsonPath('data.indicators.0.summary.changePercent', null);
    }

    public function test_changed_indicator_definition_does_not_compare_as_same_series(): void
    {
        $f = $this->fixture();
        $older = $this->earlierYear($f);
        $this->submission($older, 0, '10');
        $content = $f['template']->template_content;
        $content['indicators'][0]['description_en'] = 'A new measure definition';
        $f['template'] = $f['dataset']->templateVersions()->create(['version_number' => 2, 'template_format' => 'json',
            'created_by' => $f['user']->id, 'effective_from' => now(), 'template_content' => $content]);
        $this->submission($f, 0, '20');
        $this->getJson('/api/v1/analytics/datasets/'.$f['dataset']->id.'/comparison?reportingYearId='.$f['year']->id.'&comparisonYearId='.$older['year']->id.'&frequency=quarterly')
            ->assertOk()->assertJsonCount(2, 'data.indicators')
            ->assertJsonPath('data.indicators.0.status', 'missing_or_incompatible_series')
            ->assertJsonPath('data.indicators.0.summary.change', null)
            ->assertJsonPath('data.indicators.1.summary.change', null);
    }

    public function test_multi_year_filters_and_scope_are_enforced(): void
    {
        $f = $this->fixture();
        $this->submission($f, 0, '20');
        $calendar = $this->earlierYear($f, 2025, 'calendar');
        $base = '/api/v1/analytics/datasets/'.$f['dataset']->id;
        $this->getJson($base.'/comparison?reportingYearId='.$f['year']->id.'&comparisonYearId='.$calendar['year']->id.'&frequency=quarterly')
            ->assertUnprocessable()->assertJsonValidationErrors('comparisonYearId');
        $this->getJson($base.'/trends?startYear=2000&endYear=2026&yearType=financial&frequency=quarterly')
            ->assertUnprocessable()->assertJsonValidationErrors('endYear');
        $this->getJson($base.'/trends?startYear=2026&endYear=2025&yearType=financial&frequency=quarterly')->assertUnprocessable();
        $this->getJson($base.'/trends?startYear=2025&endYear=2026&yearType=calendar&frequency=quarterly')
            ->assertOk()->assertJsonCount(0, 'data.indicators');
        $foreign = User::factory()->create(['institution_id' => $f['other']->id, 'is_active' => true, 'status' => 'active']);
        $foreign->roles()->attach(Role::where('code', 'IA')->firstOrFail()->id, ['status' => 'active']);
        Sanctum::actingAs($foreign);
        $this->getJson($base.'/trends?startYear=2025&endYear=2026&yearType=financial&frequency=quarterly')->assertNotFound();
        $this->getJson($base.'/comparison?reportingYearId='.$f['year']->id.'&comparisonYearId='.$calendar['year']->id.'&frequency=quarterly')->assertNotFound();
    }

    public function test_ten_year_annual_trend_does_not_double_count_quarterly_values(): void
    {
        $f = $this->fixture('none');
        $this->submission($f, 0, '900');
        $annual = $f;
        $annual['periods'] = [$f['year']];
        $this->submission($annual, 0, '50');
        $this->getJson('/api/v1/analytics/datasets/'.$f['dataset']->id.'/trends?startYear=2017&endYear=2026&yearType=financial&frequency=annual')
            ->assertOk()->assertJsonCount(10, 'data.indicators.0.points')
            ->assertJsonPath('data.indicators.0.points.9.value', '50.000000')
            ->assertJsonPath('data.indicators.0.points.9.status', 'complete');
    }

    public function test_chart_recommendation_counts_real_observations_including_zero(): void
    {
        $f = $this->fixture();
        $this->submission($f, 0, '0');
        $this->getJson($this->url($f))->assertOk()
            ->assertJsonPath('data.indicators.0.recommendedChart', 'bar')
            ->assertJsonPath('data.indicators.0.availableCharts', ['bar', 'table']);
        $this->submission($f, 2, '20');
        $this->getJson($this->url($f))->assertOk()
            ->assertJsonPath('data.indicators.0.recommendedChart', 'line')
            ->assertJsonPath('data.indicators.0.availableCharts', ['line', 'bar', 'table'])
            ->assertJsonPath('data.indicators.0.points.1.value', null)
            ->assertJsonPath('data.indicators.0.points.2.change', null);
    }

    #[TestWith(['20', ['8', '12'], ['bar', 'donut', 'pie', 'table']])]
    #[TestWith(['20', ['8', '11'], ['bar', 'table']])]
    #[TestWith(['20', ['-1', '21'], ['bar', 'table']])]
    #[TestWith(['0', ['0', '0'], ['bar', 'table']])]
    #[TestWith(['20', ['20'], ['table']])]
    public function test_circular_charts_require_a_complete_nonnegative_partition(string $total, array $values, array $charts): void
    {
        $f = $this->fixture();
        $content = $f['template']->template_content;
        $content['dimensions'] = [
            ['id' => 7, 'name_en' => 'Publications', 'indicatorIds' => [$f['indicator']->id],
                'options' => [['id' => 8, 'name_en' => 'International'], ['id' => 9, 'name_en' => 'BEJ']]],
            ['id' => 10, 'name_en' => 'Other classification', 'indicatorIds' => [$f['indicator']->id],
                'options' => [['id' => 11, 'name_en' => 'A'], ['id' => 12, 'name_en' => 'B']]],
        ];
        $f['template'] = $f['dataset']->templateVersions()->create(['version_number' => 2, 'template_format' => 'json',
            'created_by' => $f['user']->id, 'effective_from' => now(), 'template_content' => $content]);
        $submission = $this->submission($f, 0, $total);
        $breakdowns = [];
        foreach ($values as $index => $value) {
            $breakdowns[] = ['dimensionId' => 7, 'optionId' => 8 + $index, 'value' => $value];
        }
        $breakdowns[] = ['dimensionId' => 10, 'optionId' => 11, 'value' => '10'];
        $breakdowns[] = ['dimensionId' => 10, 'optionId' => 12, 'value' => '10'];
        $submission->values()->first()->update(['breakdowns' => $breakdowns]);
        $this->getJson($this->url($f))->assertOk()
            ->assertJsonCount(2, 'data.indicators.0.points.0.breakdownCharts')
            ->assertJsonPath('data.indicators.0.points.0.breakdownCharts.0.availableCharts', $charts)
            ->assertJsonPath('data.indicators.0.points.0.breakdownCharts.0.categories.0.label', 'International')
            ->assertJsonPath('data.indicators.0.points.0.breakdownCharts.1.categories.0.label', 'A');
    }

    public function test_text_and_missing_scalar_values_recommend_tables(): void
    {
        $f = $this->fixture();
        $this->submission($f, 0, null);
        $this->getJson($this->url($f))->assertOk()
            ->assertJsonPath('data.indicators.0.recommendedChart', 'table')
            ->assertJsonPath('data.indicators.0.chartReason', 'no_scalar_values');
        $content = $f['template']->template_content;
        $content['indicators'][0]['data_type'] = 'text';
        $f['template'] = $f['dataset']->templateVersions()->create(['version_number' => 2, 'template_format' => 'json',
            'created_by' => $f['user']->id, 'effective_from' => now(), 'template_content' => $content]);
        $submission = $this->submission($f, 1, null);
        $submission->values()->create(['indicator_id' => $f['indicator']->id, 'dimension_values' => [],
            'dimension_key' => 'total', 'data_type' => 'text', 'value_text' => 'Narrative']);
        $this->getJson($this->url($f))->assertOk()
            ->assertJsonPath('data.indicators.1.availableCharts', ['table'])
            ->assertJsonPath('data.indicators.1.chartReason', 'non_numeric')
            ->assertJsonPath('data.indicators.1.points.1.breakdownCharts', []);
    }
}
