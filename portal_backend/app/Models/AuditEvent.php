<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AuditEvent extends Model
{
    public const UPDATED_AT = null;

    protected $table = 'audit_events';

    protected $fillable = [
        'user_id',
        'actor_snapshot',
        'institution_id',
        'actor_type',
        'event_type',
        'entity_id',
        'ip_address',
        'request_id',
        'old_values',
        'new_values',
        'reason',
        'entity_type',
    ];

    protected $casts = [
        'old_values' => 'array',
        'actor_snapshot' => 'array',
        'new_values' => 'array',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    protected static function booted(): void
    {
        // Huzuia mabadiliko kupitia model; bulk SQL hulindwa na database trigger.
        static::updating(function (AuditEvent $auditEvent): void {
            throw new \LogicException('Audit events cannot be updated.');
        });

        static::deleting(function (AuditEvent $auditEvent): void {
            throw new \LogicException('Audit events cannot be deleted.');
        });
    }
}
