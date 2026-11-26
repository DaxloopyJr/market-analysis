<?php

namespace App\DTOs;

final readonly class DatasetIndicatorData
{
    public function __construct(public bool $isRequired = true, public int $displayOrder = 1) {}

    public function attributes(): array
    {
        return ['is_required' => $this->isRequired, 'display_order' => $this->displayOrder];
    }
}
