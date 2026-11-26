<?php

namespace App\DTOs;

use Illuminate\Validation\Rule;

final readonly class DatasetPlanningData
{
    public function __construct(public array $data) {}

    public static function rules(): array
    {
        return [
            'collectionMethod' => ['sometimes', 'required', Rule::in(['manual', 'system', 'hybrid'])],
            'sourceSystemName' => ['sometimes', 'nullable', 'string', 'max:255'],
            'sourceDescription' => ['sometimes', 'nullable', 'string', 'max:10000'],
            'consumers' => ['sometimes', 'array', 'max:100'],
            'consumers.*' => ['array:consumerId,name,shortName,description'],
            'consumers.*.consumerId' => ['sometimes', 'integer', 'distinct', Rule::exists('data_consumers', 'id')],
            'consumers.*.name' => ['required_without:consumers.*.consumerId', 'string', 'max:255'],
            'consumers.*.shortName' => ['sometimes', 'nullable', 'string', 'max:50'],
            'consumers.*.description' => ['sometimes', 'nullable', 'string', 'max:2000'],
            // Priority hubadilishwa na MDO kupitia njia maalumu yenye sababu na audit.
            'priority' => ['missing'], 'priorityUpdatedBy' => ['missing'],
            'priorityUpdatedAt' => ['missing'], 'priorityReason' => ['missing'],
        ];
    }

    public function attributes(): array
    {
        $result = [];
        foreach (['collectionMethod' => 'collection_method', 'sourceSystemName' => 'source_system_name',
            'sourceDescription' => 'source_description'] as $key => $column) {
            if (array_key_exists($key, $this->data)) {
                $result[$column] = $this->data[$key];
            }
        }

        return $result;
    }
}
