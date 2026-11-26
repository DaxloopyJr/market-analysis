<?php

namespace App\DTOs;

final readonly class DatasetDefinitionUpdateData
{
    // Fields zilizokosekana hazipewi defaults ili partial update isifute taarifa.
    public function __construct(private array $validated) {}

    public function attributes(): array
    {
        $columns = [
            'datasetName' => 'dataset_name',
            'responsibleUserId' => 'responsible_user_id',
            'description' => 'description', 'status' => 'status',
        ];
        $attributes = [];
        foreach ($columns as $field => $column) {
            if (array_key_exists($field, $this->validated)) {
                $attributes[$column] = $this->validated[$field];
            }
        }

        return $attributes;
    }

    public function frequencies(): ?array
    {
        return $this->validated['frequencies'] ?? null;
    }
}
