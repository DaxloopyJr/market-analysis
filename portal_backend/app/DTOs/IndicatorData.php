<?php

namespace App\DTOs;

final readonly class IndicatorData
{
    public function __construct(
        public string $nameEn,
        public string $dataType,
        public ?string $nameSw = null,
        public ?string $descriptionEn = null,
        public ?string $descriptionSw = null,
        public ?int $unitId = null,
        public string $aggregationRule = 'none',
        public string $status = 'active',
        public string $performanceDirection = 'higher_is_better',
    ) {}

    public function attributes(): array
    {
        return [
            'name_en' => $this->nameEn,
            'name_sw' => $this->nameSw,
            'description_en' => $this->descriptionEn,
            'description_sw' => $this->descriptionSw,
            'data_type' => $this->dataType,
            'unit_id' => $this->unitId,
            'aggregation_rule' => $this->aggregationRule,
            'status' => $this->status,
            'performance_direction' => $this->performanceDirection,
        ];
    }
}
