<?php

namespace App\Services;

use App\DTOs\AuditEventData;
use Illuminate\Support\Facades\DB;

use App\Models\ReferenceDataType;
use App\DTOs\ReferenceDataTypeData; 

class ReferenceDataTypeService
{
    public function __construct(private readonly AuditService $auditService) {}

    public function createReferenceDataType(ReferenceDataTypeData $data, int $userId, ?string $ipAddress = null, ?string $requestId = null): ReferenceDataType
    {
        // Rekodi na audit huhifadhiwa pamoja; hitilafu yoyote hurudisha transaction nyuma.
        return DB::transaction(function () use ($data, $userId, $ipAddress, $requestId) {
            $record = ReferenceDataType::create([
                'data_type_code' => $data->dataTypeCode,
                'data_type_name_sw' => $data->dataTypeNameSw,
                'data_type_name_en' => $data->dataTypeNameEn,
                'description_sw' => $data->descriptionSw,
                'description_en' => $data->descriptionEn,
                'status' => $data->status,
            ]);

            // Actor hutoka backend, si fields zinazotumwa na client.
            $this->auditService->record(new AuditEventData(
                eventType: 'reference_data_created',
                userId: $userId,
                entityType: 'reference_data_type',
                entityId: (string) $record->id,
                ipAddress: $ipAddress,
                requestId: $requestId,
                newValues: $record->getAttributes(),
            ));

            return $record;
        });
    }
}
