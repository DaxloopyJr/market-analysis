<?php

namespace App\Services;

use App\DTOs\AuditEventData;
use App\DTOs\NotificationData;
use App\Models\DatasetReportingCalendar;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;

class DatasetReminderService
{
    public function sendDue(): int
    {
        $count = 0;
        DatasetReportingCalendar::where('reminders_enabled', true)->whereNull('submitted_at')
            ->whereHas('period', fn ($query) => $query->whereNull('institution_id')->whereDate('deadline', '>=', today('Africa/Dar_es_Salaam')))->chunkById(100, function ($rows) use (&$count) {
                foreach ($rows as $row) {
                    $count += DB::transaction(function () use ($row) {
                        // Lock pamoja na unique key huzuia scheduler mbili kutuma reminder ileile.
                        $calendar = DatasetReportingCalendar::lockForUpdate()->findOrFail($row->id);
                        $dataset = $calendar->dataset;
                        $recipient = $calendar->responsibleUser;
                        if (! $calendar->reminders_enabled || $calendar->submitted_at || $dataset->status !== 'active'
                            || app(ReportingPeriodStatusService::class)->manuallyClosed($calendar->period)
                            || ! $recipient || ! DatasetCalendarService::eligibleRecipient($dataset, $recipient)) {
                            return 0;
                        }
                        $days = (int) today('Africa/Dar_es_Salaam')->diffInDays(
                            CarbonImmutable::parse($calendar->period->deadline->toDateString(), 'Africa/Dar_es_Salaam'), false);
                        if (! in_array($days, $calendar->reminder_days, true)) {
                            return 0;
                        }
                        $key = ['calendar_id' => $calendar->id, 'user_id' => $recipient->id,
                            'deadline' => $calendar->period->deadline->toDateString(), 'days_before' => $days];
                        if (DB::table('dataset_reminders')->where($key)->exists()) {
                            return 0;
                        }
                        $audit = app(AuditService::class)->record(new AuditEventData(eventType: 'dataset_deadline_reminder',
                            actorType: 'system', entityType: 'dataset_reporting_calendar', entityId: (string) $calendar->id,
                            newValues: $key));
                        $notification = app(NotificationService::class)->notifyUser(new NotificationData(
                            userId: $recipient->id, auditEventId: $audit->id, type: 'DatasetDeadlineReminder',
                            message: "Dataset {$dataset->dataset_code}, kipindi {$calendar->period->label}: mwisho wa kuwasilisha ni {$calendar->period->deadline->toDateString()}.",
                            sentAt: now()));
                        DB::table('dataset_reminders')->insert($key + ['notification_id' => $notification->id, 'created_at' => now(), 'updated_at' => now()]);

                        return 1;
                    });
                }
            });

        return $count;
    }
}
