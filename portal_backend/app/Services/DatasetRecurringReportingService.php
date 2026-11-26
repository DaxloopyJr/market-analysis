<?php

namespace App\Services;

use App\DTOs\AuditEventData;
use App\Events\AuditEventOccurred;
use App\Models\DatasetDefinition;
use App\Models\DatasetReportingCalendar;
use App\Models\IndicatorTarget;
use App\Models\ReportingPeriod;
use App\Models\Submission;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class DatasetRecurringReportingService
{
    /** Read-only preflight: selecting a quarter must not create a calendar or a second draft. */
    public function selectionStatus(Request $request, int $id, int $startYear, string $frequency, ?int $number): array
    {
        $dataset = app(DatasetConfigurationService::class)->dataset($request, $id);
        $periods = app(ReportingPeriodService::class)->forDatasetYear($request, $dataset, $startYear, $frequency);
        $period = collect($periods)->first(fn ($entry) => $frequency === 'annual' || $entry->period_number === $number);
        abort_unless($period, 422, 'Chagua kipindi halali.');
        $calendar = DatasetReportingCalendar::with('submission')->where('dataset_definition_id', $id)
            ->where('reporting_period_id', $period->id)->first();
        $actor = $request->user();
        $assigned = (int) ($calendar?->responsible_user_id ?? $dataset->responsible_user_id) === (int) $actor->id;
        abort_unless($actor->hasRole('MOA', 'IA') || $assigned || (int) $dataset->responsible_user_id === (int) $actor->id, 403);

        $status = app(ReportingEntryService::class)->status($period, $calendar);
        $canEnter = $status['canEnterData'] && $assigned && DatasetCalendarService::eligibleRecipient($dataset, $actor);
        $action = $canEnter ? ($calendar?->submission ? 'resume' : 'start') : 'blocked';
        if ($status['entryStatus'] === 'submitted') {
            $action = 'view';
        }

        return array_merge($status, [
            'datasetId' => $id, 'reportingPeriodId' => $period->id, 'periodLabel' => $period->label,
            'reportingCalendarId' => $calendar?->id, 'canEnterData' => $canEnter, 'action' => $action,
            'templateVersionId' => $calendar?->submission?->template_version_id ?? $calendar?->template_version_id
                ?? $dataset->templateVersions()->orderByDesc('version_number')->value('id'),
        ]);
    }

    public function settings(Request $request, int $id, array $settings): DatasetDefinition
    {
        return DB::transaction(function () use ($request, $id, $settings) {
            $dataset = app(DatasetConfigurationService::class)->dataset($request, $id, true);
            $settings['responsibleUserId'] ??= $dataset->responsible_user_id;
            abort_unless($settings['responsibleUserId'], 422, 'Weka responsible user kwenye dataset kwanza.');
            abort_unless(DatasetCalendarService::eligibleRecipient($dataset, User::findOrFail($settings['responsibleUserId'])), 422, 'Chagua data officer active wa dataset.');
            abort_if(($settings['yearType'] ?? null) === 'calendar' && ($settings['yearStartMonth'] ?? 1) !== 1, 422, 'Calendar year huanza Januari.');
            $before = $dataset->reporting_settings;
            $dataset->responsible_user_id = $settings['responsibleUserId'];
            $dataset->reporting_settings = $settings;
            if ($dataset->isDirty('responsible_user_id')) {
                app(DatasetCalendarService::class)->reassignPending($request, $dataset);
            }
            if ($dataset->isDirty()) {
                $dataset->save();
                $this->audit($request, 'dataset_reporting_settings_updated', 'dataset_definition', $id, $before, $settings);
            }

            return $dataset;
        });
    }

    /** @return list<array<string, mixed>> */
    public function prepareYear(Request $request, int $id, int $startYear, string $frequency): array
    {
        return DB::transaction(function () use ($request, $id, $startYear, $frequency) {
            $dataset = app(DatasetConfigurationService::class)->dataset($request, $id, true);
            $periods = app(ReportingPeriodService::class)->forDatasetYear($request, $dataset, $startYear, $frequency);
            $settings = $dataset->reporting_settings ?? [];
            $settings['responsibleUserId'] = $dataset->responsible_user_id;
            abort_unless(DatasetCalendarService::eligibleRecipient($dataset, User::findOrFail($settings['responsibleUserId'])), 422, 'Officer wa reporting settings hayuko active au hana scope sahihi.');
            $result = [];
            foreach ($periods as $period) {
                $calendar = DatasetReportingCalendar::where('dataset_definition_id', $id)->where('reporting_period_id', $period->id)->first();
                // Reusing a year preserves manual overrides, submitted records and pinned templates.
                if ($calendar === null && ! app(ReportingPeriodStatusService::class)->manuallyClosed($period)) {
                    $calendar = app(DatasetCalendarService::class)->save($request, $id, [...$settings, 'reportingPeriodId' => $period->id]);
                }
                $result[] = ['reportingPeriodId' => $period->id, 'label' => $period->label,
                    'periodType' => $period->period_type, 'periodNumber' => $period->period_number,
                    'startDate' => $period->start_date->toDateString(), 'endDate' => $period->end_date->toDateString(),
                    'deadline' => $period->deadline->toDateString(),
                    'isOpen' => app(ReportingPeriodStatusService::class)->status($period) === 'open',
                    'calendar' => $calendar ? app(DatasetCalendarService::class)->snapshot($calendar) : null] + app(ReportingEntryService::class)->status($period, $calendar);
            }

            return $result;
        });
    }

    public function context(Request $request, int $id, int $startYear, string $frequency, ?int $number): array
    {
        return DB::transaction(function () use ($request, $id, $startYear, $frequency, $number) {
            $periods = $this->prepareYear($request, $id, $startYear, $frequency);
            $selected = collect($periods)->first(fn ($period) => $frequency === 'annual' || $period['periodNumber'] === $number);
            abort_unless($selected && $selected['canEnterData'], 422, $selected['reason'] ?? 'Chagua kipindi halali.');
            $calendar = DatasetReportingCalendar::lockForUpdate()->findOrFail($selected['calendar']['id']);
            $period = ReportingPeriod::lockForUpdate()->findOrFail($calendar->reporting_period_id);
            if ($period->parent_id) {
                $period->setRelation('parent', ReportingPeriod::lockForUpdate()->findOrFail($period->parent_id));
            }
            $calendar->setRelation('period', $period);
            app(ReportingEntryService::class)->assertAvailable($calendar);
            abort_unless($request->user()->hasRole('MOA') || (int) $calendar->responsible_user_id === (int) $request->user()->id, 403);
            $dataset = $calendar->dataset;
            if ($calendar->template_version_id === null) {
                abort_if($calendar->submitted_at !== null, 422, 'Submission ya zamani haina template iliyofungwa; historia ihakikiwe kwanza.');
                $targetVersions = IndicatorTarget::where('dataset_definition_id', $id)->where('reporting_period_id', $calendar->reporting_period_id)
                    ->where('status', 'active')->whereNotNull('template_version_id')->distinct()->pluck('template_version_id');
                abort_if($targetVersions->count() > 1, 422, 'Targets za kipindi hiki zina template versions tofauti; zihakiki kwanza.');
                $calendar->template_version_id = $targetVersions->first() ?? $dataset->templateVersions()->orderByDesc('version_number')->firstOrFail()->id;
                $calendar->save();
                $this->audit($request, 'dataset_reporting_template_selected', 'dataset_reporting_calendar', $calendar->id, null,
                    ['templateVersionId' => $calendar->template_version_id, 'reportingPeriodId' => $calendar->reporting_period_id]);
            }
            $version = $dataset->templateVersions()->findOrFail($calendar->template_version_id);

            return ['reportingCalendarId' => $calendar->id, 'datasetId' => $id, 'reportingPeriod' => collect($selected)->except('calendar')->all(),
                'calendar' => app(DatasetCalendarService::class)->snapshot($calendar),
                'templateVersionId' => $version->id, 'template' => $version->template_content,
                'annualBudgetContext' => app(AnnualBudgetService::class)->context($calendar,
                    Submission::where('reporting_calendar_id', $calendar->id)->first()),
                'annualObjectiveContext' => app(AnnualObjectiveService::class)->context($calendar,
                    Submission::where('reporting_calendar_id', $calendar->id)->first()),
                'annualTargetContext' => app(AnnualTargetService::class)->context($calendar, $version->template_content,
                    Submission::where('reporting_calendar_id', $calendar->id)->first()),
                'submittedAt' => $calendar->submitted_at?->toIso8601String(),
                'targets' => IndicatorTarget::where('dataset_definition_id', $id)->where('reporting_period_id', $calendar->reporting_period_id)
                    ->where('template_version_id', $version->id)->where('status', 'active')->get()->toArray()];
        });
    }

    /** Prepare calendars before anyone opens a submission, including next year's early reminders. */
    public function prepareDueYears(): int
    {
        $count = 0;
        DatasetDefinition::where('status', 'active')->whereNotNull('reporting_settings')->chunkById(50, function ($datasets) use (&$count) {
            foreach ($datasets as $dataset) {
                $settings = $dataset->reporting_settings;
                if (! ($settings['remindersEnabled'] ?? false)) {
                    continue;
                }
                $officer = User::find($settings['responsibleUserId']);
                if (! $officer || ! DatasetCalendarService::eligibleRecipient($dataset, $officer)) {
                    continue;
                }
                $request = Request::create('/scheduled-reporting', 'POST');
                $request->setUserResolver(fn () => $officer);
                $years = ReportingPeriod::whereNull('institution_id')->where('period_type', 'annual')->where('year_type', 'financial')->where(fn ($q) => $q->where('automatic_status', true)->orWhere('status', 'open'))->get()->map(fn ($period) => $period->start_date->year);
                foreach ($years as $startYear) {
                    foreach ($dataset->frequencies->pluck('frequency') as $frequency) {
                        try {
                            $this->prepareYear($request, $dataset->id, $startYear, $frequency);
                            $count++;
                        } catch (\Throwable $exception) {
                            report($exception);
                        }
                    }
                }
            }
        });

        return $count;
    }

    private function audit(Request $request, string $type, string $entity, int $id, ?array $before, array $after): void
    {
        AuditEventOccurred::dispatch(new AuditEventData(eventType: $type, userId: $request->user()->id,
            entityType: $entity, entityId: (string) $id, oldValues: $before, newValues: $after,
            requestId: $request->attributes->get('auditRequestId'), ipAddress: $request->ip()));
    }
}
