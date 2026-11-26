<?php

namespace App\Services;

use App\DTOs\AuditEventData;
use App\DTOs\IndicatorTargetData;
use App\Events\AuditEventOccurred;
use App\Models\DatasetDefinition;
use App\Models\DatasetReportingCalendar;
use App\Models\IndicatorTarget;
use App\Models\ReportingPeriod;
use App\Models\TemplateVersion;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\ValidationException;

class IndicatorTargetService
{
    public function create(Request $request, int $datasetId, IndicatorTargetData $data): IndicatorTarget
    {
        return DB::transaction(function () use ($request, $datasetId, $data) {
            $dataset = $this->dataset($request, $datasetId);
            $period = $this->period($dataset, $data->reportingPeriodId);
            $pinnedVersion = DatasetReportingCalendar::where('dataset_definition_id', $datasetId)
                ->where('reporting_period_id', $period->id)->value('template_version_id');
            abort_if($pinnedVersion !== null && $data->templateVersionId !== null && (int) $pinnedVersion !== $data->templateVersionId,
                422, 'Target lazima itumie template ya kipindi hiki.');
            $version = $this->configuration($dataset, $data->templateVersionId ?? ($pinnedVersion === null ? null : (int) $pinnedVersion));
            $indicator = $this->indicator($version, $data->indicatorId, $period);
            $value = $this->numeric($data->targetValue, $indicator['data_type'], 'targetValue');
            $dimensions = $this->dimensions($version, $data->targetScope, $data->dimensionValues, $data->indicatorId);
            $key = hash('sha256', json_encode([$data->targetScope, $dimensions], JSON_THROW_ON_ERROR));
            abort_if(IndicatorTarget::where('dataset_definition_id', $datasetId)->where('indicator_id', $data->indicatorId)
                ->where('reporting_period_id', $period->id)->where('dimension_key', $key)->exists(), 409,
                'Target ya indicator, kipindi na dimensions hizi tayari ipo; tumia PATCH.');
            $target = IndicatorTarget::create([
                'dataset_definition_id' => $datasetId, 'indicator_id' => $data->indicatorId,
                'reporting_period_id' => $period->id, 'template_version_id' => $version->id,
                'target_scope' => $data->targetScope, 'dimension_values' => $dimensions, 'dimension_key' => $key,
                'target_value' => $value, 'notes' => $data->notes, 'status' => 'active', 'created_by' => $request->user()->id,
            ]);
            $this->audit($request, $target, 'indicator_target_created', null);

            return $target;
        });
    }

    public function update(Request $request, int $datasetId, int $id, array $data): IndicatorTarget
    {
        return DB::transaction(function () use ($request, $datasetId, $id, $data) {
            $dataset = $this->dataset($request, $datasetId);
            $target = IndicatorTarget::where('dataset_definition_id', $datasetId)->lockForUpdate()->findOrFail($id);
            // Draft iliyopitwa na period/configuration lazima iweze kusitishwa ili isizuie activation.
            if ($dataset->status === 'draft' && $target->template_version_id === null && ($data['status'] ?? null) === 'inactive') {
                abort_if(array_key_exists('targetValue', $data), 422, 'Sitisha target bila kubadili targetValue.');
                $before = $target->attributesToArray();
                $target->status = 'inactive';
                if (array_key_exists('notes', $data)) {
                    $target->notes = $data['notes'];
                }
                if ($target->isDirty()) {
                    $target->save();
                    $this->audit($request, $target, 'indicator_target_deactivated', $before);
                }

                return $target;
            }
            $period = $this->period($dataset, $target->reporting_period_id);
            $before = $target->attributesToArray();
            if (isset($data['targetValue'])) {
                $indicator = $this->indicator($this->configuration($dataset, $target->template_version_id), $target->indicator_id, $period);
                $target->target_value = $this->numeric($data['targetValue'], $indicator['data_type'], 'targetValue');
            }
            if (array_key_exists('notes', $data)) {
                $target->notes = $data['notes'];
            }
            if (isset($data['status'])) {
                $target->status = $data['status'];
            }
            // Targets za historia hazihaririwi wakati dataset imerudishwa draft.
            abort_if($dataset->status === 'draft' && $target->template_version_id !== null, 422, 'Target hii ni ya version iliyopo; historia inahifadhiwa wakati wa draft.');
            if ($target->status === 'active') {
                $version = $this->configuration($dataset, $target->template_version_id);
                $this->indicator($version, $target->indicator_id, $period);
                $this->dimensions($version, $target->target_scope, $target->dimension_values, $target->indicator_id);
                if ($dataset->status === 'active' && $target->template_version_id === null) {
                    // Legacy draft targets are adopted only when explicitly edited and revalidated.
                    $target->template_version_id = $version->id;
                }
            }
            if ($target->isDirty()) {
                $type = $target->isDirty('status') && $target->status === 'inactive' ? 'indicator_target_deactivated' : 'indicator_target_updated';
                $target->save();
                $this->audit($request, $target, $type, $before);
            }

            return $target;
        });
    }

    private function dataset(Request $request, int $id): DatasetDefinition
    {
        $dataset = app(DatasetIndicatorService::class)->scopedDatasets($request->user())->lockForUpdate()->findOrFail($id);
        abort_unless(in_array($dataset->status, ['draft', 'active'], true), 422, 'Dataset lazima iwe draft au active.');

        return $dataset;
    }

    private function period(DatasetDefinition $dataset, int $id): ReportingPeriod
    {
        $period = ReportingPeriod::where(function ($query) use ($dataset) {
            $query->whereNull('institution_id')->orWhere('institution_id', $dataset->institution_id);
        })->findOrFail($id);
        if ($period->parent_id !== null) {
            $parent = ReportingPeriod::lockForUpdate()->findOrFail($period->parent_id);
            abort_if(app(ReportingPeriodStatusService::class)->manuallyClosed($parent), 422, 'Mwaka wa period hii umefungwa.');
        }
        $period = ReportingPeriod::lockForUpdate()->findOrFail($id);
        abort_if(app(ReportingPeriodStatusService::class)->manuallyClosed($period), 422, 'Period imefungwa.');

        return $period;
    }

    private function configuration(DatasetDefinition $dataset, ?int $versionId): TemplateVersion
    {
        if ($dataset->status === 'draft') {
            abort_if($versionId !== null, 422, 'Target ya draft haitumii templateVersionId.');

            return new TemplateVersion(['template_content' => app(DatasetConfigurationService::class)->configurationSnapshot($dataset)]);
        }
        if ($versionId === null) {
            return $dataset->templateVersions()->orderByDesc('version_number')->firstOrFail();
        }

        return $dataset->templateVersions()->findOrFail($versionId);
    }

    public function validateDraftTargets(DatasetDefinition $dataset, array $snapshot): Collection
    {
        $version = new TemplateVersion(['template_content' => $snapshot]);
        $targets = IndicatorTarget::where('dataset_definition_id', $dataset->id)->whereNull('template_version_id')
            ->where('status', 'active')->lockForUpdate()->get();
        foreach ($targets as $target) {
            $period = $this->period($dataset, $target->reporting_period_id);
            $indicator = $this->indicator($version, $target->indicator_id, $period);
            // Decimal cast ya DB huongeza zeros hata kwa integer; ziondolewe bila kupoteza precision.
            $number = rtrim(rtrim((string) $target->target_value, '0'), '.');
            if (! str_contains((string) $target->target_value, '.')) {
                $number = (string) $target->target_value;
            }
            $this->numeric($number === '' ? '0' : $number, $indicator['data_type'], 'targetValue');
            $this->dimensions($version, $target->target_scope, $target->dimension_values, $target->indicator_id);
        }

        return $targets;
    }

    public function bindDraftTargets(Request $request, Collection $targets, TemplateVersion $version): void
    {
        // Caller ametengeneza version na kushikilia transaction; audit failure hurudisha activation yote.
        foreach ($targets as $target) {
            $before = $target->attributesToArray();
            $target->template_version_id = $version->id;
            $target->save();
            $this->audit($request, $target, 'indicator_target_versioned', $before);
        }
    }

    private function indicator(TemplateVersion $version, int $id, ReportingPeriod $period): array
    {
        $snapshot = $version->template_content;
        abort_unless(in_array($period->period_type, $snapshot['frequencies'] ?? [], true), 422, 'Frequency ya period haipo katika template version.');
        $indicator = collect($snapshot['indicators'] ?? [])->firstWhere('id', $id);
        abort_unless($indicator !== null, 422, 'Indicator haipo katika template version iliyochaguliwa.');
        abort_unless(in_array($indicator['data_type'], ['integer', 'decimal'], true), 422, 'Targets za sasa ni za indicators za integer au decimal.');

        return $indicator;
    }

    public function numeric(mixed $value, string $type, string $field): string
    {
        // String arithmetic huepusha kupoteza precision ya fedha kupitia floating point.
        $pattern = $type === 'integer' ? '/^-?\d{1,18}$/' : '/^-?\d{1,18}(\.\d{1,6})?$/';
        if ((! is_string($value) && ! is_int($value)) || ! preg_match($pattern, (string) $value)) {
            throw ValidationException::withMessages([$field => 'Tuma namba kama string; hadi digits 18 kabla ya decimal na 6 baada yake. Integer haina sehemu ya decimal.']);
        }
        $negative = str_starts_with((string) $value, '-');
        [$whole, $fraction] = array_pad(explode('.', ltrim((string) $value, '-'), 2), 2, '');
        $whole = ltrim($whole, '0') ?: '0';
        $fraction = rtrim($fraction, '0');
        $normalized = $whole.($fraction !== '' ? '.'.$fraction : '');

        return ($negative && $normalized !== '0' ? '-' : '').$normalized;
    }

    private function dimensions(TemplateVersion $version, string $scope, array $values, int $indicatorId): array
    {
        if ($scope === 'total') {
            abort_unless($values === [], 422, 'Target total haitumi dimensionValues.');

            return [];
        }
        abort_if($values === [], 422, 'Target ya dimensions inahitaji dimensionValues.');
        // Required dimensions hupimwa kwa indicator husika; versions za zamani hubaki dataset-wide.
        $definitions = collect($version->template_content['dimensions'] ?? [])
            ->filter(fn ($definition) => empty($definition['indicatorIds']) || in_array($indicatorId, $definition['indicatorIds'], true))->keyBy('id');
        $result = [];
        foreach ($values as $entry) {
            $id = (int) $entry['dimensionId'];
            $definition = $definitions->get($id);
            abort_unless($definition !== null && ! isset($result[$id]), 422, 'Dimension haipo kwenye version au imerudiwa.');
            $value = $entry['value'];
            switch ($definition['data_type']) {
                case 'reference':
                    abort_unless((is_int($value) || (is_string($value) && ctype_digit($value)))
                        && collect(($definition['optionSource'] ?? null) === 'manual' ? ($definition['options'] ?? []) : ($definition['referenceValues'] ?? []))->contains(fn ($item) => (string) $item['id'] === (string) (int) $value), 422,
                        'Reference value haipo katika snapshot ya dimension.');
                    $value = (int) $value;
                    break;
                case 'integer':
                case 'decimal':
                    $value = $this->numeric($value, $definition['data_type'], 'dimensionValues');
                    break;
                case 'boolean':
                    abort_unless(is_bool($value), 422, 'Dimension boolean inahitaji true au false.');
                    break;
                case 'date':
                    Validator::make(['value' => $value], ['value' => ['required', 'string', 'date_format:Y-m-d']])->validate();
                    break;
                default:
                    Validator::make(['value' => $value], ['value' => ['required', 'string', 'max:255']])->validate();
                    $value = trim($value);
            }
            $result[$id] = ['dimensionId' => $id, 'value' => $value];
        }
        foreach ($definitions as $id => $definition) {
            abort_if(($definition['isRequired'] ?? false) && ! isset($result[$id]), 422, 'Dimension ya lazima haijajazwa.');
        }
        ksort($result);

        return array_values($result);
    }

    private function audit(Request $request, IndicatorTarget $target, string $type, ?array $before): void
    {
        AuditEventOccurred::dispatch(new AuditEventData(eventType: $type, userId: $request->user()->id,
            entityType: 'indicator_target', entityId: (string) $target->id, ipAddress: $request->ip(),
            requestId: $request->attributes->get('auditRequestId'), oldValues: $before, newValues: $target->attributesToArray()));
    }
}
