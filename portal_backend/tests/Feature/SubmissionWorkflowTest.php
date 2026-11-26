<?php

namespace Tests\Feature;

use App\Models\ApprovalCircle;
use App\Models\AuditEvent;
use App\Models\DatasetDefinition;
use App\Models\DatasetReportingCalendar;
use App\Models\Department;
use App\Models\Indicator;
use App\Models\Institution;
use App\Models\ReportingPeriod;
use App\Models\Role;
use App\Models\Submission;
use App\Models\User;
use App\Services\AuditService;
use App\Services\NotificationService;
use App\Services\ReportingEntryService;
use App\Services\SubmissionValueValidator;
use App\Services\WorkflowConfigurationService;
use Carbon\Carbon;
use Database\Seeders\RolesPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use PHPUnit\Framework\Attributes\TestWith;
use Tests\TestCase;

class SubmissionWorkflowTest extends TestCase
{
    use RefreshDatabase;

    public function test_annual_baseline_is_saved_corrected_with_conflict_guard_and_frozen(): void
    {
        $f = $this->fixture(withAnnualTargets: false);
        $entry = ['indicatorId' => $f['indicators']['integer'], 'targetValue' => '60', 'baselineValue' => '100'];
        $this->putJson($f['url'].'/values', ['expectedRevision' => 0, 'values' => $f['values'], 'annualTargets' => [$entry]])
            ->assertOk()->assertJsonPath('data.annualTargetContext.targets.0.baselineValue', '100');
        $changed = array_replace($entry, ['baselineValue' => '90']);
        $this->putJson($f['url'].'/values', ['expectedRevision' => 1, 'values' => $f['values'], 'annualTargets' => [$changed]])->assertConflict();
        $this->postJson($f['url'].'/submit', ['expectedRevision' => 1])->assertOk();
        Sanctum::actingAs($f['ia']);
        $payload = ['reason' => 'Correct baseline', 'annualTargets' => [$changed + ['expectedTargetValue' => '60']]];
        $this->patchJson($f['url'].'/annual-targets', $payload)->assertUnprocessable();
        $payload['annualTargets'][0]['expectedBaselineValue'] = '100';
        $this->patchJson($f['url'].'/annual-targets', $payload)->assertOk()->assertJsonPath('data.targets.0.baselineValue', '90');
        $this->patchJson($f['url'].'/annual-targets', $payload)->assertConflict();
        $this->getJson($f['url'])->assertOk()->assertJsonPath('data.annualTargetContext.targets.0.baselineValue', '100');
        $this->assertDatabaseHas('dataset_annual_targets', ['indicator_id' => $entry['indicatorId'], 'baseline_value' => '90']);
    }

    public function test_invalid_baseline_rolls_back_draft_values_and_target(): void
    {
        $f = $this->fixture(withAnnualTargets: false);
        $this->putJson($f['url'].'/values', ['expectedRevision' => 0, 'values' => $f['values'],
            'annualTargets' => [['indicatorId' => $f['indicators']['integer'], 'targetValue' => '60', 'baselineValue' => '100.5']]])
            ->assertUnprocessable();
        $this->assertDatabaseCount('dataset_annual_targets', 0);
        $this->assertDatabaseCount('submission_values', 0);
    }

    public function test_merged_save_preserves_objective_targets_and_performance_together(): void
    {
        $f = $this->fixture(withAnnualTargets: false);
        [, $objective] = $this->objectivePlan($f);
        $payload = ['expectedRevision' => 0, 'values' => $f['values'],
            'objectiveVersionId' => $objective['objectiveVersionId'], 'expectedObjectiveVersionId' => null,
            'annualTargets' => [['indicatorId' => $f['indicators']['integer'], 'targetValue' => '60', 'baselineValue' => '100']],
            'performance' => ['approved_budget' => 1000, 'actual_expenditure' => 250, 'achievements' => 'First quarter completed']];
        $this->putJson($f['url'].'/values', $payload)->assertOk()
            ->assertJsonPath('data.annualObjectiveContext.selectedObjective.objectiveVersionId', $objective['objectiveVersionId'])
            ->assertJsonPath('data.annualTargetContext.targets.0.baselineValue', '100');
        $this->assertDatabaseHas('submissions', ['id' => $f['submission'], 'approved_budget' => 1000,
            'actual_expenditure' => 250, 'achievements' => 'First quarter completed']);
        $payload['expectedRevision'] = 1;
        $payload['expectedObjectiveVersionId'] = $objective['objectiveVersionId'];
        $payload['performance']['status'] = 'published';
        $this->putJson($f['url'].'/values', $payload)->assertUnprocessable();
        $this->assertDatabaseHas('submissions', ['id' => $f['submission'], 'status' => 'draft', 'revision' => 1]);
    }

    public function test_annual_budget_is_shared_but_cash_flows_are_per_period_and_reports_do_not_repeat_budget(): void
    {
        $f = $this->fixture();
        $f['values'][] = ['indicatorId' => $f['indicators']['decimal'], 'value' => '12.50'];
        $payload = ['expectedRevision' => 0, 'values' => $f['values'],
            'performance' => ['approved_budget' => '1000.00', 'actual_received' => '300.00', 'actual_expenditure' => '200.00']];
        $this->putJson($f['url'].'/values', $payload)->assertOk()
            ->assertJsonPath('data.annualBudgetContext.approvedBudget', '1000.00')
            ->assertJsonPath('data.annualBudgetContext.readOnly', true);
        $payload['expectedRevision'] = 1;
        $payload['performance']['approved_budget'] = '2000.00';
        $this->putJson($f['url'].'/values', $payload)->assertConflict();
        $this->assertDatabaseHas('submissions', ['id' => $f['submission'], 'revision' => 1, 'actual_received' => 300]);
        $this->postJson($f['url'].'/submit', ['expectedRevision' => 1])->assertOk();
        $this->getJson($f['url'])->assertOk()
            ->assertJsonPath('data.submittedVersions.0.performance_snapshot.approved_budget', '1000.00')
            ->assertJsonPath('data.submittedVersions.0.performance_snapshot.actual_received', '300.00');
        Submission::findOrFail($f['submission'])->update(['status' => 'published', 'published_at' => now()]);

        $this->travelTo(Carbon::parse('2027-01-05 12:00:00', 'Africa/Dar_es_Salaam'));
        $context = $this->postJson('/api/v1/datasets/'.$f['dataset']->id.'/submission-context', [
            'startYear' => 2026, 'frequency' => 'quarterly', 'periodNumber' => 3,
        ])->assertOk()->assertJsonPath('data.annualBudgetContext.approvedBudget', '1000.00')->json('data');
        $id = $this->postJson('/api/v1/submissions', ['reportingCalendarId' => $context['reportingCalendarId']])->assertCreated()->json('data.id');
        $url = '/api/v1/submissions/'.$id;
        $this->getJson($url)->assertOk()->assertJsonPath('data.performance.actual_received', null);
        $this->putJson($url.'/values', ['expectedRevision' => 0, 'values' => $f['values'],
            'performance' => ['actual_received' => '400.00', 'actual_expenditure' => '250.00']])->assertOk()
            ->assertJsonPath('data.performance.approved_budget', '1000.00');
        $this->postJson($url.'/submit', ['expectedRevision' => 1])->assertOk();
        Submission::findOrFail($id)->update(['status' => 'published', 'published_at' => now()]);
        $this->assertDatabaseCount('dataset_annual_budgets', 1);
        Sanctum::actingAs($f['moa']);
        $this->getJson('/api/v1/reports/budget-delivery')->assertOk()
            ->assertJsonPath('data.summary.approvedBudget', '1000.00')
            ->assertJsonPath('data.summary.actualReceived', '700.00')
            ->assertJsonPath('data.summary.actualExpenditure', '450.00')
            ->assertJsonPath('data.summary.budgetUtilisationPercent', 45)
            ->assertJsonPath('data.summary.annualBudgetCount', 1);
        $this->getJson('/api/v1/reports/organisation-performance')->assertOk()
            ->assertJsonPath('data.rows.0.approvedBudget', '1000.00')
            ->assertJsonPath('data.rows.0.actualReceived', '700.00');
        $this->getJson('/api/v1/reports/annual-me')->assertOk()
            ->assertJsonPath('data.sections.budgetSummary.approvedBudget', '1000.00')
            ->assertJsonPath('data.sections.budgetSummary.actualExpenditure', '450.00');
        $nextYear = $this->postJson('/api/v1/reporting-periods', ['periodType' => 'annual', 'yearType' => 'financial',
            'startDate' => '2027-07-01', 'endDate' => '2028-06-30', 'deadlineDays' => 0])->assertCreated()->json('data.id');
        $this->postJson('/api/v1/reporting-periods/'.$nextYear.'/quarters', ['deadlineDays' => 7])->assertOk();
        $this->travelTo(Carbon::parse('2027-07-05 12:00:00', 'Africa/Dar_es_Salaam'));
        Sanctum::actingAs($f['officer']);
        $this->postJson('/api/v1/datasets/'.$f['dataset']->id.'/submission-context', [
            'startYear' => 2027, 'frequency' => 'quarterly', 'periodNumber' => 1,
        ])->assertOk()->assertJsonPath('data.annualBudgetContext.approvedBudget', null)
            ->assertJsonPath('data.annualBudgetContext.readOnly', false);
    }

    public function test_finances_are_optional_and_invalid_money_does_not_save(): void
    {
        $f = $this->fixture();
        foreach (['-1', '1.234', '10000000000000000000000'] as $invalid) {
            $this->putJson($f['url'].'/values', ['expectedRevision' => 0, 'values' => $f['values'],
                'performance' => ['actual_received' => $invalid]])->assertUnprocessable()->assertJsonValidationErrors('performance.actual_received');
        }
        $this->assertDatabaseCount('dataset_annual_budgets', 0);
        $this->putJson($f['url'].'/values', ['expectedRevision' => 0, 'values' => $f['values'],
            'performance' => ['approved_budget' => null, 'actual_received' => '0', 'actual_expenditure' => '0']])->assertOk()
            ->assertJsonPath('data.annualBudgetContext.readOnly', false);
        $this->postJson($f['url'].'/submit', ['expectedRevision' => 1])->assertOk()
            ->assertJsonPath('data.annualBudgetContext.approvedBudget', null);
        $this->assertDatabaseCount('dataset_annual_budgets', 0);
        Sanctum::actingAs($f['reviewer']);
        $this->postJson($f['url'].'/return', ['expectedRevision' => 2, 'comments' => 'Correct values', 'correctionDeadline' => '2026-10-30'])->assertOk();
        Sanctum::actingAs($f['officer']);
        $this->putJson($f['url'].'/values', ['expectedRevision' => 3, 'values' => $f['values'],
            'performance' => ['approved_budget' => '1000']])->assertConflict();
    }

    public function test_legacy_budget_is_preserved_and_not_treated_as_an_annual_budget(): void
    {
        $f = $this->fixture();
        Submission::findOrFail($f['submission'])->update(['status' => 'published', 'attempt' => 1,
            'submitted_at' => now(), 'published_at' => now(), 'approved_budget' => 200, 'actual_expenditure' => 100]);
        $this->getJson($f['url'])->assertOk()->assertJsonPath('data.performance.approved_budget', '200.00')
            ->assertJsonPath('data.performance.budget_scope', 'legacy_period')
            ->assertJsonPath('data.annualBudgetContext.historicalSnapshotAvailable', false);
        Sanctum::actingAs($f['moa']);
        $this->getJson('/api/v1/reports/budget-delivery')->assertOk()
            ->assertJsonPath('data.summary.approvedBudget', null)
            ->assertJsonPath('data.summary.actualExpenditure', '100.00')
            ->assertJsonPath('data.summary.legacyBudgetSubmissions', 1);
    }

    #[TestWith(['200.00'])]
    #[TestWith(['0.00'])]
    public function test_legacy_draft_budget_survives_read_save_null_and_first_submit(string $amount): void
    {
        $f = $this->fixture();
        Submission::findOrFail($f['submission'])->update(['approved_budget' => $amount]);
        $this->getJson($f['url'])->assertOk()->assertJsonPath('data.performance.approved_budget', $amount)
            ->assertJsonPath('data.performance.budget_scope', 'legacy_period')
            ->assertJsonPath('data.annualBudgetContext.legacyApprovedBudget', $amount);
        $this->putJson($f['url'].'/values', ['expectedRevision' => 0, 'values' => $f['values']])->assertOk()
            ->assertJsonPath('data.performance.approved_budget', $amount);
        $this->putJson($f['url'].'/values', ['expectedRevision' => 1, 'values' => $f['values'],
            'performance' => ['approved_budget' => null, 'actual_received' => '100']])->assertOk()
            ->assertJsonPath('data.performance.approved_budget', $amount);
        $this->postJson($f['url'].'/submit', ['expectedRevision' => 2])->assertOk()
            ->assertJsonPath('data.performance.approved_budget', $amount)->assertJsonPath('data.performance.budget_scope', 'legacy_period');
        $this->getJson($f['url'])->assertOk()
            ->assertJsonPath('data.submittedVersions.0.performance_snapshot.approved_budget', $amount);
        $this->assertDatabaseCount('dataset_annual_budgets', 0);
        $this->assertDatabaseHas('submissions', ['id' => $f['submission'], 'approved_budget' => $amount, 'annual_budget_snapshot' => null]);
    }

    public function test_legacy_draft_budget_is_not_overwritten_by_another_annual_budget_without_explicit_input(): void
    {
        $f = $this->fixture();
        Submission::findOrFail($f['submission'])->update(['approved_budget' => '200']);
        DB::table('dataset_annual_budgets')->insert(['dataset_definition_id' => $f['dataset']->id,
            'reporting_year_id' => $f['year'], 'approved_budget' => '1000', 'created_by' => $f['officer']->id,
            'created_at' => now(), 'updated_at' => now()]);
        $this->putJson($f['url'].'/values', ['expectedRevision' => 0, 'values' => $f['values']])->assertOk()
            ->assertJsonPath('data.performance.approved_budget', '200.00')
            ->assertJsonPath('data.annualBudgetContext.approvedBudget', '1000.00');
        $this->putJson($f['url'].'/values', ['expectedRevision' => 1, 'values' => $f['values'],
            'performance' => ['approved_budget' => '1000.00']])->assertOk()
            ->assertJsonPath('data.performance.approved_budget', '1000.00')->assertJsonPath('data.performance.budget_scope', 'annual');
        $this->assertDatabaseCount('dataset_annual_budgets', 1);
    }

    public function test_reports_use_frozen_annual_targets_and_do_not_sum_repeated_quarter_targets(): void
    {
        $f = $this->fixture(indicatorMetadata: ['aggregation_rule' => 'sum']);
        $this->putJson($f['url'].'/values', ['expectedRevision' => 0, 'values' => $f['values']])->assertOk();
        $this->postJson($f['url'].'/submit', ['expectedRevision' => 1])->assertOk();
        Submission::findOrFail($f['submission'])->update(['status' => 'published', 'published_at' => now()]);
        // A conflicting legacy period plan must not replace the frozen annual target of 100.
        DB::table('indicator_targets')->insert(['dataset_definition_id' => $f['dataset']->id,
            'reporting_period_id' => $f['period'], 'indicator_id' => $f['indicators']['integer'],
            'template_version_id' => $f['template']->id, 'target_scope' => 'total', 'dimension_values' => '[]',
            'dimension_key' => 'total', 'target_value' => '999', 'status' => 'active', 'created_by' => $f['officer']->id]);
        $this->travelTo(Carbon::parse('2027-01-05 12:00:00', 'Africa/Dar_es_Salaam'));
        $context = $this->postJson('/api/v1/datasets/'.$f['dataset']->id.'/submission-context', [
            'startYear' => 2026, 'frequency' => 'quarterly', 'periodNumber' => 3,
        ])->assertOk()->json('data');
        $id = $this->postJson('/api/v1/submissions', ['reportingCalendarId' => $context['reportingCalendarId']])->assertCreated()->json('data.id');
        $values = $f['values'];
        $values[0]['value'] = '10';
        $this->putJson('/api/v1/submissions/'.$id.'/values', ['expectedRevision' => 0, 'values' => $values])->assertOk();
        $this->postJson('/api/v1/submissions/'.$id.'/submit', ['expectedRevision' => 1])->assertOk();
        Submission::findOrFail($id)->update(['status' => 'published', 'published_at' => now()]);
        DB::table('dataset_annual_targets')->where('dataset_definition_id', $f['dataset']->id)->update(['target_value' => '200']);
        Sanctum::actingAs($f['moa']);
        $this->getJson('/api/v1/reports/indicator-performance')->assertOk()
            ->assertJsonPath('data.rows.0.target', 100)->assertJsonPath('data.rows.0.achievementPercent', 20)
            ->assertJsonPath('data.rows.0.targetScope', 'annual')->assertJsonPath('data.rows.0.targetSnapshotAvailable', true);
        $this->getJson('/api/v1/reports/quarterly-trend')->assertOk()
            ->assertJsonPath('data.rows.1.cumulativeTarget', 100)->assertJsonPath('data.rows.1.cumulativeActual', 30)
            ->assertJsonPath('data.rows.1.cumulativeAchievementPercent', 30)
            ->assertJsonPath('data.summary.deliveryPercent', 30);
        // Incompatible snapshots must not silently choose a target or add the two targets.
        $submission = Submission::findOrFail($id);
        $snapshot = $submission->annual_targets_snapshot;
        $snapshot[0]['targetValue'] = '200';
        $submission->update(['annual_targets_snapshot' => $snapshot]);
        $this->getJson('/api/v1/reports/quarterly-trend')->assertOk()
            ->assertJsonPath('data.rows.1.cumulativeTarget', null)
            ->assertJsonPath('data.rows.1.cumulativeTargetStatus', 'inconsistent_snapshots')
            ->assertJsonPath('data.rows.1.cumulativeAchievementPercent', null);
        $submission->update(['annual_targets_snapshot' => null]);
        $this->getJson('/api/v1/reports/indicator-performance')->assertOk()
            ->assertJsonPath('data.rows.1.target', null)->assertJsonPath('data.rows.1.targetSnapshotAvailable', false);
        $this->getJson('/api/v1/reports/quarterly-trend')->assertOk()
            ->assertJsonPath('data.rows.1.cumulativeTarget', null)->assertJsonPath('data.rows.1.cumulativeTargetStatus', 'not_available');
    }

    public function test_reports_preserve_objective_and_indicator_snapshots_after_live_edits(): void
    {
        $f = $this->fixture(indicatorMetadata: ['indicator_code' => 'FROZEN-01', 'name_en' => 'Original staff',
            'aggregation_rule' => 'sum', 'performance_direction' => 'higher_is_better', 'result_level' => 'output',
            'performance_weight' => '2', 'unit' => ['data_value_name_en' => 'Persons']]);
        [$planUrl, $objective] = $this->objectivePlan($f);
        $this->putJson($f['url'].'/values', ['expectedRevision' => 0, 'values' => $f['values'],
            'objectiveVersionId' => $objective['objectiveVersionId'], 'expectedObjectiveVersionId' => null])->assertOk();
        $this->postJson($f['url'].'/submit', ['expectedRevision' => 1])->assertOk();
        Submission::findOrFail($f['submission'])->update(['status' => 'published', 'published_at' => now()]);
        Indicator::findOrFail($f['indicators']['integer'])->update(['name_en' => 'Changed staff', 'strategic_objective' => 'Z',
            'aggregation_rule' => 'latest', 'performance_direction' => 'lower_is_better', 'performance_weight' => 99, 'result_level' => 'impact']);
        Sanctum::actingAs($f['ia']);
        $this->postJson($planUrl.'/objectives/'.$objective['objectiveId'].'/versions', [
            'description' => 'Changed next year', 'effectiveFrom' => '2027-07-01', 'reason' => 'New strategy',
        ])->assertCreated();
        Sanctum::actingAs($f['moa']);
        $this->getJson('/api/v1/reports/indicator-performance?strategicObjective=A')->assertOk()
            ->assertJsonPath('data.rows.0.indicatorName', 'Original staff')->assertJsonPath('data.rows.0.unit', 'Persons')
            ->assertJsonPath('data.rows.0.direction', 'higher_is_better')->assertJsonPath('data.rows.0.aggregationRule', 'sum')
            ->assertJsonPath('data.rows.0.weight', 2)->assertJsonPath('data.rows.0.resultLevel', 'output')
            ->assertJsonPath('data.rows.0.achievementPercent', 20)
            ->assertJsonPath('data.rows.0.objectiveDescription', 'Increase production')
            ->assertJsonPath('data.rows.0.objectiveVersionId', $objective['objectiveVersionId']);
        $this->getJson('/api/v1/reports/filters')->assertOk()->assertJsonPath('data.strategicObjectives', ['A'])
            ->assertJsonPath('data.objectiveVersions.0.description', 'Increase production');
        $this->getJson('/api/v1/reports/indicator-performance?strategicObjective=Z')->assertOk()->assertJsonCount(0, 'data.rows');
        $this->getJson('/api/v1/reports/strategic-objective')->assertOk()
            ->assertJsonPath('data.rows.0.objectiveDescription', 'Increase production');
        Submission::findOrFail($f['submission'])->update(['objective_snapshot' => null]);
        $this->getJson('/api/v1/reports/indicator-performance')->assertOk()
            ->assertJsonPath('data.rows.0.strategicObjective', null)->assertJsonPath('data.rows.0.objectiveSnapshotAvailable', false);
    }

    public function test_reports_require_frequency_for_mixed_periods_and_reject_same_frequency_overlaps(): void
    {
        $f = $this->fixture();
        $this->putJson($f['url'].'/values', ['expectedRevision' => 0, 'values' => $f['values'],
            'performance' => ['approved_budget' => '1000', 'actual_received' => '300', 'actual_expenditure' => '200']])->assertOk();
        $this->postJson($f['url'].'/submit', ['expectedRevision' => 1])->assertOk();
        $source = Submission::findOrFail($f['submission']);
        $source->update(['status' => 'published', 'published_at' => now()]);
        Sanctum::actingAs($f['moa']);
        $this->postJson('/api/v1/reporting-periods/'.$f['year'].'/months', ['deadlineDays' => 7])->assertOk();
        $month = ReportingPeriod::where('parent_id', $f['year'])->where('period_type', 'monthly')->where('period_number', 4)->firstOrFail();
        $copy = $this->copyPublishedForPeriod($source, $month);
        foreach (['budget-delivery', 'annual-me', 'quarterly-trend', 'indicator-performance', 'organisation-performance'] as $type) {
            $this->getJson('/api/v1/reports/'.$type)->assertUnprocessable()->assertJsonValidationErrors('frequency');
        }
        $this->getJson('/api/v1/reports/budget-delivery?frequency=quarterly')->assertOk()
            ->assertJsonCount(1, 'data.rows')->assertJsonPath('data.summary.actualExpenditure', '200.00');
        $this->getJson('/api/v1/reports/budget-delivery?frequency=monthly')->assertOk()
            ->assertJsonPath('data.rows.0.submissionId', $copy->id)->assertJsonPath('data.summary.actualReceived', '300.00');
        $this->getJson('/api/v1/reports/published-register')->assertOk()->assertJsonCount(2, 'data.rows');
        $this->getJson('/api/v1/reports/budget-delivery?frequency=invalid')->assertUnprocessable()->assertJsonValidationErrors('frequency');
        $month->update(['period_type' => 'quarterly', 'period_number' => 5]);
        $this->getJson('/api/v1/reports/budget-delivery?frequency=quarterly')->assertUnprocessable()->assertJsonValidationErrors('reportingPeriodId');
        $this->getJson('/api/v1/reports/budget-delivery?reportingPeriodId='.$month->id)->assertOk()->assertJsonCount(1, 'data.rows');
    }

    public function test_trends_separate_changed_template_metadata_and_objective_versions_are_not_grouped_by_code(): void
    {
        $f = $this->fixture(indicatorMetadata: ['aggregation_rule' => 'sum', 'unit_id' => 1, 'unit' => ['data_value_name_en' => 'Persons']]);
        $template = $f['template']->template_content;
        $this->putJson($f['url'].'/values', ['expectedRevision' => 0, 'values' => $f['values']])->assertOk();
        $this->postJson($f['url'].'/submit', ['expectedRevision' => 1])->assertOk();
        $source = Submission::findOrFail($f['submission']);
        $source->update(['status' => 'published', 'published_at' => now(),
            'objective_snapshot' => ['objectiveVersionId' => 11, 'code' => 'A', 'description' => 'Original A']]);
        $next = ReportingPeriod::where('parent_id', $f['year'])->where('period_type', 'quarterly')->where('quarter', 3)->firstOrFail();
        $copy = $this->copyPublishedForPeriod($source, $next);
        $template['indicators'][0]['unit_id'] = 2;
        $template['indicators'][0]['unit']['data_value_name_en'] = 'Thousands of persons';
        $version = $f['dataset']->templateVersions()->create(['version_number' => 2, 'template_format' => 'json',
            'template_content' => $template, 'effective_from' => now(), 'created_by' => $f['moa']->id]);
        $copy->update(['template_version_id' => $version->id,
            'objective_snapshot' => ['objectiveVersionId' => 12, 'code' => 'A', 'description' => 'Different A']]);
        $copy->values()->update(['value_numeric' => 10]);
        Sanctum::actingAs($f['moa']);
        $rows = $this->getJson('/api/v1/reports/quarterly-trend')->assertOk()
            ->assertJsonPath('data.rows.0.cumulativeActual', 20)->assertJsonPath('data.rows.1.cumulativeActual', 10)->json('data.rows');
        $this->assertNotSame($rows[0]['seriesKey'], $rows[1]['seriesKey']);
        $this->getJson('/api/v1/reports/strategic-objective')->assertOk()->assertJsonCount(2, 'data.rows')
            ->assertJsonPath('data.rows.0.objectiveDescription', 'Original A')->assertJsonPath('data.rows.1.objectiveDescription', 'Different A');
        $this->getJson('/api/v1/reports/annual-me')->assertOk()->assertJsonCount(2, 'data.sections.objectives');
    }

    public function test_report_reduction_uses_frozen_baseline_and_rejects_inconsistent_trend_baselines(): void
    {
        $f = $this->fixture(indicatorMetadata: ['aggregation_rule' => 'latest', 'performance_direction' => 'lower_is_better']);
        $this->putJson($f['url'].'/values', ['expectedRevision' => 0, 'values' => $f['values']])->assertOk();
        $this->postJson($f['url'].'/submit', ['expectedRevision' => 1])->assertOk();
        $source = Submission::findOrFail($f['submission']);
        $snapshot = $source->annual_targets_snapshot;
        $snapshot[0]['targetValue'] = '0';
        $snapshot[0]['baselineValue'] = '100';
        $source->update(['status' => 'published', 'published_at' => now(), 'annual_targets_snapshot' => $snapshot]);
        Sanctum::actingAs($f['moa']);
        $this->getJson('/api/v1/reports/indicator-performance')->assertOk()->assertJsonPath('data.rows.0.achievementPercent', 80);
        $next = ReportingPeriod::where('parent_id', $f['year'])->where('quarter', 3)->firstOrFail();
        $copy = $this->copyPublishedForPeriod($source, $next);
        $copy->values()->update(['value_numeric' => 0]);
        $this->getJson('/api/v1/reports/target-exceptions')->assertOk()->assertJsonCount(0, 'data.rows');
        $this->getJson('/api/v1/reports/quarterly-trend')->assertOk()
            ->assertJsonPath('data.rows.1.cumulativeAchievementPercent', 100)
            ->assertJsonPath('data.rows.1.cumulativeBaselineStatus', 'available');
        $snapshot[0]['baselineValue'] = '90';
        $copy->update(['annual_targets_snapshot' => $snapshot]);
        $this->getJson('/api/v1/reports/quarterly-trend')->assertOk()
            ->assertJsonPath('data.rows.1.cumulativeAchievementPercent', null)
            ->assertJsonPath('data.rows.1.cumulativeBaselineStatus', 'inconsistent_snapshots');
        foreach ([null, '0', '-1'] as $invalidBaseline) {
            $snapshot[0]['baselineValue'] = $invalidBaseline;
            $source->update(['annual_targets_snapshot' => $snapshot]);
            $this->getJson('/api/v1/reports/indicator-performance')->assertOk()->assertJsonPath('data.rows.0.achievementPercent', null);
        }
    }

    public function test_reports_do_not_sum_none_and_sector_report_excludes_operational_data(): void
    {
        $f = $this->fixture(indicatorMetadata: ['aggregation_rule' => 'none']);
        $this->putJson($f['url'].'/values', ['expectedRevision' => 0, 'values' => $f['values']])->assertOk();
        $this->postJson($f['url'].'/submit', ['expectedRevision' => 1])->assertOk();
        $source = Submission::findOrFail($f['submission']);
        $source->update(['status' => 'published', 'published_at' => now()]);
        $next = ReportingPeriod::where('parent_id', $f['year'])->where('quarter', 3)->firstOrFail();
        $copy = $this->copyPublishedForPeriod($source, $next);
        $copy->values()->update(['value_numeric' => 10]);
        Sanctum::actingAs($f['moa']);
        $this->getJson('/api/v1/reports/quarterly-trend')->assertOk()
            ->assertJsonPath('data.rows.0.actual', 20)->assertJsonPath('data.rows.1.actual', 10)
            ->assertJsonPath('data.rows.1.cumulativeActual', null)->assertJsonPath('data.rows.1.cumulativeAchievementPercent', null);
        $this->getJson('/api/v1/reports/sector-performance')->assertOk()->assertJsonCount(0, 'data.rows');
        $this->getJson('/api/v1/reports/indicator-performance')->assertOk()->assertJsonCount(2, 'data.rows');
        $f['dataset']->forceFill(['reporting_purpose' => 'sector_performance'])->save();
        $this->getJson('/api/v1/reports/sector-performance')->assertOk()->assertJsonCount(1, 'data.rows')
            ->assertJsonPath('data.rows.0.submissions', 2);
    }

    public function test_annual_reports_aggregate_before_scoring_and_keep_missing_finances_null(): void
    {
        $f = $this->fixture(indicatorMetadata: ['aggregation_rule' => 'sum']);
        $this->putJson($f['url'].'/values', ['expectedRevision' => 0, 'values' => $f['values'],
            'performance' => ['approved_budget' => '1000', 'actual_received' => '500']])->assertOk();
        $this->postJson($f['url'].'/submit', ['expectedRevision' => 1])->assertOk();
        $source = Submission::findOrFail($f['submission']);
        $source->update(['status' => 'published', 'published_at' => now()]);
        $next = ReportingPeriod::where('parent_id', $f['year'])->where('quarter', 3)->firstOrFail();
        $copy = $this->copyPublishedForPeriod($source, $next);
        $copy->values()->update(['value_numeric' => 80]);
        Sanctum::actingAs($f['moa']);
        foreach (['indicator-performance', 'quarterly-trend', 'annual-me', 'organisation-performance'] as $type) {
            $this->getJson('/api/v1/reports/'.$type)->assertOk()
                ->assertJsonPath('data.summary.deliveryPercent', 100)
                ->assertJsonPath('data.summary.fullyAchieved', 1)
                ->assertJsonPath('data.summary.underperforming', 0);
        }
        $this->getJson('/api/v1/reports/budget-delivery')->assertOk()
            ->assertJsonPath('data.rows.0.budgetUtilisationPercent', null)
            ->assertJsonPath('data.rows.0.receivedUtilisationPercent', null);
        $source->update(['actual_expenditure' => '0']);
        $this->getJson('/api/v1/reports/budget-delivery')->assertOk()
            ->assertJsonPath('data.rows.0.budgetUtilisationPercent', 0)
            ->assertJsonPath('data.rows.0.receivedUtilisationPercent', 0);
    }

    #[TestWith(['average', 50])]
    #[TestWith(['min', 20])]
    #[TestWith(['max', 80])]
    public function test_report_annual_extrema_and_average_require_all_quarters(string $rule, int $achievement): void
    {
        $f = $this->fixture(indicatorMetadata: ['aggregation_rule' => $rule]);
        $this->putJson($f['url'].'/values', ['expectedRevision' => 0, 'values' => $f['values']])->assertOk();
        $this->postJson($f['url'].'/submit', ['expectedRevision' => 1])->assertOk();
        $source = Submission::findOrFail($f['submission']);
        $source->update(['status' => 'published', 'published_at' => now()]);
        Sanctum::actingAs($f['moa']);
        $this->getJson('/api/v1/reports/quarterly-trend')->assertOk()
            ->assertJsonPath('data.rows.0.complete', false)
            ->assertJsonPath('data.rows.0.expectedPeriods', 4)
            ->assertJsonPath('data.rows.0.reportedPeriods', 1)
            ->assertJsonPath('data.rows.0.cumulativeAchievementPercent', null)
            ->assertJsonPath('data.summary.deliveryPercent', null);
        foreach ([1 => 40, 3 => 60, 4 => 80] as $quarter => $value) {
            $period = ReportingPeriod::where('parent_id', $f['year'])->where('quarter', $quarter)->firstOrFail();
            $copy = $this->copyPublishedForPeriod($source, $period);
            $copy->values()->update(['value_numeric' => $value]);
        }
        $this->getJson('/api/v1/reports/quarterly-trend')->assertOk()
            ->assertJsonPath('data.rows.3.complete', true)
            ->assertJsonPath('data.rows.3.reportedPeriods', 4)
            ->assertJsonPath('data.rows.3.cumulativeAchievementPercent', $achievement)
            ->assertJsonPath('data.summary.deliveryPercent', $achievement);
        $this->getJson('/api/v1/reports/annual-me')->assertOk()->assertJsonPath('data.summary.deliveryPercent', $achievement);
    }

    private function copyPublishedForPeriod(Submission $source, ReportingPeriod $period): Submission
    {
        $calendar = $source->calendar->newQuery()
            ->where('dataset_definition_id', $source->calendar->dataset_definition_id)
            ->where('reporting_period_id', $period->id)->first();
        if ($calendar === null) {
            $calendar = $source->calendar->replicate();
            $calendar->reporting_period_id = $period->id;
            $calendar->save();
        }
        $copy = $source->replicate();
        $copy->reporting_calendar_id = $calendar->id;
        $copy->reference = 'COPY-'.$source->id.'-'.$period->id;
        $copy->save();
        foreach ($source->values as $value) {
            $newValue = $value->replicate();
            $newValue->submission_id = $copy->id;
            $newValue->save();
        }

        return $copy;
    }

    private function objectivePlan(array $f): array
    {
        Sanctum::actingAs($f['ia']);
        $id = $this->postJson('/api/v1/strategic-plans', ['name' => 'Institution Strategy', 'startDate' => '2026-07-01', 'endDate' => '2031-06-30'])
            ->assertCreated()->json('data.id');
        $url = '/api/v1/strategic-plans/'.$id;
        $version = $this->postJson($url.'/objectives', ['code' => 'A', 'description' => 'Increase production', 'effectiveFrom' => '2026-07-01'])
            ->assertCreated()->json('data');
        $this->postJson($url.'/activate')->assertOk();
        Sanctum::actingAs($f['officer']);

        return [$url, $version];
    }

    public function test_objective_is_required_for_configured_year_and_frozen_in_submission_history(): void
    {
        $f = $this->fixture();
        [$planUrl, $v1] = $this->objectivePlan($f);
        $this->getJson($f['url'])->assertOk()->assertJsonPath('data.annualObjectiveContext.requiresEntry', true);
        $this->putJson($f['url'].'/values', ['expectedRevision' => 0, 'values' => $f['values']])->assertOk();
        $this->postJson($f['url'].'/submit', ['expectedRevision' => 1])->assertUnprocessable();
        $this->putJson($f['url'].'/values', ['expectedRevision' => 1, 'values' => $f['values'],
            'objectiveVersionId' => $v1['objectiveVersionId'], 'expectedObjectiveVersionId' => null])
            ->assertOk()->assertJsonPath('data.annualObjectiveContext.selectedObjective.description', 'Increase production');
        $this->postJson($f['url'].'/submit', ['expectedRevision' => 2])->assertOk()
            ->assertJsonPath('data.annualObjectiveContext.readOnly', true);
        Sanctum::actingAs($f['ia']);
        $v2 = $this->postJson($planUrl.'/objectives/'.$v1['objectiveId'].'/versions', [
            'description' => 'Production and quality', 'effectiveFrom' => '2027-07-01', 'reason' => 'New annual priorities',
        ])->assertCreated()->json('data');
        $this->getJson($f['url'])->assertOk()
            ->assertJsonPath('data.annualObjectiveContext.selectedObjective.description', 'Increase production')
            ->assertJsonPath('data.submittedVersions.0.objective_snapshot.description', 'Increase production');
        $this->assertDatabaseHas('dataset_annual_objectives', ['dataset_definition_id' => $f['dataset']->id,
            'reporting_year_id' => $f['year'], 'objective_version_id' => $v1['objectiveVersionId']]);
        $this->assertNotNull(DB::table('dataset_annual_objectives')->first()->locked_at);
        $this->assertDatabaseCount('template_versions', 1);

        // New quarters reuse the annual choice even though another objective version now exists.
        Sanctum::actingAs($f['officer']);
        $this->travelTo(Carbon::parse('2027-01-05 12:00:00', 'Africa/Dar_es_Salaam'));
        $context = $this->postJson('/api/v1/datasets/'.$f['dataset']->id.'/submission-context', [
            'startYear' => 2026, 'frequency' => 'quarterly', 'periodNumber' => 3,
        ])->assertOk()->assertJsonPath('data.annualObjectiveContext.selectedObjective.description', 'Increase production')
            ->assertJsonPath('data.annualObjectiveContext.readOnly', true)->json('data');
        $next = $this->postJson('/api/v1/submissions', ['reportingCalendarId' => $context['reportingCalendarId']])->assertCreated()->json('data.id');
        $this->putJson('/api/v1/submissions/'.$next.'/values', ['expectedRevision' => 0, 'values' => $f['values'],
            'objectiveVersionId' => $v2['objectiveVersionId'], 'expectedObjectiveVersionId' => $v1['objectiveVersionId']])->assertConflict();

        // A different reporting year offers v2, without modifying the dataset template.
        Sanctum::actingAs($f['moa']);
        $year = $this->postJson('/api/v1/reporting-periods', ['periodType' => 'annual', 'yearType' => 'financial',
            'startDate' => '2027-07-01', 'endDate' => '2028-06-30', 'deadlineDays' => 0])->assertCreated()->json('data.id');
        $this->postJson('/api/v1/reporting-periods/'.$year.'/quarters', ['deadlineDays' => 7])->assertOk();
        Sanctum::actingAs($f['officer']);
        $this->travelTo(Carbon::parse('2027-07-05 12:00:00', 'Africa/Dar_es_Salaam'));
        $nextContext = $this->postJson('/api/v1/datasets/'.$f['dataset']->id.'/submission-context', [
            'startYear' => 2027, 'frequency' => 'quarterly', 'periodNumber' => 1,
        ])->assertOk()->assertJsonPath('data.annualObjectiveContext.requiresEntry', true)
            ->assertJsonPath('data.annualObjectiveContext.selectedObjective', null)
            ->assertJsonPath('data.annualObjectiveContext.availableObjectives.0.objectiveVersionId', $v2['objectiveVersionId'])->json('data');
        $newId = $this->postJson('/api/v1/submissions', ['reportingCalendarId' => $nextContext['reportingCalendarId']])->assertCreated()->json('data.id');
        $this->putJson('/api/v1/submissions/'.$newId.'/values', ['expectedRevision' => 0, 'values' => $f['values'],
            'objectiveVersionId' => $v1['objectiveVersionId'], 'expectedObjectiveVersionId' => null])->assertUnprocessable();
        $this->putJson('/api/v1/submissions/'.$newId.'/values', ['expectedRevision' => 0, 'values' => $f['values'],
            'objectiveVersionId' => $v2['objectiveVersionId'], 'expectedObjectiveVersionId' => null])->assertOk();
        $this->postJson('/api/v1/submissions/'.$newId.'/submit', ['expectedRevision' => 1])->assertOk()
            ->assertJsonPath('data.annualObjectiveContext.selectedObjective.description', 'Production and quality');
    }

    public function test_draft_objective_can_change_but_stale_assignment_and_other_owner_are_rejected(): void
    {
        $f = $this->fixture();
        [$planUrl, $v1] = $this->objectivePlan($f);
        Sanctum::actingAs($f['ia']);
        $b = $this->postJson($planUrl.'/objectives', ['code' => 'B', 'description' => 'Improve quality', 'effectiveFrom' => '2026-07-01'])->assertCreated()->json('data');
        Sanctum::actingAs($f['moa']);
        $other = $this->postJson('/api/v1/strategic-plans', ['name' => 'Ministry plan', 'startDate' => '2026-07-01', 'endDate' => '2031-06-30'])->assertCreated()->json('data.id');
        $foreign = $this->postJson('/api/v1/strategic-plans/'.$other.'/objectives', ['code' => 'A', 'description' => 'Ministry objective', 'effectiveFrom' => '2026-07-01'])->assertCreated()->json('data.objectiveVersionId');
        $this->postJson('/api/v1/strategic-plans/'.$other.'/activate')->assertOk();
        Sanctum::actingAs($f['officer']);
        $payload = ['expectedRevision' => 0, 'values' => $f['values'], 'objectiveVersionId' => $foreign, 'expectedObjectiveVersionId' => null];
        $this->putJson($f['url'].'/values', $payload)->assertUnprocessable();
        $this->assertDatabaseCount('dataset_annual_objectives', 0);
        $this->assertDatabaseCount('submission_values', 0);
        $payload['objectiveVersionId'] = $v1['objectiveVersionId'];
        $this->putJson($f['url'].'/values', $payload)->assertOk();
        $payload['expectedRevision'] = 1;
        $payload['objectiveVersionId'] = $b['objectiveVersionId'];
        $this->putJson($f['url'].'/values', $payload)->assertConflict();
        $payload['expectedObjectiveVersionId'] = $v1['objectiveVersionId'];
        $this->putJson($f['url'].'/values', $payload)->assertOk()->assertJsonPath('data.annualObjectiveContext.selectedObjective.code', 'B');
        $this->assertDatabaseHas('audit_events', ['event_type' => 'annual_objective_selected']);
    }

    public function test_legacy_submission_remains_without_objective_after_plan_is_added(): void
    {
        $f = $this->fixture();
        $this->putJson($f['url'].'/values', ['expectedRevision' => 0, 'values' => $f['values']])->assertOk();
        $this->postJson($f['url'].'/submit', ['expectedRevision' => 1])->assertOk();
        $this->objectivePlan($f);
        $this->getJson($f['url'])->assertOk()->assertJsonPath('data.annualObjectiveContext.selectedObjective', null)
            ->assertJsonPath('data.annualObjectiveContext.readOnly', true)
            ->assertJsonPath('data.annualObjectiveContext.historicalSnapshotAvailable', false);
    }

    public function test_returned_submission_keeps_objective_on_resubmit(): void
    {
        $f = $this->fixture();
        [$planUrl, $v1] = $this->objectivePlan($f);
        $this->putJson($f['url'].'/values', ['expectedRevision' => 0, 'values' => $f['values'],
            'objectiveVersionId' => $v1['objectiveVersionId'], 'expectedObjectiveVersionId' => null])->assertOk();
        $this->postJson($f['url'].'/submit', ['expectedRevision' => 1])->assertOk();
        Sanctum::actingAs($f['reviewer']);
        $returned = $this->postJson($f['url'].'/return', ['expectedRevision' => 2, 'comments' => 'Correct actuals', 'correctionDeadline' => '2026-10-30'])
            ->assertOk()->json('data.revision');
        Sanctum::actingAs($f['ia']);
        $this->postJson($planUrl.'/objectives/'.$v1['objectiveId'].'/versions', [
            'description' => 'Updated goal', 'effectiveFrom' => '2027-07-01', 'reason' => 'Next year',
        ])->assertCreated();
        Sanctum::actingAs($f['officer']);
        $this->putJson($f['url'].'/values', ['expectedRevision' => $returned, 'values' => $f['values'],
            'objectiveVersionId' => $v1['objectiveVersionId'], 'expectedObjectiveVersionId' => $v1['objectiveVersionId']])->assertConflict();
        $this->putJson($f['url'].'/values', ['expectedRevision' => $returned, 'values' => $f['values']])->assertOk();
        $this->postJson($f['url'].'/submit', ['expectedRevision' => $returned + 1])->assertOk()
            ->assertJsonPath('data.annualObjectiveContext.selectedObjective.description', 'Increase production');
        $this->getJson($f['url'])->assertOk()->assertJsonPath('data.submittedVersions.1.objective_snapshot.description', 'Increase production');
    }

    public function test_department_dataset_uses_ministry_objectives(): void
    {
        $f = $this->fixture();
        $department = Department::create(['institution_id' => $f['mit']->id, 'name' => 'Industry', 'code' => 'DID', 'is_active' => true]);
        $ddo = $this->user('DDO', $f['mit']->id);
        $ddo->update(['department_id' => $department->id]);
        $f['dataset']->update(['institution_id' => $f['mit']->id, 'department_id' => $department->id, 'responsible_user_id' => $ddo->id]);
        DatasetReportingCalendar::whereKey($f['calendar'])->update(['responsible_user_id' => $ddo->id]);
        Sanctum::actingAs($f['ministryReviewer']);
        $plan = $this->postJson('/api/v1/strategic-plans', ['name' => 'MIT Plan', 'startDate' => '2026-07-01', 'endDate' => '2031-06-30'])->assertCreated()->json('data.id');
        $version = $this->postJson('/api/v1/strategic-plans/'.$plan.'/objectives', [
            'code' => 'C', 'description' => 'Industrial performance', 'effectiveFrom' => '2026-07-01',
        ])->assertCreated()->json('data.objectiveVersionId');
        $this->postJson('/api/v1/strategic-plans/'.$plan.'/activate')->assertOk();
        Sanctum::actingAs($ddo);
        $this->getJson($f['url'])->assertOk()->assertJsonPath('data.annualObjectiveContext.availableObjectives.0.code', 'C');
        $this->putJson($f['url'].'/values', ['expectedRevision' => 0, 'values' => $f['values'],
            'objectiveVersionId' => $version, 'expectedObjectiveVersionId' => null])->assertOk();
        $this->assertDatabaseHas('audit_events', ['event_type' => 'annual_objective_selected', 'institution_id' => $f['mit']->id]);
    }

    public function test_new_version_invalidates_unsubmitted_selection_without_rewriting_history(): void
    {
        $f = $this->fixture();
        // The plan starts earlier than the reporting year, allowing a revision at the year's start.
        Sanctum::actingAs($f['ia']);
        $plan = $this->postJson('/api/v1/strategic-plans', ['name' => 'Existing plan', 'startDate' => '2025-07-01', 'endDate' => '2031-06-30'])->assertCreated()->json('data.id');
        $url = '/api/v1/strategic-plans/'.$plan;
        $v1 = $this->postJson($url.'/objectives', ['code' => 'A', 'description' => 'Original', 'effectiveFrom' => '2025-07-01'])->assertCreated()->json('data');
        $this->postJson($url.'/activate')->assertOk();
        Sanctum::actingAs($f['officer']);
        $this->putJson($f['url'].'/values', ['expectedRevision' => 0, 'values' => $f['values'],
            'objectiveVersionId' => $v1['objectiveVersionId'], 'expectedObjectiveVersionId' => null])->assertOk();
        Sanctum::actingAs($f['ia']);
        $this->postJson($url.'/objectives/'.$v1['objectiveId'].'/versions', [
            'description' => 'Revised', 'effectiveFrom' => '2026-07-01', 'reason' => 'Annual planning',
        ])->assertCreated();
        Sanctum::actingAs($f['officer']);
        $this->getJson($f['url'])->assertOk()->assertJsonPath('data.annualObjectiveContext.selectionValid', false)
            ->assertJsonPath('data.annualObjectiveContext.requiresEntry', true);
        $this->postJson($f['url'].'/submit', ['expectedRevision' => 1])->assertUnprocessable();
        $this->assertNull(DB::table('dataset_annual_objectives')->first()->locked_at);
    }

    private function user(string $role, ?int $institution = null): User
    {
        $u = User::factory()->create(['institution_id' => $institution, 'is_active' => true, 'status' => 'active']);
        $u->roles()->attach(Role::where('code', $role)->firstOrFail()->id, ['status' => 'active', 'effective_from' => '2020-01-01']);

        return $u;
    }

    #[TestWith(['quarterly', 2])]
    #[TestWith(['monthly', 4])]
    #[TestWith(['weekly', 17])]
    #[TestWith(['annual', 1])]
    public function test_annual_target_is_entered_once_and_shared_by_reporting_year(string $frequency, int $number): void
    {
        $f = $this->fixture(withAnnualTargets: false);
        $f['dataset']->frequencies()->firstOrCreate(['frequency' => $frequency]);
        $content = $f['template']->template_content;
        $content['frequencies'] = array_values(array_unique(['quarterly', $frequency]));
        if ($frequency !== 'quarterly') {
            $f['dataset']->templateVersions()->create(['version_number' => 2, 'template_format' => 'json',
                'template_content' => $content, 'effective_from' => now(), 'created_by' => $f['moa']->id]);
        }
        Sanctum::actingAs($f['moa']);
        if (in_array($frequency, ['monthly', 'weekly'], true)) {
            $suffix = $frequency === 'monthly' ? 'months' : 'weeks';
            $this->postJson('/api/v1/reporting-periods/'.$f['year'].'/'.$suffix, ['deadlineDays' => 7])->assertOk();
        }
        $nextYear = $this->postJson('/api/v1/reporting-periods', ['periodType' => 'annual', 'yearType' => 'financial',
            'startDate' => '2027-07-01', 'endDate' => '2028-06-30', 'deadlineDays' => 0])->assertCreated()->json('data.id');
        $this->postJson('/api/v1/reporting-periods/'.$nextYear.'/quarters', ['deadlineDays' => 7])->assertOk();
        Sanctum::actingAs($f['officer']);
        $context = $this->postJson('/api/v1/datasets/'.$f['dataset']->id.'/submission-context', [
            'startYear' => 2026, 'frequency' => $frequency, ...($frequency === 'annual' ? [] : ['periodNumber' => $number]),
        ])->assertOk()->assertJsonPath('data.annualTargetContext.requiresEntry', false)->json('data');
        $id = $this->postJson('/api/v1/submissions', ['reportingCalendarId' => $context['reportingCalendarId']])->assertSuccessful()->json('data.id');
        $url = '/api/v1/submissions/'.$id;
        $targets = [
            ['indicatorId' => $f['indicators']['integer'], 'targetValue' => '100'],
            ['indicatorId' => $f['indicators']['decimal'], 'targetValue' => '250.50'],
        ];
        $this->putJson($url.'/values', ['expectedRevision' => 0, 'values' => $f['values']])->assertOk();
        $this->putJson($url.'/values', ['expectedRevision' => 1, 'values' => $f['values'], 'annualTargets' => $targets])
            ->assertOk()->assertJsonPath('data.annualTargetContext.readOnly', true);
        $this->postJson($url.'/submit', ['expectedRevision' => 2])->assertOk()
            ->assertJsonPath('data.annualTargetContext.targets.0.targetValue', '100');
        $this->assertDatabaseCount('dataset_annual_targets', 2);

        // Another period uses the same annual plan, even when the first entry was mid-year.
        $this->travelTo(Carbon::parse('2027-01-05 12:00:00', 'Africa/Dar_es_Salaam'));
        $this->postJson('/api/v1/datasets/'.$f['dataset']->id.'/submission-context', [
            'startYear' => 2026, 'frequency' => 'quarterly', 'periodNumber' => 3,
        ])->assertOk()->assertJsonPath('data.annualTargetContext.targets.0.targetValue', '100')
            ->assertJsonPath('data.annualTargetContext.requiresEntry', false);
        $this->travelTo(Carbon::parse('2027-07-05 12:00:00', 'Africa/Dar_es_Salaam'));
        $this->postJson('/api/v1/datasets/'.$f['dataset']->id.'/submission-context', [
            'startYear' => 2027, 'frequency' => 'quarterly', 'periodNumber' => 1,
        ])->assertOk()->assertJsonPath('data.annualTargetContext.requiresEntry', false)
            ->assertJsonCount(0, 'data.annualTargetContext.targets');
    }

    public function test_annual_target_correction_requires_authority_and_preserves_submitted_snapshot(): void
    {
        $f = $this->fixture();
        $this->putJson($f['url'].'/values', ['expectedRevision' => 0, 'values' => $f['values']])->assertOk();
        $this->postJson($f['url'].'/submit', ['expectedRevision' => 1])->assertOk();
        $payload = ['reason' => 'Approved annual plan correction', 'annualTargets' => [
            ['indicatorId' => $f['indicators']['integer'], 'targetValue' => '120', 'expectedTargetValue' => '100'],
        ]];
        $this->patchJson($f['url'].'/annual-targets', $payload)->assertForbidden();
        Sanctum::actingAs($f['ia']);
        $this->patchJson($f['url'].'/annual-targets', ['annualTargets' => $payload['annualTargets']])->assertUnprocessable();
        $this->patchJson($f['url'].'/annual-targets', $payload)->assertOk()->assertJsonPath('data.targets.0.targetValue', '120');
        $this->patchJson($f['url'].'/annual-targets', $payload)->assertConflict();
        $this->getJson($f['url'])->assertOk()->assertJsonPath('data.annualTargetContext.targets.0.targetValue', '100')
            ->assertJsonPath('data.submittedVersions.0.annual_targets_snapshot.0.targetValue', '100');
        $this->assertDatabaseHas('audit_events', ['event_type' => 'annual_target_corrected', 'reason' => $payload['reason']]);
    }

    public function test_annual_target_validation_and_read_only_save_roll_back_values(): void
    {
        $f = $this->fixture(withAnnualTargets: false);
        $targets = [['indicatorId' => $f['indicators']['integer'], 'targetValue' => '100'],
            ['indicatorId' => $f['indicators']['text'], 'targetValue' => '5']];
        $this->putJson($f['url'].'/values', ['expectedRevision' => 0, 'values' => $f['values'], 'annualTargets' => $targets])->assertUnprocessable();
        $this->assertDatabaseCount('dataset_annual_targets', 0);
        $this->assertDatabaseCount('submission_values', 0);
        $this->putJson($f['url'].'/values', ['expectedRevision' => 0, 'values' => $f['values'], 'annualTargets' => [$targets[0]]])->assertOk();
        $targets[0]['targetValue'] = '200';
        $this->putJson($f['url'].'/values', ['expectedRevision' => 1, 'values' => [], 'annualTargets' => [$targets[0]]])->assertConflict();
        $this->getJson($f['url'])->assertOk()->assertJsonPath('data.revision', 1)->assertJsonPath('data.values.0.value', '20');
    }

    public function test_submission_without_optional_targets_is_allowed_and_snapshot_stays_empty(): void
    {
        $f = $this->fixture(withAnnualTargets: false);
        $this->putJson($f['url'].'/values', ['expectedRevision' => 0, 'values' => $f['values'],
            'annualTargets' => [['indicatorId' => $f['indicators']['integer'], 'targetValue' => null]]])->assertOk();
        $this->postJson($f['url'].'/submit', ['expectedRevision' => 1])->assertOk()
            ->assertJsonPath('data.annualTargetContext.optional', true)
            ->assertJsonPath('data.annualTargetContext.requiresEntry', false)
            ->assertJsonPath('data.annualTargetContext.targets', []);
        $this->getJson($f['url'])->assertOk()->assertJsonPath('data.submittedVersions.0.annual_targets_snapshot', []);
        $this->assertDatabaseCount('dataset_annual_targets', 0);
    }

    public function test_auditors_can_read_submissions_but_cannot_take_workflow_actions(): void
    {
        $f = $this->fixture();
        $auditor = $this->user('IAU', $f['inst']->id);
        Sanctum::actingAs($auditor);
        $this->getJson($f['url'])->assertOk()->assertJsonPath('data.allowedActions', []);
        $this->putJson($f['url'].'/values', ['expectedRevision' => 0, 'values' => $f['values']])->assertForbidden();
        $this->postJson($f['url'].'/submit', ['expectedRevision' => 0])->assertForbidden();
        $outsider = $this->user('IAU', $f['mit']->id);
        Sanctum::actingAs($outsider);
        $this->getJson($f['url'])->assertNotFound();
        Sanctum::actingAs($this->user('MAU', $f['mit']->id));
        $this->getJson($f['url'])->assertOk()->assertJsonPath('data.allowedActions', []);
    }

    private function fixture(bool $activate = true, bool $withGender = false, bool $withAnnualTargets = true, array $indicatorMetadata = []): array
    {
        $this->travelTo(Carbon::parse('2026-10-22 12:00:00', 'Africa/Dar_es_Salaam'));
        $this->seed(RolesPermissionsSeeder::class);
        $inst = Institution::create(['code' => 'CAMARTEC', 'name' => 'CAMARTEC', 'is_active' => true, 'status' => 'active']);
        $mit = Institution::create(['code' => 'MIT', 'name' => 'Ministry', 'is_active' => true, 'status' => 'active']);
        $moa = $this->user('MOA', $mit->id);
        $ia = $this->user('IA', $inst->id);
        $officer = $this->user('IDO', $inst->id);
        $reviewer = $this->user('IHOD', $inst->id);
        $approver = $this->user('AO', $inst->id);
        $publisher = $this->user('AO', $inst->id);
        $ministryReviewer = $this->user('MDO', $mit->id);
        $ministryApprover = $this->user('MDD', $mit->id);
        $ministryPublisher = $this->user('ME', $mit->id);
        $dataset = DatasetDefinition::create(['institution_id' => $inst->id, 'dataset_code' => 'CAMARTEC/TEST', 'dataset_name' => 'Staff', 'created_by' => $officer->id, 'responsible_user_id' => $officer->id, 'status' => 'active']);
        $dataset->frequencies()->create(['frequency' => 'quarterly']);
        $indicators = [];
        foreach (['integer', 'decimal', 'text', 'boolean', 'date'] as $type) {
            $i = new Indicator(['indicator_code' => 'TEST-'.$type, 'name_en' => $type, 'data_type' => $type]);
            $i->created_by = $officer->id;
            $i->save();
            $indicators[$type] = $i->id;
        }
        $snapshot = ['frequencies' => ['quarterly'], 'indicators' => collect($indicators)->map(fn ($id, $type) => ['id' => $id, 'data_type' => $type, 'isRequired' => $type === 'integer'] + ($type === 'integer' ? $indicatorMetadata : []))->values()->all(),
            'dimensions' => [['id' => 99, 'data_type' => 'reference', 'indicatorIds' => [$indicators['integer']], 'isRequired' => true, 'optionSource' => 'manual', 'options' => [['id' => 101, 'code' => 'ICT'], ['id' => 102, 'code' => 'ADMIN']]]]];
        if ($withGender) {
            $snapshot['dimensions'][] = ['id' => 100, 'data_type' => 'reference', 'indicatorIds' => [$indicators['integer']],
                'isRequired' => false, 'optionSource' => 'manual', 'options' => [['id' => 201], ['id' => 202]]];
        }
        $template = $dataset->templateVersions()->create(['version_number' => 1, 'template_format' => 'json', 'template_content' => $snapshot, 'effective_from' => now(), 'created_by' => $moa->id]);
        Sanctum::actingAs($moa);
        $year = $this->postJson('/api/v1/reporting-periods', ['periodType' => 'annual', 'yearType' => 'financial', 'startDate' => '2026-07-01', 'endDate' => '2027-06-30', 'deadlineDays' => 0])->assertCreated()->json('data.id');
        $period = $this->postJson('/api/v1/reporting-periods/'.$year.'/quarters', ['deadlineDays' => 7])->assertOk()->json('data.1.id');
        $steps = [['step_name' => 'Review', 'required_role_code' => 'IHOD', 'action' => 'review', 'level' => 'institution'],
            ['step_name' => 'Approve', 'required_role_code' => 'AO', 'action' => 'approve', 'level' => 'institution']];
        $config = ['name' => 'CAMARTEC flow', 'steps' => $steps];
        Sanctum::actingAs($ia);
        $circle = $this->postJson('/api/v1/approval-circles', $config)->assertCreated()->assertJsonPath('data.status', 'draft')->json('data.id');
        if ($activate) {
            $this->postJson('/api/v1/approval-circles/'.$circle.'/activate')->assertOk();
        }
        Sanctum::actingAs($moa);
        $ministryConfig = ['name' => 'Ministry flow', 'steps' => [
            ['step_name' => 'Ministry review', 'required_role_code' => 'MDO', 'action' => 'review', 'level' => 'ministry'],
            ['step_name' => 'Ministry approval', 'required_role_code' => 'MDD', 'action' => 'approve', 'level' => 'ministry'],
            ['step_name' => 'Publication', 'required_role_code' => 'ME', 'action' => 'publish', 'level' => 'ministry'],
        ]];
        $ministryCircle = $this->postJson('/api/v1/approval-circles', $ministryConfig)->assertCreated()->json('data.id');
        $this->postJson('/api/v1/approval-circles/'.$ministryCircle.'/activate')->assertOk();
        Sanctum::actingAs($officer);
        $calendar = $this->postJson('/api/v1/datasets/'.$dataset->id.'/submission-context', ['startYear' => 2026, 'frequency' => 'quarterly', 'periodNumber' => 2])->assertOk()->json('data.reportingCalendarId');
        $submission = $this->postJson('/api/v1/submissions', ['reportingCalendarId' => $calendar])->assertCreated()->json('data.id');
        $url = '/api/v1/submissions/'.$submission;
        $values = [['indicatorId' => $indicators['integer'], 'dimensionValues' => [['dimensionId' => 99, 'value' => 101]], 'value' => '20']];

        // Most workflow tests start with an established annual plan.
        if ($withAnnualTargets) {
            foreach (['integer', 'decimal'] as $type) {
                DB::table('dataset_annual_targets')->insert([
                    'dataset_definition_id' => $dataset->id, 'reporting_year_id' => $year,
                    'indicator_id' => $indicators[$type], 'template_version_id' => $template->id,
                    'target_value' => '100', 'data_type' => $type, 'created_by' => $officer->id,
                    'created_at' => now(), 'updated_at' => now(),
                ]);
            }
        }

        return compact('inst', 'mit', 'ministryCircle', 'ministryConfig', 'moa', 'ia', 'officer', 'reviewer', 'approver', 'publisher', 'ministryReviewer', 'ministryApprover',
            'ministryPublisher', 'dataset', 'indicators', 'template', 'year', 'period', 'circle', 'config', 'calendar', 'submission', 'url', 'values');
    }

    private function breakdownFixture(): array
    {
        $f = $this->fixture(withGender: true);
        $f['summary'] = ['indicatorId' => $f['indicators']['integer'], 'value' => '123', 'remarks' => 'Staff at period end',
            'breakdowns' => [['dimensionId' => 99, 'optionId' => 101, 'value' => '70'],
                ['dimensionId' => 99, 'optionId' => 102, 'value' => '53'],
                ['dimensionId' => 100, 'optionId' => 201, 'value' => '73'],
                ['dimensionId' => 100, 'optionId' => 202, 'value' => '50']]];

        return $f;
    }

    public function test_independent_breakdowns_and_remarks_survive_save_submit_and_history(): void
    {
        $f = $this->breakdownFixture();
        $this->putJson($f['url'].'/values', ['expectedRevision' => 0, 'values' => [$f['summary']]])->assertOk()
            ->assertJsonPath('data.values.0.value', '123')->assertJsonPath('data.values.0.breakdowns', $f['summary']['breakdowns'])
            ->assertJsonPath('data.values.0.remarks', 'Staff at period end');
        $this->assertDatabaseCount('submission_values', 1);
        $this->getJson($f['url'])->assertOk()->assertJsonPath('data.values.0.breakdowns', $f['summary']['breakdowns']);
        $this->postJson($f['url'].'/submit', ['expectedRevision' => 1])->assertOk()
            ->assertJsonPath('data.status', 'submitted')
            ->assertJsonPath('data.submittedBy.userId', $f['officer']->id)
            ->assertJsonPath('data.submittedBy.name', $f['officer']->name);
        $this->getJson('/api/v1/submissions')->assertOk()
            ->assertJsonPath('data.0.submittedBy.userId', $f['officer']->id)
            ->assertJsonPath('data.0.submittedBy.name', $f['officer']->name);
        $this->getJson($f['url'])->assertOk()->assertJsonPath('data.submittedVersions.0.values.0.breakdowns', $f['summary']['breakdowns'])
            ->assertJsonPath('data.submittedVersions.0.values.0.remarks', 'Staff at period end');
    }

    #[TestWith(['missing_required'])]
    #[TestWith(['partial_optional'])]
    #[TestWith(['wrong_total'])]
    #[TestWith(['blank_option'])]
    public function test_incomplete_breakdowns_save_as_draft_but_cannot_be_submitted(string $case): void
    {
        $f = $this->breakdownFixture();
        $row = $f['summary'];
        if ($case === 'missing_required') {
            $row['breakdowns'] = array_slice($row['breakdowns'], 2);
        } elseif ($case === 'partial_optional') {
            array_pop($row['breakdowns']);
        } elseif ($case === 'wrong_total') {
            $row['breakdowns'][3]['value'] = '49';
        } else {
            $row['breakdowns'][0]['value'] = null;
        }
        $this->putJson($f['url'].'/values', ['expectedRevision' => 0, 'values' => [$row]])->assertOk();
        $this->postJson($f['url'].'/submit', ['expectedRevision' => 1])->assertUnprocessable()->assertJsonValidationErrors('values.0.breakdowns');
        $this->assertDatabaseHas('submissions', ['id' => $f['submission'], 'status' => 'draft', 'revision' => 1]);
        $this->assertDatabaseCount('submission_revisions', 0);
    }

    #[TestWith(['unknown_dimension'])]
    #[TestWith(['wrong_option'])]
    #[TestWith(['duplicate_option'])]
    #[TestWith(['mixed_dimensions'])]
    #[TestWith(['mixed_rows'])]
    #[TestWith(['invalid_number'])]
    #[TestWith(['non_numeric_indicator'])]
    public function test_invalid_breakdowns_are_rejected_without_replacing_saved_values(string $case): void
    {
        $f = $this->breakdownFixture();
        $this->putJson($f['url'].'/values', ['expectedRevision' => 0, 'values' => $f['values']])->assertOk();
        $row = $f['summary'];
        $rows = [];
        if ($case === 'unknown_dimension') {
            $row['breakdowns'][0]['dimensionId'] = 999;
        } elseif ($case === 'wrong_option') {
            $row['breakdowns'][0]['optionId'] = 201;
        } elseif ($case === 'duplicate_option') {
            $row['breakdowns'][] = $row['breakdowns'][0];
        } elseif ($case === 'mixed_dimensions') {
            $row['dimensionValues'] = [['dimensionId' => 99, 'value' => 101]];
        } elseif ($case === 'mixed_rows') {
            $rows = $f['values'];
        } elseif ($case === 'non_numeric_indicator') {
            $row['indicatorId'] = $f['indicators']['text'];
        } else {
            $row['breakdowns'][0]['value'] = 'seventy';
        }
        $rows[] = $row;
        $this->putJson($f['url'].'/values', ['expectedRevision' => 1, 'values' => $rows])->assertUnprocessable();
        $this->getJson($f['url'])->assertOk()->assertJsonPath('data.revision', 1)->assertJsonPath('data.values.0.value', '20')
            ->assertJsonMissingPath('data.values.0.breakdowns');
    }

    public function test_optional_breakdown_can_be_omitted_and_zero_options_are_valid(): void
    {
        $f = $this->breakdownFixture();
        $row = $f['summary'];
        $row['breakdowns'] = array_slice($row['breakdowns'], 0, 2);
        $row['breakdowns'][0]['value'] = '123';
        $row['breakdowns'][1]['value'] = '0';
        $this->putJson($f['url'].'/values', ['expectedRevision' => 0, 'values' => [$row]])->assertOk();
        $this->postJson($f['url'].'/submit', ['expectedRevision' => 1])->assertOk();
    }

    #[TestWith(['0.3', '0.1', '0.2'])]
    #[TestWith(['9007199254740993.000002', '9007199254740993.000001', '0.000001'])]
    public function test_decimal_breakdown_sums_are_exact_and_support_reference_options(string $total, string $first, string $second): void
    {
        $snapshot = ['indicators' => [['id' => 1, 'data_type' => 'decimal', 'isRequired' => true]],
            'dimensions' => [['id' => 2, 'data_type' => 'reference', 'isRequired' => true, 'indicatorIds' => [1],
                'optionSource' => 'reference', 'referenceValues' => [['id' => 3], ['id' => 4]]]]];
        $row = ['indicatorId' => 1, 'value' => $total, 'breakdowns' => [
            ['dimensionId' => 2, 'optionId' => 3, 'value' => $first], ['dimensionId' => 2, 'optionId' => 4, 'value' => $second]]];

        $result = app(SubmissionValueValidator::class)->validate($snapshot, [$row], true);

        $this->assertSame($total, $result[0]['value_numeric']);
        $this->assertSame($row['breakdowns'], $result[0]['breakdowns']);
    }

    private function correctionFixture(): array
    {
        $f = $this->fixture();
        $f['values'][0]['remarks'] = 'Original officer note';
        $f['values'][] = ['indicatorId' => $f['indicators']['text'], 'value' => 'Keep this row'];
        $this->putJson($f['url'].'/values', ['expectedRevision' => 0, 'values' => $f['values']])->assertOk();
        $this->postJson($f['url'].'/submit', ['expectedRevision' => 1])->assertOk();
        Sanctum::actingAs($f['reviewer']);
        $f['correction'] = ['expectedRevision' => 2, 'reason' => 'Corrected a typing error from the staff register.',
            'values' => [['indicatorId' => $f['indicators']['integer'], 'dimensionValues' => [['dimensionId' => 99, 'value' => 101]], 'value' => '21']]];

        return $f;
    }

    public function test_ihod_correction_preserves_workflow_and_original_history_and_notifies_officer(): void
    {
        $f = $this->correctionFixture();
        $this->getJson($f['url'])->assertOk()->assertJsonPath('data.allowedActions', ['review', 'return', 'correct']);
        $this->patchJson($f['url'].'/values', $f['correction'])->assertOk()->assertJsonPath('data.revision', 3)
            ->assertJsonPath('data.status', 'submitted')->assertJsonPath('data.currentStep.sequence', 1)
            ->assertJsonPath('data.attempt', 1)->assertJsonCount(2, 'data.values')
            ->assertJsonPath('data.values.0.value', '21')->assertJsonPath('data.values.0.remarks', 'Original officer note')
            ->assertJsonPath('data.values.1.value', 'Keep this row');
        $this->getJson($f['url'])->assertOk()->assertJsonPath('data.submittedVersions.0.values.0.value', '20');
        $audit = AuditEvent::where('event_type', 'submission_reviewer_corrected')->firstOrFail();
        $this->assertSame('20', $audit->old_values['values'][0]['value']);
        $this->assertSame('21', $audit->new_values['values'][0]['value']);
        $this->assertSame($f['correction']['reason'], $audit->reason);
        $this->assertSame($f['reviewer']->id, $audit->user_id);
        $this->assertSame('IHOD', $audit->actor_snapshot['actingRole']);
        $reviewerName = $f['reviewer']->name;
        $this->assertSame($reviewerName, $audit->actor_snapshot['name']);
        $history = $this->getJson($f['url'])->assertOk()->json('data.history');
        $correction = collect($history)->firstWhere('action', 'reviewer_corrected');
        $this->assertSame($audit->actor_snapshot, $correction['actor']);
        $this->assertDatabaseHas('submission_approvals', ['submission_id' => $f['submission'], 'actor_id' => $f['reviewer']->id,
            'action' => 'reviewer_corrected', 'comments' => $f['correction']['reason']]);
        $this->assertDatabaseHas('notifications', ['user_id' => $f['officer']->id, 'audit_event_id' => $audit->id,
            'message' => Submission::findOrFail($f['submission'])->reference.': Submission yako imerekebishwa na IHOD '.$f['reviewer']->name.'. Sababu: '.$f['correction']['reason']]);
        $this->postJson($f['url'].'/review', ['expectedRevision' => 3])->assertOk()->assertJsonPath('data.currentStep.required_role_code', 'AO');
        $this->patchJson($f['url'].'/values', [...$f['correction'], 'expectedRevision' => 4])->assertForbidden();
    }

    #[TestWith(['missing_reason', 422])]
    #[TestWith(['blank_reason', 422])]
    #[TestWith(['stale_revision', 409])]
    #[TestWith(['no_change', 422])]
    #[TestWith(['new_row', 422])]
    #[TestWith(['incomplete_value', 422])]
    public function test_invalid_reviewer_corrections_leave_submission_unchanged(string $case, int $status): void
    {
        $f = $this->correctionFixture();
        $body = $f['correction'];
        if ($case === 'missing_reason') {
            unset($body['reason']);
        } elseif ($case === 'blank_reason') {
            $body['reason'] = '   ';
        } elseif ($case === 'stale_revision') {
            $body['expectedRevision'] = 1;
        } elseif ($case === 'no_change') {
            $body['values'][0]['value'] = '20';
        } elseif ($case === 'new_row') {
            $body['values'][0]['dimensionValues'][0]['value'] = 102;
        } else {
            $body['values'][0]['value'] = null;
        }
        $this->patchJson($f['url'].'/values', $body)->assertStatus($status);
        $this->getJson($f['url'])->assertOk()->assertJsonPath('data.revision', 2)->assertJsonPath('data.values.0.value', '20');
        $this->assertDatabaseMissing('audit_events', ['event_type' => 'submission_reviewer_corrected']);
        $this->assertDatabaseMissing('notifications', ['user_id' => $f['officer']->id, 'type' => 'SubmissionWorkflow']);
    }

    #[TestWith(['officer', 403])]
    #[TestWith(['approver', 403])]
    #[TestWith(['foreign_ihod', 404])]
    #[TestWith(['unassigned_ihod', 404])]
    #[TestWith(['self_review', 403])]
    #[TestWith(['published', 403])]
    public function test_corrections_enforce_current_reviewer_assignment_and_scope(string $case, int $status): void
    {
        $f = $this->correctionFixture();
        if (in_array($case, ['officer', 'approver'], true)) {
            Sanctum::actingAs($f[$case]);
        } elseif ($case === 'foreign_ihod') {
            Sanctum::actingAs($this->user('IHOD', $f['mit']->id));
        } elseif ($case === 'unassigned_ihod') {
            ApprovalCircle::findOrFail($f['circle'])->steps()->where('sequence', 1)->update(['assigned_user_id' => $f['reviewer']->id]);
            Sanctum::actingAs($this->user('IHOD', $f['inst']->id));
        } elseif ($case === 'self_review') {
            $f['officer']->roles()->attach(Role::where('code', 'IHOD')->value('id'), ['status' => 'active', 'effective_from' => '2020-01-01']);
            Sanctum::actingAs($f['officer']);
        } else {
            Submission::findOrFail($f['submission'])->update(['status' => 'published']);
        }
        $this->patchJson($f['url'].'/values', $f['correction'])->assertStatus($status);
        $this->assertDatabaseHas('submissions', ['id' => $f['submission'], 'revision' => 2]);
        $this->assertDatabaseMissing('audit_events', ['event_type' => 'submission_reviewer_corrected']);
    }

    public function test_correction_rolls_back_when_officer_notification_fails(): void
    {
        $f = $this->correctionFixture();
        $this->mock(NotificationService::class)->shouldReceive('notifyUser')->once()->andThrow(new \RuntimeException('Notification failed'));
        $this->patchJson($f['url'].'/values', $f['correction'])->assertStatus(500);
        $this->getJson($f['url'])->assertOk()->assertJsonPath('data.revision', 2)->assertJsonPath('data.values.0.value', '20');
        $this->assertDatabaseMissing('audit_events', ['event_type' => 'submission_reviewer_corrected']);
        $this->assertDatabaseMissing('submission_approvals', ['action' => 'reviewer_corrected']);
    }

    public function test_correction_validates_breakdown_totals_before_saving(): void
    {
        $f = $this->breakdownFixture();
        $this->putJson($f['url'].'/values', ['expectedRevision' => 0, 'values' => [$f['summary']]])->assertOk();
        $this->postJson($f['url'].'/submit', ['expectedRevision' => 1])->assertOk();
        Sanctum::actingAs($f['reviewer']);
        $row = $f['summary'];
        $row['value'] = '124';
        $body = ['expectedRevision' => 2, 'reason' => 'Added a missed staff member.', 'values' => [$row]];
        $this->patchJson($f['url'].'/values', $body)->assertUnprocessable();
        $body['values'][0]['breakdowns'][0]['value'] = '71';
        $body['values'][0]['breakdowns'][2]['value'] = '74';
        $this->patchJson($f['url'].'/values', $body)->assertOk()->assertJsonPath('data.values.0.value', '124')
            ->assertJsonPath('data.values.0.breakdowns.0.value', '71')->assertJsonPath('data.revision', 3);
    }

    public function test_complete_dynamic_path_and_history(): void
    {
        $f = $this->fixture();
        $this->postJson('/api/v1/submissions', ['reportingCalendarId' => $f['calendar']])->assertOk()->assertJsonPath('data.id', $f['submission']);
        $this->postJson($f['url'].'/submit', ['expectedRevision' => 0])->assertUnprocessable()->assertJsonValidationErrors('values');
        $this->putJson($f['url'].'/values', ['expectedRevision' => 0, 'values' => $f['values']])->assertOk()->assertJsonPath('data.revision', 1);
        $this->putJson($f['url'].'/values', ['expectedRevision' => 0, 'values' => []])->assertStatus(409);
        $this->postJson($f['url'].'/submit', ['expectedRevision' => 1])->assertOk()->assertJsonPath('data.status', 'submitted')->assertJsonPath('data.workflowVersionId', $f['circle']);
        $this->assertDatabaseHas('notifications', ['user_id' => $f['reviewer']->id, 'type' => 'SubmissionWorkflow']);
        $this->putJson($f['url'].'/values', ['expectedRevision' => 2, 'values' => []])->assertStatus(409);
        Sanctum::actingAs($f['reviewer']);
        $this->postJson($f['url'].'/approve', ['expectedRevision' => 2])->assertForbidden();
        $this->postJson($f['url'].'/review', ['expectedRevision' => 2])->assertOk()->assertJsonPath('data.status', 'under_review');
        $this->postJson($f['url'].'/review', ['expectedRevision' => 2])->assertStatus(409);
        Sanctum::actingAs($f['ministryReviewer']);
        $this->getJson($f['url'])->assertNotFound();
        Sanctum::actingAs($f['approver']);
        $this->postJson($f['url'].'/approve', ['expectedRevision' => 3])->assertOk()
            ->assertJsonPath('data.status', 'under_review')->assertJsonPath('data.workflowStage', 'ministry')
            ->assertJsonPath('data.ministryWorkflowVersionId', $f['ministryCircle'])
            ->assertJsonPath('data.currentStep.required_role_code', 'MDO');
        $this->postJson($f['url'].'/publish', ['expectedRevision' => 4])->assertForbidden();
        $this->assertDatabaseHas('notifications', ['user_id' => $f['ministryReviewer']->id, 'type' => 'SubmissionWorkflow']);
        Sanctum::actingAs($f['ministryReviewer']);
        $this->postJson($f['url'].'/review', ['expectedRevision' => 4])->assertOk()->assertJsonPath('data.currentStep.required_role_code', 'MDD');
        Sanctum::actingAs($f['ministryApprover']);
        $this->postJson($f['url'].'/approve', ['expectedRevision' => 5])->assertOk()->assertJsonPath('data.status', 'approved');
        $this->postJson($f['url'].'/publish', ['expectedRevision' => 6])->assertForbidden();
        Sanctum::actingAs($f['ministryPublisher']);
        $this->postJson($f['url'].'/publish', ['expectedRevision' => 6])->assertOk()->assertJsonPath('data.status', 'published');
        $this->getJson($f['url'])->assertOk()->assertJsonCount(1, 'data.submittedVersions')->assertJsonPath('data.values.0.value', '20');
        $this->assertDatabaseCount('submissions', 1);
        $this->assertDatabaseCount('submission_revisions', 1);
        $this->assertDatabaseHas('audit_events', ['event_type' => 'submission_publish', 'entity_id' => (string) $f['submission']]);
        $this->assertNotNull(DatasetReportingCalendar::findOrFail($f['calendar'])->submitted_at);
    }

    public function test_return_correction_window_and_workflow_version_are_preserved(): void
    {
        $f = $this->fixture();
        $this->putJson($f['url'].'/values', ['expectedRevision' => 0, 'values' => $f['values']])->assertOk();
        $this->postJson($f['url'].'/submit', ['expectedRevision' => 1])->assertOk();
        Sanctum::actingAs($f['ia']);
        $this->putJson('/api/v1/approval-circles/'.$f['circle'], $f['config'])->assertStatus(409);
        $clone = $this->postJson('/api/v1/approval-circles/'.$f['circle'].'/clone')->assertCreated()->json('data.id');
        $this->postJson('/api/v1/approval-circles/'.$clone.'/activate')->assertOk();
        $this->assertDatabaseHas('approval_circles', ['id' => $f['circle'], 'status' => 'retired']);
        $this->travelTo(Carbon::parse('2027-01-10 12:00:00', 'Africa/Dar_es_Salaam'));
        $this->artisan('reporting-periods:sync-status')->assertSuccessful();
        $this->assertDatabaseHas('reporting_periods', ['id' => $f['period'], 'status' => 'closed', 'automatic_status' => true]);
        Sanctum::actingAs($f['reviewer']);
        $this->postJson($f['url'].'/return', ['expectedRevision' => 2, 'comments' => 'Correct ICT', 'correctionDeadline' => '2027-01-15'])->assertOk()->assertJsonPath('data.status', 'returned');
        Sanctum::actingAs($f['officer']);
        $f['values'][0]['value'] = '21';
        $entry = app(ReportingEntryService::class)->status(ReportingPeriod::findOrFail($f['period']), DatasetReportingCalendar::findOrFail($f['calendar']));
        $this->assertSame('returned', $entry['entryStatus']);
        $this->assertTrue($entry['canEnterData']);
        $this->assertSame('2027-01-15', $entry['correctionDeadline']);
        Sanctum::actingAs($f['moa']);
        $this->patchJson('/api/v1/reporting-periods/'.$f['period'], ['status' => 'closed'])->assertOk();
        Sanctum::actingAs($f['officer']);
        $this->putJson($f['url'].'/values', ['expectedRevision' => 3, 'values' => $f['values']])->assertUnprocessable();
        Sanctum::actingAs($f['moa']);
        $this->patchJson('/api/v1/reporting-periods/'.$f['period'], ['status' => 'open'])->assertOk();
        Sanctum::actingAs($f['officer']);
        $this->putJson($f['url'].'/values', ['expectedRevision' => 3, 'values' => $f['values']])->assertOk();
        $this->postJson($f['url'].'/submit', ['expectedRevision' => 4])->assertOk()->assertJsonPath('data.attempt', 2)->assertJsonPath('data.workflowVersionId', $f['circle']);
        $this->getJson($f['url'])->assertOk()->assertJsonPath('data.submittedVersions.0.values.0.value', '20')->assertJsonPath('data.submittedVersions.1.values.0.value', '21');
        Sanctum::actingAs($f['reviewer']);
        $this->postJson($f['url'].'/return', ['expectedRevision' => 5, 'comments' => 'Again', 'correctionDeadline' => '2027-01-10'])->assertOk();
        $this->travelTo(Carbon::parse('2027-01-11 00:00:00', 'Africa/Dar_es_Salaam'));
        Sanctum::actingAs($f['officer']);
        $this->putJson($f['url'].'/values', ['expectedRevision' => 6, 'values' => $f['values']])->assertUnprocessable();
    }

    public function test_values_types_dimensions_duplicates_and_optional_targets(): void
    {
        $f = $this->fixture();
        $rows = $f['values'];
        $rows[] = ['indicatorId' => $f['indicators']['decimal'], 'value' => '123.123456'];
        $rows[] = ['indicatorId' => $f['indicators']['text'], 'value' => 'Staff note'];
        $rows[] = ['indicatorId' => $f['indicators']['boolean'], 'value' => false];
        $rows[] = ['indicatorId' => $f['indicators']['date'], 'value' => '2026-10-22'];
        $this->putJson($f['url'].'/values', ['expectedRevision' => 0, 'values' => $rows])->assertOk();
        foreach ([
            [...$rows, $rows[0]],
            [['indicatorId' => $f['indicators']['integer'], 'value' => '1.5']],
            [['indicatorId' => $f['indicators']['integer'], 'dimensionValues' => [['dimensionId' => 99, 'value' => 999]], 'value' => '2']],
            [['indicatorId' => $f['indicators']['boolean'], 'value' => 'false']],
            [['indicatorId' => $f['indicators']['decimal'], 'value' => 1.23]],
            [['indicatorId' => 999999, 'value' => '2']],
        ] as $invalid) {
            $this->putJson($f['url'].'/values', ['expectedRevision' => 1, 'values' => $invalid])->assertUnprocessable();
        }
        $this->postJson($f['url'].'/submit', ['expectedRevision' => 1])->assertOk();
        $this->assertDatabaseCount('indicator_targets', 0);
    }

    public function test_missing_workflow_deadline_and_transaction_rollback(): void
    {
        $f = $this->fixture(false);
        $this->putJson($f['url'].'/values', ['expectedRevision' => 0, 'values' => $f['values']])->assertOk();
        $this->postJson($f['url'].'/submit', ['expectedRevision' => 1])->assertStatus(409);
        $this->assertDatabaseCount('submission_revisions', 0);
        Sanctum::actingAs($f['ia']);
        $this->postJson('/api/v1/approval-circles/'.$f['circle'].'/activate')->assertOk();
        Sanctum::actingAs($f['officer']);
        $this->mock(NotificationService::class)->shouldReceive('notifyUser')->andThrow(new \RuntimeException('notification failed'));
        $this->postJson($f['url'].'/submit', ['expectedRevision' => 1])->assertStatus(500);
        $this->assertDatabaseHas('submissions', ['id' => $f['submission'], 'status' => 'draft', 'revision' => 1, 'approval_circle_id' => null]);
        $this->assertDatabaseCount('submission_revisions', 0);
        $this->assertNull(DatasetReportingCalendar::findOrFail($f['calendar'])->submitted_at);
        $this->assertDatabaseMissing('audit_events', ['event_type' => 'submission_submitted']);
        $this->travelTo(Carbon::parse('2027-01-08 00:00:00', 'Africa/Dar_es_Salaam'));
        $this->putJson($f['url'].'/values', ['expectedRevision' => 1, 'values' => $f['values']])->assertUnprocessable();
        $this->postJson($f['url'].'/submit', ['expectedRevision' => 1])->assertUnprocessable();
        $this->getJson($f['url'])->assertOk();
    }

    public function test_foreign_officer_and_configuration_scope_are_denied(): void
    {
        $f = $this->fixture();
        $otherInst = Institution::create(['code' => 'OTHER', 'name' => 'Other']);
        $other = $this->user('IDO', $otherInst->id);
        Sanctum::actingAs($other);
        $this->postJson('/api/v1/submissions', ['reportingCalendarId' => $f['calendar']])->assertForbidden();
        $this->getJson($f['url'])->assertNotFound();
        $this->getJson('/api/v1/submissions')->assertOk()->assertJsonCount(0, 'data');
        $this->postJson('/api/v1/approval-circles/'.$f['circle'].'/clone')->assertForbidden();
        $ia = $this->user('IA', $otherInst->id);
        Sanctum::actingAs($ia);
        $this->getJson('/api/v1/approval-circles/'.$f['circle'])->assertNotFound();
        $this->postJson('/api/v1/approval-circles/'.$f['circle'].'/activate')->assertNotFound();
    }

    public function test_workflow_validation_activation_audit_and_draft_step_updates(): void
    {
        $f = $this->fixture(false);
        Sanctum::actingAs($f['ia']);
        $bad = $f['config'];
        $bad['steps'] = [$bad['steps'][0]];
        $this->putJson('/api/v1/approval-circles/'.$f['circle'], $bad)->assertOk();
        $this->postJson('/api/v1/approval-circles/'.$f['circle'].'/activate')->assertUnprocessable();
        $bad = $f['config'];
        $bad['steps'][0]['level'] = 'ministry';
        $this->putJson('/api/v1/approval-circles/'.$f['circle'], $bad)->assertUnprocessable();
        $bad = $f['config'];
        $bad['steps'][0]['assigned_user_id'] = $f['officer']->id;
        $this->putJson('/api/v1/approval-circles/'.$f['circle'], $bad)->assertUnprocessable();
        $this->putJson('/api/v1/approval-circles/'.$f['circle'], $f['config'])->assertOk();
        $step = ApprovalCircle::findOrFail($f['circle'])->steps()->firstOrFail();
        $this->putJson('/api/v1/approval-circle-steps/'.$step->id, ['step_name' => 'Technical review'])->assertOk();
        $this->mock(AuditService::class)->shouldReceive('record')->andThrow(new \RuntimeException('audit failed'));
        $this->postJson('/api/v1/approval-circles/'.$f['circle'].'/activate')->assertStatus(500);
        $this->assertDatabaseHas('approval_circles', ['id' => $f['circle'], 'status' => 'draft', 'is_active' => false]);
    }

    public function test_draft_incomplete_values_and_audit_rollback(): void
    {
        $f = $this->fixture();
        $incomplete = [['indicatorId' => $f['indicators']['integer'], 'value' => null]];
        $this->putJson($f['url'].'/values', ['expectedRevision' => 0, 'values' => $incomplete])->assertOk();
        $this->postJson($f['url'].'/submit', ['expectedRevision' => 1])->assertUnprocessable();
        $this->mock(AuditService::class)->shouldReceive('record')->andThrow(new \RuntimeException('audit failed'));
        $this->putJson($f['url'].'/values', ['expectedRevision' => 1, 'values' => $f['values']])->assertStatus(500);
        $this->getJson($f['url'])->assertOk()->assertJsonPath('data.revision', 1)->assertJsonPath('data.values.0.value', null);
        $this->assertDatabaseCount('submission_values', 1);
    }

    public function test_assigned_reviewer_self_review_and_closed_period_checks(): void
    {
        $f = $this->fixture(false);
        Sanctum::actingAs($f['ia']);
        $assigned = $this->user('IHOD', $f['inst']->id);
        $f['config']['steps'][0]['assigned_user_id'] = $assigned->id;
        $this->putJson('/api/v1/approval-circles/'.$f['circle'], $f['config'])->assertOk();
        $this->postJson('/api/v1/approval-circles/'.$f['circle'].'/activate')->assertOk();
        Sanctum::actingAs($f['officer']);
        ReportingPeriod::findOrFail($f['year'])->update(['status' => 'closed', 'automatic_status' => false]);
        $this->putJson($f['url'].'/values', ['expectedRevision' => 0, 'values' => $f['values']])->assertUnprocessable();
        ReportingPeriod::findOrFail($f['year'])->update(['status' => 'open']);
        $this->putJson($f['url'].'/values', ['expectedRevision' => 0, 'values' => $f['values']])->assertOk();
        $this->postJson($f['url'].'/submit', ['expectedRevision' => 1])->assertOk();
        Sanctum::actingAs($f['reviewer']);
        $this->postJson($f['url'].'/review', ['expectedRevision' => 2])->assertNotFound();
        Sanctum::actingAs($assigned);
        $this->postJson($f['url'].'/return', ['expectedRevision' => 2, 'comments' => 'Fix', 'correctionDeadline' => '2026-10-21'])->assertUnprocessable();
        $this->postJson($f['url'].'/return', ['expectedRevision' => 2, 'comments' => 'Fix', 'correctionDeadline' => '2026-10-22'])->assertOk();
        Sanctum::actingAs($f['officer']);
        $this->travelTo(Carbon::parse('2026-10-22 23:59:59', 'Africa/Dar_es_Salaam'));
        $this->putJson($f['url'].'/values', ['expectedRevision' => 3, 'values' => $f['values']])->assertOk();
        $this->travelTo(Carbon::parse('2026-10-23 00:00:00', 'Africa/Dar_es_Salaam'));
        $this->postJson($f['url'].'/submit', ['expectedRevision' => 4])->assertUnprocessable();
    }

    public function test_department_path_goes_directly_to_configured_ministry_role(): void
    {
        $f = $this->fixture();
        $department = Department::create(['code' => 'D1', 'name' => 'Industry', 'status' => 'active', 'is_active' => true]);

        $f['dataset']->update(['institution_id' => $f['mit']->id, 'department_id' => $department->id]);
        $f['officer']->update(['institution_id' => $f['mit']->id, 'department_id' => $department->id]);
        $f['officer']->roles()->sync([Role::where('code', 'DDO')->value('id') => ['status' => 'active', 'effective_from' => '2020-01-01']]);
        foreach (['ministryReviewer', 'ministryApprover', 'ministryPublisher'] as $key) {
            $f[$key]->update(['institution_id' => $f['mit']->id, 'department_id' => $department->id]);
        }
        Sanctum::actingAs($f['moa']);
        $config = ['name' => 'Ministry department flow', 'steps' => [
            ['step_name' => 'Review', 'required_role_code' => 'MDO', 'action' => 'review', 'level' => 'ministry'],
            ['step_name' => 'Approve', 'required_role_code' => 'MDD', 'action' => 'approve', 'level' => 'ministry'],
            ['step_name' => 'Publish', 'required_role_code' => 'ME', 'action' => 'publish', 'level' => 'ministry'],
        ]];

        $circle = $this->postJson('/api/v1/approval-circles', $config)->assertCreated()->json('data.id');
        $this->postJson('/api/v1/approval-circles/'.$circle.'/activate')->assertOk();
        Sanctum::actingAs($f['officer']->fresh());
        $this->putJson($f['url'].'/values', ['expectedRevision' => 0, 'values' => $f['values']])->assertOk();
        $this->postJson($f['url'].'/submit', ['expectedRevision' => 1])->assertOk()->assertJsonPath('data.workflowVersionId', $circle)->assertJsonPath('data.currentStep.required_role_code', 'MDO');
        Sanctum::actingAs($f['moa']);
        $replacement = $this->postJson('/api/v1/approval-circles/'.$circle.'/clone')->assertCreated()->json('data.id');
        $this->postJson('/api/v1/approval-circles/'.$replacement.'/activate')->assertOk();
        $otherDepartment = Department::create(['code' => 'D2', 'name' => 'Finance', 'status' => 'active', 'is_active' => true]);
        $f['ministryReviewer']->update(['department_id' => $otherDepartment->id]);
        $f['ministryApprover']->update(['department_id' => $otherDepartment->id]);
        $wrong = $this->user('MDO', $f['inst']->id);
        $wrong->update(['department_id' => $otherDepartment->id]);
        Sanctum::actingAs($wrong);
        $this->getJson($f['url'])->assertNotFound();
        Sanctum::actingAs($f['ministryReviewer']);
        $this->getJson($f['url'])->assertOk();
        $this->postJson($f['url'].'/review', ['expectedRevision' => 2])->assertOk()
            ->assertJsonPath('data.workflowVersionId', $replacement)
            ->assertJsonPath('data.ministryWorkflowVersionId', $replacement);
        $this->assertDatabaseHas('notifications', ['user_id' => $f['ministryApprover']->id, 'type' => 'SubmissionWorkflow']);
        Sanctum::actingAs($f['ministryApprover']);
        $this->postJson($f['url'].'/approve', ['expectedRevision' => 3])->assertOk();
    }

    public function test_existing_draft_and_reviewer_keep_the_same_template_after_master_changes(): void
    {
        $f = $this->fixture();
        $newContent = $f['template']->template_content;
        $newContent['dimensions'] = [];
        $f['dataset']->templateVersions()->create(['version_number' => 2, 'template_format' => 'json',
            'template_content' => $newContent, 'created_by' => $f['moa']->id, 'effective_from' => now()]);
        $this->getJson($f['url'])->assertOk()->assertJsonPath('data.templateVersionId', $f['template']->id)
            ->assertJsonCount(1, 'data.template.dimensions');
        $this->postJson('/api/v1/datasets/'.$f['dataset']->id.'/submission-context',
            ['startYear' => 2026, 'frequency' => 'quarterly', 'periodNumber' => 2])->assertOk()
            ->assertJsonPath('data.templateVersionId', $f['template']->id)->assertJsonCount(1, 'data.template.dimensions');
        $this->putJson($f['url'].'/values', ['expectedRevision' => 0, 'values' => $f['values']])->assertOk();
        $this->postJson($f['url'].'/submit', ['expectedRevision' => 1])->assertOk();
        Sanctum::actingAs($f['reviewer']);
        $this->getJson($f['url'])->assertOk()->assertJsonPath('data.templateVersionId', $f['template']->id)
            ->assertJsonCount(1, 'data.template.dimensions')->assertJsonPath('data.submittedVersions.0.values.0.dimensionValues.0.dimensionId', 99);
    }

    public function test_institution_and_ministry_workflows_are_separately_scoped(): void
    {
        $f = $this->fixture(false);
        Sanctum::actingAs($f['ia']);
        $this->postJson('/api/v1/approval-circles/'.$f['circle'].'/activate')->assertOk()
            ->assertJsonPath('data.scope_key', 'institution-'.$f['inst']->id)
            ->assertJsonPath('data.institution_id', $f['inst']->id);

        Sanctum::actingAs($f['moa']);
        $ministryConfig = ['name' => 'Shared ministry flow', 'steps' => [
            ['step_name' => 'Review', 'required_role_code' => 'MDO', 'action' => 'review', 'level' => 'ministry'],
            ['step_name' => 'Approve', 'required_role_code' => 'MDD', 'action' => 'approve', 'level' => 'ministry'],
            ['step_name' => 'Publish', 'required_role_code' => 'ME', 'action' => 'publish', 'level' => 'ministry'],
        ]];
        $ministryCircle = $this->postJson('/api/v1/approval-circles', $ministryConfig)->assertCreated()
            ->assertJsonPath('data.scope_key', 'global')->assertJsonPath('data.institution_id', null)->json('data.id');
        $this->postJson('/api/v1/approval-circles/'.$ministryCircle.'/activate')->assertOk();
        $this->getJson('/api/v1/approval-circles/'.$f['circle'])->assertNotFound();

        Sanctum::actingAs($f['ia']);
        $this->getJson('/api/v1/approval-circles/'.$ministryCircle)->assertNotFound();

        $departmentA = Department::create(['code' => 'D1', 'name' => 'Department 1', 'status' => 'active', 'is_active' => true]);
        $departmentB = Department::create(['code' => 'D2', 'name' => 'Department 2', 'status' => 'active', 'is_active' => true]);
        $departmentDatasetA = new DatasetDefinition(['institution_id' => $f['mit']->id, 'department_id' => $departmentA->id]);
        $departmentDatasetB = new DatasetDefinition(['institution_id' => $f['mit']->id, 'department_id' => $departmentB->id]);
        $service = app(WorkflowConfigurationService::class);
        $this->assertSame($f['circle'], $service->resolve($f['dataset'])->id);
        $this->assertSame($ministryCircle, $service->resolve($departmentDatasetA)->id);
        $this->assertSame($ministryCircle, $service->resolve($departmentDatasetB)->id);
    }

    public function test_missing_ministry_workflow_blocks_submission_and_institution_cannot_publish(): void
    {
        $f = $this->fixture();
        ApprovalCircle::findOrFail($f['ministryCircle'])->update(['status' => 'retired', 'is_active' => false]);
        $this->putJson($f['url'].'/values', ['expectedRevision' => 0, 'values' => $f['values']])->assertOk();
        $this->postJson($f['url'].'/submit', ['expectedRevision' => 1])->assertStatus(409);
        $this->assertDatabaseHas('submissions', ['id' => $f['submission'], 'status' => 'draft', 'revision' => 1,
            'approval_circle_id' => null, 'ministry_approval_circle_id' => null, 'workflow_stage' => null]);
        $this->assertNull(DatasetReportingCalendar::findOrFail($f['calendar'])->submitted_at);
        $this->assertDatabaseCount('submission_revisions', 0);

        Sanctum::actingAs($f['ia']);
        $config = $f['config'];
        $config['steps'][] = ['step_name' => 'Publish', 'required_role_code' => 'AO', 'action' => 'publish', 'level' => 'institution'];
        $this->postJson('/api/v1/approval-circles', $config)->assertUnprocessable();
    }

    public function test_handoff_without_ministry_recipient_rolls_back_and_foreign_roles_cannot_read(): void
    {
        $f = $this->fixture();
        $this->putJson($f['url'].'/values', ['expectedRevision' => 0, 'values' => $f['values']])->assertOk();
        $this->postJson($f['url'].'/submit', ['expectedRevision' => 1])->assertOk();
        Sanctum::actingAs($f['reviewer']);
        $this->postJson($f['url'].'/review', ['expectedRevision' => 2])->assertOk();
        $f['ministryReviewer']->update(['is_active' => false]);
        Sanctum::actingAs($f['approver']);
        $this->postJson($f['url'].'/approve', ['expectedRevision' => 3])->assertStatus(409);
        $this->assertDatabaseHas('submissions', ['id' => $f['submission'], 'revision' => 3, 'workflow_stage' => 'institution', 'current_step' => 2]);
        $this->assertDatabaseMissing('audit_events', ['event_type' => 'submission_approve', 'entity_id' => (string) $f['submission']]);
        $f['ministryReviewer']->update(['is_active' => true]);
        $this->postJson($f['url'].'/approve', ['expectedRevision' => 3])->assertOk();
        $impostor = $this->user('MDO', $f['inst']->id);
        Sanctum::actingAs($impostor);
        $this->getJson($f['url'])->assertNotFound();
        $this->getJson('/api/v1/submissions')->assertOk()->assertJsonCount(0, 'data');
        Sanctum::actingAs($f['ministryReviewer']);
        $this->getJson($f['url'])->assertOk()->assertJsonPath('data.allowedActions.0', 'review');
    }

    public function test_ministry_return_restarts_last_selected_versions_after_dynamic_handoff(): void
    {
        $f = $this->fixture();
        $this->putJson($f['url'].'/values', ['expectedRevision' => 0, 'values' => $f['values']])->assertOk();
        $this->postJson($f['url'].'/submit', ['expectedRevision' => 1])->assertOk();
        // Replace both active configurations after submit, before the handoff.
        $activeVersions = [];
        foreach ([[$f['ia'], $f['circle']], [$f['moa'], $f['ministryCircle']]] as [$admin, $version]) {
            Sanctum::actingAs($admin);
            $clone = $this->postJson('/api/v1/approval-circles/'.$version.'/clone')->assertCreated()->json('data.id');
            $activeVersions[] = $clone;
            $this->postJson('/api/v1/approval-circles/'.$clone.'/activate')->assertOk();
            $this->assertDatabaseHas('approval_circles', ['id' => $version, 'status' => 'retired']);
        }
        Sanctum::actingAs($f['reviewer']);
        $this->postJson($f['url'].'/review', ['expectedRevision' => 2])->assertOk();
        Sanctum::actingAs($f['approver']);
        $this->postJson($f['url'].'/approve', ['expectedRevision' => 3])->assertOk()->assertJsonPath('data.ministryWorkflowVersionId', $activeVersions[1]);
        $this->travelTo(Carbon::parse('2027-01-10 12:00:00', 'Africa/Dar_es_Salaam'));
        $this->artisan('reporting-periods:sync-status')->assertSuccessful();
        $this->assertDatabaseHas('reporting_periods', ['id' => $f['period'], 'status' => 'closed', 'automatic_status' => true]);
        Sanctum::actingAs($f['ministryReviewer']);
        $this->postJson($f['url'].'/return', ['expectedRevision' => 4, 'comments' => 'Correct figures', 'correctionDeadline' => '2027-01-15'])->assertOk()->assertJsonPath('data.status', 'returned');
        Sanctum::actingAs($f['officer']);
        $f['values'][0]['value'] = '25';
        $this->putJson($f['url'].'/values', ['expectedRevision' => 5, 'values' => $f['values']])->assertOk();
        $this->postJson($f['url'].'/submit', ['expectedRevision' => 6])->assertOk()
            ->assertJsonPath('data.workflowStage', 'institution')->assertJsonPath('data.currentStep.required_role_code', 'IHOD')
            ->assertJsonPath('data.workflowVersionId', $activeVersions[0])->assertJsonPath('data.ministryWorkflowVersionId', $activeVersions[1]);
        $this->getJson($f['url'])->assertOk()->assertJsonCount(2, 'data.submittedVersions')
            ->assertJsonPath('data.submittedVersions.0.values.0.value', '20')->assertJsonPath('data.submittedVersions.1.values.0.value', '25');
        Sanctum::actingAs($f['ministryReviewer']);
        $this->getJson($f['url'])->assertNotFound();
        Sanctum::actingAs($f['reviewer']);
        $this->postJson($f['url'].'/review', ['expectedRevision' => 7])->assertOk();
        Sanctum::actingAs($f['approver']);
        $this->postJson($f['url'].'/approve', ['expectedRevision' => 8])->assertOk()->assertJsonPath('data.workflowStage', 'ministry');
    }

    #[TestWith(['renamed'])]
    #[TestWith(['removed'])]
    #[TestWith(['no_recipient'])]
    #[TestWith(['missing_active'])]
    #[TestWith(['ambiguous'])]
    #[TestWith(['historical'])]
    public function test_ministry_forward_uses_active_version_and_rolls_back_when_unavailable(string $case): void
    {
        $f = $this->fixture();
        $this->putJson($f['url'].'/values', ['expectedRevision' => 0, 'values' => $f['values']])->assertOk();
        $this->postJson($f['url'].'/submit', ['expectedRevision' => 1])->assertOk();
        Sanctum::actingAs($f['reviewer']);
        $this->postJson($f['url'].'/review', ['expectedRevision' => 2])->assertOk();
        Sanctum::actingAs($f['approver']);
        $this->postJson($f['url'].'/approve', ['expectedRevision' => 3])->assertOk();

        Sanctum::actingAs($f['moa']);
        $config = $f['ministryConfig'];
        $config['steps'][0]['step_name'] = 'Renamed review';
        $config['steps'][2]['required_role_code'] = 'MDD';
        if ($case === 'removed') {
            array_shift($config['steps']);
        } elseif ($case === 'ambiguous') {
            array_unshift($config['steps'], $config['steps'][0]);
        }
        $active = $this->postJson('/api/v1/approval-circles', $config)->assertCreated()->json('data.id');
        $this->postJson('/api/v1/approval-circles/'.$active.'/activate')->assertOk();
        if ($case === 'no_recipient') {
            $f['ministryApprover']->update(['is_active' => false]);
        } elseif ($case === 'missing_active') {
            ApprovalCircle::findOrFail($active)->update(['is_active' => false, 'status' => 'retired']);
        }
        if ($case === 'historical') {
            foreach (Submission::findOrFail($f['submission'])->approvals()->get() as $approval) {
                $meta = $approval->meta;
                unset($meta['completedStepId']);
                $approval->update(['meta' => $meta]);
            }
        }

        Sanctum::actingAs($f['ministryReviewer']);
        $response = $this->postJson($f['url'].'/review', ['expectedRevision' => 4]);
        if (in_array($case, ['no_recipient', 'missing_active', 'ambiguous'], true)) {
            $response->assertConflict();
            $this->assertDatabaseHas('submissions', ['id' => $f['submission'], 'revision' => 4,
                'ministry_approval_circle_id' => $f['ministryCircle'], 'current_step' => 1]);
            $this->assertDatabaseCount('submission_approvals', 5);

            return;
        }
        $response->assertOk()->assertJsonPath('data.ministryWorkflowVersionId', $active)
            ->assertJsonPath('data.currentStep.required_role_code', 'MDD')
            ->assertJsonPath('data.currentStep.action', 'approve')
            ->assertJsonPath('data.templateVersionId', $f['template']->id);
        $lastApproval = Submission::findOrFail($f['submission'])->approvals()->get()->last();
        $this->assertSame(ApprovalCircle::findOrFail($f['ministryCircle'])->steps()->first()->id, $lastApproval->meta['completedStepId']);
        $this->assertDatabaseHas('notifications', ['user_id' => $f['ministryApprover']->id, 'type' => 'SubmissionWorkflow']);
        Sanctum::actingAs($f['ministryApprover']);
        $this->postJson($f['url'].'/approve', ['expectedRevision' => 4])->assertConflict();
        $this->postJson($f['url'].'/approve', ['expectedRevision' => 5])->assertOk()
            ->assertJsonPath('data.currentStep.action', 'publish')->assertJsonPath('data.status', 'approved');
        $this->postJson($f['url'].'/publish', ['expectedRevision' => 6])->assertOk()->assertJsonPath('data.status', 'published');
        $this->assertDatabaseHas('submissions', ['id' => $f['submission'], 'ministry_approval_circle_id' => $active,
            'revision' => 7, 'template_version_id' => $f['template']->id, 'status' => 'published']);
    }

    public function test_old_mdo_approval_continues_to_active_mdd_approval_without_returning_to_mdo_review(): void
    {
        $f = $this->fixture();
        Sanctum::actingAs($f['moa']);
        $oldConfig = $f['ministryConfig'];
        $oldConfig['steps'][0]['required_role_code'] = 'MDD';
        array_splice($oldConfig['steps'], 1, 0, [[
            'step_name' => 'Old MDO approval', 'required_role_code' => 'MDO', 'action' => 'approve', 'level' => 'ministry',
        ]]);
        $old = $this->postJson('/api/v1/approval-circles', $oldConfig)->assertCreated()->json('data.id');
        $this->postJson('/api/v1/approval-circles/'.$old.'/activate')->assertOk();
        Sanctum::actingAs($f['officer']);
        $this->putJson($f['url'].'/values', ['expectedRevision' => 0, 'values' => $f['values']])->assertOk();
        $this->postJson($f['url'].'/submit', ['expectedRevision' => 1])->assertOk();
        Sanctum::actingAs($f['reviewer']);
        $this->postJson($f['url'].'/review', ['expectedRevision' => 2])->assertOk();
        Sanctum::actingAs($f['approver']);
        $this->postJson($f['url'].'/approve', ['expectedRevision' => 3])->assertOk();
        Sanctum::actingAs($f['ministryApprover']);
        $this->postJson($f['url'].'/review', ['expectedRevision' => 4])->assertOk()
            ->assertJsonPath('data.currentStep.required_role_code', 'MDO');
        Sanctum::actingAs($f['moa']);
        $active = $this->postJson('/api/v1/approval-circles', $f['ministryConfig'])->assertCreated()->json('data.id');
        $this->postJson('/api/v1/approval-circles/'.$active.'/activate')->assertOk();

        Sanctum::actingAs($f['ministryReviewer']);
        $this->postJson($f['url'].'/approve', ['expectedRevision' => 5])->assertOk()
            ->assertJsonPath('data.ministryWorkflowVersionId', $active)
            ->assertJsonPath('data.currentStep.required_role_code', 'MDD')
            ->assertJsonPath('data.currentStep.action', 'approve');
        $this->assertDatabaseHas('submissions', ['id' => $f['submission'], 'revision' => 6,
            'status' => 'under_review', 'ministry_approval_circle_id' => $active]);
    }

    #[TestWith(['publish'])]
    #[TestWith(['return'])]
    public function test_mdd_can_publish_or_return_directly_after_mdo_review(string $action): void
    {
        $f = $this->fixture();
        $this->putJson($f['url'].'/values', ['expectedRevision' => 0, 'values' => $f['values']])->assertOk();
        $this->postJson($f['url'].'/submit', ['expectedRevision' => 1])->assertOk();
        Sanctum::actingAs($f['reviewer']);
        $this->postJson($f['url'].'/review', ['expectedRevision' => 2])->assertOk();
        Sanctum::actingAs($f['approver']);
        $this->postJson($f['url'].'/approve', ['expectedRevision' => 3])->assertOk();

        Sanctum::actingAs($f['moa']);
        $config = ['name' => 'MDO review then MDD publication', 'steps' => [
            ['step_name' => 'Review', 'required_role_code' => 'MDO', 'action' => 'review', 'level' => 'ministry', 'can_return' => true],
            ['step_name' => 'Publish', 'required_role_code' => 'MDD', 'action' => 'publish', 'level' => 'ministry', 'can_return' => true],
        ]];
        $active = $this->postJson('/api/v1/approval-circles', $config)->assertCreated()->json('data.id');
        $this->postJson('/api/v1/approval-circles/'.$active.'/activate')->assertOk();
        Sanctum::actingAs($f['ministryReviewer']);
        $this->postJson($f['url'].'/publish', ['expectedRevision' => 4])->assertForbidden();
        $this->postJson($f['url'].'/review', ['expectedRevision' => 4])->assertOk()
            ->assertJsonPath('data.ministryWorkflowVersionId', $active)
            ->assertJsonPath('data.currentStep.action', 'publish');

        Sanctum::actingAs($f['ministryApprover']);
        $this->getJson($f['url'])->assertOk()->assertJsonPath('data.allowedActions', ['publish', 'return']);
        $this->postJson($f['url'].'/approve', ['expectedRevision' => 5])->assertForbidden();
        $this->postJson($f['url'].'/review', ['expectedRevision' => 5])->assertForbidden();
        $payload = ['expectedRevision' => 5];
        if ($action === 'return') {
            $this->postJson($f['url'].'/return', $payload)->assertUnprocessable();
            $payload += ['comments' => 'Please correct the figures', 'correctionDeadline' => '2026-10-30'];
        }
        $status = $action === 'publish' ? 'published' : 'returned';
        $this->postJson($f['url'].'/'.$action, $payload)->assertOk()->assertJsonPath('data.status', $status);
        $this->assertDatabaseHas('submissions', ['id' => $f['submission'], 'status' => $status, 'revision' => 6]);
        $this->assertDatabaseMissing('submission_approvals', ['submission_id' => $f['submission'],
            'actor_id' => $f['ministryApprover']->id, 'action' => 'approve']);
        $this->assertDatabaseHas('notifications', ['user_id' => $f['officer']->id, 'type' => 'SubmissionWorkflow']);
    }

    public function test_completed_approval_moves_to_publication_without_repeating_reordered_steps(): void
    {
        $f = $this->fixture();
        $this->putJson($f['url'].'/values', ['expectedRevision' => 0, 'values' => $f['values']])->assertOk();
        $this->postJson($f['url'].'/submit', ['expectedRevision' => 1])->assertOk();
        Sanctum::actingAs($f['reviewer']);
        $this->postJson($f['url'].'/review', ['expectedRevision' => 2])->assertOk();
        Sanctum::actingAs($f['approver']);
        $this->postJson($f['url'].'/approve', ['expectedRevision' => 3])->assertOk();
        Sanctum::actingAs($f['ministryReviewer']);
        $this->postJson($f['url'].'/review', ['expectedRevision' => 4])->assertOk();
        Sanctum::actingAs($f['moa']);
        $config = $f['ministryConfig'];
        array_splice($config['steps'], 1, 0, [[
            'step_name' => 'Inserted before completed approval', 'required_role_code' => 'MDO',
            'action' => 'approve', 'level' => 'ministry',
        ]]);
        $active = $this->postJson('/api/v1/approval-circles', $config)->assertCreated()->json('data.id');
        $this->postJson('/api/v1/approval-circles/'.$active.'/activate')->assertOk();

        Sanctum::actingAs($f['ministryApprover']);
        $this->postJson($f['url'].'/approve', ['expectedRevision' => 5])->assertOk()
            ->assertJsonPath('data.ministryWorkflowVersionId', $active)
            ->assertJsonPath('data.currentStep.action', 'publish')->assertJsonPath('data.currentStep.sequence', 4);
        $this->assertDatabaseHas('submissions', ['id' => $f['submission'], 'status' => 'approved', 'current_step' => 4]);
    }

    public function test_legacy_submission_preserves_its_original_shared_workflow(): void
    {
        $f = $this->fixture();
        $this->putJson($f['url'].'/values', ['expectedRevision' => 0, 'values' => $f['values']])->assertOk();
        $this->postJson($f['url'].'/submit', ['expectedRevision' => 1])->assertOk();
        // Simulate a pre-migration submission pinned to the former mixed general workflow.
        $circle = ApprovalCircle::findOrFail($f['circle']);
        $circle->update(['institution_id' => null, 'scope_key' => 'legacy-general', 'status' => 'retired', 'is_active' => false]);
        $circle->steps()->create(['sequence' => 3, 'step_name' => 'Legacy publication', 'required_role_code' => 'AO',
            'action' => 'publish', 'level' => 'institution', 'can_return' => true]);
        Submission::findOrFail($f['submission'])->update(['workflow_stage' => null, 'ministry_approval_circle_id' => null]);
        Sanctum::actingAs($f['reviewer']);
        $this->postJson($f['url'].'/review', ['expectedRevision' => 2])->assertOk();
        Sanctum::actingAs($f['approver']);
        $this->postJson($f['url'].'/approve', ['expectedRevision' => 3])->assertOk()->assertJsonPath('data.status', 'approved');
        $this->postJson($f['url'].'/publish', ['expectedRevision' => 4])->assertOk()->assertJsonPath('data.status', 'published');
    }

    public function test_cloning_old_institution_path_omits_publication_only_in_new_draft(): void
    {
        $f = $this->fixture();
        $old = ApprovalCircle::findOrFail($f['circle']);
        $old->steps()->create(['sequence' => 3, 'step_name' => 'Old publication', 'required_role_code' => 'AO',
            'action' => 'publish', 'level' => 'institution', 'can_return' => true]);
        Sanctum::actingAs($f['ia']);
        $clone = $this->postJson('/api/v1/approval-circles/'.$old->id.'/clone')->assertCreated()
            ->assertJsonCount(2, 'data.steps')->assertJsonPath('data.steps.1.action', 'approve')->json('data.id');
        $this->assertSame(3, $old->steps()->count());
        $this->postJson('/api/v1/approval-circles/'.$clone.'/activate')->assertOk();
        Sanctum::actingAs($f['officer']);
        $this->putJson($f['url'].'/values', ['expectedRevision' => 0, 'values' => $f['values']])->assertOk();
        $this->postJson($f['url'].'/submit', ['expectedRevision' => 1])->assertOk()->assertJsonPath('data.workflowVersionId', $clone);
    }
}
