<?php

namespace App\Services;

use App\DTOs\DatasetPlanningData;
use App\Models\DataConsumer;
use App\Models\DatasetDefinition;
use Illuminate\Validation\ValidationException;

class DatasetPlanningService
{
    // Caller hushikilia lock ya dataset na transaction pamoja na audit.
    public function apply(DatasetDefinition $dataset, DatasetPlanningData $data, int $actorId): void
    {
        $dataset->fill($data->attributes());
        if (in_array($dataset->collection_method, ['system', 'hybrid'], true) && ! filled($dataset->source_system_name)) {
            throw ValidationException::withMessages(['sourceSystemName' => 'Jina la mfumo linahitajika kwa system au hybrid.']);
        }
        if (filled($dataset->source_system_name) && ! in_array($dataset->collection_method, ['system', 'hybrid'], true)) {
            throw ValidationException::withMessages(['sourceSystemName' => 'Chagua system au hybrid kwa data zinazotoka kwenye mfumo.']);
        }
        $dataset->save();
        if (! array_key_exists('consumers', $data->data)) {
            return;
        }
        $ids = [];
        foreach ($data->data['consumers'] as $entry) {
            if (isset($entry['consumerId'])) {
                if (count($entry) !== 1) {
                    throw ValidationException::withMessages(['consumers' => 'Consumer aliyepo huchaguliwa kwa consumerId pekee.']);
                }
                $consumer = DataConsumer::findOrFail($entry['consumerId']);
            } else {
                $name = preg_replace('/\s+/u', ' ', trim($entry['name']));
                if ($name === '') {
                    throw ValidationException::withMessages(['consumers' => 'Jina la consumer linahitajika.']);
                }
                // Unique key na createOrFirst huzuia duplicates hata requests zikifika pamoja.
                $consumer = DataConsumer::query()->createOrFirst(['normalized_name' => mb_strtolower($name)], [
                    'name' => $name, 'short_name' => $entry['shortName'] ?? null,
                    'description' => $entry['description'] ?? null, 'created_by' => $actorId,
                ]);
            }
            $ids[] = $consumer->id;
        }
        $dataset->consumers()->sync(array_unique($ids));
        $dataset->unsetRelation('consumers');
    }
}
