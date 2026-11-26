<?php

namespace App\Events;

use App\DTOs\AuditEventData;
use Illuminate\Foundation\Events\Dispatchable;

class AuditEventOccurred
{
    use Dispatchable;

    /**
     * Event ya ndani hubeba taarifa za action bila kuzitangaza kwenye browser.
     */
    public function __construct(
        public readonly AuditEventData $auditEventData,
    ) {}

}
