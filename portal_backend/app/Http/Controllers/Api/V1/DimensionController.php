<?php

namespace App\Http\Controllers\Api\V1;

use App\DTOs\DimensionUpdateData;
use App\Http\Controllers\Controller;
use App\Models\DimensionDefinition;
use App\Services\DatasetConfigurationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class DimensionController extends Controller
{
    private function authorizeAccess(Request $request): void
    {
        $user = $request->user();
        abort_unless($user && $user->is_active && $user->status === 'active' && $user->hasRole('MOA', 'IA', 'IDO', 'DDO'), 403);
    }

    public function index(Request $request): JsonResponse
    {
        $this->authorizeAccess($request);
        $data = $request->validate(['status' => ['sometimes', Rule::in(['active', 'inactive'])],
            'perPage' => ['sometimes', 'integer', 'between:1,100'], 'page' => ['sometimes', 'integer', 'min:1']]);
        $query = DimensionDefinition::query();
        if (isset($data['status'])) {
            $query->where('status', $data['status']);
        }
        $page = $query->orderBy('id')->paginate($data['perPage'] ?? 20)->appends($data);
        $page->through(fn ($dimension) => $this->snapshot($dimension));

        return response()->json($page);
    }

    public function show(Request $request, int $id): JsonResponse
    {
        $this->authorizeAccess($request);

        return response()->json(['data' => $this->snapshot(DimensionDefinition::findOrFail($id))]);
    }

    public function update(Request $request, int $id, DatasetConfigurationService $service): JsonResponse
    {
        $this->authorizeAccess($request);
        $data = $request->validate([
            'dimensionCode' => ['prohibited'], 'createdBy' => ['prohibited'],
            'options' => ['missing'],
            'nameEn' => ['sometimes', 'required', 'string', 'max:255'],
            'nameSw' => ['sometimes', 'nullable', 'string', 'max:255'],
            'dataType' => ['sometimes', 'required', Rule::in(DimensionDefinition::DATA_TYPES)],
            'referenceTypeId' => ['sometimes', 'nullable', 'integer', Rule::exists('reference_data_types', 'id')],
            'status' => ['sometimes', 'required', Rule::in(['active', 'inactive'])],
        ]);

        return response()->json(['data' => $this->snapshot($service->updateDefinition($request, $id, new DimensionUpdateData($data)))]);
    }

    public function destroy(Request $request, int $id, DatasetConfigurationService $service): JsonResponse
    {
        $this->authorizeAccess($request);

        return response()->json(['data' => $this->snapshot($service->updateDefinition($request, $id, new DimensionUpdateData(['status' => 'inactive'])))]);
    }

    private function snapshot(DimensionDefinition $dimension): array
    {
        return ['id' => $dimension->id, 'dimensionCode' => $dimension->dimension_code,
            'nameEn' => $dimension->name_en, 'nameSw' => $dimension->name_sw, 'dataType' => $dimension->data_type,
            'referenceTypeId' => $dimension->reference_type_id, 'status' => $dimension->status,
            'options' => $dimension->options()->orderBy('id')->get(['id', 'code', 'name_en', 'name_sw'])->toArray(),
            'createdBy' => (int) $dimension->created_by];
    }
}
