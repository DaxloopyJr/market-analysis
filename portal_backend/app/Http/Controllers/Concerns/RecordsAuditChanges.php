<?php

namespace App\Http\Controllers\Concerns;

use App\DTOs\AuditEventData;
use App\Events\AuditEventOccurred;
use Illuminate\Database\Eloquent\Model;

trait RecordsAuditChanges
{
    private function auditChange(string $eventType, string $reason, ?Model $entity = null, string $entityType = '', ?array $oldValues = null, ?array $newValues = null): void
    {
        // Event hutumia record(); actor ni mtendaji, si user anayehaririwa.
        $actor = request()->user();
        AuditEventOccurred::dispatch(new AuditEventData(
            eventType: $eventType,
            userId: $actor?->id,
            actorType: $actor ? 'user' : 'system',
            entityType: $entityType,
            entityId: $entity ? (string) $entity->getKey() : null,
            ipAddress: request()->ip(),
            requestId: request()->attributes->get('auditRequestId'),
            oldValues: $oldValues,
            newValues: $newValues,
            reason: $reason,
        ));
    }
}
