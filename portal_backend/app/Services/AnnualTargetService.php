<?php

namespace App\Services;

use App\DTOs\AuditEventData;
use App\Models\DatasetReportingCalendar;
use App\Models\ReportingPeriod;
use App\Models\Submission;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class AnnualTargetService
{
    /** Resolve the explicit reporting year, not the server's current calendar year. */
    public function year(DatasetReportingCalendar $calendar): ReportingPeriod
    {
        $period = $calendar->period;
        $year = $period->period_type === 'annual' ? $period : $period->parent;
        abort_unless($year && $year->period_type === 'annual', 422, 'Reporting period must belong to an annual reporting year.');

        return $year;
    }

    public function context(DatasetReportingCalendar $calendar, array $template, ?Submission $submission = null): array
    {
        $year = $this->year($calendar);
        $indicators = collect($template['indicators'] ?? [])->whereIn('data_type', ['integer', 'decimal']);
        $historical = $submission && ($submission->attempt > 0 || $submission->submitted_at !== null);
        $targets = $historical ? ($submission->annual_targets_snapshot ?? []) : DB::table('dataset_annual_targets')
            ->where('dataset_definition_id', $calendar->dataset_definition_id)->where('reporting_year_id', $year->id)
            ->whereIn('indicator_id', $indicators->pluck('id'))->orderBy('indicator_id')->get()
            ->map(fn ($target) => $this->snapshot($target))->all();
        $missing = $historical ? [] : $indicators->pluck('id')->diff(collect($targets)->pluck('indicatorId'))->values()->all();

        return ['reportingYearId' => $year->id, 'yearLabel' => $year->label,
            'targets' => $targets, 'missingIndicatorIds' => $missing,
            'requiresEntry' => false, 'optional' => true, 'readOnly' => $historical || $missing === [],
            'historicalSnapshotAvailable' => ! $historical || $submission->annual_targets_snapshot !== null];
    }

    /** Caller holds the dataset lock; annual targets and draft values commit together. */
    public function save(Request $request, Submission $submission, array $entries): void
    {
        if ($entries === []) {
            return;
        }
        abort_if($submission->attempt > 0 || $submission->submitted_at !== null, 409, 'Submitted annual targets are read-only.');
        $year = $this->year($submission->calendar);
        $indicators = collect($submission->template->template_content['indicators'] ?? [])->keyBy('id');
        foreach ($entries as $entry) {
            // Empty optional fields do not create zero targets or erase existing annual plans.
            if ($entry['targetValue'] === null) {
                continue;
            }
            $indicator = $indicators->get($entry['indicatorId']);
            abort_unless($indicator && in_array($indicator['data_type'], ['integer', 'decimal'], true), 422, 'Annual target requires a numeric indicator in this submission template.');
            $value = app(IndicatorTargetService::class)->numeric($entry['targetValue'], $indicator['data_type'], 'annualTargets');
            $baseline = ($entry['baselineValue'] ?? null) === null ? null
                : app(IndicatorTargetService::class)->numeric($entry['baselineValue'], $indicator['data_type'], 'annualTargets.baselineValue');
            $query = DB::table('dataset_annual_targets')->where('dataset_definition_id', $submission->calendar->dataset_definition_id)
                ->where('reporting_year_id', $year->id)->where('indicator_id', $indicator['id']);
            $existing = $query->first();
            if ($existing) {
                abort_unless($existing->target_value === $value
                    && (! array_key_exists('baselineValue', $entry) || $existing->baseline_value === $baseline), 409, 'Annual target already exists and is read-only. Use the authorized correction action with a reason.');

                continue;
            }
            $id = DB::table('dataset_annual_targets')->insertGetId([
                'dataset_definition_id' => $submission->calendar->dataset_definition_id, 'reporting_year_id' => $year->id,
                'indicator_id' => $indicator['id'], 'template_version_id' => $submission->template_version_id,
                'data_type' => $indicator['data_type'], 'target_value' => $value, 'baseline_value' => $baseline,
                'created_by' => $request->user()->id, 'created_at' => now(), 'updated_at' => now(),
            ]);
            $this->audit($request, $id, null, $this->snapshot(DB::table('dataset_annual_targets')->find($id)));
        }
    }

    /** Capture once; returned submissions keep the baseline used when originally submitted. */
    public function freeze(Submission $submission): void
    {
        if ($submission->attempt > 0 || $submission->submitted_at !== null) {
            return;
        }
        $context = $this->context($submission->calendar, $submission->template->template_content);
        $submission->annual_targets_snapshot = $context['targets'];
    }

    public function correct(Request $request, Submission $submission, array $entries, string $reason): void
    {
        $actor = $request->user();
        $dataset = $submission->calendar->dataset;
        abort_unless($actor->hasRole('MOA') || ($actor->hasRole('IA') && (int) $actor->institution_id === (int) $dataset->institution_id), 403);
        abort_if(trim($reason) === '', 422, 'A correction reason is required.');
        $year = $this->year($submission->calendar);
        abort_if(app(ReportingPeriodStatusService::class)->manuallyClosed($year), 422, 'Reporting year is closed.');
        foreach ($entries as $entry) {
            $target = DB::table('dataset_annual_targets')->where('dataset_definition_id', $dataset->id)
                ->where('reporting_year_id', $year->id)->where('indicator_id', $entry['indicatorId'])->first();
            abort_unless($target, 404, 'Annual target not found.');
            $expected = app(IndicatorTargetService::class)->numeric($entry['expectedTargetValue'], $target->data_type, 'annualTargets');
            abort_unless($target->target_value === $expected, 409, 'Annual target changed; reload before correcting it.');
            $value = app(IndicatorTargetService::class)->numeric($entry['targetValue'], $target->data_type, 'annualTargets');
            $baseline = $target->baseline_value;
            if (array_key_exists('baselineValue', $entry)) {
                abort_unless(array_key_exists('expectedBaselineValue', $entry), 422, 'expectedBaselineValue is required when correcting baselineValue.');
                $expectedBaseline = $entry['expectedBaselineValue'] === null ? null
                    : app(IndicatorTargetService::class)->numeric($entry['expectedBaselineValue'], $target->data_type, 'annualTargets.expectedBaselineValue');
                abort_unless($baseline === $expectedBaseline, 409, 'Annual baseline changed; reload before correcting it.');
                $baseline = $entry['baselineValue'] === null ? null
                    : app(IndicatorTargetService::class)->numeric($entry['baselineValue'], $target->data_type, 'annualTargets.baselineValue');
            }
            if ($target->target_value === $value && $target->baseline_value === $baseline) {
                continue;
            }
            $before = $this->snapshot($target);
            DB::table('dataset_annual_targets')->where('id', $target->id)->update(['target_value' => $value, 'baseline_value' => $baseline, 'updated_at' => now()]);
            $target->target_value = $value;
            $target->baseline_value = $baseline;
            $this->audit($request, $target->id, $before, $this->snapshot($target), trim($reason));
        }
    }

    private function snapshot(object $target): array
    {
        return ['id' => (int) $target->id, 'indicatorId' => (int) $target->indicator_id,
            'reportingYearId' => (int) $target->reporting_year_id, 'targetValue' => $target->target_value,
            'baselineValue' => $target->baseline_value ?? null,
            'templateVersionId' => (int) $target->template_version_id];
    }

    private function audit(Request $request, int $id, ?array $before, array $after, ?string $reason = null): void
    {
        app(AuditService::class)->record(new AuditEventData(
            eventType: $before === null ? 'annual_target_created' : 'annual_target_corrected',
            userId: $request->user()->id, entityType: 'dataset_annual_target', entityId: (string) $id,
            oldValues: $before, newValues: $after, reason: $reason,
            ipAddress: $request->ip(), requestId: $request->attributes->get('auditRequestId'),
        ));
    }
}
