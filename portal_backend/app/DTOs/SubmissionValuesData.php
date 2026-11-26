<?php

namespace App\DTOs;

final readonly class SubmissionValuesData
{
    public function __construct(public array $values, public int $expectedRevision, public array $annualTargets = [], public ?int $objectiveVersionId = null, public ?int $expectedObjectiveVersionId = null, public array $performance = []) {}
}
