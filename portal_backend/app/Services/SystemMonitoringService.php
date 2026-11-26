<?php

namespace App\Services;

use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Symfony\Component\Process\Process;
use Throwable;

class SystemMonitoringService
{
    /** Global API aggregates contain no user IDs, URLs, payloads or credentials. */
    public function recordRequest(int $status, int $duration): void
    {
        $minute = now()->utc()->startOfMinute()->format('Y-m-d H:i:s');
        DB::table('monitoring_request_minutes')->insertOrIgnore(['minute' => $minute]);
        DB::table('monitoring_request_minutes')->where('minute', $minute)->update([
            'requests' => DB::raw('requests + 1'),
            'server_errors' => DB::raw('server_errors + '.($status >= 500 ? 1 : 0)),
            'client_errors' => DB::raw('client_errors + '.($status >= 400 && $status < 500 ? 1 : 0)),
            'duration_ms' => DB::raw('duration_ms + '.max(0, $duration)),
        ]);
    }

    /** Slow filesystem/OS probes run in the scheduler, never in a dashboard HTTP request. */
    public function collect(): array
    {
        $resources = $this->resources();
        $storage = $this->storage();
        $checks = [];
        $checks[] = $this->probe('database', 'Database', fn () => DB::select('SELECT 1'));
        $checks[] = $this->probe('cache', 'Cache', function () {
            $key = 'monitoring.probe.'.bin2hex(random_bytes(8));
            Cache::put($key, 'ok', 30);
            try {
                if (Cache::get($key) !== 'ok') {
                    throw new \RuntimeException('Cache probe failed');
                }
            } finally {
                Cache::forget($key);
            }
        });
        $payload = ['resources' => $resources, 'storage' => $storage, 'checks' => $checks];
        DB::table('monitoring_samples')->insert(['collected_at' => now()->utc(), 'payload' => json_encode($payload, JSON_THROW_ON_ERROR)]);
        $cutoff = now()->utc()->subDays(config('monitoring.retention_days'));
        DB::table('monitoring_samples')->where('collected_at', '<', $cutoff)->delete();
        DB::table('monitoring_request_minutes')->where('minute', '<', $cutoff)->delete();

        return $payload;
    }

    private function probe(string $id, string $name, callable $check): array
    {
        $start = hrtime(true);
        try {
            $check();

            return ['id' => $id, 'name' => $name, 'status' => 'healthy', 'latencyMs' => round((hrtime(true) - $start) / 1000000, 2)];
        } catch (Throwable) {
            return ['id' => $id, 'name' => $name, 'status' => 'unavailable', 'latencyMs' => null];
        }
    }

    /** Host-visible resources; these are not container quotas or external availability percentages. */
    public function resources(): array
    {
        $result = ['cpu' => null, 'memory' => null, 'uptimeSeconds' => null, 'scope' => 'collector_host'];
        try {
            if (PHP_OS_FAMILY === 'Windows') {
                $process = new Process(['powershell.exe', '-NoProfile', '-NonInteractive', '-Command',
                    '$o=Get-CimInstance Win32_OperatingSystem; $c=Get-CimInstance Win32_Processor; [pscustomobject]@{cpu=($c|Measure-Object LoadPercentage -Average).Average; memory=(100*($o.TotalVisibleMemorySize-$o.FreePhysicalMemory)/$o.TotalVisibleMemorySize); uptimeSeconds=((Get-Date)-$o.LastBootUpTime).TotalSeconds}|ConvertTo-Json -Compress']);
                $process->setTimeout(10);
                $process->mustRun();
                $values = json_decode($process->getOutput(), true, 512, JSON_THROW_ON_ERROR);
                foreach (['cpu', 'memory', 'uptimeSeconds'] as $key) {
                    $result[$key] = isset($values[$key]) && is_numeric($values[$key]) ? round((float) $values[$key], 2) : null;
                }
            } elseif (is_readable('/proc/stat') && is_readable('/proc/meminfo')) {
                $stat = file('/proc/stat')[0];
                $ticks = array_map('intval', preg_split('/\s+/', trim($stat)));
                array_shift($ticks);
                // guest counters are already included in user/nice; do not count them twice.
                $total = array_sum(array_slice($ticks, 0, 8));
                $idle = $ticks[3] + ($ticks[4] ?? 0);
                $previous = Cache::get('monitoring.cpu.'.gethostname());
                Cache::put('monitoring.cpu.'.gethostname(), [$total, $idle], 900);
                if ($previous && $total > $previous[0] && $idle >= $previous[1]) {
                    $result['cpu'] = round(max(0, min(100, 100 * (1 - ($idle - $previous[1]) / ($total - $previous[0])))), 2);
                }
                preg_match('/MemTotal:\s+(\d+)/', file_get_contents('/proc/meminfo'), $totalMem);
                preg_match('/MemAvailable:\s+(\d+)/', file_get_contents('/proc/meminfo'), $available);
                if (! empty($totalMem[1]) && isset($available[1])) {
                    $result['memory'] = round(100 * (1 - $available[1] / $totalMem[1]), 2);
                }
                if (is_readable('/proc/uptime')) {
                    $result['uptimeSeconds'] = (int) explode(' ', file_get_contents('/proc/uptime'))[0];
                }
            }
        } catch (Throwable) {
            // Unsupported/denied probes stay null, never a fabricated zero.
        }

        return $result;
    }

    public function storage(): array
    {
        $path = config('monitoring.disk_path');
        $total = is_dir($path) ? @disk_total_space($path) : false;
        $free = is_dir($path) ? @disk_free_space($path) : false;
        $valid = $total !== false && $total > 0 && $free !== false;
        $databaseBytes = null;
        try {
            if (DB::getDriverName() === 'pgsql') {
                $databaseBytes = (int) DB::selectOne('SELECT pg_database_size(current_database()) AS bytes')->bytes;
            } elseif (DB::getDriverName() === 'sqlite') {
                $db = DB::connection()->getDatabaseName();
                $databaseBytes = is_file($db) ? filesize($db) : null;
            }
        } catch (Throwable) {
        }

        return ['status' => $valid ? 'available' : 'unavailable', 'scope' => 'collector_storage_volume',
            'totalGB' => $valid ? round($total / 1073741824, 3) : null,
            'usedGB' => $valid ? round(($total - $free) / 1073741824, 3) : null,
            'freeGB' => $valid ? round($free / 1073741824, 3) : null,
            'usedPercent' => $valid ? round(100 * ($total - $free) / $total, 2) : null,
            'databaseBytes' => $databaseBytes, 'uploadsBytes' => $this->directorySize(config('monitoring.uploads_path'))];
    }

    private function directorySize(string $path): ?int
    {
        try {
            if (! is_dir($path)) {
                return null;
            }
            $start = microtime(true);
            $bytes = 0;
            $files = new \RecursiveIteratorIterator(new \RecursiveDirectoryIterator($path, \FilesystemIterator::SKIP_DOTS));
            foreach ($files as $file) {
                if (microtime(true) - $start > 2) {
                    return null; // Do not present an incomplete scan as total storage usage.
                }
                if ($file->isFile() && ! $file->isLink()) {
                    $bytes += $file->getSize();
                }
            }

            return $bytes;
        } catch (Throwable) {
            return null;
        }
    }

    private function heartbeat(string $key, string $name): array
    {
        try {
            $time = Cache::get('monitoring.'.$key);

            return ['id' => $key, 'name' => $name,
                'status' => $time === null ? 'unknown' : (now()->timestamp - $time <= config('monitoring.heartbeat_stale_seconds') ? 'healthy' : 'stale'),
                'checkedAt' => $time === null ? null : CarbonImmutable::createFromTimestampUTC($time)->toIso8601String()];
        } catch (Throwable) {
            return ['id' => $key, 'name' => $name, 'status' => 'unavailable', 'checkedAt' => null];
        }
    }

    public function dashboard(string $window): array
    {
        $days = match ($window) {
            '7d' => 7, '30d' => 30, default => 1
        };
        $start = now()->utc()->subDays($days);
        $samples = DB::table('monitoring_samples')->where('collected_at', '>=', $start)->orderBy('collected_at')->get();
        $latest = DB::table('monitoring_samples')->orderByDesc('id')->first();
        $snapshot = $latest ? json_decode($latest->payload, true, 512, JSON_THROW_ON_ERROR) : [];
        $collected = $latest ? CarbonImmutable::parse($latest->collected_at, 'UTC') : null;
        $fresh = config('monitoring.enabled') && $collected && $collected->timestamp >= now()->timestamp - config('monitoring.sample_stale_seconds');
        $bucket = fn ($time) => CarbonImmutable::parse($time, 'UTC')->startOfHour()->toIso8601String();
        $performance = $samples->groupBy(fn ($row) => $bucket($row->collected_at))->map(function ($rows, $time) {
            $points = $rows->map(fn ($row) => json_decode($row->payload, true));

            return ['time' => $time, 'cpu' => $points->avg('resources.cpu'), 'memory' => $points->avg('resources.memory'),
                'disk' => $points->avg('storage.usedPercent')];
        })->values()->all();
        $requests = DB::table('monitoring_request_minutes')->where('minute', '>=', $start)->orderBy('minute')->get();
        $total = (int) $requests->sum('requests');
        $activity = $requests->groupBy(fn ($row) => $bucket($row->minute))->map(function ($rows, $time) {
            $n = $rows->sum('requests');

            return ['time' => $time, 'count' => $n, 'averageResponseMs' => $n ? round($rows->sum('duration_ms') / $n, 2) : null,
                'serverErrors' => $rows->sum('server_errors'), 'clientErrors' => $rows->sum('client_errors')];
        })->values()->all();
        $servers = [['id' => 'api', 'name' => 'API', 'status' => 'healthy', 'checkedAt' => now()->toIso8601String()]];
        foreach ($snapshot['checks'] ?? [['id' => 'database', 'name' => 'Database', 'status' => 'unknown'], ['id' => 'cache', 'name' => 'Cache', 'status' => 'unknown']] as $check) {
            $check['checkedAt'] = $collected?->toIso8601String();
            if (! $fresh && $collected) {
                $check['status'] = 'stale';
            }
            $servers[] = $check;
        }
        $servers[] = $this->heartbeat('scheduler', 'Scheduler');
        $driver = config('queue.connections.'.config('queue.default').'.driver');
        $servers[] = in_array($driver, ['database', 'redis', 'sqs', 'beanstalkd'], true)
            ? $this->heartbeat('worker', 'Default queue worker')
            : ['id' => 'worker', 'name' => 'Default queue worker', 'status' => $driver === 'sync' ? 'not_applicable' : 'unsupported', 'checkedAt' => null];
        $uptime = $fresh ? ($snapshot['resources']['uptimeSeconds'] ?? null) : null;

        return ['window' => $window, 'collectedAt' => $collected?->toIso8601String(), 'generatedAt' => now()->toIso8601String(),
            'status' => ! config('monitoring.enabled') ? 'disabled' : ($fresh ? 'available' : ($latest ? 'stale' : 'not_collected')),
            'scope' => 'single_collector_host', 'performance' => $performance, 'activity' => $activity,
            'logs' => app(RecentSystemLogs::class)->read($start),
            'storage' => $fresh ? ($snapshot['storage'] ?? []) : ['status' => 'unavailable', 'totalGB' => null, 'usedGB' => null],
            'servers' => $servers, 'summary' => ['uptime' => $uptime === null ? null : round($uptime / 3600, 1).' hours',
                'uptimeBasis' => 'collector_host_since_boot', 'requestCount' => $total,
                'averageResponseMs' => $total ? round($requests->sum('duration_ms') / $total, 2) : null,
                'serverErrorPercent' => $total ? round(100 * $requests->sum('server_errors') / $total, 2) : null,
                'clientErrorCount' => (int) $requests->sum('client_errors'),
                'lastRequestAt' => $requests->last()?->minute,
                'telemetryCoverage' => 'successfully_recorded_API_requests_excluding_health_and_monitoring']];
    }
}
