<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\ReportingPeriod;
use App\Services\DatasetAnalyticsService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class DatasetAnalyticsController extends Controller
{
    public function organisations(Request $request, DatasetAnalyticsService $service): JsonResponse
    {
        $filters = $request->validate([
            'type' => ['required', Rule::in(['institution', 'department'])],
            'search' => ['sometimes', 'string', 'max:100'],
            'page' => ['sometimes', 'integer', 'min:1'],
            'perPage' => ['sometimes', 'integer', 'between:1,100'],
        ]);

        return response()->json($service->organisations($request->user(), $filters));
    }

    public function datasets(Request $request, DatasetAnalyticsService $service): JsonResponse
    {
        $filters = $request->validate([
            'institutionId' => ['sometimes', 'integer', 'min:1'],
            'departmentId' => ['sometimes', 'integer', 'min:1'],
            'reportingPurpose' => ['sometimes', Rule::in(['operational', 'sector_performance'])],
            'page' => ['sometimes', 'integer', 'min:1'],
            'perPage' => ['sometimes', 'integer', 'between:1,100'],
        ]);

        return response()->json($service->datasets($request->user(), $filters));
    }

    public function options(Request $request, int $dataset, DatasetAnalyticsService $service): JsonResponse
    {
        return response()->json(['data' => $service->options($request->user(), $dataset)]);
    }

    public function show(Request $request, int $dataset, DatasetAnalyticsService $service): JsonResponse
    {
        $filters = $request->validate([
            'reportingYearId' => ['required', 'integer', 'min:1'],
            'frequency' => ['required', Rule::in(ReportingPeriod::TYPES)],
        ]);

        return response()->json(['data' => $service->analyse($request->user(), $dataset, $filters)]);
    }

    public function trends(Request $request, int $dataset, DatasetAnalyticsService $service): JsonResponse
    {
        $filters = $request->validate([
            'startYear' => ['required', 'integer', 'between:1900,9998'],
            'endYear' => ['required', 'integer', 'between:1900,9998', 'gte:startYear'],
            'yearType' => ['required', Rule::in(['financial', 'calendar'])],
            'frequency' => ['required', Rule::in(ReportingPeriod::TYPES)],
        ]);
        if ($filters['endYear'] - $filters['startYear'] >= 20) {
            throw ValidationException::withMessages(['endYear' => 'Select at most 20 years per request.']);
        }

        return response()->json(['data' => $service->trends($request->user(), $dataset, $filters)]);
    }

    public function comparison(Request $request, int $dataset, DatasetAnalyticsService $service): JsonResponse
    {
        $filters = $request->validate([
            'reportingYearId' => ['required', 'integer', 'min:1'],
            'comparisonYearId' => ['required', 'integer', 'min:1', 'different:reportingYearId'],
            'frequency' => ['required', Rule::in(ReportingPeriod::TYPES)],
        ]);

        return response()->json(['data' => $service->comparison($request->user(), $dataset, $filters)]);
    }
}
