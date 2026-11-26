<?php

return [
    'host' => env('SMPP_HOST'),
    'port' => (int) env('SMPP_PORT', 2775),
    'system_id' => env('SMPP_SYSTEM_ID'),
    'password' => env('SMPP_PASSWORD'),
    'from' => env('SMPP_FROM'),
    'debug' => (bool) env('SMPP_DEBUG', false),
];
