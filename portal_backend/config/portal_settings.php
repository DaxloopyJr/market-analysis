<?php

return [
    'portal_name' => [
        'type' => 'text',
        'default' => 'Viwanda Portal',
    ],
    'contact_email' => [
        'type' => 'text',
        'default' => null,
    ],
    'contact_phone' => [
        'type' => 'text',
        'default' => null,
    ],
    'contact_address' => [
        'type' => 'text',
        'default' => null,
    ],
    'logo' => [
        'type' => 'image',
        'default' => null,
    ],
    'announcements_enabled' => [
        'type' => 'boolean',
        'default' => false,
    ],
    'announcements_limit' => [
        'type' => 'integer',
        'default' => 5,
    ],
    'announcements' => [
        'type' => 'json',
        'default' => [],
    ],
];
