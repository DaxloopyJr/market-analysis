<?php

namespace App\Http\Controllers\Api\V1;

use App\DTOs\ReportingPeriodData;
use App\Http\Controllers\Controller;
use App\Models\ReportingPeriod;
use App\Services\ReportingEntryService;
use App\Services\ReportingPeriodService;
use App\Services\ReportingPeriodStatusService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class ReportingPeriodController extends Controller
{
    public function index(Request $request, ReportingPeriodService $service): JsonResponse
    {
        $data = $request->validate([
            'institutionId' => ['prohibited'], 'parentId' => ['sometimes', 'integer'],
            'periodType' => ['sometimes', Rule::in(ReportingPeriod::TYPES)],
            'status' => ['sometimes', Rule::in(['open', 'closed'])],
            'perPage' => ['sometimes', 'integer', 'between:1,100'], 'page' => ['sometimes', 'integer', 'min:1'],
        ]);
        $query = $service->query($request)->with('parent');
        foreach (['institutionId' => 'institution_id', 'parentId' => 'parent_id', 'periodType' => 'period_type'] as $field => $column) {
            if (isset($data[$field])) {
                $query->where($column, $data[$field]);
            }
        }
        if (isset($data['status'])) {
            app(ReportingPeriodStatusService::class)->filter($query, $data['status']);
        }
        $page = $query->orderByDesc('start_date')->orderByDesc('id')->paginate($data['perPage'] ?? 20)->appends($data);
        $page->through(fn ($period) => $this->snapshot($period));

        return response()->json($page);
    }

    public function show(Request $request, int $id, ReportingPeriodService $service): JsonResponse
    {
        return response()->json(['data' => $this->snapshot($service->query($request)->findOrFail($id))]);
    }

    public function store(Request $request, ReportingPeriodService $service): JsonResponse
    {
        $data = $request->validate([
            'institutionId' => ['prohibited'],
            'periodType' => ['required', Rule::in(ReportingPeriod::TYPES)],
            'yearType' => ['required_if:periodType,annual', 'prohibited_unless:periodType,annual', Rule::in(['calendar', 'financial'])],
            'startDate' => ['required_if:periodType,annual', 'prohibited_unless:periodType,annual', 'date_format:Y-m-d'],
            'endDate' => ['required_if:periodType,annual', 'prohibited_unless:periodType,annual', 'date_format:Y-m-d', 'after:startDate'],
            'parentId' => ['required_unless:periodType,annual', 'prohibited_if:periodType,annual', 'integer', Rule::exists('reporting_periods', 'id')],
            'quarter' => ['required_if:periodType,quarterly', 'prohibited_unless:periodType,quarterly', 'integer', 'between:1,4'],
            // Period number ni nafasi ndani ya annual parent; dates huhesabiwa na service.
            'periodNumber' => ['required_if:periodType,monthly,semiannual,weekly,daily', 'prohibited_if:periodType,annual,quarterly', 'integer', 'min:1',
                'max:'.match ($request->input('periodType')) {
                    'monthly' => 12, 'semiannual' => 2, 'weekly' => 53, default => 366
                }],
            'deadline' => ['required_without:deadlineDays', Rule::prohibitedIf($request->has('deadlineDays')), 'date_format:Y-m-d'],
            'deadlineDays' => ['required_without:deadline', Rule::prohibitedIf($request->has('deadline')), 'integer', 'between:0,365'],
            'createdBy' => ['prohibited'], 'status' => ['prohibited'],
        ]);
        $period = $service->create($request, new ReportingPeriodData(
            null, $data['periodType'], $data['deadline'] ?? null, $data['yearType'] ?? null,
            $data['startDate'] ?? null, $data['endDate'] ?? null, $data['parentId'] ?? null, $data['quarter'] ?? null, $data['periodNumber'] ?? null, $data['deadlineDays'] ?? null,
        ));

        return response()->json(['data' => $this->snapshot($period)], 201);
    }

    public function generateQuarters(Request $request, int $id, ReportingPeriodService $service): JsonResponse
    {
        $data = $request->validate(['deadlineDays' => ['required', 'integer', 'between:0,365']]);

        return response()->json(['data' => array_map(fn ($period) => $this->snapshot($period),
            $service->generateQuarters($request, $id, $data['deadlineDays']))]);
    }

    public function update(Request $request, int $id, ReportingPeriodService $service): JsonResponse
    {
        $data = $request->validate([
            'deadline' => ['sometimes', 'required', 'date_format:Y-m-d'],
            'status' => ['sometimes', 'required', Rule::in(['open', 'closed'])],
            'institutionId' => ['prohibited'], 'periodType' => ['prohibited'], 'yearType' => ['prohibited'],
            'startDate' => ['prohibited'], 'endDate' => ['prohibited'], 'parentId' => ['prohibited'],
            'periodNumber' => ['prohibited'], 'quarter' => ['prohibited'], 'createdBy' => ['prohibited'],
        ]);

        return response()->json(['data' => $this->snapshot($service->update($request, $id, $data))]);
    }

    public function generateMonths(Request $request, int $id, ReportingPeriodService $service): JsonResponse
    {
        $data = $request->validate(['deadlineDays' => ['required', 'integer', 'between:0,365']]);

        return response()->json(['data' => array_map(fn ($period) => $this->snapshot($period),
            $service->generateMonths($request, $id, $data['deadlineDays']))]);
    }

    public function destroy(Request $request, int $id, ReportingPeriodService $service): JsonResponse
    {
        // Period yenye targets haifutwi; DELETE huifunga na historia hubaki.
        return response()->json(['data' => $this->snapshot($service->update($request, $id, ['status' => 'closed']))]);
    }

    public function generateSemiannual(Request $request, int $id, ReportingPeriodService $service): JsonResponse
    {
        return $this->generatePeriods($request, $id, $service, 'semiannual');
    }

    public function generateWeeks(Request $request, int $id, ReportingPeriodService $service): JsonResponse
    {
        return $this->generatePeriods($request, $id, $service, 'weekly');
    }

    public function generateDays(Request $request, int $id, ReportingPeriodService $service): JsonResponse
    {
        return $this->generatePeriods($request, $id, $service, 'daily');
    }

    private function generatePeriods(Request $request, int $id, ReportingPeriodService $service, string $periodType): JsonResponse
    {
        $data = $request->validate(['deadlineDays' => ['required', 'integer', 'between:0,365']]);

        return response()->json(['data' => array_map(fn ($period) => $this->snapshot($period),
            $service->generatePeriods($request, $id, $periodType, $data['deadlineDays']))]);
    }

    private function snapshot(ReportingPeriod $period): array
    {
        return ['id' => $period->id, 'institutionId' => $period->institution_id === null ? null : (int) $period->institution_id,
            'parentId' => $period->parent_id === null ? null : (int) $period->parent_id,
            'periodCode' => $period->period_code, 'label' => $period->label, 'periodType' => $period->period_type,
            'yearType' => $period->year_type, 'quarter' => $period->quarter, 'periodNumber' => $period->period_number,
            'startDate' => $period->start_date->toDateString(), 'endDate' => $period->end_date->toDateString(),
            'deadline' => $period->deadline->toDateString(), 'status' => app(ReportingPeriodStatusService::class)->status($period),
            'automaticStatus' => (bool) $period->automatic_status,
            'isOpen' => app(ReportingPeriodStatusService::class)->status($period) === 'open',
            'createdBy' => (int) $period->created_by] + app(ReportingEntryService::class)->status($period);
    }
}
