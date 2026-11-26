<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ReferenceDataValue extends Model
{
    protected $fillable = [
        'data_type_id', 
        'data_value_code', 
        'data_value_name_sw', 
        'data_value_name_en',
        'parent_id', 
        'value', 
        'effective_from', 
        'effective_to', 
        'status',
    ];

    protected $attributes = ['status' => 'active'];

    protected function casts(): array
    {
        return [
            'effective_from' => 'date:Y-m-d',
            'effective_to' => 'date:Y-m-d',
        ];
    }

    public function dataType(): BelongsTo
    {
        return $this->belongsTo(ReferenceDataType::class, 'data_type_id');
    }

    // Parent inaweza kuwa value ya type tofauti, mfano wilaya chini ya mkoa.
    public function parent(): BelongsTo
    {
        return $this->belongsTo(self::class, 'parent_id');
    }

    public function children(): HasMany
    {
        return $this->hasMany(self::class, 'parent_id');
    }
}
