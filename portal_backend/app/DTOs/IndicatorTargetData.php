<?php

namespace App\DTOs;

final readonly class IndicatorTargetData
{
    public function __construct(public int $indicatorId, public int $reportingPeriodId, public ?int $templateVersionId,
        public string $targetValue,
        public string $targetScope = 'total',
        public array $dimensionValues = [],
        public ?string $notes = null) {}
}
