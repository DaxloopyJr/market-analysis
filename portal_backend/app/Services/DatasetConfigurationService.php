<?php

namespace App\Services;

use App\DTOs\AuditEventData;
use App\DTOs\DatasetSectorsData;
use App\DTOs\DimensionData;
use App\DTOs\DimensionUpdateData;
use App\Events\AuditEventOccurred;
use App\Models\DatasetDefinition;
use App\Models\DatasetDimension;
use App\Models\DatasetIndicator;
use App\Models\DimensionDefinition;
use App\Models\ReferenceDataValue;
use App\Models\TemplateVersion;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class DatasetConfigurationService
{
    public function updateDefinition(Request $request, int $id, DimensionUpdateData $data): DimensionDefinition
    {
        return DB::transaction(function () use ($request, $id, $data) {
            $dimension = DimensionDefinition::lockForUpdate()->findOrFail($id);
            abort_unless($request->user()->hasRole('MOA') || (int) $dimension->created_by === (int) $request->user()->id, 403);
            $before = $dimension->attributesToArray();
            $dimension->fill($data->attributes());
            // Options zilizotolewa hubaki na aina yake ili IDs zisibadilishe maana.
            abort_if($dimension->options()->exists() && ($dimension->data_type !== 'reference' || $dimension->reference_type_id !== null), 422, 'Dimension yenye options haiwezi kubadilishiwa aina au reference type.');
            if ($dimension->isDirty()) {
                // Catalogue inayotumiwa na dataset active inalindwa; matoleo ya zamani yana snapshots zake.
                $inUse = DB::table('dataset_dimensions')->join('dataset_definitions', 'dataset_definitions.id', '=', 'dataset_dimensions.dataset_definition_id')
                    ->where('dimension_id', $id)->where('dataset_definitions.status', 'active')->exists();
                abort_if($inUse, 422, 'Dimension inatumiwa na dataset active.');
                if ($dimension->status === 'active' || $dimension->isDirty(['data_type', 'reference_type_id'])) {
                    $this->validateDimension($dimension, false);
                }
                $type = $dimension->isDirty('status') && $dimension->status === 'inactive' ? 'dimension_deactivated' : 'dimension_updated';
                $dimension->save();
                $this->audit($request, $type, 'dimension_definition', $id, $before, $dimension->attributesToArray());
            }

            return $dimension;
        });
    }

    public function dataset(Request $request, int $id, bool $lock = false): DatasetDefinition
    {
        $query = app(DatasetIndicatorService::class)->scopedDatasets($request->user());

        return ($lock ? $query->lockForUpdate() : $query)->findOrFail($id);
    }

    private function draft(Request $request, int $id): DatasetDefinition
    {
        $dataset = $this->dataset($request, $id, true);
        abort_unless($dataset->status === 'draft', 422, 'Rudisha dataset kuwa draft kabla ya kubadilisha configuration.');

        return $dataset;
    }

    public function replaceSectors(Request $request, int $id, DatasetSectorsData $data): array
    {
        return DB::transaction(function () use ($request, $id, $data) {
            $dataset = $this->dataset($request, $id, true);
            abort_unless($dataset->status === 'draft', 422, 'Dataset lazima iwe draft kabla ya kubadilisha sectors.');
            $before = $this->sectorSnapshot($dataset->fresh());
            $sectorIds = [];
            $subsectorIds = [];
            foreach ($data->sectors as $entry) {
                $sector = $this->validValue((int) $entry['sectorId']);
                $this->checkSector($sector);
                $sectorIds[] = $sector->id;
                foreach ($entry['subsectorIds'] ?? [] as $subsectorId) {
                    $subsector = $this->validValue((int) $subsectorId);
                    $this->checkSubsector($subsector, $sector->id);
                    $subsectorIds[] = $subsector->id;
                }
            }
            $dataset->sectors()->sync($sectorIds);
            $dataset->subsectors()->sync($subsectorIds);
            $after = $this->sectorSnapshot($dataset->fresh());
            $this->audit($request, 'dataset_sectors_updated', 'dataset_definition', $id, $before, $after);

            return $after;
        });
    }

    public function assignInitialSectors(Request $request, int $id, DatasetSectorsData $data): array
    {
        return DB::transaction(function () use ($request, $id, $data) {
            $dataset = $this->draft($request, $id);
            // Uchaguzi wa kwanza pekee unaruhusiwa; audit ya creation hubeba sectors hizi.
            abort_if($dataset->sectors()->exists(), 422, 'Sectors tayari zimechaguliwa.');
            $sectorIds = [];
            $subsectorIds = [];
            foreach ($data->sectors as $entry) {
                $sector = $this->validValue((int) $entry['sectorId']);
                $this->checkSector($sector);
                $sectorIds[] = $sector->id;
                foreach ($entry['subsectorIds'] ?? [] as $subsectorId) {
                    $subsector = $this->validValue((int) $subsectorId);
                    $this->checkSubsector($subsector, $sector->id);
                    $subsectorIds[] = $subsector->id;
                }
            }
            $dataset->sectors()->sync($sectorIds);
            $dataset->subsectors()->sync($subsectorIds);
            $after = $this->sectorSnapshot($dataset->fresh());

            return $after;
        });
    }

    public function sectorSnapshot(DatasetDefinition $dataset): array
    {
        $children = $dataset->subsectors()->orderBy('reference_data_values.id')->get();

        return $dataset->sectors()->orderBy('reference_data_values.id')->get()->map(fn ($sector) => [
            'sectorId' => $sector->id, 'sectorCode' => $sector->data_value_code,
            'nameEn' => $sector->data_value_name_en, 'nameSw' => $sector->data_value_name_sw,
            'subsectors' => $children->where('parent_id', $sector->id)->map(fn ($child) => [
                'subsectorId' => $child->id, 'code' => $child->data_value_code,
                'nameEn' => $child->data_value_name_en, 'nameSw' => $child->data_value_name_sw,
            ])->values()->all(),
        ])->all();
    }

    public function attachDimension(Request $request, int $id, ?int $dimensionId, ?DimensionData $new, array $options): DatasetDimension
    {
        return DB::transaction(function () use ($request, $id, $dimensionId, $new, $options) {
            $this->draft($request, $id);
            if ($new) {
                $dimension = new DimensionDefinition($new->attributes());
                $dimension->created_by = $request->user()->id;
                abort_if($new->options !== [] && ($new->dataType !== 'reference' || $new->referenceTypeId !== null), 422, 'Options hutumika kwa reference dimension isiyo na referenceTypeId.');
                $dimension->save();
                foreach ($new->options as $option) {
                    $dimension->options()->create(['code' => $option['code'], 'name_en' => $option['nameEn'], 'name_sw' => $option['nameSw'] ?? null]);
                }
                $this->validateDimension($dimension);
                $this->audit($request, 'dimension_created', 'dimension_definition', $dimension->id, null,
                    $dimension->attributesToArray() + ['options' => $dimension->options()->get()->toArray()]);
            } else {
                $dimension = DimensionDefinition::lockForUpdate()->findOrFail($dimensionId);
                $this->validateDimension($dimension);
            }
            $indicatorIds = $options['indicatorIds'] ?? [];
            abort_if($dimension->options()->exists() && $indicatorIds === [], 422, 'Chagua indicators zinazotumia dimension hii.');
            $indicatorLinks = DatasetIndicator::where('dataset_definition_id', $id)->whereIn('indicator_id', $indicatorIds)->get();
            abort_unless($indicatorLinks->count() === count($indicatorIds), 422, 'Indicator lazima iwe imeunganishwa na dataset hii.');
            abort_if(DatasetDimension::where('dataset_definition_id', $id)->where('dimension_id', $dimension->id)->exists(), 409, 'Dimension tayari ipo kwenye dataset.');
            $link = DatasetDimension::create([
                'dataset_definition_id' => $id, 'dimension_id' => $dimension->id,
                'is_required' => $options['isRequired'] ?? true, 'display_order' => $options['displayOrder'] ?? 1,
            ]);
            $link->indicatorLinks()->sync($indicatorLinks->modelKeys());
            $this->audit($request, 'dataset_dimension_attached', 'dataset_dimension', $link->id, null, $link->attributesToArray() + ['indicatorIds' => $indicatorIds]);

            return $link->load('dimension');
        });
    }

    public function changeDimension(Request $request, int $id, int $dimensionId, array $options, bool $detach): ?DatasetDimension
    {
        return DB::transaction(function () use ($request, $id, $dimensionId, $options, $detach) {
            $this->draft($request, $id);
            $link = DatasetDimension::where('dataset_definition_id', $id)->where('dimension_id', $dimensionId)->lockForUpdate()->firstOrFail();
            $before = $link->attributesToArray() + ['indicatorIds' => $link->indicatorLinks()->pluck('indicator_id')->all()];
            if ($detach) {
                $link->delete();
                $this->audit($request, 'dataset_dimension_detached', 'dataset_dimension', $link->id, $before, null);

                return null;
            }
            $link->fill(['is_required' => $options['isRequired'] ?? $link->is_required,
                'display_order' => $options['displayOrder'] ?? $link->display_order]);
            if ($link->isDirty()) {
                $link->save();
                $this->audit($request, 'dataset_dimension_updated', 'dataset_dimension', $link->id, $before, $link->attributesToArray());
            }

            return $link->load('dimension');
        });
    }

    public function reopen(Request $request, int $id): DatasetDefinition
    {
        return DB::transaction(function () use ($request, $id) {
            $dataset = $this->dataset($request, $id, true);
            if ($dataset->status !== 'draft') {
                $before = $dataset->attributesToArray();
                // Matoleo yaliyotolewa hubaki; draft haitumiki kwa submissions mpya mpaka activation.
                $dataset->update(['status' => 'draft']);
                $this->audit($request, 'dataset_draft_opened', 'dataset_definition', $id, $before, $dataset->attributesToArray());
            }

            return $dataset;
        });
    }

    public function activate(Request $request, int $id): TemplateVersion
    {
        return DB::transaction(function () use ($request, $id) {
            $dataset = $this->draft($request, $id);
            $before = $dataset->attributesToArray();
            $snapshot = $this->configurationSnapshot($dataset);
            // Master versions describe the form, not a particular reporting year or its targets.
            $version = TemplateVersion::create([
                'dataset_definition_id' => $id,
                'version_number' => ((int) $dataset->templateVersions()->max('version_number')) + 1,
                'template_format' => 'json', 'effective_from' => now(), 'created_by' => $request->user()->id,
                'template_content' => $snapshot,
            ]);
            $dataset->update(['status' => 'active']);
            // Only never-submitted periods follow the new master; Q1 history may remain on V1 while Q2 adopts V2.
            app(DraftTemplateMigrationService::class)->adopt($request, $dataset, $version);
            $this->audit($request, 'template_version_created', 'template_version', $version->id, null, $version->attributesToArray());
            $this->audit($request, 'dataset_activated', 'dataset_definition', $id, $before,
                $dataset->attributesToArray() + ['templateVersionId' => $version->id]);

            return $version;
        }, 3);
    }

    // Snapshot ya draft hutumia validation ileile ya activation bila kuunda version.
    public function configurationSnapshot(DatasetDefinition $dataset): array
    {
        $id = $dataset->id;
        $frequencies = $this->validateDetails($dataset);
        // Dataset lock hulinda links; indicator locks huzuia definition kubadilika katikati ya snapshot.
        $indicators = $dataset->indicators()->orderBy('indicators.id')->lockForUpdate()->get();
        abort_if($indicators->isEmpty(), 422, 'Unganisha angalau indicator moja.');
        $indicatorSnapshots = [];
        foreach ($indicators as $indicator) {
            abort_unless($indicator->status === 'active', 422, 'Indicators zote lazima ziwe active.');
            app(IndicatorService::class)->validateConfiguration($indicator);
            $unit = $indicator->unit_id === null ? null : $this->validValue($indicator->unit_id)->attributesToArray();
            $indicatorSnapshots[] = $indicator->attributesToArray() + [
                'isRequired' => (bool) $indicator->pivot->is_required,
                'displayOrder' => (int) $indicator->pivot->display_order, 'unit' => $unit,
            ];
        }
        $dimensionSnapshots = [];
        foreach ($dataset->dimensions()->orderBy('dimension_definitions.id')->lockForUpdate()->get() as $dimension) {
            $values = $this->validateDimension($dimension);
            $dimensionLink = DatasetDimension::findOrFail($dimension->pivot->id);
            $dimensionSnapshots[] = $dimension->attributesToArray() + [
                'indicatorIds' => $dimensionLink->indicatorLinks()->pluck('indicator_id')->map(fn ($value) => (int) $value)->all(),
                'optionSource' => $dimension->options()->exists() ? 'manual' : ($dimension->data_type === 'reference' ? 'reference' : null),
                'options' => $dimension->options()->orderBy('id')->get()->toArray(),
                'isRequired' => (bool) $dimension->pivot->is_required,
                'displayOrder' => (int) $dimension->pivot->display_order,
                'referenceType' => $dimension->referenceType?->attributesToArray(), 'referenceValues' => $values,
            ];
        }

        return [
            'schemaVersion' => 3, 'datasetId' => $id, 'datasetCode' => $dataset->dataset_code,
            'datasetName' => $dataset->dataset_name, 'description' => $dataset->description,
            'reportingPurpose' => $dataset->reporting_purpose,
            // Source na consumers huhifadhiwa kwenye toleo ili historia isibadilike.
            'collectionMethod' => $dataset->collection_method,
            'sourceSystemName' => $dataset->source_system_name,
            'sourceDescription' => $dataset->source_description,
            'consumers' => $dataset->consumers->map(fn ($consumer) => [
                'id' => $consumer->id, 'name' => $consumer->name, 'shortName' => $consumer->short_name,
            ])->all(),
            'institutionId' => (int) $dataset->institution_id, 'departmentId' => $dataset->department_id,
            'frequencies' => $frequencies, 'sectors' => $this->sectorSnapshot($dataset),
            'indicators' => $indicatorSnapshots, 'dimensions' => $dimensionSnapshots,
        ];
    }

    public function validateDetails(DatasetDefinition $dataset): array
    {
        $institution = $dataset->institution;
        abort_unless($institution && $institution->is_active && $institution->status === 'active', 422, 'Taasisi haiko active.');
        if ($dataset->department_id !== null) {
            $department = $dataset->department;
            abort_unless($institution->code === 'MIT' && $department && $department->is_active && $department->status === 'active', 422, 'Department si halali au haiko active.');
        }
        abort_if(blank($dataset->dataset_name), 422, 'Dataset inahitaji jina.');
        $frequencies = $dataset->frequencies()->pluck('frequency')->sort()->values()->all();
        abort_if(empty($frequencies), 422, 'Dataset inahitaji frequency.');
        $sectorIds = $dataset->sectors()->pluck('reference_data_values.id')->all();
        abort_if(empty($sectorIds), 422, 'Chagua angalau sector moja.');
        foreach ($sectorIds as $sectorId) {
            $this->checkSector($this->validValue($sectorId));
        }
        foreach ($dataset->subsectors()->get() as $subsector) {
            $subsector = $this->validValue($subsector->id);
            abort_unless(in_array($subsector->parent_id, $sectorIds), 422, 'Subsector haina sector yake kwenye dataset.');
            $this->checkSubsector($subsector, (int) $subsector->parent_id);
        }

        return $frequencies;
    }

    private function validateDimension(DimensionDefinition $dimension, bool $requireActive = true): array
    {
        abort_if($requireActive && $dimension->status !== 'active', 422, 'Dimension lazima iwe active.');
        if ($dimension->data_type !== 'reference') {
            if ($dimension->reference_type_id !== null) {
                throw ValidationException::withMessages(['referenceTypeId' => 'Reference type hutumika kwa dataType reference pekee.']);
            }

            return [];
        }
        if ($dimension->reference_type_id === null) {
            // Options maalumu husomwa hapa; snapshots hulinda submissions za matoleo ya zamani.
            $options = $dimension->options()->orderBy('id')->get();
            abort_if($options->isEmpty(), 422, 'Weka options au chagua reference type yenye values.');

            return [];
        }
        $type = $dimension->referenceType;
        if (! $type || $type->status !== 'active') {
            throw ValidationException::withMessages(['referenceTypeId' => 'Chagua reference type iliyo active.']);
        }
        $values = $type->values()->where('status', 'active')
            ->where(fn ($q) => $q->whereNull('effective_from')->orWhereDate('effective_from', '<=', today()))
            ->where(fn ($q) => $q->whereNull('effective_to')->orWhereDate('effective_to', '>=', today()))
            ->orderBy('id')->get();
        abort_if($values->isEmpty(), 422, 'Reference dimension inahitaji values zilizo hai.');

        return $values->map(fn ($value) => $value->attributesToArray())->all();
    }

    private function validValue(int $id): ReferenceDataValue
    {
        $value = ReferenceDataValue::with('dataType')->findOrFail($id);
        abort_unless($value->status === 'active' && $value->dataType?->status === 'active'
            && ($value->effective_from === null || $value->effective_from->lte(today()))
            && ($value->effective_to === null || $value->effective_to->gte(today())), 422, 'Reference value si hai kwa tarehe ya sasa.');

        return $value;
    }

    private function checkSector(ReferenceDataValue $sector): void
    {
        abort_unless($sector->dataType->data_type_code === 'SECTOR' && $sector->parent_id === null, 422, 'Sector lazima iwe root value ya type SECTOR.');
    }

    private function checkSubsector(ReferenceDataValue $subsector, int $sectorId): void
    {
        abort_unless((int) $subsector->parent_id === $sectorId
            && in_array($subsector->dataType->data_type_code, ['SECTOR', 'SUBSECTOR'], true), 422, 'Subsector lazima iwe mtoto wa sector iliyochaguliwa.');
    }

    private function audit(Request $request, string $type, string $entity, int $id, ?array $before, ?array $after): void
    {
        AuditEventOccurred::dispatch(new AuditEventData(eventType: $type, userId: $request->user()->id,
            entityType: $entity, entityId: (string) $id, ipAddress: $request->ip(),
            requestId: $request->attributes->get('auditRequestId'), oldValues: $before, newValues: $after));
    }
}
