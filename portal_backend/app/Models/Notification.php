<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Notification extends Model
{
    protected $table = 'notifications';

    protected $fillable = [
        'user_id',
        'audit_event_id',
        'type', 
        'message',
        'is_read',
        'created_at',
        'sent_at',
    ];

    protected $casts = [
        'is_read' => 'boolean',
        'created_at' => 'datetime',
        'sent_at' => 'datetime',
    ];

    public const UPDATED_AT = null;

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function auditEvent()
    {
        return $this->belongsTo(AuditEvent::class);
    }
}
