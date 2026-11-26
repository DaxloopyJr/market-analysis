<?php

namespace App\Services;

use App\Models\AuditEvent;
use Carbon\CarbonImmutable;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Database\Eloquent\Builder;

class AuditQueryService
{
    public function scopedQuery(): Builder
    {
        $user = auth()->user();
        abort_unless($user && $user->can('audit.read'), 403);
        $query = AuditEvent::query();
        if (! $user->can('audit.readAll')) {
            $query->where('institution_id', $user->institution_id);
        }

        return $query;
    }

    public function paginate(array $filters): LengthAwarePaginator
    {
        $query = $this->scopedQuery();
        // Majina ya columns yanatokana na orodha hii pekee, si input ya mtumiaji.
        $filterColumns = [
            'eventType' => 'event_type', 'actorType' => 'actor_type',
            'userId' => 'user_id', 'entityType' => 'entity_type',
            'entityId' => 'entity_id', 'requestId' => 'request_id',
        ];

        foreach ($filterColumns as $filterName => $columnName) {
            if (isset($filters[$filterName])) {
                $query->where($columnName, $filters[$filterName]);
            }
        }

        // Tarehe hufuata timezone ya application; mwisho hujumuisha siku nzima.
        if (isset($filters['startDate'])) {
            $query->where('created_at', '>=', CarbonImmutable::parse($filters['startDate'], config('app.timezone'))->startOfDay());
        }
        if (isset($filters['endDate'])) {
            $query->where('created_at', '<', CarbonImmutable::parse($filters['endDate'], config('app.timezone'))->addDay()->startOfDay());
        }

        return $query->orderByDesc('created_at')->orderByDesc('id')
            ->paginate((int) ($filters['perPage'] ?? 20), ['*'], 'page', (int) ($filters['page'] ?? 1))
            ->appends($filters);
    }
}
