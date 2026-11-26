<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ReportingPeriod extends Model
{
    public const TYPES = ['annual', 'quarterly', 'monthly', 'semiannual', 'weekly', 'daily'];

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return ['start_date' => 'date:Y-m-d', 'end_date' => 'date:Y-m-d', 'deadline' => 'date:Y-m-d', 'quarter' => 'integer', 'period_number' => 'integer', 'automatic_status' => 'boolean'];
    }

    public function parent(): BelongsTo
    {
        return $this->belongsTo(self::class, 'parent_id');
    }

    public function quarters(): HasMany
    {
        return $this->hasMany(self::class, 'parent_id');
    }

    public function institution(): BelongsTo
    {
        return $this->belongsTo(Institution::class);
    }
}
