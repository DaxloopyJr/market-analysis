<?php

namespace App\Services;

use App\Models\DatasetReportingCalendar;
use App\Models\ReportingPeriod;
use Carbon\CarbonImmutable;

class ReportingEntryService
{
    public function status(ReportingPeriod $period, ?DatasetReportingCalendar $calendar = null): array
    {
        $today = CarbonImmutable::now('Africa/Dar_es_Salaam')->toDateString();
        $submission = $calendar?->submission;
        $returned = $submission?->status === 'returned';
        $deadline = $returned && $submission->correction_deadline
            ? $submission->correction_deadline->toDateString() : $period->deadline->toDateString();
        $status = match (true) {
            $submission !== null && ! in_array($submission->status, ['draft', 'returned'], true) => 'submitted',
            $calendar?->submitted_at !== null && ! $returned => 'submitted',
            $period->institution_id !== null => 'closed',
            app(ReportingPeriodStatusService::class)->manuallyClosed($period) => 'closed',
            $today > $deadline => 'overdue',
            $today < $period->start_date->toDateString() => 'upcoming',
            $returned => 'returned',
            default => 'available',
        };

        return ['entryStatus' => $status, 'canEnterData' => in_array($status, ['available', 'returned'], true),
            'submissionStatus' => $submission?->status,
            'reference' => $submission?->reference,
            'revision' => $submission?->revision,
            'submissionId' => $submission?->id, 'correctionDeadline' => $returned ? $deadline : null, 'reason' => match ($status) {
                'submitted' => 'Data tayari zimewasilishwa.', 'closed' => 'Kipindi kimefungwa.',
                'returned' => 'Data zimerudishwa kwa marekebisho.',
                'overdue' => 'Submission deadline imepita.', 'upcoming' => 'Kipindi hakijaanza.', default => null,
            }];
    }

    public function assertAvailable(DatasetReportingCalendar $calendar): void
    {
        $status = $this->status($calendar->period, $calendar);
        abort_unless($status['canEnterData'], 422, $status['reason']);
    }
}
