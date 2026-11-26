<?php

return [
    'enabled' => env('MONITORING_ENABLED', true),
    'retention_days' => 31,
    'sample_stale_seconds' => 900,
    'heartbeat_stale_seconds' => 180,
    // Disk usage is the filesystem containing this directory, not just application files.
    'disk_path' => storage_path(),
    'uploads_path' => storage_path('app'),
];
