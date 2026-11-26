<?php

namespace App\Listeners;

use App\DTOs\AuditEventData;
use App\Services\AuditService;
use Illuminate\Auth\Events\Failed;
use Illuminate\Auth\Events\Login;
use Illuminate\Auth\Events\Logout;
use Illuminate\Http\Request;

class RecordAuthenticationAudit
{
    public function __construct(private readonly AuditService $auditService, private readonly Request $request) {}

    public function handle(Login|Failed|Logout $event): void
    {
        $eventType = match (true) {
            $event instanceof Login => 'loginSucceeded',
            $event instanceof Failed => 'loginFailed',
            default => 'logout',
        };

        // Akaunti inayolengwa na failed login si uthibitisho wa utambulisho wa actor.
        $userId = $event instanceof Failed ? null : $event->user?->getAuthIdentifier();
        $targetId = $event->user?->getAuthIdentifier();

        // Credentials, email na password za login hazinakiliwi kwenye audit.
        $this->auditService->record(new AuditEventData(
            eventType: $eventType,
            userId: $userId,
            actorType: $userId === null ? 'anonymous' : 'user',
            entityType: $targetId === null ? null : 'user',
            entityId: $targetId === null ? null : (string) $targetId,
            ipAddress: $this->request->attributes->get('auditIpAddress'),
            requestId: $this->request->attributes->get('auditRequestId'),
        ));
    }
}
