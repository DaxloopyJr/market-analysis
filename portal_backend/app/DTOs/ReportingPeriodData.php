<?php

namespace App\DTOs;

final readonly class ReportingPeriodData
{
    public function __construct(public ?int $institutionId, public string $periodType, public ?string $deadline,
        public ?string $yearType = null,
        public ?string $startDate = null,
        public ?string $endDate = null,
        public ?int $parentId = null,
        public ?int $quarter = null,
        public ?int $periodNumber = null,
        public ?int $deadlineDays = null) {}
}
