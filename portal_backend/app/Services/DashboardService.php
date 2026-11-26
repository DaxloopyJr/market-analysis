<?php

namespace App\Services;

use App\Models\DatasetDefinition;
use App\Models\DatasetReportingCalendar;
use App\Models\Department;
use App\Models\Institution;
use App\Models\Submission;
use App\Models\SubmissionApproval;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class DashboardService
{
    public function __construct(private SubmissionService $submissions) {}

    public function build(User $user, array $filters): array
    {
        abort_unless($user->canDo('dashboard.view'), 403);
        $ministry = $user->institution?->code === 'MIT' && $user->institution->is_active && $user->institution->status === 'active';
        $scope = $user->hasRole('MOA') || ($ministry && $user->canDo('analytics.view.ministry')) ? 'ministry'
            : ($user->hasRole('DDO') ? 'department' : 'institution');
        abort_if($scope !== 'ministry' && $user->institution_id === null, 403, 'Institution scope is required.');
        abort_if($scope === 'department' && $user->department_id === null, 403, 'Department scope is required.');
        $institutionId = $scope === 'ministry' ? ($filters['institution_id'] ?? null) : $user->institution_id;
        $departmentId = $scope === 'department' ? $user->department_id : ($filters['department_id'] ?? null);
        abort_if($scope !== 'ministry' && isset($filters['institution_id']) && (int) $filters['institution_id'] !== (int) $institutionId, 403);
        abort_if($scope === 'department' && isset($filters['department_id']) && (int) $filters['department_id'] !== (int) $departmentId, 403);
        $today = CarbonImmutable::now('Africa/Dar_es_Salaam');
        $year = $today->month >= 7 ? $today->year : $today->year - 1;
        $fy = $filters['fy'] ?? $year.'/'.substr((string) ($year + 1), -2);
        $start = $end = null;
        if ($fy !== 'all') {
            [$year, $last] = explode('/', $fy);
            $expected = (string) ((int) $year + 1);
            if ($last !== $expected && $last !== substr($expected, -2)) {
                throw ValidationException::withMessages(['fy' => 'Use consecutive financial years, for example 2026/27 or 2026/2027.']);
            }
            $start = $year.'-07-01';
            $end = $expected.'-07-01';
        }
        $datasetScope = fn (Builder $query) => $query
            ->when($institutionId !== null, fn ($q) => $q->where('institution_id', $institutionId))
            ->when($departmentId !== null, fn ($q) => $q->where('department_id', $departmentId));
        $periodScope = fn (Builder $query) => $query->when($start !== null, fn ($q) => $q->where('start_date', '>=', $start)->where('start_date', '<', $end));

        // Reuse workflow visibility; readers additionally see released approved/published records.
        $visible = Submission::where(function ($query) use ($user) {
            $query->whereIn('id', $this->submissions->query($user)->select('submissions.id'));
            if ($user->canDo('submissions.view.approved')) {
                $query->orWhere(fn ($q) => $q->whereIn('status', ['approved', 'published'])
                    ->where(fn ($stage) => $stage->where('workflow_stage', 'ministry')->orWhereNull('workflow_stage')->orWhere('status', 'published')));
            }
        })->whereHas('calendar.dataset', $datasetScope);
        $query = (clone $visible)->whereHas('calendar.period', $periodScope);
        $ids = fn () => (clone $query)->select('submissions.id');
        $counts = (clone $query)->select('status')->selectRaw('COUNT(*) AS total')->groupBy('status')->pluck('total', 'status');
        $statuses = ['draft', 'submitted', 'under_review', 'returned', 'approved', 'published'];
        $distribution = collect($statuses)->map(fn ($status) => ['status' => $status, 'total' => (int) ($counts[$status] ?? 0), 'label' => ucwords(str_replace('_', ' ', $status))])->all();
        $pending = $this->pending(clone $query, $user, $ministry);
        $awaiting = (clone $query)->whereIn('status', ['submitted', 'under_review', 'approved'])
            ->where(fn ($q) => $q->where('workflow_stage', 'ministry')->orWhere(fn ($legacy) => $legacy->whereNull('workflow_stage')
                ->whereHas('circle.steps', fn ($step) => $step->whereColumn('sequence', 'submissions.current_step')->where('level', 'ministry'))));
        $datasets = $datasetScope(DatasetDefinition::query());
        if (! $user->hasRole('MOA', 'IA') && ! ($ministry && $user->hasRole('MDO', 'MDD') && $user->canDo('datasets.view.ministry'))) {
            $datasets->where(fn ($q) => $q->where('responsible_user_id', $user->id)->orWhereIn('id', DatasetReportingCalendar::whereIn('id', (clone $visible)->select('reporting_calendar_id'))->select('dataset_definition_id')));
        }
        $active = (clone $datasets)->where('status', 'active');
        $calendars = DatasetReportingCalendar::whereIn('dataset_definition_id', (clone $active)->select('id'))->whereHas('period', $periodScope)
            ->where(fn ($q) => $q->whereDoesntHave('submission')->orWhereHas('submission', fn ($s) => $s->whereIn('id', $ids())));
        if (! $user->hasRole('MOA', 'IA')) {
            $calendars->where('responsible_user_id', $user->id);
        }
        $due = (clone $calendars)->whereHas('period', fn ($p) => $p->whereNull('institution_id')->where('deadline', '<', $today->toDateString()));
        $dueCount = (clone $due)->count();
        $delivered = (clone $due)->whereNotNull('submitted_at')->count();
        $publishedCount = (int) ($counts['published'] ?? 0);
        $returnedCount = (int) ($counts['returned'] ?? 0);
        $institutions = Institution::where('is_active', true)->where('status', 'active')->when($institutionId, fn ($q) => $q->whereKey($institutionId));
        $departments = Department::where('is_active', true)->where('status', 'active')->when($departmentId, fn ($q) => $q->whereKey($departmentId));
        $cards = collect($distribution)->mapWithKeys(fn ($row) => [$row['status'] => $row['total']])->all() + [
            'active_datasets' => (clone $active)->count(), 'total_submissions' => (int) $counts->sum(),
            'pending_approvals' => (clone $pending)->count(), 'awaiting_ministry' => (clone $awaiting)->count(),
            'acceptance_rate' => $publishedCount + $returnedCount > 0 ? round(100 * $publishedCount / ($publishedCount + $returnedCount), 1) : 0,
            'due_obligations' => $dueCount, 'submitted_obligations' => $delivered, 'overdue' => $dueCount - $delivered,
            'compliance_rate' => $dueCount > 0 ? round(100 * $delivered / $dueCount, 1) : 0,
            'institutions' => $scope === 'ministry' ? (clone $institutions)->count() : null,
            'departments' => $scope === 'ministry' ? (clone $departments)->count() : null,
            'users' => $user->hasRole('MOA', 'IA') ? User::when($institutionId, fn ($q) => $q->where('institution_id', $institutionId))->when($departmentId, fn ($q) => $q->where('department_id', $departmentId))->count() : null,
            'institutional_admins' => $user->hasRole('MOA') ? User::whereHas('roles', fn ($q) => $q->where('code', 'IA'))->when($institutionId, fn ($q) => $q->where('institution_id', $institutionId))->count() : null,
            // Reporting channel is not part of the current institution schema.
            'portal_institutions' => null, 'api_institutions' => null,
        ];
        $recent = $this->rows(clone $query, 40);
        $feed = $this->rows((clone $query)->where('status', 'published'), 20, true);
        $details = ['active_datasets' => (clone $active)->with('frequencies')->orderBy('id')->limit(100)->get()->map(fn ($d) => [
            'Code' => $d->dataset_code, 'Name' => $d->dataset_name, 'Frequency' => $d->frequencies->pluck('frequency')->implode(', '), 'Due' => null])];
        foreach ($statuses as $status) {
            $details[$status] = $this->rows((clone $query)->where('status', $status), 100)->map(fn ($row) => [
                'Reference' => $row['reference'], 'Dataset' => $row['dataset'], 'Group' => $row['institution'], 'Status' => $row['status'], 'Date' => $row['submitted_at']]);
        }
        $month = DB::getDriverName() === 'sqlite' ? "strftime('%Y-%m', COALESCE(submitted_at, created_at))" : "TO_CHAR(COALESCE(submitted_at, created_at), 'YYYY-MM')";
        $trend = (clone $query)->selectRaw("$month AS month, COUNT(*) AS total")->groupByRaw($month)->orderBy('month')->get()
            ->map(fn ($row) => ['month' => $row->month, 'total' => (int) $row->total]);
        $grouped = fn (string $table, string $column) => DB::table('submissions')->join('dataset_reporting_calendars as calendars', 'calendars.id', '=', 'submissions.reporting_calendar_id')
            ->join('dataset_definitions as datasets', 'datasets.id', '=', 'calendars.dataset_definition_id')
            ->join($table.' as groups', 'groups.id', '=', 'datasets.'.$column)->whereIn('submissions.id', $ids())
            ->select('groups.id', 'groups.name')->selectRaw("COUNT(*) AS total, SUM(CASE WHEN submissions.status = 'published' THEN 1 ELSE 0 END) AS published")
            ->groupBy('groups.id', 'groups.name')->orderByDesc('total')->orderBy('groups.id')->limit(12)->get()
            ->map(fn ($row) => ['id' => $row->id, 'name' => $row->name, 'total' => (int) $row->total, 'published' => (int) $row->published,
                'rate' => round(100 * $row->published / $row->total, 1)]);
        $byInstitution = $grouped('institutions', 'institution_id');
        $byDepartment = $grouped('departments', 'department_id');
        $complianceGroups = fn (string $table, string $column) => DB::table('dataset_reporting_calendars as calendars')
            ->join('dataset_definitions as datasets', 'datasets.id', '=', 'calendars.dataset_definition_id')
            ->join($table.' as groups', 'groups.id', '=', 'datasets.'.$column)
            ->whereIn('calendars.id', (clone $due)->select('id'))->select('groups.id', 'groups.name')
            ->selectRaw('COUNT(*) AS total, SUM(CASE WHEN calendars.submitted_at IS NOT NULL THEN 1 ELSE 0 END) AS submitted')
            ->groupBy('groups.id', 'groups.name')->orderBy('groups.id')->limit(12)->get()
            ->map(fn ($row) => ['id' => $row->id, 'name' => $row->name, 'total' => (int) $row->total,
                'submitted' => (int) $row->submitted, 'overdue' => (int) $row->total - (int) $row->submitted,
                'rate' => round(100 * $row->submitted / $row->total, 1)]);

        return [
            'scope' => $scope, 'fy' => $fy, 'cards' => $cards, 'details' => $details, 'trend' => $trend, 'status_distribution' => $distribution,
            'by_institution' => $byInstitution, 'by_department' => $byDepartment,
            'compliance' => ['due' => $dueCount, 'submitted' => $delivered, 'overdue' => $dueCount - $delivered, 'rate' => $cards['compliance_rate'],
                'institutions' => $complianceGroups('institutions', 'institution_id'), 'departments' => $complianceGroups('departments', 'department_id')],
            'recent_grouped' => $recent->groupBy('institution')->map(fn ($rows, $group) => ['group' => $group, 'items' => $rows->take(5)->values()])->values(),
            'pending_approvals' => $this->rows($pending, 20), 'published_data' => $feed,
            'recent_activity' => SubmissionApproval::whereIn('submission_id', $ids())->orderByDesc('acted_at')->orderByDesc('id')->limit(20)
                ->get(['id', 'submission_id', 'action', 'step_name', 'acted_at']),
            'obligations' => (clone $calendars)->with(['period.parent', 'submission', 'dataset'])->orderBy('deadline')->orderBy('id')->limit(100)->get()->map(function ($calendar) use ($user) {
                $status = app(ReportingEntryService::class)->status($calendar->period, $calendar);

                return ['calendar_id' => $calendar->id, 'dataset_id' => $calendar->dataset_definition_id, 'name' => $calendar->dataset->dataset_name,
                    'description' => $calendar->dataset->description, 'frequency' => $calendar->period->period_type, 'period' => $calendar->period->label,
                    'due_date' => $calendar->period->deadline->toDateString(), 'status' => $status['entryStatus'],
                    'submission_id' => $calendar->submission?->id, 'reference' => $calendar->submission?->reference,
                    'can_enter_data' => $status['canEnterData'] && (int) $calendar->responsible_user_id === (int) $user->id
                        && DatasetCalendarService::eligibleRecipient($calendar->dataset, $user)];
            }),
            'filters' => $scope === 'ministry' ? ['institutions' => $institutions->orderBy('name')->get(['id', 'name', 'code']),
                'departments' => $departments->orderBy('name')->get(['id', 'name', 'code'])] : null,
            'limits' => ['details' => 100, 'pending_approvals' => 20, 'published_data' => 20, 'recent_activity' => 20, 'obligations' => 100],
        ];
    }

    public function pending(Builder $query, User $user, bool $ministry): Builder
    {
        $roles = array_unique(array_merge($user->roles->pluck('code')->all(), $user->delegatedRoleCodes()));
        $currentStep = function (Builder $submissions, string $level) use ($roles, $user) {
            $step = fn ($steps) => $steps->whereColumn('sequence', 'submissions.current_step')->whereIn('required_role_code', $roles)
                ->where('level', $level)->where(fn ($q) => $q->whereNull('assigned_user_id')->orWhere('assigned_user_id', $user->id));
            $submissions->where(fn ($q) => $q->where(fn ($m) => $m->where('workflow_stage', 'ministry')->whereHas('ministryCircle.steps', $step))
                ->orWhere(fn ($i) => $i->where(fn ($stage) => $stage->whereNull('workflow_stage')->orWhere('workflow_stage', 'institution'))->whereHas('circle.steps', $step)));
        };

        return $query->whereIn('status', ['submitted', 'under_review', 'approved'])->where('created_by', '!=', $user->id)
            ->whereHas('calendar', fn ($c) => $c->where('responsible_user_id', '!=', $user->id))
            ->where(function ($q) use ($user, $ministry, $currentStep) {
                $q->where(function ($institution) use ($user, $currentStep) {
                    $institution->whereHas('calendar.dataset', fn ($d) => $d->whereNotNull('institution_id')->where('institution_id', $user->institution_id));
                    $currentStep($institution, 'institution');
                });
                if ($ministry) {
                    $q->orWhere(function ($ministryQuery) use ($user, $currentStep) {
                        if (! $user->hasRole('MDO', 'MDD')) {
                            $ministryQuery->whereHas('calendar.dataset', fn ($d) => $d->whereNull('department_id')
                                ->orWhere(fn ($own) => $own->where('institution_id', $user->institution_id)->where('department_id', $user->department_id)));
                        }
                        $currentStep($ministryQuery, 'ministry');
                    });
                }
            });
    }

    private function rows(Builder $query, int $limit, bool $includeValues = false): Collection
    {
        if ($includeValues) {
            $query->with(['values', 'template']);
        }

        return $query->with(['calendar.dataset.institution', 'calendar.dataset.department', 'calendar.period', 'circle.steps', 'ministryCircle.steps'])
            ->orderByDesc('updated_at')->orderByDesc('id')->limit($limit)->get()->map(function ($s) use ($includeValues) {
                $dataset = $s->calendar->dataset;
                $step = $s->currentCircle()?->steps->firstWhere('sequence', $s->current_step);

                return ['id' => $s->id, 'reference' => $s->reference, 'dataset_id' => $dataset->id, 'dataset' => $dataset->dataset_name,
                    'institution_id' => $dataset->institution_id, 'institution' => $dataset->institution?->name,
                    'department_id' => $dataset->department_id, 'department' => $dataset->department?->name,
                    'period' => $s->calendar->period->label, 'status' => $s->status, 'workflow_stage' => $s->workflow_stage,
                    'current_step' => $step ? ['name' => $step->step_name, 'action' => $step->action, 'role' => $step->required_role_code] : null,
                    'submitted_at' => $s->submitted_at?->toIso8601String(), 'published_at' => $s->published_at?->toIso8601String()]
                    + ($includeValues ? ['templateVersionId' => $s->template_version_id, 'values' => $s->values->map->input()->all(),
                        'indicators' => collect($s->template->template_content['indicators'] ?? [])->map(fn ($indicator) => collect($indicator)->only(['id', 'indicator_code', 'name_en', 'name_sw', 'data_type'])->all())->values(),
                        'dimensions' => collect($s->template->template_content['dimensions'] ?? [])->map(fn ($dimension) => collect($dimension)->only(['id', 'name_en', 'name_sw', 'data_type', 'indicatorIds'])->all() + [
                            'options' => collect(($dimension['optionSource'] ?? null) === 'manual' ? ($dimension['options'] ?? []) : ($dimension['referenceValues'] ?? []))
                                ->map(fn ($option) => collect($option)->only(['id', 'code', 'name_en', 'name_sw', 'data_value_code', 'data_value_name_en', 'data_value_name_sw'])->all())->values(),
                        ])->values()] : []);
            });
    }
}
