<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class DimensionDefinition extends Model
{
    public const DATA_TYPES = ['reference', 'text', 'integer', 'decimal', 'boolean', 'date'];

    protected $fillable = ['dimension_code', 'name_en', 'name_sw', 'data_type', 'reference_type_id', 'status'];
    protected $attributes = ['status' => 'active'];

    public function options(): \Illuminate\Database\Eloquent\Relations\HasMany
    {
        return $this->hasMany(DimensionOption::class, 'dimension_id');
    }

    public function referenceType(): \Illuminate\Database\Eloquent\Relations\BelongsTo
    {
        return $this->belongsTo(ReferenceDataType::class, 'reference_type_id');
    }
}
