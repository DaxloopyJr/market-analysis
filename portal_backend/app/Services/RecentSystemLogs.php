<?php

namespace App\Services;

use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;
use Throwable;

class RecentSystemLogs
{
    /** Read a bounded tail of configured local logs; never expose raw context or traces. */
    public function read(CarbonInterface $since): array
    {
        $files = $this->files((string) config('logging.default'));
        $files = array_values(array_unique($files));
        usort($files, fn ($a, $b) => (@filemtime($b) ?: 0) <=> (@filemtime($a) ?: 0));
        $entries = [];
        foreach (array_slice($files, 0, 31) as $path) {
            $handle = @fopen($path, 'rb');
            if ($handle === false) {
                continue;
            }
            try {
                $size = fstat($handle)['size'] ?? 0;
                if ($size > 65536) {
                    fseek($handle, -65536, SEEK_END);
                    fgets($handle); // Discard a potentially partial first line.
                }
                $tail = stream_get_contents($handle, 65536);
            } finally {
                fclose($handle);
            }
            foreach (explode("\n", $tail ?: '') as $line) {
                if (! preg_match('/^\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\] [\w.-]+\.(DEBUG|INFO|NOTICE|WARNING|ERROR|CRITICAL|ALERT|EMERGENCY): (.*)$/', rtrim($line, "\r"), $match)) {
                    continue;
                }
                try {
                    $time = CarbonImmutable::createFromFormat('!Y-m-d H:i:s', $match[1], config('app.timezone', 'UTC'));
                    if ($time === false || $time->lt($since) || $time->gt(CarbonImmutable::now())) {
                        continue;
                    }
                } catch (Throwable) {
                    continue;
                }
                // Context may contain credentials or personal data. Only a safe category is emitted.
                $message = preg_split('/\s+\{/', $match[3], 2)[0];
                $module = match (true) {
                    preg_match('/\b(smtp|mailer|email|mail)\b/i', $message) === 1 => 'mail',
                    preg_match('/\b(beem|sms|smpp)\b/i', $message) === 1 => 'sms',
                    preg_match('/\b(sqlstate|database|pdoexception)\b/i', $message) === 1 => 'database',
                    preg_match('/\b(queue|job|worker)\b/i', $message) === 1 => 'queue',
                    default => 'application',
                };
                $level = strtolower($match[2]);
                $entries[] = ['time' => $time->toIso8601String(), 'module' => $module,
                    'message' => ucfirst($module).' '.$level.' recorded. Technical details are available in the server log.',
                    'level' => $level];
            }
        }
        usort($entries, fn ($a, $b) => strcmp($b['time'], $a['time']));

        return array_slice($entries, 0, 50);
    }

    /** Resolve only local single/daily channels; remote providers require their own integration. */
    private function files(string $name, array $visited = []): array
    {
        if (in_array($name, $visited, true)) {
            return [];
        }
        $visited[] = $name;
        $channel = config('logging.channels.'.$name, []);
        if (($channel['driver'] ?? null) === 'stack') {
            $files = [];
            foreach ($channel['channels'] ?? [] as $child) {
                $files = array_merge($files, $this->files($child, $visited));
            }

            return $files;
        }
        $path = $channel['path'] ?? null;
        if (! is_string($path)) {
            return [];
        }
        if (($channel['driver'] ?? null) === 'single') {
            return is_file($path) ? [$path] : [];
        }
        if (($channel['driver'] ?? null) === 'daily') {
            $extension = pathinfo($path, PATHINFO_EXTENSION);
            $stem = $extension === '' ? $path : substr($path, 0, -strlen($extension) - 1);

            return glob($stem.'-????-??-??'.($extension === '' ? '' : '.'.$extension)) ?: [];
        }

        return [];
    }
}
