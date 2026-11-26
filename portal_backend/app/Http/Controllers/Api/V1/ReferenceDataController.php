<?php

namespace App\Http\Controllers\Api\V1;

use App\DTOs\ReferenceDataTypeData;
use App\DTOs\ReferenceDataValueData;
use App\Http\Controllers\Controller;
use App\Models\ReferenceDataType;
use App\Services\ReferenceDataTypeService;
use App\Services\ReferenceDataValueService;
use App\Services\ReferenceDataUpdateService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class ReferenceDataController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $this->authorizeAccess($request);
        $filters = $this->filters($request);
        $query = ReferenceDataType::query();
        if (isset($filters['status'])) {
            $query->where('status', $filters['status']);
        }

        return response()->json($query->orderBy('data_type_code')->orderBy('id')
            ->paginate($filters['perPage'] ?? 20)->appends($filters));
    }

    public function show(Request $request, string $id): JsonResponse
    {
        $this->authorizeAccess($request);

        return response()->json(['data' => ReferenceDataType::findOrFail($id)]);
    }

    public function store(Request $request, ReferenceDataTypeService $service): JsonResponse
    {
        $this->authorizeAccess($request, true);
        $data = $request->validate([
            'dataTypeCode' => ['required', 'string', 'max:255', Rule::unique('reference_data_types', 'data_type_code')],
            'dataTypeNameEn' => ['required', 'string', 'max:255'],
            'dataTypeNameSw' => ['nullable', 'string', 'max:255'],
            'descriptionEn' => ['nullable', 'string', 'max:255'],
            'descriptionSw' => ['nullable', 'string', 'max:255'],
            'status' => ['sometimes', Rule::in(['active', 'inactive'])],
        ]);

        $dataType = $service->createReferenceDataType(new ReferenceDataTypeData(
            dataTypeCode: $data['dataTypeCode'],
            dataTypeNameEn: $data['dataTypeNameEn'],
            dataTypeNameSw: $data['dataTypeNameSw'] ?? null,
            descriptionEn: $data['descriptionEn'] ?? null,
            descriptionSw: $data['descriptionSw'] ?? null,
            status: $data['status'] ?? 'active',
        ), $request->user()->id, $request->ip(), $request->attributes->get('auditRequestId'));

        return response()->json(['data' => $dataType], 201);
    }

    public function values(Request $request, string $id): JsonResponse
    {
        $this->authorizeAccess($request);
        $filters = $this->filters($request);
        $query = ReferenceDataType::findOrFail($id)->values();
        if (isset($filters['status'])) {
            $query->where('status', $filters['status']);
        }

        return response()->json($query->orderBy('data_value_code')->orderBy('id')
            ->paginate($filters['perPage'] ?? 20)->appends($filters));
    }

    public function showValue(Request $request, string $id, string $valueId): JsonResponse
    {
        $this->authorizeAccess($request);
        // Value lazima iwe ndani ya type iliyotajwa kwenye URL.
        $value = ReferenceDataType::findOrFail($id)->values()->findOrFail($valueId);

        return response()->json(['data' => $value]);
    }

    public function storeValue(Request $request, string $id, ReferenceDataValueService $service): JsonResponse
    {
        $this->authorizeAccess($request, true);
        $dataType = ReferenceDataType::findOrFail($id);
        $data = $request->validate([
            'dataValueCode' => ['required', 'string', 'max:255',
                Rule::unique('reference_data_values', 'data_value_code')->where('data_type_id', $dataType->id)],
            'dataValueNameEn' => ['required', 'string', 'max:255'],
            'dataValueNameSw' => ['nullable', 'string', 'max:255'],
            'parentId' => ['nullable', 'integer', Rule::exists('reference_data_values', 'id')],
            'value' => ['nullable', 'string', 'max:255'],
            'effectiveFrom' => ['nullable', 'date_format:Y-m-d'],
            'effectiveTo' => ['nullable', 'date_format:Y-m-d',
                ...($request->filled('effectiveFrom') ? ['after_or_equal:effectiveFrom'] : [])],
            'status' => ['sometimes', Rule::in(['active', 'inactive'])],
        ]);

        // Type hutokana na URL iliyohakikiwa; parent inaweza kuwa ya type nyingine.
        $value = $service->createReferenceDataValue(new ReferenceDataValueData(
            dataTypeId: $dataType->id,
            dataValueCode: $data['dataValueCode'],
            dataValueNameEn: $data['dataValueNameEn'],
            dataValueNameSw: $data['dataValueNameSw'] ?? null,
            parentId: isset($data['parentId']) ? (int) $data['parentId'] : null,
            value: $data['value'] ?? null,
            effectiveFrom: $data['effectiveFrom'] ?? null,
            effectiveTo: $data['effectiveTo'] ?? null,
            status: $data['status'] ?? 'active',
        ), $request->user()->id, $request->ip(), $request->attributes->get('auditRequestId'));

        return response()->json(['data' => $value], 201);
    }

    public function update(Request $request, string $id, ReferenceDataUpdateService $service): JsonResponse
    {
        $this->authorizeAccess($request, true);
        $record = ReferenceDataType::findOrFail($id);
        $data = $request->validate([
            'dataTypeCode' => ['sometimes', 'required', 'string', 'max:255', Rule::unique('reference_data_types', 'data_type_code')->ignore($record->id)],
            'dataTypeNameEn' => ['sometimes', 'required', 'string', 'max:255'],
            'dataTypeNameSw' => ['sometimes', 'nullable', 'string', 'max:255'],
            'descriptionEn' => ['sometimes', 'nullable', 'string', 'max:255'],
            'descriptionSw' => ['sometimes', 'nullable', 'string', 'max:255'],
            'status' => ['sometimes', 'required', Rule::in(['active', 'inactive'])],
        ]);

        return $this->saveChanges($request, $service, (int) $id, null, $data);
    }

    public function updateValue(Request $request, string $id, string $valueId, ReferenceDataUpdateService $service): JsonResponse
    {
        $this->authorizeAccess($request, true);
        $record = ReferenceDataType::findOrFail($id)->values()->findOrFail($valueId);
        $data = $request->validate([
            'dataValueCode' => ['sometimes', 'required', 'string', 'max:255', Rule::unique('reference_data_values', 'data_value_code')->where('data_type_id', $record->data_type_id)->ignore($record->id)],
            'dataValueNameEn' => ['sometimes', 'required', 'string', 'max:255'],
            'dataValueNameSw' => ['sometimes', 'nullable', 'string', 'max:255'],
            'parentId' => ['sometimes', 'nullable', 'integer', Rule::exists('reference_data_values', 'id')],
            'value' => ['sometimes', 'nullable', 'string', 'max:255'],
            'effectiveFrom' => ['sometimes', 'nullable', 'date_format:Y-m-d'],
            'effectiveTo' => ['sometimes', 'nullable', 'date_format:Y-m-d'],
            'status' => ['sometimes', 'required', Rule::in(['active', 'inactive'])],
        ]);

        return $this->saveChanges($request, $service, (int) $id, (int) $valueId, $data);
    }

    public function destroy(Request $request, string $id, ReferenceDataUpdateService $service): JsonResponse
    {
        $this->authorizeAccess($request, true);
        // DELETE husitisha matumizi bila kufuta record au kubadilisha status za values zake.
        return $this->saveChanges($request, $service, (int) $id, null, ['status' => 'inactive']);
    }

    public function destroyValue(Request $request, string $id, string $valueId, ReferenceDataUpdateService $service): JsonResponse
    {
        $this->authorizeAccess($request, true);
        return $this->saveChanges($request, $service, (int) $id, (int) $valueId, ['status' => 'inactive']);
    }

    private function saveChanges(Request $request, ReferenceDataUpdateService $service, int $typeId, ?int $valueId, array $data): JsonResponse
    {
        $columns = [
            'dataTypeCode' => 'data_type_code', 'dataTypeNameEn' => 'data_type_name_en',
            'dataTypeNameSw' => 'data_type_name_sw', 'descriptionEn' => 'description_en',
            'descriptionSw' => 'description_sw', 'dataValueCode' => 'data_value_code',
            'dataValueNameEn' => 'data_value_name_en', 'dataValueNameSw' => 'data_value_name_sw',
            'parentId' => 'parent_id', 'value' => 'value', 'effectiveFrom' => 'effective_from',
            'effectiveTo' => 'effective_to', 'status' => 'status',
        ];
        $changes = [];
        // Field isiyotumwa huhifadhi thamani yake; null iliyotumwa hufuta thamani nullable.
        foreach ($data as $key => $value) {
            $changes[$columns[$key]] = $value;
        }
        $record = $service->update($valueId !== null, $typeId, $valueId, $changes,
            $request->user()->id, $request->ip(), $request->attributes->get('auditRequestId'));

        return response()->json(['data' => $record]);
    }

    private function filters(Request $request): array
    {
        return $request->validate([
            'status' => ['sometimes', Rule::in(['active', 'inactive'])],
            'perPage' => ['sometimes', 'integer', 'between:1,100'],
            'page' => ['sometimes', 'integer', 'min:1'],
        ]);
    }

    private function authorizeAccess(Request $request, bool $write = false): void
    {
        $user = $request->user();
        abort_unless($user, 401);
        abort_unless($user->is_active && $user->status === 'active', 403);
        // Walio ruhusiwa hapa ni MOA na IA ruhusa maalumu ya kusimamia reference data za pamoja.
        if ($write) {
            abort_unless($user->canDo('reference_data.manage'), 403);
        }
    }
}
