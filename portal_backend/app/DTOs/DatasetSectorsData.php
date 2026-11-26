<?php

namespace App\DTOs;

final readonly class DatasetSectorsData
{
    // Kila entry hubeba sectorId na subsectorIds zake; service huhakiki hierarchy.
    public function __construct(public array $sectors) {}
}
