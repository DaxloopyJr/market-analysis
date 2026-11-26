<?php

namespace App\DTOs;

final readonly class ReferenceDataTypeData
{
    public function __construct(
        public string $dataTypeCode,
        public ?string $dataTypeNameSw = null,
        public ?string $dataTypeNameEn ,
        public ?string $descriptionSw = null,
        public ?string $descriptionEn ,
        public string $status = 'active',
    ) {}
}