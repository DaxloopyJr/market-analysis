<?php

namespace App\Jobs;

use Illuminate\Contracts\Queue\ShouldBeUnique;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Cache;

class MonitoringHeartbeat implements ShouldBeUnique, ShouldQueue
{
    use Queueable;

    public int $uniqueFor = 300;

    public int $tries = 1;

    public int $timeout = 15;

    public function __construct(public int $dispatchedAt) {}

    /**
     * Execute the job.
     */
    public function handle(): void
    {
        // An old backlog item is not evidence that this queue is currently responsive.
        if (time() - $this->dispatchedAt <= 180) {
            Cache::put('monitoring.worker', now()->timestamp, 86400);
        }
    }
}
