<?php


namespace App\DTOs;

final readonly class ReferenceDataValueData
{
    public function __construct(
        public int $dataTypeId,
        public string $dataValueCode,
        public string $dataValueNameEn,
        public ?string $dataValueNameSw = null,
        public ?int $parentId = null,
        public ?string $value = null,
        public ?string $effectiveFrom = null,
        public ?string $effectiveTo = null,
        public string $status = 'active',
    ) {}
}