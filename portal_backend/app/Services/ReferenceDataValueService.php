<?php

namespace App\Services;

use App\DTOs\AuditEventData;
use Illuminate\Support\Facades\DB;

use App\Models\ReferenceDataValue;
use App\DTOs\ReferenceDataValueData;

class ReferenceDataValueService
{
    public function __construct(private readonly AuditService $auditService) {}

    // Fields za DTO huunganishwa na columns za database kwa majina yaliyoainishwa.
    public function createReferenceDataValue(ReferenceDataValueData $data, int $userId, ?string $ipAddress = null, ?string $requestId = null): ReferenceDataValue
    {
        // Rekodi na audit huhifadhiwa pamoja; hitilafu yoyote hurudisha transaction nyuma.
        return DB::transaction(function () use ($data, $userId, $ipAddress, $requestId) {
            $record = ReferenceDataValue::create([
                'data_type_id' => $data->dataTypeId,
                'data_value_code' => $data->dataValueCode,
                'data_value_name_sw' => $data->dataValueNameSw,
                'data_value_name_en' => $data->dataValueNameEn,
                'parent_id' => $data->parentId,
                'value' => $data->value,
                'effective_from' => $data->effectiveFrom,
                'effective_to' => $data->effectiveTo,
                'status' => $data->status,
            ]);

            // Actor hutoka backend, si fields zinazotumwa na client.
            $this->auditService->record(new AuditEventData(
                eventType: 'reference_data_created',
                userId: $userId,
                entityType: 'reference_data_value',
                entityId: (string) $record->id,
                ipAddress: $ipAddress,
                requestId: $requestId,
                newValues: $record->getAttributes(),
            ));

            return $record;
        });
    }
}
