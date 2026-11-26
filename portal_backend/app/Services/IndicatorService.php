<?php

namespace App\Services;

use App\DTOs\AuditEventData;
use App\DTOs\IndicatorData;
use App\DTOs\IndicatorUpdateData;
use App\Events\AuditEventOccurred;
use App\Models\Indicator;
use App\Models\ReferenceDataValue;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class IndicatorService
{
    public function create(IndicatorData $data, User $actor, ?string $ipAddress, ?string $requestId, ?int $institutionId = null): Indicator
    {
        return DB::transaction(function () use ($data, $actor, $ipAddress, $requestId, $institutionId) {
            $indicator = new Indicator($data->attributes());
            $indicator->indicator_code = app(IndicatorCodeGenerator::class)->next($institutionId ?? $actor->institution_id);
            $indicator->created_by = $actor->id;
            $this->validateConfiguration($indicator);
            $indicator->save();
            $this->audit($indicator, $actor, 'indicator_created', null, $ipAddress, $requestId);

            return $indicator;
        });
    }

    public function update(int $id, IndicatorUpdateData $data, User $actor, ?string $ipAddress, ?string $requestId): Indicator
    {
        return DB::transaction(function () use ($id, $data, $actor, $ipAddress, $requestId) {
            $indicator = Indicator::lockForUpdate()->findOrFail($id);
            // Catalogue inashirikiwa; creator huhariri zake na MOA husimamia zote.
            abort_unless($actor->hasRole('MOA') || (int) $indicator->created_by === (int) $actor->id, 403);
            $before = $indicator->attributesToArray();
            $indicator->fill($data->attributes());
            // Indicator inayoshirikiwa haihaririwi ikiwa inatumiwa na dataset active bila versioning.
            if ($indicator->isDirty()) {
                abort_if($indicator->datasets()->where('dataset_definitions.status', 'active')->exists(),
                    422, 'Indicator inatumiwa na dataset active; mabadiliko yanahitaji versioning.');
            }
            // Deactivation inaruhusiwa hata kama unit ya zamani imesitishwa.
            if ($indicator->status === 'active' || $indicator->isDirty(['data_type', 'unit_id', 'aggregation_rule', 'performance_direction'])) {
                $this->validateConfiguration($indicator);
            }
            if ($indicator->isDirty()) {
                $eventType = $indicator->isDirty('status') && $indicator->status === 'inactive'
                    ? 'indicator_deactivated' : 'indicator_updated';
                $indicator->save();
                $this->audit($indicator, $actor, $eventType, $before, $ipAddress, $requestId);
            }

            return $indicator;
        });
    }

    public function validateConfiguration(Indicator $indicator): void
    {
        if (! in_array($indicator->performance_direction, Indicator::PERFORMANCE_DIRECTIONS, true)) {
            throw ValidationException::withMessages(['performanceDirection' => 'Invalid performance direction.']);
        }
        $numeric = in_array($indicator->data_type, ['integer', 'decimal'], true);
        $allowed = $numeric ? Indicator::AGGREGATION_RULES
            : ($indicator->data_type === 'date' ? ['none', 'min', 'max', 'latest'] : ['none', 'latest']);
        if (! in_array($indicator->aggregation_rule, $allowed, true)) {
            throw ValidationException::withMessages(['aggregationRule' => 'Aggregation haiendani na data type iliyochaguliwa.']);
        }
        if ($indicator->unit_id === null) {
            return;
        }
        if (! $numeric) {
            throw ValidationException::withMessages(['unitId' => 'Unit hutumika kwa integer au decimal pekee.']);
        }
        // Foreign key pekee haihakikishi kuwa reference value ni unit iliyo hai.
        $unit = ReferenceDataValue::whereKey($indicator->unit_id)
            ->where('status', 'active')
            ->whereHas('dataType', fn ($query) => $query->where('data_type_code', 'UNIT')->where('status', 'active'))
            ->where(fn ($query) => $query->whereNull('effective_from')->orWhereDate('effective_from', '<=', today()))
            ->where(fn ($query) => $query->whereNull('effective_to')->orWhereDate('effective_to', '>=', today()))
            ->first();
        if (! $unit) {
            throw ValidationException::withMessages(['unitId' => 'Chagua reference value iliyo hai chini ya type UNIT.']);
        }
    }

    private function audit(Indicator $indicator, User $actor, string $eventType, ?array $before, ?string $ipAddress, ?string $requestId): void
    {
        // Listener ni synchronous ili indicator na audit zihifadhiwe au zirudishwe nyuma pamoja.
        AuditEventOccurred::dispatch(new AuditEventData(
            eventType: $eventType, userId: $actor->id,
            entityType: 'indicator', entityId: (string) $indicator->id,
            ipAddress: $ipAddress, requestId: $requestId,
            oldValues: $before, newValues: $indicator->attributesToArray(),
        ));
    }
}
