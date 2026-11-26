<?php

namespace App\Services;

use App\DTOs\AuditEventData;
use App\DTOs\DatasetIndicatorData;
use App\DTOs\IndicatorData;
use App\Events\AuditEventOccurred;
use App\Models\DatasetDefinition;
use App\Models\DatasetIndicator;
use App\Models\Indicator;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\DB;

class DatasetIndicatorService
{
    public function scopedDatasets(User $actor): Builder
    {
        abort_unless($actor->is_active && $actor->status === 'active' && $actor->hasRole('MOA', 'IA', 'IDO', 'DDO'), 403);
        $query = DatasetDefinition::query();
        if ($actor->hasRole('MOA')) {
            return $query;
        }
        abort_unless($actor->institution_id !== null, 403);
        $query->where('institution_id', $actor->institution_id);
        if (!$actor->hasRole('IA', 'IDO')) {
            abort_unless($actor->department_id !== null, 403);
            $query->where('department_id', $actor->department_id);
        }

        return $query;
    }

    public function attach(int $datasetId, User $actor, DatasetIndicatorData $data, ?int $indicatorId, ?IndicatorData $newIndicator, ?string $ip, ?string $requestId): DatasetIndicator
    {
        return DB::transaction(function () use ($datasetId, $actor, $data, $indicatorId, $newIndicator, $ip, $requestId) {
            $dataset = $this->editable($datasetId, $actor);
            // Uundaji na kuunganisha hukamilika pamoja; failure haiachi indicator bila uhusiano.
            $indicator = $newIndicator !== null
                ? app(IndicatorService::class)->create($newIndicator, $actor, $ip, $requestId, $dataset->institution_id)
                : Indicator::lockForUpdate()->findOrFail($indicatorId);
            abort_unless($indicator->status === 'active', 422, 'Indicator lazima iwe active.');
            abort_if(DatasetIndicator::where('dataset_definition_id', $datasetId)->where('indicator_id', $indicator->id)->exists(),
                409, 'Indicator tayari imeunganishwa na dataset hii.');
            $link = DatasetIndicator::create($data->attributes() + [
                'dataset_definition_id' => $datasetId, 'indicator_id' => $indicator->id,
            ]);
            $this->audit($link, $actor, 'dataset_indicator_attached', null, $link->attributesToArray(), $ip, $requestId);

            return $link->load('indicator');
        });
    }

    public function change(int $datasetId, int $indicatorId, User $actor, array $changes, bool $detach, ?string $ip, ?string $requestId): ?DatasetIndicator
    {
        return DB::transaction(function () use ($datasetId, $indicatorId, $actor, $changes, $detach, $ip, $requestId) {
            $this->editable($datasetId, $actor);
            $link = DatasetIndicator::where('dataset_definition_id', $datasetId)->where('indicator_id', $indicatorId)->lockForUpdate()->firstOrFail();
            $before = $link->attributesToArray();
            if ($detach) {
                abort_if(DB::table('dataset_dimension_indicators')->where('dataset_indicator_id', $link->id)->exists(), 422,
                    'Ondoa dimensions zinazotumia indicator hii kabla ya kuiondoa kwenye dataset.');
                // Huondoa uhusiano pekee; definition ya indicator inayoshirikiwa haifutwi.
                $link->delete();
                $this->audit($link, $actor, 'dataset_indicator_detached', $before, null, $ip, $requestId);

                return null;
            }
            $data = new DatasetIndicatorData($changes['isRequired'] ?? $link->is_required, $changes['displayOrder'] ?? $link->display_order);
            $link->fill($data->attributes());
            if ($link->isDirty()) {
                $link->save();
                $this->audit($link, $actor, 'dataset_indicator_updated', $before, $link->attributesToArray(), $ip, $requestId);
            }

            return $link->load('indicator');
        });
    }

    private function editable(int $id, User $actor): DatasetDefinition
    {
        $dataset = $this->scopedDatasets($actor)->lockForUpdate()->findOrFail($id);
        // Muundo wa dataset active hausogezwi bila versioning; configuration hufanyika ikiwa draft.
        abort_unless($dataset->status === 'draft', 422, 'Dataset lazima iwe draft ili kubadilisha indicators.');

        return $dataset;
    }

    private function audit(DatasetIndicator $link, User $actor, string $eventType, ?array $before, ?array $after, ?string $ip, ?string $requestId): void
    {
        AuditEventOccurred::dispatch(new AuditEventData(
            eventType: $eventType, userId: $actor->id, entityType: 'dataset_indicator',
            entityId: (string) $link->id, ipAddress: $ip, requestId: $requestId,
            oldValues: $before, newValues: $after,
        ));
    }
}
