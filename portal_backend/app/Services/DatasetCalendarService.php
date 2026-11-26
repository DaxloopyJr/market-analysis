<?php

namespace App\Services;

use App\DTOs\AuditEventData;
use App\Events\AuditEventOccurred;
use App\Models\DatasetDefinition;
use App\Models\DatasetReportingCalendar;
use App\Models\ReportingPeriod;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class DatasetCalendarService
{
    /** Caller holds the dataset lock and transaction so assignment and audit commit together. */
    public function reassignPending(Request $request, DatasetDefinition $dataset): void
    {
        $calendars = DatasetReportingCalendar::where('dataset_definition_id', $dataset->id)
            ->whereNull('submitted_at')
            ->where('responsible_user_id', '!=', $dataset->responsible_user_id)
            ->whereDoesntHave('submission', fn ($query) => $query->where('status', '!=', 'draft')->orWhereNotNull('submitted_at'))
            ->orderBy('id')->lockForUpdate()->get();

        foreach ($calendars as $calendar) {
            $before = ['responsible_user_id' => (int) $calendar->responsible_user_id];
            $calendar->responsible_user_id = $dataset->responsible_user_id;
            $calendar->save();
            AuditEventOccurred::dispatch(new AuditEventData(eventType: 'dataset_calendar_reassigned',
                userId: $request->user()->id, entityType: 'dataset_reporting_calendar', entityId: (string) $calendar->id,
                requestId: $request->attributes->get('auditRequestId'), ipAddress: $request->ip(),
                oldValues: $before, newValues: ['responsible_user_id' => (int) $calendar->responsible_user_id],
                reason: 'Responsible officer changed on the dataset.'));
        }
    }

    /**
     * Keep calendar writes and their audits atomic while reusing single-period checks.
     *
     * @param  array{reportingPeriodIds: list<int>, responsibleUserId: int, deadlineDays: int, reminderDays?: list<int>, remindersEnabled?: bool}  $data
     * @return list<DatasetReportingCalendar>
     */
    public function saveMany(Request $request, int $datasetId, array $data): array
    {
        return DB::transaction(function () use ($request, $datasetId, $data) {
            $periodIds = $data['reportingPeriodIds'];
            unset($data['reportingPeriodIds']);
            $calendars = [];
            foreach ($periodIds as $periodId) {
                $calendars[] = $this->save($request, $datasetId, [...$data, 'reportingPeriodId' => $periodId]);
            }

            return $calendars;
        });
    }

    public function save(Request $request, int $datasetId, array $data): DatasetReportingCalendar
    {
        return DB::transaction(function () use ($request, $datasetId, $data) {
            $dataset = app(DatasetConfigurationService::class)->dataset($request, $datasetId, true);
            $period = ReportingPeriod::lockForUpdate()->findOrFail($data['reportingPeriodId']);
            abort_unless($period->institution_id === null, 422, 'Chagua period ya pamoja iliyoandaliwa na MOA.');
            abort_unless(! app(ReportingPeriodStatusService::class)->manuallyClosed($period), 422, 'Period imefungwa.');
            abort_unless($dataset->frequencies()->where('frequency', $period->period_type)->exists(), 422, 'Frequency ya period haipo kwenye dataset.');
            $recipient = User::findOrFail($data['responsibleUserId']);
            abort_unless(self::eligibleRecipient($dataset, $recipient), 422, 'Mpokeaji lazima awe data officer active wa dataset hii.');
            $calendar = DatasetReportingCalendar::firstOrNew([
                'dataset_definition_id' => $datasetId, 'reporting_period_id' => $period->id,
            ]);
            abort_if($calendar->submitted_at !== null, 422, 'Calendar iliyowasilishwa haibadilishwi.');
            $before = $calendar->exists ? $calendar->attributesToArray() : null;
            $calendar->fill([
                'responsible_user_id' => $recipient->id, 'deadline_days' => (int) $period->end_date->diffInDays($period->deadline),
                'deadline' => $period->deadline, // MOA owns the authoritative deadline.
                'reminder_days' => array_values(array_unique($data['reminderDays'] ?? [7, 1])),
                'reminders_enabled' => $data['remindersEnabled'] ?? false,
            ]);
            if (! $calendar->exists) {
                $calendar->created_by = $request->user()->id;
            }
            if ($calendar->isDirty()) {
                $calendar->save();
                AuditEventOccurred::dispatch(new AuditEventData(eventType: 'dataset_calendar_saved',
                    userId: $request->user()->id, entityType: 'dataset_reporting_calendar', entityId: (string) $calendar->id,
                    ipAddress: $request->ip(), oldValues: $before, newValues: $calendar->attributesToArray()));
            }

            return $calendar;
        });
    }

    public static function eligibleRecipient(DatasetDefinition $dataset, User $user): bool
    {
        if (! $user->is_active || $user->status !== 'active' || (int) $user->institution_id !== (int) $dataset->institution_id) {
            return false;
        }

        return $dataset->department_id === null
            ? $user->hasRole('IDO')
            : $user->hasRole('DDO') && (int) $user->department_id === (int) $dataset->department_id;
    }

    // Huitwa na submission service pekee, ndani ya transaction ya kuwasilisha.
    public function markSubmitted(int $datasetId, int $periodId): void
    {
        DatasetReportingCalendar::where('dataset_definition_id', $datasetId)->where('reporting_period_id', $periodId)
            ->whereNull('submitted_at')->update(['submitted_at' => now()]);
    }

    public function snapshot(DatasetReportingCalendar $calendar): array
    {
        return ['id' => $calendar->id, 'datasetId' => (int) $calendar->dataset_definition_id,
            'templateVersionId' => $calendar->template_version_id === null ? null : (int) $calendar->template_version_id,
            'reportingPeriodId' => (int) $calendar->reporting_period_id,
            'periodLabel' => $calendar->period->label,
            'reportingYear' => $calendar->period->parent?->label ?? $calendar->period->label,
            'periodType' => $calendar->period->period_type,
            'responsibleUserId' => (int) $calendar->responsible_user_id,
            'deadlineDays' => (int) $calendar->period->end_date->diffInDays($calendar->period->deadline), 'deadline' => $calendar->period->deadline->toDateString(),
            'reminderDays' => $calendar->reminder_days, 'remindersEnabled' => $calendar->reminders_enabled,
            'submittedAt' => $calendar->submitted_at?->toIso8601String()] + app(ReportingEntryService::class)->status($calendar->period, $calendar);
    }
}
