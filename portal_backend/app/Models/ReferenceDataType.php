<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ReferenceDataType extends Model
{
    protected $fillable = [
        'data_type_code',
        'data_type_name_sw', 
        'data_type_name_en',
        'description_sw', 
        'description_en', 
        'status',
    ];

    protected $attributes = ['status' => 'active'];

    public function values(): HasMany
    {
        return $this->hasMany(ReferenceDataValue::class, 'data_type_id');
    }
}
