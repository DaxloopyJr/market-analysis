<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

class Indicator extends Model
{
    public const PERFORMANCE_DIRECTIONS = ['higher_is_better', 'lower_is_better', 'neutral'];

    public const DATA_TYPES = ['integer', 'decimal', 'text', 'boolean', 'date'];

    public function datasets(): BelongsToMany
    {
        return $this->belongsToMany(DatasetDefinition::class, 'dataset_indicators')
            ->withPivot(['id', 'is_required', 'display_order'])->withTimestamps();
    }

    public const AGGREGATION_RULES = ['none', 'sum', 'average', 'min', 'max', 'latest'];

    protected $fillable = [
        'indicator_code', 'name_en', 'name_sw', 'description_en', 'description_sw',
        'data_type', 'unit_id', 'aggregation_rule', 'status', 'strategic_objective',
        'result_level', 'baseline_value', 'performance_direction', 'performance_weight',
    ];

    protected $attributes = ['aggregation_rule' => 'none', 'status' => 'active', 'performance_direction' => 'higher_is_better'];

    protected function casts(): array
    {
        return ['unit_id' => 'integer'];
    }

    public function unit(): BelongsTo
    {
        return $this->belongsTo(ReferenceDataValue::class, 'unit_id');
    }
}
