<?php

namespace App\DTOs;

final readonly class DimensionData
{
    public function __construct(public string $dimensionCode, public string $nameEn, public string $dataType,
        public ?string $nameSw = null,
         public ?int $referenceTypeId = null,
          public array $options = []) {}

    public function attributes(): array
    {
        return [
            'dimension_code' => $this->dimensionCode, 
            'name_en' => $this->nameEn,
            'name_sw' => $this->nameSw,
             'data_type' => $this->dataType, 
             'reference_type_id' => $this->referenceTypeId
             ];
    }
}
