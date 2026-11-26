<?php

namespace App\Services;

use App\DTOs\AuditEventData;
use App\Models\ReportingPeriod;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\DB;

class ReportingPeriodStatusService
{
    public function manuallyClosed(ReportingPeriod $period): bool
    {
        return (! $period->automatic_status && $period->status === 'closed')
            || ($period->parent_id !== null && $this->manuallyClosed($period->parent));
    }

    public function status(ReportingPeriod $period): string
    {
        $today = CarbonImmutable::now('Africa/Dar_es_Salaam')->toDateString();

        return ! $this->manuallyClosed($period) && $today >= $period->start_date->toDateString()
            && $today <= $period->deadline->toDateString() ? 'open' : 'closed';
    }

    /** Apply the same live status to paginated filters even when the scheduler is delayed. */
    public function filter(Builder $query, string $status): Builder
    {
        $today = CarbonImmutable::now('Africa/Dar_es_Salaam')->toDateString();
        $open = ReportingPeriod::query()->select('id')
            ->where(fn ($q) => $q->where('automatic_status', true)->orWhere('status', 'open'))
            ->whereDate('start_date', '<=', $today)->whereDate('deadline', '>=', $today)
            ->whereDoesntHave('parent', fn ($q) => $q->where('automatic_status', false)->where('status', 'closed'));

        return $status === 'open' ? $query->whereIn('id', $open) : $query->whereNotIn('id', $open);
    }

    /** Persist only real transitions; retries do not duplicate audits. */
    public function synchronize(): int
    {
        $changed = 0;
        ReportingPeriod::whereNull('institution_id')->where('automatic_status', true)->chunkById(100, function ($periods) use (&$changed) {
            foreach ($periods as $candidate) {
                $changed += DB::transaction(function () use ($candidate) {
                    $parent = $candidate->parent_id ? ReportingPeriod::lockForUpdate()->findOrFail($candidate->parent_id) : null;
                    $period = ReportingPeriod::lockForUpdate()->findOrFail($candidate->id);
                    if (! $period->automatic_status) {
                        return 0;
                    }
                    $period->setRelation('parent', $parent);
                    $next = $this->status($period);
                    if ($next === $period->status) {
                        return 0;
                    }
                    $before = ['status' => $period->status];
                    $period->update(['status' => $next]);
                    app(AuditService::class)->record(new AuditEventData(
                        eventType: 'reporting_period_automatically_'.$next, actorType: 'system',
                        entityType: 'reporting_period', entityId: (string) $period->id,
                        oldValues: $before, newValues: ['status' => $next],
                        reason: 'Reporting window evaluated in Africa/Dar_es_Salaam.'
                    ));

                    return 1;
                }, 3);
            }
        });

        return $changed;
    }
}
