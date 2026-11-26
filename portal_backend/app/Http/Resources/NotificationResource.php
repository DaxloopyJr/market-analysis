<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class NotificationResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        // Audit event haipanuliwi hapa ili kutofichua taarifa zinazohitaji ruhusa tofauti.
        return [
            'id' => $this->id,
            'auditEventId' => $this->audit_event_id,
            'type' => $this->type,
            'message' => $this->message,
            'isRead' => $this->is_read,
            'createdAt' => $this->created_at?->toIso8601String(),
            'sentAt' => $this->sent_at?->toIso8601String(),
        ];
    }
}
