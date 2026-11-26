<?php

namespace App\Console\Commands;

use App\Services\SystemMonitoringService;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;

#[Signature('monitoring:collect')]
#[Description('Collect server resource metrics and prune expired monitoring history')]
class CollectSystemMonitoring extends Command
{
    /**
     * Execute the console command.
     */
    public function handle(SystemMonitoringService $monitoring): int
    {
        if (! config('monitoring.enabled')) {
            $this->info('Monitoring is disabled.');

            return self::SUCCESS;
        }
        $sample = $monitoring->collect();
        $this->info('Monitoring sample saved. Scheduler and worker heartbeats are collected independently.');
        $this->table(['Measurement', 'Value'], [
            ['CPU percent', $sample['resources']['cpu'] ?? 'Unavailable'],
            ['Memory percent', $sample['resources']['memory'] ?? 'Unavailable'],
            ['Disk used GiB', $sample['storage']['usedGB'] ?? 'Unavailable'],
            ['Database bytes', $sample['storage']['databaseBytes'] ?? 'Unavailable'],
            ['Local uploads bytes', $sample['storage']['uploadsBytes'] ?? 'Unavailable'],
        ]);

        return self::SUCCESS;
    }
}
