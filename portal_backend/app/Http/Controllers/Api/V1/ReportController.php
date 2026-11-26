<?php

namespace App\Http\Controllers\Api\V1;

use App\DTOs\AuditEventData;
use App\Events\AuditEventOccurred;
use App\Http\Controllers\Controller;
use App\Models\DatasetDefinition;
use App\Models\DatasetReportingCalendar;
use App\Models\Indicator;
use App\Models\ReportingPeriod;
use App\Models\Submission;
use App\Models\User;
use App\Services\ReportAccess;
use Brick\Math\BigDecimal;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class ReportController extends Controller
{
    public const REPORTS = [
        'data-submission' => ['Data Submission Report', 'Submission and workflow', 'Submitted datasets and their reporting status by institution, sector and period.'],
        'submission-compliance' => ['Submission Compliance Report', 'Submission and workflow', 'On-time, late, outstanding and fully compliant reporting obligations.'],
        'outstanding-overdue' => ['Outstanding and Overdue Submissions', 'Submission and workflow', 'Unstarted, draft, returned and overdue reporting obligations.'],
        'approval-turnaround' => ['Approval and Publication Turnaround', 'Submission and workflow', 'Elapsed time and bottlenecks from submission through publication.'],
        'returned-corrections' => ['Returned-for-Correction Report', 'Submission and workflow', 'Return reasons, correction deadlines and resubmission turnaround.'],
        'published-register' => ['Published Data Register', 'Submission and workflow', 'Traceable register of published submission revisions.'],
        'data-quality' => ['Data Quality and Audit Report', 'Submission and workflow', 'Completeness, revision, correction and audit indicators.'],
        'indicator-performance' => ['Indicator Performance Report â€” Viashiria', 'M&E performance', 'Baseline, target, actual, achievement, variance and rating by indicator.'],
        'quarterly-trend' => ['Quarterly Performance and Trend', 'M&E performance', 'Quarterly and cumulative performance across reporting periods.'],
        'strategic-objective' => ['Strategic Objective Performance', 'M&E performance', 'Weighted results under strategic objectives Aâ€“Y.'],
        'organisation-performance' => ['Institution, Department and Unit Performance', 'M&E performance', 'Comparative delivery and financial performance by reporting organisation.'],
        'sector-performance' => ['Sector and Subsector Performance', 'M&E performance', 'Published indicator results by sector and contributing institution.'],
        'target-exceptions' => ['Target Variance and Exception Report', 'M&E performance', 'Underperformance, zero delivery, missing targets and unusual overachievement.'],
        'budget-delivery' => ['Budget Utilisation versus Delivery', 'M&E performance', 'Approved budget, expenditure, physical delivery and composite scores.'],
        'annual-me' => ['Annual Consolidated M&E Report', 'Consolidated annual report', 'Overall, objective, organisation, quarterly, exception and financial sections.'],
    ];

    public function catalog(Request $request): JsonResponse
    {
        $rows = [];
        foreach (self::REPORTS as $slug => [$title, $category, $description]) {
            if (! ReportAccess::canView($request->user(), $slug)) {
                continue;
            }
            $rows[] = ['slug' => $slug, 'title' => $title, 'category' => $category,
                'description' => $description, 'permission' => ReportAccess::permissionFor($slug)];
        }

        return response()->json(['data' => $rows]);
    }

    public function filters(Request $request): JsonResponse
    {
        abort_unless(ReportAccess::canAccessAny($request->user(), array_keys(self::REPORTS)), 403, 'No report access has been assigned to your role.');
        $datasets = $this->scopedDatasets(DatasetDefinition::query(), $request->user())
            ->with(['institution:id,name,code', 'department:id,name', 'sectors'])->get();
        $calendarQuery = DatasetReportingCalendar::query()->whereHas('dataset', fn ($q) => $this->scopedDatasets($q, $request->user()))->with('period.parent');
        $periods = $calendarQuery->get()->map(fn ($c) => ['id' => (int) $c->reporting_period_id, 'label' => $c->period->label,
            'financialYear' => $c->period->parent?->label ?? $c->period->label])->unique('id')->sortBy('label')->values();

        $objectives = Submission::query()->where('status', 'published')->whereNotNull('objective_snapshot')
            ->whereHas('calendar.dataset', fn ($dataset) => $this->scopedDatasets($dataset, $request->user()))
            ->get(['objective_snapshot'])->pluck('objective_snapshot')->unique('objectiveVersionId')->values();

        return response()->json(['data' => [
            'accessScope' => ReportAccess::scope($request->user()),
            'institutions' => $datasets->pluck('institution')->filter()->unique('id')->sortBy('name')->values(),
            'departments' => $datasets->pluck('department')->filter()->unique('id')->sortBy('name')->values(),
            'datasets' => $datasets->map(fn ($d) => ['id' => (int) $d->id, 'datasetName' => $d->dataset_name, 'datasetCode' => $d->dataset_code])->sortBy('datasetName')->values(),
            'sectors' => $datasets->pluck('sectors')->flatten(1)->unique('id')->sortBy('data_value_name_en')->values(),
            'periods' => $periods,
            'financialYears' => $periods->pluck('financialYear')->unique()->sort()->values(),
            'strategicObjectives' => $objectives->pluck('code')->filter()->unique()->sort()->values(),
            'objectiveVersions' => $objectives,
            'frequencies' => ReportingPeriod::TYPES,
        ]]);
    }

    public function show(Request $request, string $type): JsonResponse
    {
        abort_unless(isset(self::REPORTS[$type]), 404, 'Unknown report type.');
        abort_unless(ReportAccess::canView($request->user(), $type), 403, 'Your role does not include this report.');
        $filters = $this->validatedFilters($request);
        $submissions = $this->submissions($request, $filters);
        $operational = in_array($type, ['data-submission', 'submission-compliance', 'outstanding-overdue', 'approval-turnaround', 'returned-corrections', 'published-register', 'data-quality'], true);
        if (! $operational) {
            $submissions = $submissions->where('status', 'published');
            if (isset($filters['strategicObjective'])) {
                $submissions = $submissions->filter(fn ($submission) => ($submission->objective_snapshot['code'] ?? null) === $filters['strategicObjective']);
            }
            // Sector tags alone do not make operational data a sector performance measure.
            if ($type === 'sector-performance') {
                $submissions = $submissions->filter(fn ($submission) => $submission->calendar->dataset->reporting_purpose === 'sector_performance');
            }
            $this->assertNonOverlappingPeriods($submissions);
        }
        $obligations = $operational ? $this->obligations($request, $filters) : collect();
        [$title, $category] = self::REPORTS[$type];
        $payload = match ($type) {
            'data-submission' => $this->dataSubmission($obligations),
            'submission-compliance' => $this->compliance($obligations),
            'outstanding-overdue' => $this->outstanding($obligations),
            'approval-turnaround' => $this->turnaround($submissions),
            'returned-corrections' => $this->returned($submissions),
            'published-register' => $this->published($submissions),
            'data-quality' => $this->quality($submissions),
            'indicator-performance' => $this->indicatorReport($submissions, $filters),
            'quarterly-trend' => $this->trendReport($submissions, $filters),
            'strategic-objective' => $this->objectiveReport($submissions, $filters),
            'organisation-performance' => $this->organisationReport($submissions, $filters),
            'sector-performance' => $this->sectorReport($submissions, $filters),
            'target-exceptions' => $this->exceptionReport($submissions, $filters),
            'budget-delivery' => $this->budgetReport($submissions, $filters),
            'annual-me' => $this->annualReport($submissions, $filters),
        };

        return response()->json(['data' => array_merge(['type' => $type, 'title' => $title, 'category' => $category,
            'generatedAt' => now()->toIso8601String(), 'filters' => $filters, 'rows' => []], $payload)]);
    }

    /** Consolidate published results without changing the existing report calculations. */
    public function executiveOverview(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_unless(ReportAccess::canView($user, 'annual-me')
            && ReportAccess::canView($user, 'sector-performance'), 403, 'Annual M&E and sector performance report access are required.');

        // Require an explicit year so a dashboard cannot silently display all years.
        $request->validate(['financialYear' => ['required', 'string', 'max:80']]);
        $filters = $this->validatedFilters($request);
        $filters['status'] = 'published';
        $submissions = $this->submissions($request, $filters);
        if (isset($filters['strategicObjective'])) {
            $submissions = $submissions->filter(fn ($submission) => ($submission->objective_snapshot['code'] ?? null) === $filters['strategicObjective']);
        }
        $this->assertNonOverlappingPeriods($submissions);

        $performance = $this->performanceRows($submissions, $filters);
        $summary = $this->performanceSummary($performance);
        $annual = $this->annualResults($performance);
        $assessed = $annual->filter(fn ($row) => $row['achievementPercent'] !== null)->count();
        $budget = $this->budgetReport($submissions, $filters);
        $sectorSubmissions = $submissions->filter(fn ($submission) => $submission->calendar->dataset->reporting_purpose === 'sector_performance');
        $sectors = $this->sectorReport($sectorSubmissions, $filters);
        $owners = $submissions->pluck('calendar.dataset.institution')->filter()->keyBy('id');
        $institutions = $performance->groupBy('institutionId')->map(function ($rows, $institutionId) use ($owners) {
            $owner = $owners->get($institutionId);

            return array_merge($this->performanceGroup($rows, 'institutionName', $owner?->name ?? 'Unknown institution'), [
                'institutionId' => (int) $institutionId,
                'institutionCode' => $owner?->code,
            ]);
        })->values();
        $exceptions = $this->exceptionReport($submissions, $filters);

        // Stable dashboard slots. Values remain unavailable until explicit indicator mappings exist.
        $headline = [
            ['key' => 'sector_growth', 'actual' => null, 'unit' => '%', 'previousActual' => null],
            ['key' => 'trade_growth', 'actual' => null, 'unit' => '%', 'previousActual' => null],
            ['key' => 'gdp_share', 'actual' => null, 'unit' => '%', 'target' => null, 'achievementPercent' => null],
            ['key' => 'industrial_licences', 'actual' => null, 'unit' => 'count'],
            ['key' => 'new_industries', 'actual' => null, 'unit' => 'count'],
            ['key' => 'exports_usd', 'actual' => null, 'unit' => 'USD'],
            ['key' => 'companies', 'actual' => null, 'unit' => 'count'],
            ['key' => 'business_licences', 'actual' => null, 'unit' => 'count'],
        ];

        return response()->json(['data' => [
            'type' => 'executive-overview',
            'financialYear' => $filters['financialYear'],
            'generatedAt' => now()->toIso8601String(),
            'accessScope' => ReportAccess::scope($user),
            'filters' => $filters,
            'dataStatus' => $submissions->isEmpty() ? 'no_data' : 'available',
            'summary' => array_merge($summary, [
                'assessedResults' => $assessed,
                'targetsMetPercent' => $assessed === 0 ? null : round($summary['fullyAchieved'] * 100 / $assessed, 2),
                'publishedSubmissions' => $submissions->count(),
                'institutions' => $submissions->pluck('calendar.dataset.institution_id')->filter()->unique()->count(),
                'budgetUtilisationPercent' => $budget['summary']['budgetUtilisationPercent'],
            ]),
            'sectorDataStatus' => $sectorSubmissions->isEmpty() ? 'no_data' : 'available',
            'budget' => $budget['summary'],
            'headline' => $headline,
            'institutions' => $institutions,
            'exceptions' => $exceptions['rows'],
            'sectors' => $sectors['rows']->map(function ($sector) use ($sectorSubmissions) {
                $codes = $sectorSubmissions->filter(function ($submission) use ($sector) {
                    $names = $submission->calendar->dataset->sectors->pluck('data_value_name_en')->filter();

                    return $names->isEmpty() ? $sector['sectorName'] === 'Unassigned sector' : $names->contains($sector['sectorName']);
                })->pluck('calendar.dataset.institution.code')->filter()->unique()->sort()->values();

                // Delivery is target achievement, never economic sector growth.
                // Do not infer a growth indicator from its mutable display name.
                return array_merge($sector, ['institutionCodes' => $codes, 'growthPercent' => null, 'growthStatus' => 'not_configured']);
            })->values(),
        ]]);
    }

    public function indicatorMetadata(Request $request): JsonResponse
    {
        abort_unless(ReportAccess::canView($request->user(), 'indicator-performance'), 403, 'Your role does not include indicator performance reporting.');
        $indicators = $this->visibleIndicators($request->user())->with('unit')->orderBy('name_en')->get()->map(fn ($i) => $this->metadataSnapshot($i))->values();

        return response()->json(['data' => $indicators]);
    }

    public function updateIndicatorMetadata(Request $request, int $id): JsonResponse
    {
        abort_unless(ReportAccess::canView($request->user(), 'indicator-performance'), 403, 'Your role does not include indicator performance reporting.');
        $indicator = $this->visibleIndicators($request->user())->findOrFail($id);
        $data = $request->validate([
            'strategic_objective' => ['sometimes', 'nullable', 'string', 'max:20'],
            'result_level' => ['sometimes', Rule::in(['activity', 'output', 'outcome', 'impact'])],
            'baseline_value' => ['sometimes', 'nullable', 'numeric'],
            'performance_direction' => ['sometimes', Rule::in(['higher', 'lower', ...Indicator::PERFORMANCE_DIRECTIONS])],
            'performance_weight' => ['sometimes', 'numeric', 'min:0.0001', 'max:1000000'],
        ]);
        if (isset($data['performance_direction'])) {
            $data['performance_direction'] = match ($data['performance_direction']) {
                'higher' => 'higher_is_better',
                'lower' => 'lower_is_better',
                default => $data['performance_direction'],
            };
        }
        abort_unless($data !== [], 422, 'Provide at least one metadata field.');
        $actor = $request->user();
        abort_unless($actor->hasRole('MOA') || (int) $indicator->created_by === (int) $actor->id, 403);
        $before = $indicator->attributesToArray();
        $indicator->fill($data);
        if ($indicator->isDirty()) {
            $indicator->save();
            AuditEventOccurred::dispatch(new AuditEventData(
                eventType: 'indicator_me_metadata_updated', userId: $actor->id,
                entityType: 'indicator', entityId: (string) $indicator->id,
                oldValues: $before, newValues: $indicator->attributesToArray(),
                ipAddress: $request->attributes->get('auditIpAddress', $request->ip()),
                requestId: $request->attributes->get('auditRequestId'),
            ));
        }

        return response()->json(['data' => $this->metadataSnapshot($indicator->fresh('unit'))]);
    }

    private function validatedFilters(Request $request): array
    {
        return $request->validate([
            'financialYear' => ['sometimes', 'string', 'max:80'], 'institutionId' => ['sometimes', 'integer', 'min:1'],
            'departmentId' => ['sometimes', 'integer', 'min:1'], 'datasetId' => ['sometimes', 'integer', 'min:1'],
            'sectorId' => ['sometimes', 'integer', 'min:1'], 'reportingPeriodId' => ['sometimes', 'integer', 'min:1'],
            'status' => ['sometimes', 'string', 'max:30'], 'strategicObjective' => ['sometimes', 'string', 'max:20'],
            'groupBy' => ['sometimes', Rule::in(['institution', 'department'])],
            'frequency' => ['sometimes', Rule::in(ReportingPeriod::TYPES)],
        ]);
    }

    private function submissions(Request $request, array $filters): Collection
    {
        $query = Submission::query()
            ->whereHas('calendar.dataset', fn ($dataset) => $this->scopedDatasets($dataset, $request->user()))
            ->with([
                'calendar.dataset.institution', 'calendar.dataset.department', 'calendar.dataset.sectors',
                'calendar.period.parent', 'calendar.responsibleUser', 'values', 'approvals', 'template',
            ]);
        $this->applyFilters($query, $filters, true);

        return $query->orderBy('id')->get();
    }

    private function obligations(Request $request, array $filters): Collection
    {
        $query = DatasetReportingCalendar::query()->whereHas('dataset', fn ($q) => $this->scopedDatasets($q, $request->user()))
            ->with(['dataset.institution', 'dataset.department', 'dataset.sectors', 'period.parent', 'responsibleUser',
                'submission.values.indicator', 'submission.approvals', 'submission.template']);
        $this->applyFilters($query, $filters, false);

        return $query->orderBy('id')->get();
    }

    private function applyFilters(Builder $query, array $filters, bool $submission): void
    {
        $calendar = fn ($callback) => $submission ? $query->whereHas('calendar', $callback) : $callback($query);
        $calendar(function ($q) use ($filters) {
            foreach (['datasetId' => 'dataset_definition_id', 'reportingPeriodId' => 'reporting_period_id'] as $key => $column) {
                if (isset($filters[$key])) {
                    $q->where($column, $filters[$key]);
                }
            }
            foreach (['institutionId' => 'institution_id', 'departmentId' => 'department_id'] as $key => $column) {
                if (isset($filters[$key])) {
                    $q->whereHas('dataset', fn ($d) => $d->where($column, $filters[$key]));
                }
            }
            if (isset($filters['sectorId'])) {
                $q->whereHas('dataset.sectors', fn ($s) => $s->whereKey($filters['sectorId']));
            }
            if (isset($filters['frequency'])) {
                $q->whereHas('period', fn ($period) => $period->where('period_type', $filters['frequency']));
            }
            if (isset($filters['financialYear'])) {
                $q->whereHas('period', function ($p) use ($filters) {
                    $p->where('label', $filters['financialYear'])->orWhereHas('parent', fn ($parent) => $parent->where('label', $filters['financialYear']));
                });
            }
        });
        if ($submission && isset($filters['status'])) {
            $query->where('status', $filters['status']);
        }
    }

    /** Never choose a reporting frequency or discard overlapping financial entries silently. */
    private function assertNonOverlappingPeriods(Collection $submissions): void
    {
        $groups = $submissions->groupBy(fn ($submission) => $submission->calendar->dataset_definition_id.'|'
            .($submission->calendar->period->parent_id ?? $submission->calendar->period->id));
        foreach ($groups as $items) {
            $periods = $items->map(fn ($submission) => $submission->calendar->period);
            if ($periods->pluck('period_type')->unique()->count() > 1) {
                throw ValidationException::withMessages(['frequency' => 'Multiple reporting frequencies exist for a dataset and year. Select one frequency to avoid double counting.']);
            }
            $lastEnd = null;
            foreach ($periods->sortBy('start_date') as $period) {
                if ($lastEnd !== null && $period->start_date->lte($lastEnd)) {
                    throw ValidationException::withMessages(['reportingPeriodId' => 'Selected reporting periods overlap for a dataset and year. Select one reportingPeriodId or correct the overlapping calendars.']);
                }
                $lastEnd = $period->end_date;
            }
        }
    }

    private function objectiveReport(Collection $submissions, array $filters): array
    {
        $performance = $this->performanceRows($submissions, $filters);

        return ['rows' => $this->objectiveGroups($performance), 'summary' => $this->performanceSummary($performance)];
    }

    /** Objective code A may mean different things in different plans or objective versions. */
    private function objectiveGroups(Collection $performance): Collection
    {
        return $performance->groupBy(fn ($row) => $row['objectiveVersionId'] ?? 'unassigned')->map(function ($items) {
            $first = $items->first();

            return $this->performanceGroup($items, 'strategicObjective', $first['strategicObjective'] ?? 'Unassigned objective')
                + ['objectiveVersionId' => $first['objectiveVersionId'], 'objectiveDescription' => $first['objectiveDescription'],
                    'objectiveSnapshot' => $first['objectiveSnapshot'], 'objectiveSnapshotAvailable' => $first['objectiveSnapshotAvailable']];
        })->values();
    }

    private function scopedDatasets(Builder $query, User $user): Builder
    {
        return ReportAccess::scopeDatasets($query, $user);
    }

    private function visibleIndicators(User $user): Builder
    {
        return Indicator::query()->whereHas('datasets', fn ($q) => $this->scopedDatasets($q, $user));
    }

    private function dataSubmission(Collection $obligations): array
    {
        $rows = $obligations->filter(fn ($c) => $c->submission && $c->submission->status !== 'draft')
            ->map(fn ($c) => $this->base($c, $c->submission))->values();

        return ['rows' => $rows, 'summary' => ['returns' => $rows->count(), 'published' => $rows->where('status', 'published')->count(),
            'late' => $rows->where('daysLate', '>', 0)->count()]];
    }

    private function compliance(Collection $obligations): array
    {
        $groups = $obligations->groupBy(fn ($c) => implode('|', [$c->dataset->institution_id, $c->reporting_period_id]));
        $rows = $groups->map(function ($items) {
            $first = $items->first();
            $base = $this->base($first, $first->submission);
            $expected = $items->count();
            $submitted = $items->filter(fn ($c) => $c->submission?->submitted_at !== null);
            $onTime = $submitted->filter(fn ($c) => $this->daysLate($c) === 0)->count();
            $late = $submitted->count() - $onTime;
            $outstanding = $expected - $submitted->count();

            return array_merge($base, ['expectedReturns' => $expected, 'submittedReturns' => $submitted->count(), 'onTimeReturns' => $onTime,
                'lateReturns' => $late, 'outstandingReturns' => $outstanding, 'returnedReturns' => $items->filter(fn ($c) => $c->submission?->status === 'returned')->count(),
                'compliancePercent' => $this->percent($onTime, $expected), 'fullyCompliant' => $outstanding === 0 && $late === 0]);
        })->values();
        $institutions = $rows->groupBy('institutionId');
        $full = $institutions->filter(fn ($rows) => $rows->every('fullyCompliant', true))->count();

        return ['rows' => $rows, 'summary' => ['expectedReturns' => $rows->sum('expectedReturns'), 'onTimeReturns' => $rows->sum('onTimeReturns'),
            'returnCompliancePercent' => $this->percent($rows->sum('onTimeReturns'), $rows->sum('expectedReturns')),
            'institutionalFullCompliancePercent' => $this->percent($full, $institutions->count())]];
    }

    private function outstanding(Collection $obligations): array
    {
        $rows = $obligations->filter(fn ($c) => ! $c->submission || in_array($c->submission->status, ['draft', 'returned'], true))
            ->map(fn ($c) => array_merge($this->base($c, $c->submission), ['responsibleOfficer' => $c->responsibleUser?->name ?? 'Unassigned',
                'daysOverdue' => max(0, CarbonImmutable::now()->startOfDay()->diffInDays($c->period->deadline->copy()->startOfDay(), false) * -1)]))
            ->sortByDesc('daysOverdue')->values();

        return ['rows' => $rows, 'summary' => ['outstanding' => $rows->count(), 'overdue' => $rows->where('daysOverdue', '>', 0)->count(),
            'notStarted' => $rows->where('status', 'not_started')->count()]];
    }

    private function turnaround(Collection $submissions): array
    {
        $rows = $submissions->filter(fn ($s) => $s->submitted_at !== null)->map(function ($s) {
            $review = $s->approvals->firstWhere('action', 'review');
            $approval = $s->approvals->firstWhere('action', 'approve');

            return array_merge($this->base($s->calendar, $s), ['reviewAt' => $review?->acted_at?->toIso8601String(), 'approvedAt' => $approval?->acted_at?->toIso8601String(),
                'reviewHours' => $this->hours($s->submitted_at, $review?->acted_at), 'approvalHours' => $this->hours($review?->acted_at ?? $s->submitted_at, $approval?->acted_at),
                'publicationHours' => $this->hours($s->submitted_at, $s->published_at), 'currentStep' => $s->current_step]);
        })->values();

        return ['rows' => $rows, 'summary' => ['returns' => $rows->count(), 'published' => $rows->where('status', 'published')->count(),
            'averagePublicationHours' => $this->average($rows->pluck('publicationHours')->filter(fn ($v) => $v !== null))]];
    }

    private function returned(Collection $submissions): array
    {
        $rows = $submissions->filter(fn ($s) => $s->approvals->contains('action', 'return'))->map(function ($s) {
            $returns = $s->approvals->where('action', 'return')->values();
            $last = $returns->last();
            $resubmitted = $s->approvals->where('action', 'submitted')->first(fn ($a) => $a->acted_at > $last->acted_at);

            return array_merge($this->base($s->calendar, $s), ['returnCount' => $returns->count(), 'returnedAt' => $last->acted_at?->toIso8601String(),
                'returnReason' => $last->comments, 'correctionDeadline' => $s->correction_deadline?->toDateString(),
                'resubmittedAt' => $resubmitted?->acted_at?->toIso8601String(), 'correctionHours' => $this->hours($last->acted_at, $resubmitted?->acted_at)]);
        })->values();

        return ['rows' => $rows, 'summary' => ['returnedSubmissions' => $rows->count(), 'totalReturns' => $rows->sum('returnCount'),
            'averageCorrectionHours' => $this->average($rows->pluck('correctionHours')->filter(fn ($v) => $v !== null))]];
    }

    private function published(Collection $submissions): array
    {
        $rows = $submissions->where('status', 'published')->map(fn ($s) => $this->base($s->calendar, $s))->values();

        return ['rows' => $rows, 'summary' => ['publishedReturns' => $rows->count(), 'institutions' => $rows->pluck('institutionId')->unique()->count(),
            'datasets' => $rows->pluck('datasetId')->unique()->count()]];
    }

    private function quality(Collection $submissions): array
    {
        $rows = $submissions->map(function ($s) {
            $required = collect($s->template->template_content['indicators'] ?? [])->filter(fn ($i) => ($i['isRequired'] ?? $i['is_required'] ?? true) !== false);
            $requiredIds = $required->pluck('id')->map(fn ($id) => (int) $id);
            $filled = $s->values->filter(fn ($v) => $requiredIds->contains((int) $v->indicator_id)
                && ($v->value_numeric !== null || $v->value_text !== null || $v->value_boolean !== null || $v->value_date !== null));
            $filledCount = $filled->pluck('indicator_id')->unique()->count();
            $missing = max(0, $required->count() - $filledCount);
            $returns = $s->approvals->where('action', 'return')->count();

            return array_merge($this->base($s->calendar, $s), ['requiredIndicators' => $required->count(), 'filledIndicators' => $filledCount,
                'missingIndicators' => $missing, 'completenessPercent' => $this->percent($required->count() - $missing, $required->count()),
                'returnCount' => $returns, 'auditEvents' => $s->approvals->count(), 'qualityFlag' => $missing > 0 ? 'Incomplete' : ($returns > 1 ? 'Repeated corrections' : 'Pass')]);
        })->values();

        return ['rows' => $rows, 'summary' => ['submissionsAssessed' => $rows->count(), 'incomplete' => $rows->where('missingIndicators', '>', 0)->count(),
            'averageCompletenessPercent' => $this->average($rows->pluck('completenessPercent'))]];
    }

    private function indicatorReport(Collection $submissions, array $filters): array
    {
        $rows = $this->performanceRows($submissions, $filters)->values();

        return ['rows' => $rows, 'summary' => $this->performanceSummary($rows)];
    }

    private function trendReport(Collection $submissions, array $filters): array
    {
        $rows = $this->performanceRows($submissions, $filters)->sortBy(fn ($r) => [$r['datasetId'], $r['indicatorId'], $r['startDate']])->values();
        $cumulative = [];
        $rows = $rows->map(function ($row) use (&$cumulative) {
            $key = $this->seriesIdentity($row);
            $cumulative[$key][] = $row;
            $summary = $this->summarizeSeries(collect($cumulative[$key]));

            return array_merge($row, [
                'cumulativeActual' => $summary['actual'],
                'cumulativeTarget' => $summary['target'],
                'cumulativeTargetStatus' => $summary['targetStatus'],
                'cumulativeBaseline' => $summary['baseline'],
                'cumulativeBaselineStatus' => $summary['baselineStatus'],
                'cumulativeAchievementPercent' => $summary['achievementPercent'],
                'reportedPeriods' => $summary['reportedPeriods'],
                'expectedPeriods' => $summary['expectedPeriods'],
                'complete' => $summary['complete'],
            ]);
        })->values();

        return ['rows' => $rows, 'summary' => $this->performanceSummary($rows)];
    }

    private function groupedReport(Collection $submissions, array $filters, string $key, string $fallback): array
    {
        $performance = $this->performanceRows($submissions, $filters);
        $rows = $performance->groupBy(fn ($r) => $r[$key] ?: $fallback)->map(fn ($items, $label) => $this->performanceGroup($items, $key, $label))->values();

        return ['rows' => $rows, 'summary' => $this->performanceSummary($performance)];
    }

    private function organisationReport(Collection $submissions, array $filters): array
    {
        $key = ($filters['groupBy'] ?? 'institution') === 'department' ? 'departmentName' : 'institutionName';

        return $this->groupedReport($submissions, $filters, $key, $key === 'departmentName' ? 'No department / institution level' : 'Unknown institution');
    }

    private function sectorReport(Collection $submissions, array $filters): array
    {
        $performance = $this->performanceRows($submissions, $filters);
        $expanded = $performance->flatMap(function ($row) {
            $sectors = $row['sectors'] ?: ['Unassigned sector'];

            return collect($sectors)->map(fn ($sector) => array_merge($row, ['sectorName' => $sector]));
        });
        $rows = $expanded->groupBy('sectorName')->map(fn ($items, $label) => $this->performanceGroup($items, 'sectorName', $label))->values();

        return ['rows' => $rows, 'summary' => $this->performanceSummary($performance)];
    }

    private function exceptionReport(Collection $submissions, array $filters): array
    {
        $performance = $this->performanceRows($submissions, $filters);
        $rows = $performance->filter(function ($r) {
            $zeroDelivery = $r['actual'] == 0 && in_array($r['direction'], ['higher', 'higher_is_better'], true);

            return $r['target'] === null || $r['actual'] === null || $zeroDelivery || ($r['achievementPercent'] !== null && ($r['achievementPercent'] < 70 || $r['achievementPercent'] > 120));
        })->map(function ($r) {
            $zeroDelivery = $r['actual'] == 0 && in_array($r['direction'], ['higher', 'higher_is_better'], true);
            $r['exceptionType'] = $r['target'] === null ? 'Missing target' : ($r['actual'] === null ? 'Missing actual' : ($zeroDelivery ? 'Zero delivery' : ($r['achievementPercent'] > 120 ? 'Overachievement' : 'Underperformance')));

            return $r;
        })->values();

        return ['rows' => $rows, 'summary' => array_merge($this->performanceSummary($performance), ['exceptions' => $rows->count()])];
    }

    private function budgetReport(Collection $submissions, array $filters): array
    {
        $performance = $this->performanceRows($submissions, $filters)->groupBy('submissionId');
        // Financial entries belong to the submission, even when no numeric indicator is present.
        $rows = $submissions->where('status', 'published')->map(function ($submission) use ($performance) {
            $delivery = $this->weightedAverage($performance->get($submission->id, collect()));
            $row = array_merge($this->base($submission->calendar, $submission), $this->financialRow($submission));
            $utilisation = $row['budgetScope'] === 'annual' ? $this->percent($row['actualExpenditure'], $row['approvedBudget']) : null;

            return array_merge($row, ['deliveryPercent' => $delivery,
                'budgetUtilisationPercent' => $utilisation,
                'deliveryExpenditureGap' => $delivery !== null && $utilisation !== null ? round($delivery - $utilisation, 2) : null,
                'compositeScore' => $delivery !== null && $utilisation !== null ? round(0.8 * $delivery + 0.2 * $utilisation, 2) : null,
                'receivedUtilisationPercent' => $this->percent($row['actualExpenditure'], $row['actualReceived']),
                'financialDataStatus' => $row['approvedBudget'] === null && $row['actualReceived'] === null && $row['actualExpenditure'] === null ? 'Missing financial data' : 'Available']);
        })->values();

        return ['rows' => $rows, 'summary' => array_merge([
            'submissions' => $rows->count(), 'withFinancialData' => $rows->where('financialDataStatus', 'Available')->count(),
        ], $this->financialSummary($rows))];
    }

    private function financialRow(Submission $submission): array
    {
        $snapshot = $submission->annual_budget_snapshot;

        return ['reportingYearId' => (int) ($submission->calendar->period->parent_id ?? $submission->calendar->period->id),
            'budgetScope' => $snapshot === null ? 'legacy_period' : 'annual',
            'approvedBudget' => $snapshot === null ? $submission->approved_budget : ($snapshot['approvedBudget'] ?? null),
            'actualReceived' => $submission->actual_received, 'actualExpenditure' => $submission->actual_expenditure];
    }

    /** Sum period cash flows once per submission and approved budget once per dataset/year. */
    private function financialSummary(Collection $rows): array
    {
        $periods = $rows->unique('submissionId');
        $budgets = $periods->where('budgetScope', 'annual')->whereNotNull('approvedBudget')
            ->unique(fn ($row) => $row['datasetId'].':'.$row['reportingYearId']);
        $approved = $this->moneySum($budgets, 'approvedBudget');
        $received = $this->moneySum($periods, 'actualReceived');
        $spent = $this->moneySum($periods, 'actualExpenditure');
        $comparable = $periods->every(fn ($row) => $row['budgetScope'] === 'annual' && $row['approvedBudget'] !== null && $row['actualExpenditure'] !== null);

        return ['approvedBudget' => $approved, 'actualReceived' => $received, 'actualExpenditure' => $spent,
            'budgetUtilisationPercent' => $comparable ? $this->percent($spent === null ? null : (float) $spent, $approved === null ? null : (float) $approved) : null,
            'receivedUtilisationPercent' => $periods->every(fn ($row) => $row['actualReceived'] !== null && $row['actualExpenditure'] !== null)
                ? $this->percent($spent === null ? null : (float) $spent, $received === null ? null : (float) $received) : null,
            'annualBudgetCount' => $budgets->count(), 'legacyBudgetSubmissions' => $periods->where('budgetScope', 'legacy_period')->count()];
    }

    private function moneySum(Collection $rows, string $field): ?string
    {
        $values = $rows->pluck($field)->filter(fn ($value) => $value !== null);
        if ($values->isEmpty()) {
            return null;
        }
        $total = BigDecimal::of('0.00');
        foreach ($values as $value) {
            $total = $total->plus((string) $value);
        }

        return (string) $total->toScale(2);
    }

    private function annualReport(Collection $submissions, array $filters): array
    {
        $performance = $this->performanceRows($submissions, $filters);
        $objectives = $this->objectiveGroups($performance);
        $institutions = $performance->groupBy('institutionName')->map(fn ($items, $label) => $this->performanceGroup($items, 'institutionName', $label))->values();
        $budget = $this->budgetReport($submissions, $filters);
        $exceptions = $this->exceptionReport($submissions, $filters);
        $trend = $this->trendReport($submissions, $filters);
        $narratives = $submissions->where('status', 'published')->map(fn ($s) => array_merge($this->base($s->calendar, $s), [
            'achievements' => $s->achievements, 'implementationChallenges' => $s->implementation_challenges,
            'correctiveActions' => $s->corrective_actions, 'meComments' => $s->me_comments]))->filter(fn ($r) => $r['achievements'] || $r['implementationChallenges'] || $r['correctiveActions'] || $r['meComments'])->values();

        return ['rows' => $objectives, 'summary' => array_merge($this->performanceSummary($performance), ['publishedSubmissions' => $submissions->where('status', 'published')->count(),
            'institutions' => $institutions->count(), 'budgetUtilisationPercent' => $budget['summary']['budgetUtilisationPercent']]),
            'sections' => ['objectives' => $objectives, 'institutions' => $institutions, 'quarterlyTrend' => $trend['rows'],
                'exceptions' => $exceptions['rows'], 'budgetSummary' => $budget['summary'], 'budgetDelivery' => $budget['rows'], 'narratives' => $narratives]];
    }

    private function performanceRows(Collection $submissions, array $filters): Collection
    {
        return $submissions->where('status', 'published')->flatMap(function ($s) use ($filters) {
            $base = $this->base($s->calendar, $s);
            $metadata = collect($s->template->template_content['indicators'] ?? [])->keyBy('id');
            $objective = $s->objective_snapshot;

            return $s->values->groupBy('indicator_id')->map(function ($values, $indicatorId) use ($s, $base, $filters, $metadata, $objective) {
                $indicator = $metadata->get($indicatorId);
                if (isset($filters['strategicObjective']) && ($objective['code'] ?? null) !== $filters['strategicObjective']) {
                    return null;
                }
                $numeric = $values->filter(fn ($v) => $v->value_numeric !== null);
                $aggregation = $indicator['aggregation_rule'] ?? 'none';
                $actual = $indicator === null ? null : $this->aggregate($numeric->pluck('value_numeric'), $aggregation);
                $period = $s->calendar->period;
                $year = $period->parent ?? $period;
                $yearId = $year->id;
                $days = (int) $year->start_date->diffInDays($year->end_date) + 1;
                $expectedPeriods = match ($period->period_type) {
                    'annual' => 1, 'quarterly' => 4, 'semiannual' => 2, 'monthly' => 12,
                    'weekly' => (int) ceil($days / 7), default => $days,
                };
                // Only the target actually captured at submission time may describe historical performance.
                $targetSnapshot = collect($s->annual_targets_snapshot ?? [])->first(fn ($entry) => (int) ($entry['indicatorId'] ?? 0) === (int) $indicatorId
                    && (int) ($entry['reportingYearId'] ?? 0) === (int) $yearId);
                $target = isset($targetSnapshot['targetValue']) ? (float) $targetSnapshot['targetValue'] : null;
                $direction = $indicator === null ? 'neutral' : ($indicator['performance_direction'] ?? 'higher_is_better');
                $baseline = isset($targetSnapshot['baselineValue']) ? (float) $targetSnapshot['baselineValue'] : null;
                $achievement = $this->achievement($actual, $target, $direction, $baseline);

                $signature = [$indicatorId, $indicator['data_type'] ?? null, $indicator['unit_id'] ?? null,
                    $indicator['unit'] ?? null, $aggregation, $direction, $indicator['description_en'] ?? null, $indicator['description_sw'] ?? null];

                return array_merge($base, ['indicatorId' => (int) $indicatorId, 'indicatorCode' => $indicator['indicator_code'] ?? null,
                    'indicatorName' => $indicator['name_en'] ?? null, 'indicatorNameSw' => $indicator['name_sw'] ?? null,
                    'unit' => $indicator['unit']['data_value_name_en'] ?? null,
                    'templateVersionId' => (int) $s->template_version_id, 'metadataSnapshotAvailable' => $indicator !== null,
                    'seriesKey' => $indicatorId.'-'.substr(hash('sha256', json_encode($signature, JSON_THROW_ON_ERROR)), 0, 12),
                    'strategicObjective' => $objective['code'] ?? null, 'objectiveVersionId' => $objective['objectiveVersionId'] ?? null,
                    'objectiveDescription' => $objective['description'] ?? null, 'objectiveSnapshot' => $objective,
                    'objectiveSnapshotAvailable' => $objective !== null, 'resultLevel' => $indicator['result_level'] ?? null,
                    'baseline' => $baseline,
                    'expectedPeriods' => $expectedPeriods,
                    'targetScope' => 'annual', 'targetSnapshotAvailable' => $s->annual_targets_snapshot !== null,
                    'targetStatus' => $target === null ? 'not_available' : 'available',
                    'target' => $target, 'actual' => $actual, 'achievementPercent' => $achievement,
                    'valueVariance' => $actual !== null && $target !== null ? round($actual - $target, 6) : null,
                    'achievementVariance' => $achievement === null ? null : round($achievement - 100, 2),
                    'rating' => $this->rating($achievement), 'direction' => $direction, 'aggregationRule' => $aggregation, 'weight' => (float) ($indicator['performance_weight'] ?? 1),
                    ...$this->financialRow($s),

                    'achievements' => $s->achievements, 'implementationChallenges' => $s->implementation_challenges,
                    'correctiveActions' => $s->corrective_actions, 'meComments' => $s->me_comments]);
            })->filter();
        });
    }

    private function performanceGroup(Collection $items, string $key, string $label): array
    {
        $uniqueSubmissions = $items->unique('submissionId');
        $financial = $this->financialSummary($uniqueSubmissions);
        $utilisation = $financial['budgetUtilisationPercent'];
        $delivery = $this->weightedAverage($items);
        $annual = $this->annualResults($items);

        return [$key => $label, 'indicators' => $items->pluck('indicatorId')->unique()->count(), 'submissions' => $uniqueSubmissions->count(),
            'institutions' => $items->pluck('institutionId')->unique()->count(), 'deliveryPercent' => $delivery,
            'fullyAchieved' => $annual->filter(fn ($r) => $r['achievementPercent'] !== null && $r['achievementPercent'] >= 100)->count(),
            'underperforming' => $annual->filter(fn ($r) => $r['achievementPercent'] !== null && $r['achievementPercent'] < 70)->count(),
            ...$financial,
            'deliveryExpenditureGap' => $delivery !== null && $utilisation !== null ? round($delivery - $utilisation, 2) : null,
            'compositeScore' => $delivery !== null && $utilisation !== null ? round(0.8 * $delivery + 0.2 * $utilisation, 2) : null,
            'rating' => $this->rating($delivery)];
    }

    private function performanceSummary(Collection $rows): array
    {
        $annual = $this->annualResults($rows);

        return ['indicators' => $rows->pluck('indicatorId')->unique()->count(), 'submissions' => $rows->pluck('submissionId')->unique()->count(),
            'deliveryPercent' => $this->weightedAverage($rows), 'fullyAchieved' => $annual->filter(fn ($r) => $r['achievementPercent'] !== null && $r['achievementPercent'] >= 100)->count(),
            'underperforming' => $annual->filter(fn ($r) => $r['achievementPercent'] !== null && $r['achievementPercent'] < 70)->count()];
    }

    private function base(DatasetReportingCalendar $calendar, ?Submission $submission): array
    {
        $dataset = $calendar->dataset;
        $period = $calendar->period;

        return ['calendarId' => (int) $calendar->id, 'submissionId' => $submission?->id, 'reference' => $submission?->reference,
            'datasetId' => (int) $dataset->id, 'datasetCode' => $dataset->dataset_code, 'datasetName' => $dataset->dataset_name,
            'institutionId' => (int) $dataset->institution_id, 'institutionName' => $dataset->institution?->name ?? 'Unknown institution',
            'departmentId' => $dataset->department_id === null ? null : (int) $dataset->department_id, 'departmentName' => $dataset->department?->name,
            'sectors' => $dataset->sectors->map(fn ($s) => $s->data_value_name_en)->filter()->values()->all(),
            'financialYear' => $period->parent?->label ?? $period->label, 'reportingPeriodId' => (int) $period->id,
            'periodLabel' => $period->label, 'periodType' => $period->period_type, 'quarter' => $period->quarter ?? $period->period_number,
            'startDate' => $period->start_date->toDateString(), 'deadline' => $period->deadline->toDateString(),
            'status' => $submission?->status ?? 'not_started', 'revision' => $submission?->revision ?? 0,
            'submittedAt' => $submission?->submitted_at?->toIso8601String(), 'publishedAt' => $submission?->published_at?->toIso8601String(),
            'daysLate' => $submission ? $this->daysLate($calendar) : null];
    }

    private function onlyBase(array $row): array
    {
        return array_intersect_key($row, array_flip(['calendarId', 'submissionId', 'reference', 'datasetId', 'datasetCode', 'datasetName',
            'institutionId', 'institutionName', 'departmentId', 'departmentName', 'sectors', 'financialYear', 'reportingPeriodId',
            'periodLabel', 'periodType', 'quarter', 'startDate', 'deadline', 'status', 'revision', 'submittedAt', 'publishedAt', 'daysLate']));
    }

    private function daysLate(DatasetReportingCalendar $calendar): ?int
    {
        $submitted = $calendar->submission?->submitted_at;
        if (! $submitted) {
            return null;
        }

        return max(0, $calendar->period->deadline->copy()->startOfDay()->diffInDays($submitted->copy()->startOfDay(), false));
    }

    private function hours($from, $to): ?float
    {
        return $from && $to ? round($from->diffInRealMinutes($to) / 60, 2) : null;
    }

    private function aggregate(Collection $values, string $rule): ?float
    {
        $values = $values->filter(fn ($value) => $value !== null)->map(fn ($value) => (float) $value)->values();
        if ($values->isEmpty()) {
            return null;
        }

        return match ($rule) {
            'average' => round($values->avg(), 6),
            'min' => (float) $values->min(),
            'max' => (float) $values->max(),
            'latest' => (float) $values->last(),
            'sum' => (float) $values->sum(),
            default => $values->count() === 1 ? (float) $values->first() : null,
        };
    }

    private function achievement(?float $actual, ?float $target, string $direction, ?float $baseline = null): ?float
    {
        if ($actual === null || $target === null || $direction === 'neutral') {
            return null;
        }
        if (in_array($direction, ['lower', 'lower_is_better'], true)) {
            // Never invent a baseline or divide by a zero/negative planned reduction.
            return $baseline !== null && $baseline > $target
                ? round(($baseline - $actual) / ($baseline - $target) * 100, 2)
                : null;
        }
        if ($target <= 0.0 || $actual < 0.0) {
            return null;
        }

        return round($actual / $target * 100, 2);
    }

    private function rating(?float $achievement): string
    {
        if ($achievement === null) {
            return 'Not assessed';
        }
        if ($achievement > 100) {
            return 'Exceeded';
        }
        if ($achievement >= 71) {
            return 'High';
        }
        if ($achievement >= 40) {
            return 'Moderate';
        }
        if ($achievement >= 26) {
            return 'Low';
        }

        return 'Very Low';
    }

    /** Keep incompatible templates, objectives and reporting years out of the same annual result. */
    private function seriesIdentity(array $row): string
    {
        return implode('|', [$row['datasetId'], $row['seriesKey'], $row['reportingYearId'],
            $row['periodType'], $row['objectiveVersionId'] ?? 'unassigned']);
    }

    private function annualResults(Collection $rows): Collection
    {
        return $rows->groupBy(fn ($row) => $this->seriesIdentity($row))
            ->map(fn ($items) => $this->summarizeSeries($items))->values();
    }

    /** Aggregate observations before calculating achievement against one frozen annual target. */
    private function summarizeSeries(Collection $rows): array
    {
        $rows = $rows->unique('submissionId')->sortBy('startDate')->values();
        $last = $rows->last();
        $values = $rows->pluck('actual')->filter(fn ($value) => $value !== null);
        $expected = $last['expectedPeriods'];
        $complete = $values->count() === $expected;
        $rule = $last['aggregationRule'];
        $actual = $this->aggregate($values, $rule);
        if ($rule === 'none' && (! $complete || $expected !== 1)) {
            $actual = null;
        }

        // Never select one of several conflicting frozen targets/baselines.
        $snapshots = [];
        foreach (['target', 'baseline'] as $field) {
            $numbers = $rows->pluck($field)->map(fn ($value) => $value === null
                ? null : (string) BigDecimal::of((string) $value)->toScale(6))->uniqueStrict();
            $status = $numbers->count() > 1 ? 'inconsistent_snapshots'
                : ($numbers->first() === null ? 'not_available' : 'available');
            if ($field === 'target' && $numbers->containsStrict(null) && $numbers->filter(fn ($value) => $value !== null)->count() < 2) {
                $status = 'not_available';
            }
            $snapshots[$field] = $status === 'available' ? (float) $numbers->first() : null;
            $snapshots[$field.'Status'] = $status;
        }
        // Partial sums/latest observations show progress; incomplete averages/extrema do not represent a year.
        $comparable = $complete || in_array($rule, ['sum', 'latest'], true);
        $achievement = $comparable
            ? $this->achievement($actual, $snapshots['target'], $last['direction'], $snapshots['baseline'])
            : null;

        return array_merge($last, $snapshots, ['actual' => $actual, 'achievementPercent' => $achievement,
            'reportedPeriods' => $values->count(), 'expectedPeriods' => $expected, 'complete' => $complete]);
    }

    private function weightedAverage(Collection $rows): ?float
    {
        $valid = $this->annualResults($rows)->filter(fn ($r) => $r['achievementPercent'] !== null);
        if (! $valid->count()) {
            return null;
        }
        $weight = $valid->sum(fn ($r) => $r['weight'] ?? 1);

        return $weight > 0 ? round($valid->sum(fn ($r) => $r['achievementPercent'] * ($r['weight'] ?? 1)) / $weight, 2) : null;
    }

    private function percent($part, $whole): ?float
    {
        return $part === null || $whole === null || (float) $whole == 0.0 ? null : round((float) $part / (float) $whole * 100, 2);
    }

    private function average(Collection $values): ?float
    {
        return $values->count() ? round($values->avg(), 2) : null;
    }

    private function metadataSnapshot(Indicator $indicator): array
    {
        return ['id' => (int) $indicator->id, 'indicatorCode' => $indicator->indicator_code, 'nameEn' => $indicator->name_en,
            'nameSw' => $indicator->name_sw, 'unit' => $indicator->unit?->data_value_name_en,
            'strategicObjective' => $indicator->strategic_objective, 'resultLevel' => $indicator->result_level,
            'baselineValue' => $indicator->baseline_value, 'performanceDirection' => $indicator->performance_direction,
            'performanceWeight' => $indicator->performance_weight, 'aggregationRule' => $indicator->aggregation_rule];
    }
}
