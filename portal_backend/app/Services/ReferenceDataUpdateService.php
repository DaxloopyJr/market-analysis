<?php

namespace App\Services;

use App\DTOs\AuditEventData;
use App\Models\ReferenceDataType;
use App\Models\ReferenceDataValue;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class ReferenceDataUpdateService
{
    public function __construct(private readonly AuditService $auditService) {}

    public function update(bool $isValue, int $typeId, ?int $valueId, array $changes, int $userId, ?string $ipAddress, ?string $requestId): Model
    {
        return DB::transaction(function () use ($isValue, $typeId, $valueId, $changes, $userId, $ipAddress, $requestId) {
            // Kufunga hierarchy kwa mpangilio mmoja huzuia updates sambamba kutengeneza mzunguko.
            if ($isValue && array_key_exists('parent_id', $changes)) {
                ReferenceDataValue::orderBy('id')->lockForUpdate()->get(['id']);
            }
            $record = $isValue
                ? ReferenceDataValue::where('data_type_id', $typeId)->lockForUpdate()->findOrFail($valueId)
                : ReferenceDataType::lockForUpdate()->findOrFail($typeId);
            $oldValues = $record->getAttributes();
            $record->fill($changes);

            if ($isValue) {
                if ($record->effective_from && $record->effective_to && $record->effective_to->lt($record->effective_from)) {
                    throw ValidationException::withMessages(['effectiveTo' => 'Tarehe ya mwisho haiwezi kutangulia tarehe ya mwanzo.']);
                }
                if (array_key_exists('parent_id', $changes)) {
                    $seen = [$record->id => true];
                    $parentId = $record->parent_id;
                    while ($parentId !== null) {
                        if (isset($seen[$parentId])) {
                            throw ValidationException::withMessages(['parentId' => 'Parent hawezi kutengeneza mzunguko wa hierarchy.']);
                        }
                        $seen[$parentId] = true;
                        $parent = ReferenceDataValue::find($parentId);
                        if (!$parent) {
                            throw ValidationException::withMessages(['parentId' => 'Parent haipo.']);
                        }
                        $parentId = $parent->parent_id;
                    }
                }
            }

            // Request inayorudiwa bila mabadiliko haitengenezi audit ya ziada.
            if ($record->isDirty()) {
                $record->save();
                $this->auditService->record(new AuditEventData(
                    eventType: ($changes['status'] ?? null) === 'inactive' ? 'reference_data_deactivated' : 'reference_data_updated',
                    userId: $userId,
                    entityType: $isValue ? 'reference_data_value' : 'reference_data_type',
                    entityId: (string) $record->id,
                    ipAddress: $ipAddress,
                    requestId: $requestId,
                    oldValues: $oldValues,
                    newValues: $record->getAttributes(),
                ));
            }

            return $record;
        });
    }
}
