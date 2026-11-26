<?php

namespace App\Http\Controllers\Api\V1;

use App\DTOs\DatasetIndicatorData;
use App\DTOs\IndicatorData;
use App\Http\Controllers\Controller;
use App\Models\DatasetIndicator;
use App\Models\Indicator;
use App\Services\DatasetIndicatorService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class DatasetIndicatorController extends Controller
{
    public function index(Request $request, int $datasetId, DatasetIndicatorService $service): JsonResponse
    {
        $service->scopedDatasets($request->user())->findOrFail($datasetId);
        $filters = $request->validate(['perPage' => ['sometimes', 'integer', 'between:1,100'], 'page' => ['sometimes', 'integer', 'min:1']]);
        $page = DatasetIndicator::where('dataset_definition_id', $datasetId)->with('indicator')
            ->orderBy('display_order')->orderBy('id')->paginate($filters['perPage'] ?? 20)->appends($filters);
        $page->through(fn ($link) => $this->snapshot($link));

        return response()->json($page);
    }

    public function store(Request $request, int $datasetId, DatasetIndicatorService $service): JsonResponse
    {
        $service->scopedDatasets($request->user())->findOrFail($datasetId);
        // Tuma indicatorId iliyopo AU object indicator mpya; njia hizo hazichanganywi.
        $data = $request->validate([
            'indicatorId' => ['required_without:indicator', 'prohibits:indicator', 'integer', Rule::exists('indicators', 'id')],
            'indicator' => ['required_without:indicatorId', 'prohibits:indicatorId', 'array:nameEn,nameSw,descriptionEn,descriptionSw,dataType,unitId,aggregationRule,performanceDirection'],
            'indicator.nameEn' => ['required_with:indicator', 'string', 'max:255'],
            'indicator.nameSw' => ['sometimes', 'nullable', 'string', 'max:255'],
            'indicator.descriptionEn' => ['sometimes', 'nullable', 'string', 'max:10000'],
            'indicator.descriptionSw' => ['sometimes', 'nullable', 'string', 'max:10000'],
            'indicator.dataType' => ['required_with:indicator', Rule::in(Indicator::DATA_TYPES)],
            'indicator.unitId' => ['sometimes', 'nullable', 'integer', Rule::exists('reference_data_values', 'id')],
            'indicator.performanceDirection' => ['sometimes', 'required', Rule::in(Indicator::PERFORMANCE_DIRECTIONS)],
            'indicator.aggregationRule' => ['sometimes', 'required', Rule::in(Indicator::AGGREGATION_RULES)],
            'isRequired' => ['sometimes', 'required', 'boolean'],
            'displayOrder' => ['sometimes', 'required', 'integer', 'between:1,2147483647'],
        ]);
        $new = $data['indicator'] ?? null;
        $dto = $new === null ? null : new IndicatorData(
            nameEn: $new['nameEn'], dataType: $new['dataType'], nameSw: $new['nameSw'] ?? null,
            descriptionEn: $new['descriptionEn'] ?? null, descriptionSw: $new['descriptionSw'] ?? null,
            unitId: $new['unitId'] ?? null, aggregationRule: $new['aggregationRule'] ?? 'none',
            performanceDirection: $new['performanceDirection'] ?? 'higher_is_better',
        );
        $link = $service->attach($datasetId, $request->user(), new DatasetIndicatorData($data['isRequired'] ?? true, $data['displayOrder'] ?? 1),
            $data['indicatorId'] ?? null, $dto, $request->ip(), $request->attributes->get('auditRequestId'));

        return response()->json(['data' => $this->snapshot($link)], 201);
    }

    public function update(Request $request, int $datasetId, int $indicatorId, DatasetIndicatorService $service): JsonResponse
    {
        $data = $request->validate([
            'isRequired' => ['sometimes', 'required', 'boolean'],
            'displayOrder' => ['sometimes', 'required', 'integer', 'between:1,2147483647'],
            'indicatorId' => ['prohibited'], 'indicator' => ['prohibited'],
        ]);
        $link = $service->change($datasetId, $indicatorId, $request->user(), $data, false, $request->ip(), $request->attributes->get('auditRequestId'));

        return response()->json(['data' => $this->snapshot($link)]);
    }

    public function destroy(Request $request, int $datasetId, int $indicatorId, DatasetIndicatorService $service): JsonResponse
    {
        $service->change($datasetId, $indicatorId, $request->user(), [], true, $request->ip(), $request->attributes->get('auditRequestId'));

        return response()->json(['message' => 'Indicator imeondolewa kwenye dataset.']);
    }

    private function snapshot(DatasetIndicator $link): array
    {
        $indicator = $link->indicator;

        return [
            'id' => $link->id, 'datasetId' => (int) $link->dataset_definition_id,
            'indicatorId' => (int) $link->indicator_id, 'isRequired' => $link->is_required,
            'displayOrder' => $link->display_order,
            'indicator' => [
                'id' => $indicator->id, 'indicatorCode' => $indicator->indicator_code,
                'nameEn' => $indicator->name_en, 'nameSw' => $indicator->name_sw,
                'descriptionEn' => $indicator->description_en, 'descriptionSw' => $indicator->description_sw,
                'dataType' => $indicator->data_type, 'unitId' => $indicator->unit_id,
                'performanceDirection' => $indicator->performance_direction,
                'aggregationRule' => $indicator->aggregation_rule, 'status' => $indicator->status,
                'createdBy' => (int) $indicator->created_by,
            ],
        ];
    }
}
