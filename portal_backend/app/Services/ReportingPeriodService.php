<?php

namespace App\Services;

use App\DTOs\AuditEventData;
use App\DTOs\ReportingPeriodData;
use App\Events\AuditEventOccurred;
use App\Models\DatasetDefinition;
use App\Models\ReportingPeriod;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ReportingPeriodService
{
    public function query(Request $request): Builder
    {
        $user = $request->user();
        abort_unless($user && $user->is_active && $user->status === 'active', 403);
        abort_unless($user->hasRole('MOA', 'IA', 'IDO', 'DDO', 'MDO') || $user->canDo('submission_periods.view') || $user->canDo('submission_periods.configure'), 403);

        return ReportingPeriod::whereNull('institution_id');
    }

    private function authorizeWrite(Request $request): void
    {
        $user = $request->user();
        abort_unless($user && $user->is_active && $user->status === 'active' && $user->hasRole('MOA'), 403);
    }

    public function create(Request $request, ReportingPeriodData $data): ReportingPeriod
    {
        return $this->persist($request, $data);
    }

    private function persist(Request $request, ReportingPeriodData $data): ReportingPeriod
    {
        return DB::transaction(function () use ($request, $data) {
            $this->authorizeWrite($request);
            abort_unless($data->institutionId === null, 422, 'Reporting periods mpya ni za pamoja; usitume institutionId.');
            // Serialize global year creation, including overlap checks, across MOA requests.
            DB::table('roles')->where('code', 'MOA')->lockForUpdate()->first();
            if ($data->periodType === 'annual') {
                $start = CarbonImmutable::parse($data->startDate);
                $end = CarbonImmutable::parse($data->endDate);
                abort_unless($start->day === 1 && $end->equalTo($start->addYear()->subDay()), 422, 'Annual lazima iwe miezi 12 kuanzia siku ya kwanza ya mwezi.');
                abort_if($data->yearType === 'calendar' && $start->month !== 1, 422, 'Calendar year huanza Januari 1.');
                $yearType = $data->yearType;
                $label = $start->year === $end->year ? (string) $start->year : $start->year.'/'.$end->year;
                $code = ($yearType === 'calendar' ? 'CY-' : 'FY-').$start->format('Y-m').'-ANNUAL';
                // Mwaka mwingine wa aina hiyo hiyo haupaswi kuingiliana ndani ya taasisi.
                abort_if(ReportingPeriod::whereNull('institution_id')->where('period_type', 'annual')->where('year_type', $yearType)
                    ->whereDate('start_date', '<=', $end)->whereDate('end_date', '>=', $start)->exists(), 409, 'Mwaka huu unaingiliana na period iliyopo.');
            } else {
                $parent = ReportingPeriod::lockForUpdate()->findOrFail($data->parentId);
                abort_unless($parent->institution_id === null && $parent->period_type === 'annual', 422, 'Parent lazima iwe annual ya pamoja.');
                abort_if(app(ReportingPeriodStatusService::class)->manuallyClosed($parent), 422, 'Mwaka mzazi umefungwa.');
                $number = $data->quarter ?? $data->periodNumber;
                $parentStart = CarbonImmutable::instance($parent->start_date);
                $months = match ($data->periodType) {
                    'quarterly' => 3, 'monthly' => 1, 'semiannual' => 6, default => null
                };
                // Wiki huanza kwenye reporting year; wiki ya mwisho inaweza kuwa fupi.
                $start = $months !== null ? $parentStart->addMonths(($number - 1) * $months)
                    : $parentStart->addDays(($number - 1) * ($data->periodType === 'weekly' ? 7 : 1));
                $end = $months !== null ? $start->addMonths($months)->subDay()
                    : $start->addDays($data->periodType === 'weekly' ? 6 : 0);
                abort_if($start->gt($parent->end_date), 422, 'Namba ya kipindi iko nje ya reporting year.');
                $end = $end->min(CarbonImmutable::instance($parent->end_date));
                $yearType = $parent->year_type;
                $prefix = match ($data->periodType) {
                    'quarterly' => 'Q', 'monthly' => 'M', 'semiannual' => 'H', 'weekly' => 'W', 'daily' => 'D'
                };
                $label = $parent->label.' '.$prefix.$number;
                $code = str_replace('-ANNUAL', '-'.$prefix.$number, $parent->period_code);
            }
            // Kanuni hupewa wazi na caller; hakuna idadi ya siku inayodhaniwa kuwa rasmi.
            abort_if($data->deadline === null && $data->deadlineDays === null, 422, 'Weka deadline au deadlineDays.');
            $deadline = $data->deadline ?? $end->addDays($data->deadlineDays)->toDateString();
            abort_if(CarbonImmutable::parse($deadline)->lessThan($end), 422, 'Deadline isiwe kabla ya mwisho wa kipindi.');
            abort_if(ReportingPeriod::whereNull('institution_id')->where('period_code', $code)->exists(), 409, 'Period tayari ipo.');
            $period = ReportingPeriod::create([
                'institution_id' => null, 'parent_id' => $data->parentId,
                'period_type' => $data->periodType, 'year_type' => $yearType, 'period_code' => $code, 'label' => $label,
                'quarter' => $data->quarter, 'start_date' => $start, 'end_date' => $end, 'deadline' => $deadline,
                'period_number' => $data->quarter ?? $data->periodNumber,
                'status' => CarbonImmutable::now('Africa/Dar_es_Salaam')->toDateString() >= $start->toDateString() && CarbonImmutable::now('Africa/Dar_es_Salaam')->toDateString() <= CarbonImmutable::parse($deadline)->toDateString() ? 'open' : 'closed', 'automatic_status' => true, 'created_by' => $request->user()->id,
            ]);
            $this->audit($request, $period, 'reporting_period_created', null);

            return $period;
        });
    }

    public function generateQuarters(Request $request, int $annualId, int $deadlineDays): array
    {
        return $this->generatePeriods($request, $annualId, 'quarterly', $deadlineDays);
    }

    public function update(Request $request, int $id, array $data): ReportingPeriod
    {
        return DB::transaction(function () use ($request, $id, $data) {
            $period = $this->query($request)->lockForUpdate()->findOrFail($id);
            $this->authorizeWrite($request);
            $before = $period->attributesToArray();
            // Identity na dates havibadilishwi ili targets zisihamishwe kwenda kipindi tofauti.
            if (isset($data['deadline'])) {
                abort_if(CarbonImmutable::parse($data['deadline'])->lessThan($period->end_date), 422, 'Deadline isiwe kabla ya mwisho wa kipindi.');
                $period->deadline = $data['deadline'];
            }
            if (isset($data['status'])) {
                abort_if($data['status'] === 'open' && $period->parent_id && app(ReportingPeriodStatusService::class)->manuallyClosed($period->parent), 422, 'Fungua mwaka mzazi kwanza.');
                $period->automatic_status = $data['status'] === 'open';
                $period->status = $data['status'];
            }
            if ($period->automatic_status) {
                $period->status = app(ReportingPeriodStatusService::class)->status($period);
            }
            if ($period->isDirty()) {
                $type = $period->isDirty('status') ? ($period->status === 'closed' ? 'reporting_period_closed' : 'reporting_period_reopened') : 'reporting_period_updated';
                $period->save();
                $this->audit($request, $period, $type, $before);
            }

            return $period;
        });
    }

    /**
     * Fill missing months atomically without overwriting existing deadlines or status.
     *
     * @return list<ReportingPeriod>
     */
    public function generateMonths(Request $request, int $annualId, int $deadlineDays): array
    {
        return $this->generatePeriods($request, $annualId, 'monthly', $deadlineDays);
    }

    /**
     * Reuse existing periods and audit only new records in one transaction.
     * Daily counts include leap days; the final week ends at the annual boundary.
     *
     * @return list<ReportingPeriod>
     */
    public function generatePeriods(Request $request, int $annualId, string $periodType, int $deadlineDays): array
    {
        abort_unless(in_array($periodType, ['quarterly', 'monthly', 'semiannual', 'weekly', 'daily'], true), 422);

        return DB::transaction(function () use ($request, $annualId, $periodType, $deadlineDays) {
            $annual = $this->query($request)->lockForUpdate()->findOrFail($annualId);
            $this->authorizeWrite($request);
            abort_unless($annual->period_type === 'annual' && ! app(ReportingPeriodStatusService::class)->manuallyClosed($annual), 422, 'Chagua annual period iliyo open.');
            $days = (int) $annual->start_date->diffInDays($annual->end_date) + 1;
            $count = match ($periodType) {
                'quarterly' => 4, 'monthly' => 12, 'semiannual' => 2,
                'weekly' => (int) ceil($days / 7), 'daily' => $days,
            };
            $numberColumn = $periodType === 'quarterly' ? 'quarter' : 'period_number';
            $existing = ReportingPeriod::where('parent_id', $annualId)->where('period_type', $periodType)->get()->keyBy($numberColumn);
            $periods = [];
            for ($number = 1; $number <= $count; $number++) {
                $periods[] = $existing->get($number)
                    ?? $this->create($request, new ReportingPeriodData(
                        institutionId: $annual->institution_id, periodType: $periodType, deadline: null,
                        parentId: $annualId, quarter: $periodType === 'quarterly' ? $number : null,
                        periodNumber: $periodType === 'quarterly' ? null : $number, deadlineDays: $deadlineDays));
            }

            return $periods;
        });
    }

    /** Select MOA-prepared periods; officers never create years or change deadlines here. */
    public function forDatasetYear(Request $request, DatasetDefinition $dataset, int $startYear, string $frequency): array
    {
        app(DatasetIndicatorService::class)->scopedDatasets($request->user())->findOrFail($dataset->id);
        abort_unless($dataset->status === 'active' && $dataset->frequencies()->where('frequency', $frequency)->exists(), 422, 'Dataset active na frequency inayoruhusiwa vinahitajika.');
        // Sector statistics can use January–December; never silently substitute a financial year.
        $yearType = $dataset->reporting_settings['yearType'] ?? 'financial';
        $annuals = ReportingPeriod::whereNull('institution_id')->where('period_type', 'annual')
            ->where('year_type', $yearType)->whereYear('start_date', $startYear)->get();
        abort_unless($annuals->count() === 1, 422, 'MOA hajaandaa reporting year ya aina hii.');
        $annual = $annuals->first();
        if ($frequency === 'annual') {
            return [$annual];
        }
        $periods = ReportingPeriod::where('parent_id', $annual->id)->whereNull('institution_id')
            ->where('period_type', $frequency)->orderBy('start_date')->get();
        abort_if($periods->isEmpty(), 422, 'MOA hajaandaa vipindi vya frequency hii.');

        return $periods->all();
    }

    private function audit(Request $request, ReportingPeriod $period, string $type, ?array $before): void
    {
        AuditEventOccurred::dispatch(new AuditEventData(eventType: $type, userId: $request->user()->id,
            entityType: 'reporting_period', entityId: (string) $period->id, ipAddress: $request->ip(),
            requestId: $request->attributes->get('auditRequestId'), oldValues: $before, newValues: $period->attributesToArray()));
    }
}
