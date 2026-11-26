<?php

namespace App\Http\Controllers\Api\V1;

use App\DTOs\IndicatorTargetData;
use App\Http\Controllers\Controller;
use App\Models\IndicatorTarget;
use App\Services\DatasetIndicatorService;
use App\Services\IndicatorTargetService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class IndicatorTargetController extends Controller
{
    private function authorizeDataset(Request $request, int $id): void
    {
        app(DatasetIndicatorService::class)->scopedDatasets($request->user())->findOrFail($id);
    }

    public function index(Request $request, int $datasetId): JsonResponse
    {
        $this->authorizeDataset($request, $datasetId);
        $data = $request->validate([
            'reportingPeriodId' => ['sometimes', 'integer'], 'indicatorId' => ['sometimes', 'integer'],
            'targetScope' => ['sometimes', Rule::in(['total', 'dimensions'])], 'status' => ['sometimes', Rule::in(['active', 'inactive'])],
            'perPage' => ['sometimes', 'integer', 'between:1,100'], 'page' => ['sometimes', 'integer', 'min:1'],
        ]);
        $query = IndicatorTarget::where('dataset_definition_id', $datasetId);
        foreach (['reportingPeriodId' => 'reporting_period_id', 'indicatorId' => 'indicator_id', 'targetScope' => 'target_scope', 'status' => 'status'] as $field => $column) {
            if (isset($data[$field])) {
                $query->where($column, $data[$field]);
            }
        }
        $page = $query->orderByDesc('id')->paginate($data['perPage'] ?? 20)->appends($data);
        $page->through(fn ($target) => $this->snapshot($target));

        return response()->json($page);
    }

    public function show(Request $request, int $datasetId, int $targetId): JsonResponse
    {
        $this->authorizeDataset($request, $datasetId);

        return response()->json(['data' => $this->snapshot(IndicatorTarget::where('dataset_definition_id', $datasetId)->findOrFail($targetId))]);
    }

    public function store(Request $request, int $datasetId, IndicatorTargetService $service): JsonResponse
    {
        $this->authorizeDataset($request, $datasetId);
        $data = $request->validate([
            'indicatorId' => ['required', 'integer'], 'reportingPeriodId' => ['required', 'integer'],
            'templateVersionId' => ['sometimes', 'nullable', 'integer'], 'targetValue' => ['required', 'string', 'max:26'],
            'targetScope' => ['sometimes', 'required', Rule::in(['total', 'dimensions'])],
            'dimensionValues' => ['sometimes', 'array', 'max:100'],
            'dimensionValues.*' => ['required', 'array:dimensionId,value'],
            'dimensionValues.*.dimensionId' => ['required', 'integer', 'distinct'],
            'dimensionValues.*.value' => ['present'],
            'notes' => ['sometimes', 'nullable', 'string', 'max:10000'], 'createdBy' => ['prohibited'],
        ]);
        $target = $service->create($request, $datasetId, new IndicatorTargetData(
            $data['indicatorId'], $data['reportingPeriodId'], $data['templateVersionId'] ?? null, $data['targetValue'],
            $data['targetScope'] ?? 'total', $data['dimensionValues'] ?? [], $data['notes'] ?? null,
        ));

        return response()->json(['data' => $this->snapshot($target)], 201);
    }

    public function update(Request $request, int $datasetId, int $targetId, IndicatorTargetService $service): JsonResponse
    {
        $this->authorizeDataset($request, $datasetId);
        $data = $request->validate([
            'targetValue' => ['sometimes', 'required', 'string', 'max:26'],
            'notes' => ['sometimes', 'nullable', 'string', 'max:10000'],
            'status' => ['sometimes', 'required', Rule::in(['active', 'inactive'])],
            'indicatorId' => ['prohibited'], 'reportingPeriodId' => ['prohibited'], 'templateVersionId' => ['prohibited'],
            'targetScope' => ['prohibited'], 'dimensionValues' => ['prohibited'], 'createdBy' => ['prohibited'],
        ]);

        return response()->json(['data' => $this->snapshot($service->update($request, $datasetId, $targetId, $data))]);
    }

    public function destroy(Request $request, int $datasetId, int $targetId, IndicatorTargetService $service): JsonResponse
    {
        $this->authorizeDataset($request, $datasetId);

        return response()->json(['data' => $this->snapshot($service->update($request, $datasetId, $targetId, ['status' => 'inactive']))]);
    }

    private function snapshot(IndicatorTarget $target): array
    {
        return ['id' => $target->id, 'datasetId' => (int) $target->dataset_definition_id,
            'indicatorId' => (int) $target->indicator_id, 'reportingPeriodId' => (int) $target->reporting_period_id,
            'templateVersionId' => $target->template_version_id === null ? null : (int) $target->template_version_id,
            'phase' => $target->template_version_id === null ? 'draft' : 'versioned', 'targetScope' => $target->target_scope,
            'dimensionValues' => $target->dimension_values, 'targetValue' => $target->target_value,
            'notes' => $target->notes, 'status' => $target->status, 'createdBy' => (int) $target->created_by];
    }
}
