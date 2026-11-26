<?php

namespace App\Services;

use App\Models\DatasetReportingCalendar;
use App\Models\Submission;
use Brick\Math\BigDecimal;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class AnnualBudgetService
{
    public function context(DatasetReportingCalendar $calendar, ?Submission $submission = null): array
    {
        $year = app(AnnualTargetService::class)->year($calendar);
        $historical = $submission && ($submission->attempt > 0 || $submission->submitted_at !== null);
        $budget = $historical ? $submission->annual_budget_snapshot : $this->find($calendar);
        $legacy = $submission && ! $historical && $this->hasLegacyDraftBudget($submission, $budget);

        return ['reportingYearId' => $year->id, 'yearLabel' => $year->label,
            'approvedBudget' => $budget['approvedBudget'] ?? null,
            'legacyApprovedBudget' => $legacy ? $submission->approved_budget : null,
            'optional' => true, 'readOnly' => $historical || $budget !== null,
            'historicalSnapshotAvailable' => ! $historical || $budget !== null];
    }

    /** The caller holds the dataset lock and records the complete submission audit atomically. */
    public function save(Request $request, Submission $submission, array $performance): void
    {
        $value = $performance['approved_budget'] ?? null;
        $annualBudget = $this->find($submission->calendar);
        $preserveLegacy = $value === null && $this->hasLegacyDraftBudget($submission, $annualBudget);
        if ($value !== null) {
            $amount = (string) BigDecimal::of((string) $value)->toScale(2);
            $historical = $submission->attempt > 0 || $submission->submitted_at !== null;
            $existing = $historical ? $submission->annual_budget_snapshot : $this->find($submission->calendar);
            if ($existing !== null && ($existing['approvedBudget'] ?? null) !== null) {
                abort_unless(BigDecimal::of($existing['approvedBudget'])->isEqualTo($amount), 409, 'Annual approved budget is already set and is read-only.');
            } else {
                abort_if($historical, 409, 'A submitted budget snapshot cannot be changed.');
                $year = app(AnnualTargetService::class)->year($submission->calendar);
                DB::table('dataset_annual_budgets')->insert([
                    'dataset_definition_id' => $submission->calendar->dataset_definition_id,
                    'reporting_year_id' => $year->id, 'approved_budget' => $amount,
                    'created_by' => $request->user()->id, 'created_at' => now(), 'updated_at' => now(),
                ]);
            }
        }
        unset($performance['approved_budget']);
        $submission->fill($performance);
        if ($submission->attempt === 0 && $submission->submitted_at === null && ! $preserveLegacy) {
            $submission->approved_budget = $this->find($submission->calendar)['approvedBudget'] ?? null;
        }
        $submission->save();
    }

    /** Preserve submitted history, including an explicitly absent annual budget. */
    public function freeze(Submission $submission): void
    {
        if ($submission->attempt > 0 || $submission->submitted_at !== null) {
            return;
        }
        $year = app(AnnualTargetService::class)->year($submission->calendar);
        $budget = $this->find($submission->calendar);
        // A pre-upgrade draft budget is not silently erased or relabelled as an annual plan.
        if ($this->hasLegacyDraftBudget($submission, $budget)) {
            return;
        }
        $submission->annual_budget_snapshot = $budget
            ?? ['reportingYearId' => $year->id, 'approvedBudget' => null];
        $submission->approved_budget = $submission->annual_budget_snapshot['approvedBudget'];
    }

    public function performance(Submission $submission): array
    {
        $historical = $submission->attempt > 0 || $submission->submitted_at !== null;
        $budget = $historical ? $submission->annual_budget_snapshot : $this->find($submission->calendar);
        $legacy = $historical ? $budget === null : $this->hasLegacyDraftBudget($submission, $budget);

        return ['approved_budget' => $legacy ? $submission->approved_budget : ($budget['approvedBudget'] ?? null),
            'budget_scope' => $legacy ? 'legacy_period' : 'annual',
            'actual_received' => $submission->actual_received, 'actual_expenditure' => $submission->actual_expenditure,
            'achievements' => $submission->achievements, 'implementation_challenges' => $submission->implementation_challenges,
            'corrective_actions' => $submission->corrective_actions, 'me_comments' => $submission->me_comments];
    }

    private function hasLegacyDraftBudget(Submission $submission, ?array $annualBudget): bool
    {
        if ($submission->attempt > 0 || $submission->submitted_at !== null || $submission->approved_budget === null) {
            return false;
        }

        return $annualBudget === null
            || ! BigDecimal::of($submission->approved_budget)->isEqualTo($annualBudget['approvedBudget']);
    }

    private function find(DatasetReportingCalendar $calendar): ?array
    {
        $year = app(AnnualTargetService::class)->year($calendar);
        $budget = DB::table('dataset_annual_budgets')->where('dataset_definition_id', $calendar->dataset_definition_id)
            ->where('reporting_year_id', $year->id)->first();

        return $budget ? ['id' => (int) $budget->id, 'reportingYearId' => $year->id,
            'approvedBudget' => (string) BigDecimal::of((string) $budget->approved_budget)->toScale(2)] : null;
    }
}
