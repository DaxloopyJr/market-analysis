<?php

namespace App\Http\Controllers\Api\V1;

use App\DTOs\DatasetSectorsData;
use App\DTOs\DimensionData;
use App\Http\Controllers\Controller;
use App\Models\DatasetDimension;
use App\Models\DatasetIndicator;
use App\Models\DimensionDefinition;
use App\Services\DatasetConfigurationService;
use App\Services\DatasetWizardService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class DatasetConfigurationController extends Controller
{
    public function sectors(Request $request, int $datasetId, DatasetConfigurationService $service): JsonResponse
    {
        return response()->json(['data' => $service->sectorSnapshot($service->dataset($request, $datasetId))]);
    }

    public function updateSectors(Request $request, int $datasetId, DatasetConfigurationService $service): JsonResponse
    {
        $data = $request->validate([
            'sectors' => ['required', 'array', 'min:1', 'max:100'],
            'sectors.*' => ['required', 'array:sectorId,subsectorIds'],
            'sectors.*.sectorId' => ['required', 'integer', 'distinct', Rule::exists('reference_data_values', 'id')],
            'sectors.*.subsectorIds' => ['sometimes', 'array', 'max:1000'],
            'sectors.*.subsectorIds.*' => ['required', 'integer', 'distinct', Rule::exists('reference_data_values', 'id')],
        ]);

        return response()->json(['data' => $service->replaceSectors($request, $datasetId, new DatasetSectorsData($data['sectors']))]);
    }

    public function dimensions(Request $request, int $datasetId, DatasetConfigurationService $service): JsonResponse
    {
        $service->dataset($request, $datasetId);
        $filters = $request->validate(['indicatorId' => ['sometimes', 'integer'], 'perPage' => ['sometimes', 'integer', 'between:1,100'], 'page' => ['sometimes', 'integer', 'min:1']]);
        if (isset($filters['indicatorId'])) {
            DatasetIndicator::where('dataset_definition_id', $datasetId)->where('indicator_id', $filters['indicatorId'])->firstOrFail();
        }
        $page = DatasetDimension::where('dataset_definition_id', $datasetId)->with('dimension')
            ->when(isset($filters['indicatorId']), fn ($q) => $q->where(fn ($q) => $q
                ->whereDoesntHave('indicatorLinks')->orWhereHas('indicatorLinks', fn ($links) => $links->where('indicator_id', $filters['indicatorId']))))
            ->orderBy('display_order')->orderBy('id')->paginate($filters['perPage'] ?? 20)->appends($filters);
        $page->through(fn ($link) => $this->dimensionSnapshot($link));

        return response()->json($page);
    }

    public function addDimension(Request $request, int $datasetId, DatasetConfigurationService $service): JsonResponse
    {
        $service->dataset($request, $datasetId);
        $data = $request->validate([
            'dimensionId' => ['required_without:dimension', 'prohibits:dimension', 'integer', Rule::exists('dimension_definitions', 'id')],
            'dimension' => ['required_without:dimensionId', 'prohibits:dimensionId', 'array:dimensionCode,nameEn,nameSw,dataType,referenceTypeId,options'],
            'dimension.dimensionCode' => ['required_with:dimension', 'string', 'max:100', Rule::unique('dimension_definitions', 'dimension_code')],
            'dimension.nameEn' => ['required_with:dimension', 'string', 'max:255'],
            'dimension.nameSw' => ['sometimes', 'nullable', 'string', 'max:255'],
            'dimension.dataType' => ['required_with:dimension', Rule::in(DimensionDefinition::DATA_TYPES)],
            'dimension.referenceTypeId' => ['sometimes', 'nullable', 'integer', Rule::exists('reference_data_types', 'id')],
            'dimension.options' => ['sometimes', 'array', 'min:1', 'max:1000'],
            'dimension.options.*' => ['required', 'array:code,nameEn,nameSw'],
            'dimension.options.*.code' => ['required', 'string', 'max:100', 'regex:/^[A-Z0-9_\-]+$/', 'distinct'],
            'dimension.options.*.nameEn' => ['required', 'string', 'max:255'],
            'dimension.options.*.nameSw' => ['nullable', 'string', 'max:255'],
            'indicatorIds' => ['sometimes', 'array', 'min:1'],
            'indicatorIds.*' => ['required', 'integer', 'distinct'],
            ...$this->linkRules(),
        ]);
        $new = $data['dimension'] ?? null;
        $dto = $new === null ? null : new DimensionData($new['dimensionCode'], $new['nameEn'], $new['dataType'], $new['nameSw'] ?? null, $new['referenceTypeId'] ?? null, $new['options'] ?? []);
        $link = $service->attachDimension($request, $datasetId, $data['dimensionId'] ?? null, $dto, $data);

        return response()->json(['data' => $this->dimensionSnapshot($link)], 201);
    }

    public function updateDimension(Request $request, int $datasetId, int $dimensionId, DatasetConfigurationService $service): JsonResponse
    {
        $service->dataset($request, $datasetId);
        $data = $request->validate($this->linkRules() + ['dimension' => ['prohibited'], 'dimensionId' => ['prohibited'], 'indicatorIds' => ['missing']]);
        $link = $service->changeDimension($request, $datasetId, $dimensionId, $data, false);

        return response()->json(['data' => $this->dimensionSnapshot($link)]);
    }

    public function removeDimension(Request $request, int $datasetId, int $dimensionId, DatasetConfigurationService $service): JsonResponse
    {
        $service->changeDimension($request, $datasetId, $dimensionId, [], true);

        return response()->json(['message' => 'Dimension imeondolewa kwenye dataset.']);
    }

    public function activate(Request $request, int $datasetId, DatasetConfigurationService $service): JsonResponse
    {
        return response()->json(['data' => $service->activate($request, $datasetId)], 201);
    }

    public function progress(Request $request, int $datasetId, DatasetWizardService $service): JsonResponse
    {
        return response()->json(['data' => $service->progress($request, $datasetId)]);
    }

    public function reopen(Request $request, int $datasetId, DatasetConfigurationService $service): JsonResponse
    {
        $dataset = $service->reopen($request, $datasetId);

        return response()->json(['data' => ['datasetId' => $dataset->id, 'status' => $dataset->status]]);
    }

    public function versions(Request $request, int $datasetId, DatasetConfigurationService $service): JsonResponse
    {
        $dataset = $service->dataset($request, $datasetId);
        $filters = $request->validate(['perPage' => ['sometimes', 'integer', 'between:1,100'], 'page' => ['sometimes', 'integer', 'min:1']]);

        return response()->json($dataset->templateVersions()->select(['id', 'dataset_definition_id', 'version_number', 'template_format', 'effective_from', 'created_by', 'created_at'])
            ->orderByDesc('version_number')->paginate($filters['perPage'] ?? 20)->appends($filters));
    }

    public function version(Request $request, int $datasetId, int $versionId, DatasetConfigurationService $service): JsonResponse
    {
        $dataset = $service->dataset($request, $datasetId);

        return response()->json(['data' => $dataset->templateVersions()->findOrFail($versionId)]);
    }

    private function linkRules(): array
    {
        return ['isRequired' => ['sometimes', 'required', 'boolean'], 'displayOrder' => ['sometimes', 'required', 'integer', 'between:1,2147483647']];
    }

    private function dimensionSnapshot(DatasetDimension $link): array
    {
        $dimension = $link->dimension;

        return ['id' => $link->id, 'datasetId' => (int) $link->dataset_definition_id, 'dimensionId' => (int) $link->dimension_id,
            'isRequired' => $link->is_required, 'displayOrder' => $link->display_order,
            'indicatorIds' => $link->indicatorLinks()->pluck('indicator_id')->map(fn ($id) => (int) $id)->all(),
            'dimension' => ['id' => $dimension->id, 'dimensionCode' => $dimension->dimension_code,
                'nameEn' => $dimension->name_en, 'nameSw' => $dimension->name_sw, 'dataType' => $dimension->data_type,
                'referenceTypeId' => $dimension->reference_type_id, 'status' => $dimension->status,
                'options' => $dimension->options()->orderBy('id')->get(['id', 'code', 'name_en', 'name_sw'])->toArray()]];
    }
}
