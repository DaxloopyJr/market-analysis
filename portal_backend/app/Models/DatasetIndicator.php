<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class DatasetIndicator extends Model
{
    protected $fillable = ['dataset_definition_id', 'indicator_id', 'is_required', 'display_order'];

    protected function casts(): array
    {
        return ['is_required' => 'boolean', 'display_order' => 'integer'];
    }

    public function indicator(): \Illuminate\Database\Eloquent\Relations\BelongsTo
    {
        return $this->belongsTo(Indicator::class);
    }

    public function datasetDefinition(): \Illuminate\Database\Eloquent\Relations\BelongsTo
    {
        return $this->belongsTo(DatasetDefinition::class);
    }
}
