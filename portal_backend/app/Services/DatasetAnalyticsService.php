<?php

namespace App\Services;

use App\Models\DatasetDefinition;
use App\Models\DatasetReportingCalendar;
use App\Models\Department;
use App\Models\Institution;
use App\Models\ReportingPeriod;
use App\Models\Submission;
use App\Models\User;
use Brick\Math\BigDecimal;
use Brick\Math\RoundingMode;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Validation\ValidationException;

class DatasetAnalyticsService
{
    /** Scope is enforced before both browsing and reading individual dataset IDs. */
    private function visibleDatasets(User $user): Builder
    {
        abort_unless($user->is_active && $user->status === 'active', 403);
        $query = DatasetDefinition::query()->whereHas('institution')
            ->whereIn('id', DatasetReportingCalendar::whereIn('id', $this->published()->select('reporting_calendar_id'))
                ->select('dataset_definition_id'));

        // Cross-organisation preview is reserved for active MIT users, including departmental DDOs.
        if ($user->canDo('analytics.view.published')) {
            abort_unless($user->institution?->code === 'MIT' && $user->institution->is_active
                && $user->institution->status === 'active', 403);

            return $query;
        }
        if ($user->canDo('analytics.view.ministry')) {
            abort_unless($user->institution?->code === 'MIT' && $user->institution->is_active
                && $user->institution->status === 'active', 403);

            return $query;
        }
        abort_unless($user->canDo('analytics.view.institution') || $user->canDo('analytics.view.own'), 403);
        abort_unless($user->institution_id !== null && $user->institution?->is_active
            && $user->institution->status === 'active', 403);
        $query->where('institution_id', $user->institution_id);
        if ($user->hasRole('DDO') && ! $user->canDo('analytics.view.institution')) {
            abort_unless($user->department_id !== null, 403);
        }
        if (! $user->canDo('analytics.view.institution') && $user->department_id !== null) {
            $query->where('department_id', $user->department_id);
        }

        return $query;
    }

    private function published(): Builder
    {
        return Submission::where('status', 'published')->whereNotNull('published_at');
    }

    private function datasetSubmissions(int $datasetId): Builder
    {
        return $this->published()->whereHas('calendar', fn ($query) => $query->where('dataset_definition_id', $datasetId));
    }

    public function organisations(User $user, array $filters): array
    {
        $datasets = $this->visibleDatasets($user);
        $department = $filters['type'] === 'department';
        $column = $department ? 'department_id' : 'institution_id';
        $organisations = $department ? Department::query() : Institution::query();
        // Ministry departments appear under their own tab, not as subordinate institutions.
        if (! $department) {
            $datasets->whereNull('department_id');
        }
        $counts = (clone $datasets)->select($column)->selectRaw('COUNT(*) AS total')->groupBy($column);
        $page = $organisations->whereIn('id', (clone $datasets)->select($column))
            ->when(isset($filters['search']), fn ($query) => $query->where(fn ($q) => $q
                ->where('name', 'like', '%'.$filters['search'].'%')->orWhere('code', 'like', '%'.$filters['search'].'%')))
            ->orderBy('name')->orderBy('id')->paginate($filters['perPage'] ?? 25);
        $totals = $counts->pluck('total', $column);
        $page->setCollection($page->getCollection()->map(fn ($row) => [
            'id' => $row->id, 'name' => $row->name, 'code' => $row->code,
            'publishedDatasetCount' => (int) ($totals[$row->id] ?? 0),
        ]));

        return $page->toArray();
    }

    public function datasets(User $user, array $filters): array
    {
        $query = $this->visibleDatasets($user);
        foreach (['institutionId' => 'institution_id', 'departmentId' => 'department_id', 'reportingPurpose' => 'reporting_purpose'] as $key => $column) {
            if (isset($filters[$key])) {
                $query->where($column, $filters[$key]);
            }
        }
        $page = $query->orderBy('id')->paginate($filters['perPage'] ?? 25);
        // Fetch only the latest published snapshot for each page, never a newer draft definition.
        $latestIds = $this->published()->join('dataset_reporting_calendars', 'dataset_reporting_calendars.id', '=', 'submissions.reporting_calendar_id')
            ->whereIn('dataset_reporting_calendars.dataset_definition_id', $page->getCollection()->pluck('id'))
            ->selectRaw('MAX(submissions.id) AS id')->groupBy('dataset_reporting_calendars.dataset_definition_id')->pluck('id');
        $latest = $this->published()->whereIn('id', $latestIds)->with(['template', 'calendar'])->get()
            ->keyBy(fn ($submission) => $submission->calendar->dataset_definition_id);
        $page->setCollection($page->getCollection()->map(function ($dataset) use ($latest) {
            $submission = $latest[$dataset->id];
            $template = $submission->template->template_content;

            return ['id' => $dataset->id, 'datasetCode' => $template['datasetCode'] ?? $dataset->dataset_code,
                'datasetName' => $template['datasetName'] ?? null, 'institutionId' => $dataset->institution_id,
                'departmentId' => $dataset->department_id,
                'reportingPurpose' => $template['reportingPurpose'] ?? 'operational',
                'sectors' => $template['sectors'] ?? [], 'publishedAt' => $submission->published_at->toIso8601String()];
        }));

        return $page->toArray();
    }

    public function options(User $user, int $datasetId): array
    {
        $this->visibleDatasets($user)->findOrFail($datasetId);
        $periods = ReportingPeriod::whereIn('id', DatasetReportingCalendar::whereIn('id',
            $this->datasetSubmissions($datasetId)->select('reporting_calendar_id'))->select('reporting_period_id'))
            ->with('parent')->orderBy('start_date')->get();
        $years = [];
        foreach ($periods as $period) {
            $year = $period->period_type === 'annual' ? $period : $period->parent;
            if ($year === null) {
                continue;
            }
            $years[$year->id] ??= ['id' => $year->id, 'label' => $year->label, 'yearType' => $year->year_type, 'frequencies' => []];
            $years[$year->id]['frequencies'][] = $period->period_type;
            $years[$year->id]['frequencies'] = array_values(array_unique($years[$year->id]['frequencies']));
        }

        return ['datasetId' => $datasetId, 'years' => array_values($years)];
    }

    public function analyse(User $user, int $datasetId, array $filters): array
    {
        $dataset = $this->visibleDatasets($user)->findOrFail($datasetId);
        $year = ReportingPeriod::whereNull('institution_id')->where('period_type', 'annual')->findOrFail($filters['reportingYearId']);
        // Selecting exactly one frequency avoids counting annual totals alongside their quarters.
        $periods = ReportingPeriod::whereNull('institution_id')->where('period_type', $filters['frequency'])
            ->where(fn ($q) => $q->where('id', $year->id)->orWhere('parent_id', $year->id))
            ->orderBy('start_date')->orderBy('id')->get();
        $submissions = $this->datasetSubmissions($datasetId)->whereHas('calendar', fn ($q) => $q->whereIn('reporting_period_id', $periods->pluck('id')))
            ->with(['calendar', 'template', 'values'])->get()->keyBy(fn ($s) => $s->calendar->reporting_period_id);
        $series = [];
        $periodRows = [];
        $datasetSnapshot = null;
        foreach ($periods as $period) {
            $submission = $submissions->get($period->id);
            $periodRows[] = ['id' => $period->id, 'label' => $period->label, 'startDate' => $period->start_date->toDateString(),
                'periodNumber' => $this->periodNumber($period, $year),
                'endDate' => $period->end_date->toDateString(), 'published' => $submission !== null,
                'submissionId' => $submission?->id];
            if ($submission === null) {
                continue;
            }
            $template = $submission->template->template_content;
            $datasetSnapshot = $template;
            $rowsByIndicator = $submission->values->groupBy('indicator_id');
            foreach ($template['indicators'] ?? [] as $indicator) {
                // Do not aggregate across a type/unit/rule change under the same indicator ID.
                $signature = [$indicator['id'], $indicator['data_type'], $indicator['unit_id'] ?? null,
                    $indicator['aggregation_rule'] ?? 'none', $indicator['performance_direction'] ?? 'higher_is_better',
                    $indicator['description_en'] ?? null, $indicator['description_sw'] ?? null];
                $key = $indicator['id'].'-'.substr(hash('sha256', json_encode($signature)), 0, 12);
                $series[$key] ??= ['seriesKey' => $key, 'indicatorId' => $indicator['id'],
                    'name' => $indicator['name_en'], 'dataType' => $indicator['data_type'],
                    'unit' => $indicator['unit'] ?? null, 'aggregationRule' => $indicator['aggregation_rule'] ?? 'none',
                    'performanceDirection' => $indicator['performance_direction'] ?? 'higher_is_better',
                    'points' => []];
                $rows = $rowsByIndicator->get($indicator['id'], collect());
                $total = $rows->count() === 1 && empty($rows->first()->dimension_values) ? $rows->first()->input()['value'] : null;
                $target = collect($submission->annual_targets_snapshot ?? [])->first(fn ($t) => (int) $t['indicatorId'] === (int) $indicator['id']
                    && (int) $t['reportingYearId'] === (int) $year->id);
                $dimensions = collect($template['dimensions'] ?? [])->filter(fn ($d) => empty($d['indicatorIds']) || in_array($indicator['id'], $d['indicatorIds'], true))->values()->all();
                $series[$key]['points'][] = [
                    'periodId' => $period->id, 'label' => $period->label, 'submissionId' => $submission->id,
                    'templateVersionId' => $submission->template_version_id, 'indicatorName' => $indicator['name_en'],
                    'publishedAt' => $submission->published_at->toIso8601String(),
                    'value' => $total, 'status' => $total !== null ? 'present' : ($rows->isEmpty() ? 'missing' : 'dimensional_rows'),
                    'annualTarget' => $target['targetValue'] ?? null, 'baselineValue' => $target['baselineValue'] ?? null,
                    'targetSnapshotAvailable' => $submission->annual_targets_snapshot !== null,
                    'rows' => $rows->map->input()->values()->all(), 'dimensions' => $dimensions,
                ];
            }
        }
        $results = [];
        foreach ($series as $entry) {
            $points = collect($entry['points'])->keyBy('periodId');
            $entry['points'] = $periods->map(fn ($period) => $points->get($period->id) ?? [
                'periodId' => $period->id, 'label' => $period->label, 'value' => null,
                'status' => $submissions->has($period->id) ? 'not_in_template' : 'not_published',
                'rows' => [], 'dimensions' => [], 'annualTarget' => null, 'baselineValue' => null, 'targetSnapshotAvailable' => false,
            ])->all();
            $numeric = in_array($entry['dataType'], ['integer', 'decimal'], true);
            $previous = null;
            foreach ($entry['points'] as &$point) {
                $point['breakdownCharts'] = $this->breakdownCharts($point, $numeric);
                $point['change'] = null;
                $point['changePercent'] = null;
                if ($numeric && $previous !== null && $point['value'] !== null) {
                    $delta = BigDecimal::of($point['value'])->minus($previous);
                    $point['change'] = (string) $delta;
                    // Growth from a non-positive base has no unambiguous percentage interpretation.
                    if (BigDecimal::of($previous)->isPositive()) {
                        $point['changePercent'] = $this->percentage((string) $delta, (string) $previous);
                    }
                }
                $previous = $point['value'];
            }
            unset($point);
            $entry['summary'] = $this->summary($entry, $periods->count(), $numeric);
            $entry['chartType'] = $numeric ? 'line' : 'table';
            // Keep chartType for existing clients; new clients use the data-aware recommendation.
            $observations = count(array_filter($entry['points'], fn ($point) => $point['value'] !== null));
            $entry['recommendedChart'] = ! $numeric || $observations === 0 ? 'table' : ($observations > 1 ? 'line' : 'bar');
            $entry['availableCharts'] = ! $numeric || $observations === 0 ? ['table'] : ($observations > 1 ? ['line', 'bar', 'table'] : ['bar', 'table']);
            $entry['chartReason'] = ! $numeric ? 'non_numeric' : ($observations === 0 ? 'no_scalar_values' : ($observations > 1 ? 'time_series' : 'single_observation'));
            $results[] = $entry;
        }

        return ['datasetId' => $dataset->id, 'datasetName' => $datasetSnapshot['datasetName'] ?? null,
            'reportingPurpose' => $datasetSnapshot['reportingPurpose'] ?? 'operational',
            'sourceDescription' => $datasetSnapshot['sourceDescription'] ?? null,
            'reportingYear' => ['id' => $year->id, 'label' => $year->label, 'yearType' => $year->year_type],
            'frequency' => $filters['frequency'], 'publishedPeriods' => $submissions->count(),
            'expectedPeriods' => $periods->count(), 'periods' => $periodRows, 'indicators' => $results,
            'notes' => ['Published values only.', 'Annual targets are not quarterly targets.',
                'Missing data is not zero. Dimensions use the published template.', 'No sector-wide consolidation is performed.']];
    }

    /**
     * Each published dimension is a separate chart, never a combined total across dimensions.
     * Circular charts require a complete, non-negative partition of the scalar total.
     */
    private function breakdownCharts(array $point, bool $numeric): array
    {
        if (! $numeric || $point['value'] === null || count($point['rows']) !== 1) {
            return [];
        }

        $charts = [];
        foreach ($point['dimensions'] as $dimension) {
            $values = array_values(array_filter($point['rows'][0]['breakdowns'] ?? [],
                fn ($row) => (int) ($row['dimensionId'] ?? 0) === (int) $dimension['id']));
            if ($values === []) {
                continue;
            }

            $options = $dimension['options'] ?? [];
            $labels = [];
            foreach ($options as $option) {
                $labels[(string) $option['id']] = $option['name_en'] ?? $option['code'] ?? (string) $option['id'];
            }
            $categories = [];
            $seen = [];
            $sum = BigDecimal::of('0');
            $partition = true;
            foreach ($values as $row) {
                $optionId = (string) ($row['optionId'] ?? '');
                $value = $row['value'] ?? null;
                // Do not invent labels or coerce missing/text category values into zero.
                if (! isset($labels[$optionId]) || isset($seen[$optionId]) || ! is_numeric($value)) {
                    $partition = false;

                    continue;
                }
                $seen[$optionId] = true;
                $number = BigDecimal::of((string) $value);
                $sum = $sum->plus($number);
                if ($number->compareTo('0') < 0) {
                    $partition = false;
                }
                $categories[] = ['optionId' => $row['optionId'], 'label' => $labels[$optionId], 'value' => (string) $value];
            }

            $complete = count($seen) === count($labels) && count($categories) === count($values);
            $total = BigDecimal::of((string) $point['value']);
            $circular = $partition && $complete && count($categories) >= 2 && count($categories) <= 8
                && $total->isPositive() && $sum->compareTo($total) === 0;
            // Unknown or incomplete categories stay in the original rows for table rendering.
            $bar = $complete && $categories !== [];
            $charts[] = [
                'dimensionId' => $dimension['id'],
                'name' => $dimension['name_en'] ?? null,
                'recommendedChart' => $bar ? 'bar' : 'table',
                'availableCharts' => $circular ? ['bar', 'donut', 'pie', 'table'] : ($bar ? ['bar', 'table'] : ['table']),
                'chartReason' => $circular ? 'complete_partition' : ($bar ? 'category_comparison' : 'incomplete_or_unknown_categories'),
                'categories' => $categories,
            ];
        }

        return $charts;
    }

    private function summary(array $series, int $expected, bool $numeric): array
    {
        $points = collect($series['points']);
        $values = $points->pluck('value')->filter(fn ($value) => $value !== null)->values();
        $rule = $series['aggregationRule'];
        $actual = null;
        if ($numeric && $values->isNotEmpty()) {
            $numbers = $values->map(fn ($v) => BigDecimal::of($v));
            if ($rule === 'latest') {
                $actual = (string) $numbers->last();
            } elseif (in_array($rule, ['sum', 'average'], true)) {
                $sum = $numbers->reduce(fn ($carry, $number) => $carry->plus($number), BigDecimal::of('0'));
                $actual = (string) ($rule === 'sum' ? $sum : $sum->dividedBy($numbers->count(), 6, RoundingMode::HalfUp));
            } elseif (in_array($rule, ['min', 'max'], true)) {
                $actual = (string) $numbers->reduce(function ($carry, $number) use ($rule) {
                    return ($rule === 'min' ? $number->compareTo($carry) < 0 : $number->compareTo($carry) > 0) ? $number : $carry;
                }, $numbers->first());
            } elseif ($values->count() === 1 && $expected === 1) {
                $actual = (string) $numbers->first();
            }
        }
        $present = $points->filter(fn ($point) => $point['value'] !== null);
        $targets = $present->pluck('annualTarget')->map(fn ($value) => $value === null ? null : (string) BigDecimal::of($value)->toScale(6))->unique();
        $target = $targets->count() === 1 ? $targets->first() : null;
        $complete = $expected > 0 && $values->count() === $expected;
        // Partial sums/latest observations can show progress; an incomplete mean/min/max cannot represent an annual result.
        $comparable = $complete || in_array($rule, ['sum', 'latest'], true);
        $direction = $series['performanceDirection'] ?? 'higher_is_better';
        $baselines = $present->pluck('baselineValue')->map(fn ($value) => $value === null ? null : (string) BigDecimal::of($value)->toScale(6))->unique();
        $baseline = $baselines->count() === 1 ? $baselines->first() : null;
        $achievement = null;
        $targetMet = null;
        $variance = null;
        $performanceStatus = 'not_evaluable';
        $achievementBasis = null;
        if ($direction === 'neutral') {
            $performanceStatus = 'neutral';
        } elseif ($actual !== null && $target !== null && $comparable) {
            $comparison = BigDecimal::of($actual)->compareTo($target);
            $targetMet = $direction === 'lower_is_better' ? $comparison <= 0 : $comparison >= 0;
            $performanceStatus = $targetMet ? 'target_met' : 'target_not_met';
            // Raw actual minus target: frontend interprets the sign using performanceDirection.
            $variance = (string) BigDecimal::of($actual)->minus($target)->toScale(6);
            if ($direction === 'lower_is_better') {
                // Never guess a reduction baseline or divide by a zero/negative planned reduction.
                if ($baseline !== null && BigDecimal::of($baseline)->compareTo($target) > 0) {
                    $achievement = $this->percentage((string) BigDecimal::of($baseline)->minus($actual),
                        (string) BigDecimal::of($baseline)->minus($target));
                    $achievementBasis = 'reduction_from_baseline';
                }
            } elseif (BigDecimal::of($target)->isPositive() && BigDecimal::of($actual)->compareTo('0') >= 0) {
                $achievement = $this->percentage($actual, $target);
                $achievementBasis = 'actual_over_target';
            }
        }

        return ['actual' => $actual, 'aggregationRule' => $rule, 'reportedPeriods' => $values->count(),
            'complete' => $complete, 'annualTarget' => $target, 'achievementPercent' => $achievement,
            'performanceDirection' => $direction, 'baselineValue' => $baseline,
            'baselineStatus' => $baselines->count() > 1 ? 'inconsistent_snapshots' : ($baseline === null ? 'not_available' : 'available'),
            'targetMet' => $targetMet, 'performanceStatus' => $performanceStatus,
            'targetVariance' => $variance, 'achievementBasis' => $achievementBasis,
            'targetStatus' => $targets->count() > 1 ? 'inconsistent_snapshots' : ($target === null ? 'not_available' : 'available'),
            'basis' => $complete ? 'all_periods' : 'available_periods'];
    }

    /** Period identity is relative to the reporting year, never the position of a saved row. */
    private function periodNumber(ReportingPeriod $period, ReportingPeriod $year): int
    {
        if ($period->period_type === 'annual') {
            return 1;
        }
        if ($period->quarter !== null || $period->period_number !== null) {
            return (int) ($period->quarter ?? $period->period_number);
        }
        $months = ($period->start_date->year - $year->start_date->year) * 12
            + $period->start_date->month - $year->start_date->month;

        return match ($period->period_type) {
            'quarterly' => intdiv($months, 3) + 1,
            'semiannual' => intdiv($months, 6) + 1,
            'monthly' => $months + 1,
            'weekly' => intdiv((int) $year->start_date->diffInDays($period->start_date), 7) + 1,
            default => (int) $year->start_date->diffInDays($period->start_date) + 1,
        };
    }

    private function expectedYearPeriods(ReportingPeriod $year, string $frequency): int
    {
        $days = (int) $year->start_date->diffInDays($year->end_date) + 1;

        return match ($frequency) {
            'annual' => 1, 'quarterly' => 4, 'semiannual' => 2, 'monthly' => 12,
            'weekly' => (int) ceil($days / 7), default => $days,
        };
    }

    /**
     * Reuse the published snapshot reader and its authorization for every year.
     * Missing years remain explicit gaps; partial totals are never labelled annual results.
     */
    public function trends(User $user, int $datasetId, array $filters): array
    {
        $this->visibleDatasets($user)->findOrFail($datasetId);
        $years = ReportingPeriod::whereNull('institution_id')->whereNull('parent_id')
            ->where('period_type', 'annual')->where('year_type', $filters['yearType'])
            ->whereBetween('start_date', [$filters['startYear'].'-01-01', $filters['endYear'].'-12-31'])
            ->orderBy('start_date')->get()->groupBy(fn ($year) => $year->start_date->year);
        $yearRows = [];
        $series = [];
        foreach (range((int) $filters['startYear'], (int) $filters['endYear']) as $startYear) {
            $matches = $years->get($startYear, collect());
            abort_if($matches->count() > 1, 409, 'Multiple reporting years match the selected year type and start year.');
            $year = $matches->first();
            $yearRows[] = ['startYear' => $startYear, 'reportingYearId' => $year?->id,
                'label' => $year?->label ?? ($filters['yearType'] === 'financial' ? $startYear.'/'.($startYear + 1) : (string) $startYear),
                'registered' => $year !== null];
            if ($year === null) {
                continue;
            }
            $annual = $this->analyse($user, $datasetId, ['reportingYearId' => $year->id, 'frequency' => $filters['frequency']]);
            $expected = $this->expectedYearPeriods($year, $filters['frequency']);
            foreach ($annual['indicators'] as $indicator) {
                $key = $indicator['seriesKey'];
                $series[$key] ??= array_intersect_key($indicator, array_flip(['seriesKey', 'indicatorId', 'name', 'dataType', 'unit', 'aggregationRule', 'performanceDirection']));
                $summary = $this->summary($indicator, $expected, in_array($indicator['dataType'], ['integer', 'decimal'], true));
                $series[$key]['years'][$startYear] = [
                    'value' => $summary['complete'] ? $summary['actual'] : null,
                    'availableActual' => $summary['actual'],
                    'status' => $summary['reportedPeriods'] === 0 ? 'missing' : ($summary['complete'] ? 'complete' : 'partial'),
                    'expectedPeriods' => $expected, 'summary' => $summary,
                ];
            }
        }
        foreach ($series as &$indicator) {
            $points = [];
            foreach ($yearRows as $yearRow) {
                $points[] = $yearRow + ($indicator['years'][$yearRow['startYear']] ?? [
                    'value' => null, 'availableActual' => null,
                    'status' => $yearRow['registered'] ? 'no_observations' : 'year_not_registered',
                    'expectedPeriods' => null, 'summary' => null,
                ]);
            }
            unset($indicator['years']);
            $indicator['points'] = $points;
            $count = count(array_filter($points, fn ($point) => $point['value'] !== null));
            $indicator['recommendedChart'] = $count > 1 ? 'line' : ($count === 1 ? 'bar' : 'table');
            $indicator['availableCharts'] = $count > 1 ? ['line', 'bar', 'table'] : ($count === 1 ? ['bar', 'table'] : ['table']);
        }
        unset($indicator);

        return ['datasetId' => $datasetId, 'startYear' => (int) $filters['startYear'], 'endYear' => (int) $filters['endYear'],
            'yearType' => $filters['yearType'], 'sourceFrequency' => $filters['frequency'], 'years' => $yearRows,
            'indicators' => array_values($series),
            'notes' => ['value is a complete-year aggregate; availableActual may be partial.',
                'Only the selected source frequency is aggregated. Missing values are not zero.',
                'Indicator description, type, unit or aggregation changes split series. A semantic change must be recorded in the indicator definition.']];
    }

    /** Compare only shared period numbers and compatible published indicator definitions. */
    public function comparison(User $user, int $datasetId, array $filters): array
    {
        $this->visibleDatasets($user)->findOrFail($datasetId);
        $currentYear = ReportingPeriod::whereNull('institution_id')->whereNull('parent_id')->where('period_type', 'annual')->findOrFail($filters['reportingYearId']);
        $previousYear = ReportingPeriod::whereNull('institution_id')->whereNull('parent_id')->where('period_type', 'annual')->findOrFail($filters['comparisonYearId']);
        if ($currentYear->year_type !== $previousYear->year_type || $previousYear->start_date >= $currentYear->start_date) {
            throw ValidationException::withMessages(['comparisonYearId' => 'Choose an earlier year of the same year type.']);
        }
        $current = $this->analyse($user, $datasetId, ['reportingYearId' => $currentYear->id, 'frequency' => $filters['frequency']]);
        $previous = $this->analyse($user, $datasetId, ['reportingYearId' => $previousYear->id, 'frequency' => $filters['frequency']]);
        $currentSeries = collect($current['indicators'])->keyBy('seriesKey');
        $previousSeries = collect($previous['indicators'])->keyBy('seriesKey');
        $results = [];
        foreach ($currentSeries->keys()->merge($previousSeries->keys())->unique() as $key) {
            $now = $currentSeries->get($key);
            $before = $previousSeries->get($key);
            $metadata = $now ?? $before;
            $numeric = in_array($metadata['dataType'], ['integer', 'decimal'], true);
            $currentPoints = $this->numberedPoints($now, $current['periods']);
            $previousPoints = $this->numberedPoints($before, $previous['periods']);
            $numbers = array_unique(array_merge(array_keys($currentPoints), array_keys($previousPoints)));
            sort($numbers);
            $pairs = [];
            $matchedCurrent = [];
            $matchedPrevious = [];
            foreach ($numbers as $number) {
                $a = $currentPoints[$number] ?? null;
                $b = $previousPoints[$number] ?? null;
                $matched = $numeric && ($a['value'] ?? null) !== null && ($b['value'] ?? null) !== null;
                if ($matched) {
                    $matchedCurrent[] = $a;
                    $matchedPrevious[] = $b;
                }
                $pairs[] = ['periodNumber' => $number, 'currentValue' => $a['value'] ?? null,
                    'previousValue' => $b['value'] ?? null, 'comparable' => $matched,
                    'currentPeriodId' => $a['periodId'] ?? null, 'previousPeriodId' => $b['periodId'] ?? null]
                    + $this->difference($matched ? $a['value'] : null, $matched ? $b['value'] : null);
            }
            // Use full-year expected counts so aggregation=none cannot manufacture a partial annual total.
            $actual = $this->summary(['aggregationRule' => $metadata['aggregationRule'], 'points' => $matchedCurrent],
                $this->expectedYearPeriods($currentYear, $filters['frequency']), $numeric)['actual'];
            $baseline = $this->summary(['aggregationRule' => $metadata['aggregationRule'], 'points' => $matchedPrevious],
                $this->expectedYearPeriods($previousYear, $filters['frequency']), $numeric)['actual'];
            $results[] = array_intersect_key($metadata, array_flip(['seriesKey', 'indicatorId', 'name', 'dataType', 'unit', 'aggregationRule', 'performanceDirection'])) + [
                'status' => ! $now || ! $before ? 'missing_or_incompatible_series' : ($matchedCurrent === [] ? 'no_comparable_values' : 'comparable'),
                'periods' => $pairs,
                'summary' => ['basis' => 'matched_periods', 'matchedPeriodNumbers' => array_column(array_filter($pairs, fn ($pair) => $pair['comparable']), 'periodNumber'),
                    'currentActual' => $actual, 'previousActual' => $baseline] + $this->difference($actual, $baseline),
                'recommendedChart' => $matchedCurrent === [] ? 'table' : 'grouped_bar',
                'availableCharts' => $matchedCurrent === [] ? ['table'] : ['grouped_bar', 'line', 'table'],
            ];
        }

        return ['datasetId' => $datasetId, 'reportingYear' => $current['reportingYear'], 'comparisonYear' => $previous['reportingYear'],
            'frequency' => $filters['frequency'], 'indicators' => $results,
            'notes' => ['Comparison uses only matching period numbers with published scalar values in both years.',
                'Percent change is unavailable when the previous value is zero or negative.']];
    }

    private function numberedPoints(?array $series, array $periods): array
    {
        $numbers = array_column($periods, 'periodNumber', 'id');
        $points = [];
        foreach ($series['points'] ?? [] as $point) {
            $number = $numbers[$point['periodId']];
            abort_if(isset($points[$number]), 409, 'Duplicate reporting period number.');
            $points[$number] = $point;
        }

        return $points;
    }

    private function difference(?string $current, ?string $previous): array
    {
        if ($current === null || $previous === null) {
            return ['change' => null, 'changePercent' => null];
        }
        $delta = (string) BigDecimal::of($current)->minus($previous);

        return ['change' => $delta, 'changePercent' => BigDecimal::of($previous)->isPositive() ? $this->percentage($delta, $previous) : null];
    }

    private function percentage(string $numerator, string $denominator): string
    {
        return (string) BigDecimal::of($numerator)->multipliedBy('100')->dividedBy($denominator, 2, RoundingMode::HalfUp);
    }
}
