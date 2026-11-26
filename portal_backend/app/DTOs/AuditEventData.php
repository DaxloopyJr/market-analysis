<?php

namespace App\DTOs;

final readonly class AuditEventData
{
    // Actor na context hutoka backend; DTO haipokelewi moja kwa moja kutoka request body.
    public function __construct(
        public string $eventType,
        public ?int $userId = null,
        public string $actorType = 'user',
        public ?string $entityType = null,
        public ?string $entityId = null,
        public ?string $ipAddress = null,
        public ?string $requestId = null,
        public ?array $oldValues = null,
        public ?array $newValues = null,
        public ?string $reason = null,
        public ?string $actingRole = null,
    ) {}
}
