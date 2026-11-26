<?php

namespace App\Services;

use App\Models\DatasetReportingCalendar;
use App\Models\ReportingPeriod;
use App\Models\Submission;
use Illuminate\Database\Query\Builder;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class AnnualObjectiveService
{
    public function __construct(private AnnualTargetService $years, private StrategicPlanService $plans) {}

    /** Resolve against the reporting year's start, never the current server date. */
    private function eligible(DatasetReportingCalendar $calendar, ReportingPeriod $year): Builder
    {
        $start = $year->start_date->toDateString();

        return $this->plans->versions()
            ->where('p.institution_id', $calendar->dataset->institution_id)->where('p.status', 'active')
            ->where('p.start_date', '<=', $start)->where('p.end_date', '>=', $year->end_date->toDateString())
            ->where('v.effective_from', '<=', $start)
            ->whereNotExists(function (Builder $query) use ($start) {
                $query->selectRaw('1')->from('strategic_objective_versions as newer')
                    ->whereColumn('newer.strategic_objective_id', 'v.strategic_objective_id')
                    ->whereColumn('newer.effective_from', '>', 'v.effective_from')
                    ->where('newer.effective_from', '<=', $start);
            });
    }

    private function assignment(DatasetReportingCalendar $calendar, ReportingPeriod $year): ?object
    {
        return DB::table('dataset_annual_objectives')->where('dataset_definition_id', $calendar->dataset_definition_id)
            ->where('reporting_year_id', $year->id)->first();
    }

    private function applicablePlan(DatasetReportingCalendar $calendar, ReportingPeriod $year): ?object
    {
        return DB::table('strategic_plans')->where('institution_id', $calendar->dataset->institution_id)
            ->where('status', 'active')->where('start_date', '<=', $year->start_date->toDateString())
            ->where('end_date', '>=', $year->end_date->toDateString())->first();
    }

    public function context(DatasetReportingCalendar $calendar, ?Submission $submission = null): array
    {
        $year = $this->years->year($calendar);
        $historical = $submission && ($submission->attempt > 0 || $submission->submitted_at !== null);
        $assignment = $historical ? null : $this->assignment($calendar, $year);
        $selected = $historical ? $submission->objective_snapshot
            : ($assignment ? json_decode($assignment->snapshot, true, 512, JSON_THROW_ON_ERROR) : null);
        $plan = $historical ? null : $this->applicablePlan($calendar, $year);
        $locked = $historical || $assignment?->locked_at !== null;
        $options = $locked ? [] : $this->eligible($calendar, $year)->orderBy('o.code')->get()
            ->map(fn ($row) => $this->plans->mapVersion($row))->all();
        $selectionValid = $selected !== null && ($locked || in_array($selected['objectiveVersionId'], array_column($options, 'objectiveVersionId'), true));

        return ['reportingYearId' => (int) $year->id, 'yearLabel' => $year->label,
            'selectedObjective' => $selected, 'availableObjectives' => $options,
            'requiresEntry' => ! $historical && $plan !== null && ! $selectionValid,
            'selectionValid' => $selectionValid, 'readOnly' => $locked,
            'planConfigured' => $historical ? $selected !== null : $plan !== null,
            'historicalSnapshotAvailable' => ! $historical || $selected !== null];
    }

    /** The caller owns the dataset lock, serializing assignments across different quarter drafts. */
    public function save(Request $request, Submission $submission, int $versionId, ?int $expectedVersionId): void
    {
        abort_if($submission->attempt > 0 || $submission->submitted_at !== null, 409, 'Submitted objectives are read-only.');
        $calendar = $submission->calendar;
        $year = $this->years->year($calendar);
        $existing = $this->assignment($calendar, $year);
        $currentId = $existing ? (int) $existing->objective_version_id : null;
        abort_unless($currentId === $expectedVersionId, 409, 'Annual objective changed; reload the submission context.');
        if ($existing?->locked_at !== null) {
            abort_unless($currentId === $versionId, 409, 'Annual objective is locked after the first submission.');

            return;
        }
        $plan = $this->applicablePlan($calendar, $year);
        abort_unless($plan, 422, 'No active strategic plan covers this reporting year.');
        DB::table('strategic_plans')->where('id', $plan->id)->lockForUpdate()->first();
        $version = $this->eligible($calendar, $year)->where('v.id', $versionId)->first();
        abort_unless($version, 422, 'Choose an objective version belonging to this dataset owner and reporting year.');
        if ($currentId === $versionId) {
            return;
        }
        $snapshot = $this->plans->mapVersion($version) + ['reportingYearId' => (int) $year->id, 'yearLabel' => $year->label];
        $before = $existing ? json_decode($existing->snapshot, true, 512, JSON_THROW_ON_ERROR) : null;
        $values = ['objective_version_id' => $versionId, 'snapshot' => json_encode($snapshot, JSON_THROW_ON_ERROR), 'updated_at' => now()];
        if ($existing) {
            $id = (int) $existing->id;
            DB::table('dataset_annual_objectives')->where('id', $id)->update($values);
        } else {
            $id = DB::table('dataset_annual_objectives')->insertGetId($values + [
                'dataset_definition_id' => $calendar->dataset_definition_id, 'reporting_year_id' => $year->id,
                'created_by' => $request->user()->id, 'created_at' => now(),
            ]);
        }
        $this->plans->audit($request, 'annual_objective_selected', 'dataset_annual_objective', $id, $before, $snapshot);
    }

    /** Once submitted, returns/resubmissions must retain the original description, including legacy nulls. */
    public function freeze(Submission $submission): void
    {
        if ($submission->attempt > 0 || $submission->submitted_at !== null) {
            return;
        }
        $calendar = $submission->calendar;
        $year = $this->years->year($calendar);
        $plan = $this->applicablePlan($calendar, $year);
        if ($plan) {
            DB::table('strategic_plans')->where('id', $plan->id)->lockForUpdate()->first();
        }
        $context = $this->context($calendar);
        abort_if($context['requiresEntry'], 422, 'Select an objective for this dataset and reporting year before submitting.');
        $assignment = $this->assignment($calendar, $year);
        if ($assignment) {
            abort_unless($context['selectionValid'], 422, 'The selected objective is no longer applicable; choose the current version for this reporting year.');
            if ($assignment->locked_at === null) {
                DB::table('dataset_annual_objectives')->where('id', $assignment->id)->update(['locked_at' => now(), 'updated_at' => now()]);
            }
        }
        $submission->objective_snapshot = $context['selectedObjective'];
    }
}
