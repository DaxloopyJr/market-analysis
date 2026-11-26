<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class AuditEventResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        // Taarifa za akaunti nzima haziongezwi kwenye matokeo ya audit.
        return [
            'id' => $this->id,
            'userId' => $this->user_id,
            'actor' => $this->actor_snapshot,
            'actorType' => $this->actor_type,
            'eventType' => $this->event_type,
            'entityType' => $this->entity_type,
            'entityId' => $this->entity_id,
            'ipAddress' => $this->ip_address,
            'requestId' => $this->request_id,
            'oldValues' => $this->old_values,
            'newValues' => $this->new_values,
            'reason' => $this->reason,
            'createdAt' => $this->created_at?->toIso8601String(),
        ];
    }
}
