<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class DatasetDimension extends Model
{
    protected $fillable = ['dataset_definition_id', 'dimension_id', 'is_required', 'display_order'];

    public function indicatorLinks(): \Illuminate\Database\Eloquent\Relations\BelongsToMany
    {
        return $this->belongsToMany(DatasetIndicator::class, 'dataset_dimension_indicators', 'dataset_dimension_id', 'dataset_indicator_id');
    }
    protected function casts(): array
    {
        return ['is_required' => 'boolean', 'display_order' => 'integer'];
    }
    public function dimension(): \Illuminate\Database\Eloquent\Relations\BelongsTo
    {
        return $this->belongsTo(DimensionDefinition::class, 'dimension_id');
    }
}
