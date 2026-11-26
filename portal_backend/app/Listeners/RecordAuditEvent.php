<?php

namespace App\Listeners;

use App\Events\AuditEventOccurred;
use App\Services\AuditService;

class RecordAuditEvent
{
    /**
     * Service hutolewa na container bila kutegemea HTTP request.
     */
    public function __construct(
        private readonly AuditService $auditService,

    ) {}

    /**
     * Listener haina queue ili audit ishiriki transaction ya business action.
     */
    public function handle(AuditEventOccurred $event): void
    {
        $this->auditService->record($event->auditEventData);

    }
}
