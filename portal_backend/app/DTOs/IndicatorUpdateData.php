<?php

namespace App\DTOs;

final readonly class IndicatorUpdateData
{
    // Field iliyokosekana kwenye PATCH huhifadhi thamani yake; null huondoa field inayoruhusu null.
    public function __construct(private array $validated) {}

    public function attributes(): array
    {
        $columns = [
            'nameEn' => 'name_en',
            'nameSw' => 'name_sw',
            'descriptionEn' => 'description_en',
            'descriptionSw' => 'description_sw',
            'dataType' => 'data_type',
            'unitId' => 'unit_id',
            'aggregationRule' => 'aggregation_rule',
            'performanceDirection' => 'performance_direction',
            'status' => 'status',
        ];
        $attributes = [];
        foreach ($columns as $field => $column) {
            if (array_key_exists($field, $this->validated)) {
                $attributes[$column] = $this->validated[$field];
            }
        }

        return $attributes;
    }
}
