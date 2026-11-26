<?php

namespace App\Services;

use App\DTOs\AuditEventData;
use App\Events\AuditEventOccurred;
use App\Models\DatasetDefinition;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class DatasetPriorityService
{
    public function change(Request $request, int $datasetId, string $priority, string $reason): DatasetDefinition
    {
        abort_unless(in_array($priority, ['low', 'medium', 'high'], true) && trim($reason) !== '', 422);
        $actor = $request->user();
        abort_unless($actor && $actor->is_active && $actor->status === 'active' && $actor->hasRole('MDO'), 403);
        abort_unless($actor->institution?->code === 'MIT'
            && $actor->institution->is_active && $actor->institution->status === 'active', 403);

        return DB::transaction(function () use ($request, $actor, $datasetId, $priority, $reason) {
            $dataset = DatasetDefinition::lockForUpdate()->findOrFail($datasetId);
            // MDO wa MIT hupanga priority kwa taasisi na department zote, bila kusubiri review.
            // Assignment ya kwanza (null) na mabadiliko yanatumia audit na transaction ileile.
            $before = ['priority' => $dataset->priority];
            $dataset->priority = $priority;
            $dataset->priority_reason = $reason;
            $dataset->priority_updated_by = $actor->id;
            $dataset->priority_updated_at = now();
            $dataset->save();
            AuditEventOccurred::dispatch(new AuditEventData(eventType: 'dataset_priority_changed',
                userId: $actor->id, entityType: 'dataset_definition', entityId: (string) $dataset->id,
                ipAddress: $request->ip(), oldValues: $before, newValues: ['priority' => $priority], reason: $reason));

            return $dataset;
        });
    }
}
