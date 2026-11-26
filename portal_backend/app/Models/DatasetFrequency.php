<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class DatasetFrequency extends Model
{
    public const ALLOWED = ['daily', 'weekly', 'monthly', 'quarterly', 'semiannual', 'annual'];

    protected $fillable = ['frequency'];

    public function datasetDefinition(): BelongsTo
    {
        return $this->belongsTo(DatasetDefinition::class);
    }
}
