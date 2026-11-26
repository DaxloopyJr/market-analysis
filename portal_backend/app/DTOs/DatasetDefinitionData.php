<?php

namespace App\DTOs;

final readonly class DatasetDefinitionData
{
    public function __construct(
        public int $institutionId,
        public ?int $departmentId,
        public string $datasetName,
        public ?string $description,
        public array $frequencies,
        public DatasetSectorsData $sectors,
        public int $responsibleUserId,
    ) {}

    public function attributes(): array
    {
        return [
            'institution_id' => $this->institutionId,
            'department_id' => $this->departmentId,
            'dataset_name' => $this->datasetName,
            'description' => $this->description,
            'responsible_user_id' => $this->responsibleUserId,
        ];
    }
}
