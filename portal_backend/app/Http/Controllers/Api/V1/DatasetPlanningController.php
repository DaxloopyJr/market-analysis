<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\DataConsumer;
use App\Models\DatasetReportingCalendar;
use App\Models\User;
use App\Services\DatasetCalendarService;
use App\Services\DatasetConfigurationService;
use App\Services\DatasetPriorityService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class DatasetPlanningController extends Controller
{
    public function consumers(Request $request): JsonResponse
    {
        abort_unless($request->user()->hasRole('MOA', 'IA', 'IDO', 'DDO', 'MDO'), 403);
        $data = $request->validate(['search' => ['sometimes', 'string', 'max:255'], 'perPage' => ['sometimes', 'integer', 'between:1,100']]);
        $query = DataConsumer::query();
        if (isset($data['search'])) {
            $query->where('normalized_name', 'like', '%'.mb_strtolower(trim($data['search'])).'%');
        }
        $page = $query->orderBy('name')->paginate($data['perPage'] ?? 20);
        $page->through(fn ($row) => ['id' => $row->id, 'name' => $row->name, 'shortName' => $row->short_name, 'description' => $row->description]);

        return response()->json($page);
    }

    public function calendars(Request $request, int $datasetId, DatasetConfigurationService $configuration, DatasetCalendarService $service): JsonResponse
    {
        $configuration->dataset($request, $datasetId);
        $page = DatasetReportingCalendar::where('dataset_definition_id', $datasetId)->orderBy('deadline')->paginate(20);
        $page->through(fn ($calendar) => $service->snapshot($calendar));

        return response()->json($page);
    }

    public function assignees(Request $request, int $datasetId, DatasetConfigurationService $configuration): JsonResponse
    {
        $dataset = $configuration->dataset($request, $datasetId);
        $role = $dataset->department_id === null ? 'IDO' : 'DDO';
        $data = $request->validate([
            'search' => ['sometimes', 'string', 'max:255'],
            'perPage' => ['sometimes', 'integer', 'between:1,100'],
        ]);
        $page = User::query()
            ->where('is_active', true)
            ->where('status', 'active')
            ->where('institution_id', $dataset->institution_id)
            ->when($dataset->department_id !== null, fn ($query) => $query->where('department_id', $dataset->department_id))
            ->where(function ($query) use ($role) {
                $query->whereHas('roles', fn ($roles) => $roles->where('code', $role))
                    ->orWhereHas('delegationsReceived', function ($delegations) use ($role) {
                        $delegations->where('status', 'active')
                            ->where(fn ($dates) => $dates->whereNull('effective_from')->orWhereDate('effective_from', '<=', today()))
                            ->where(fn ($dates) => $dates->whereNull('effective_to')->orWhereDate('effective_to', '>=', today()))
                            ->whereHas('role', fn ($roles) => $roles->where('code', $role)
                                ->where('is_active', true)->where('status', 'active'));
                    });
            })
            ->when(isset($data['search']), function ($query) use ($data) {
                $search = '%'.mb_strtolower(trim($data['search'])).'%';
                $query->where(fn ($match) => $match->whereRaw('LOWER(name) LIKE ?', [$search])
                    ->orWhereRaw('LOWER(email) LIKE ?', [$search])
                    ->orWhereRaw('LOWER(username) LIKE ?', [$search]));
            })
            ->select(['id', 'name', 'email', 'username'])
            ->orderBy('name')
            ->paginate($data['perPage'] ?? 20);

        return response()->json($page);
    }

    public function saveCalendar(Request $request, int $datasetId, DatasetCalendarService $service): JsonResponse
    {
        $data = $request->validate([
            'reportingPeriodId' => ['required_without:reportingPeriodIds', 'missing_with:reportingPeriodIds', 'integer', Rule::exists('reporting_periods', 'id')],
            'reportingPeriodIds' => ['required_without:reportingPeriodId', 'missing_with:reportingPeriodId', 'array', 'list', 'min:1', 'max:366'],
            'reportingPeriodIds.*' => ['required', 'integer', 'distinct', Rule::exists('reporting_periods', 'id')],
            'responsibleUserId' => ['required', 'integer', Rule::exists('users', 'id')->whereNull('deleted_at')],
            'deadlineDays' => ['required', 'integer', 'between:0,365'],
            'reminderDays' => ['sometimes', 'array', 'max:10'],
            'reminderDays.*' => ['integer', 'distinct', 'between:0,365'],
            'remindersEnabled' => ['sometimes', 'boolean'],
            'submittedAt' => ['missing'], 'deadline' => ['missing'],
        ]);

        if (array_key_exists('reportingPeriodIds', $data)) {
            return response()->json(['data' => array_map(
                fn (DatasetReportingCalendar $calendar) => $service->snapshot($calendar),
                $service->saveMany($request, $datasetId, $data),
            )]);
        }

        return response()->json(['data' => $service->snapshot($service->save($request, $datasetId, $data))]);
    }

    public function priority(Request $request, int $datasetId, DatasetPriorityService $service): JsonResponse
    {
        $data = $request->validate(['priority' => ['required', Rule::in(['low', 'medium', 'high'])],
            'reason' => ['required', 'string', 'max:2000']]);
        $dataset = $service->change($request, $datasetId, $data['priority'], $data['reason']);

        return response()->json(['data' => ['datasetId' => $dataset->id, 'priority' => $dataset->priority,
            'priorityUpdatedBy' => $dataset->priority_updated_by, 'priorityUpdatedAt' => $dataset->priority_updated_at->toIso8601String()]]);
    }
}
