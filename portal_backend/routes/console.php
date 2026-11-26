<?php

use App\Jobs\MonitoringHeartbeat;
use App\Services\DatasetRecurringReportingService;
use App\Services\DatasetReminderService;
use App\Services\ReportingPeriodStatusService;
use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

Artisan::command('datasets:send-reminders', function () {
    app(DatasetRecurringReportingService::class)->prepareDueYears();
    $this->info('Notifications sent: '.app(DatasetReminderService::class)->sendDue());
})->purpose('Send due in-app dataset reminders');

Artisan::command('reporting-periods:sync-status', function () {
    $this->info('Periods updated: '.app(ReportingPeriodStatusService::class)->synchronize());
})->purpose('Open and close reporting periods according to their dates');

Schedule::command('reporting-periods:sync-status')->everyMinute()->withoutOverlapping();

// Scheduler hujaribu kila saa; kumbukumbu ya delivery huzuia kutuma mara mbili.
Schedule::command('datasets:send-reminders')->hourly()->withoutOverlapping();

Schedule::call(function () {
    Cache::put('monitoring.scheduler', now()->timestamp, 86400);
    $driver = config('queue.connections.'.config('queue.default').'.driver');
    if (in_array($driver, ['database', 'redis', 'sqs', 'beanstalkd'], true)) {
        MonitoringHeartbeat::dispatch(time());
    }
})->name('monitoring-heartbeat')->everyMinute()->withoutOverlapping()->when(fn () => config('monitoring.enabled'));

Schedule::command('monitoring:collect')->everyFiveMinutes()->withoutOverlapping()
    ->when(fn () => config('monitoring.enabled'));
