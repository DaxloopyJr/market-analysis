<?php

namespace App\DTOs;

final readonly class DimensionUpdateData
{
    public function __construct(private array $validated) {}

    public function attributes(): array
    {
        $result = [];
        foreach ([
            'nameEn' => 'name_en', 
            'nameSw' => 'name_sw', 
            'dataType' => 'data_type',
            'referenceTypeId' => 'reference_type_id', 
            'status' => 'status'] as $field => $column) {
            if (array_key_exists($field, $this->validated)) {
                $result[$column] = $this->validated[$field];
            }
        }

        return $result;
    }
}
