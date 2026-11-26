<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\DatasetFrequency;
use App\Services\DatasetConfigurationService;
use App\Services\DatasetRecurringReportingService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class DatasetReportingController extends Controller
{
    public function showSettings(Request $request, int $datasetId, DatasetConfigurationService $service): JsonResponse
    {
        return response()->json(['data' => $service->dataset($request, $datasetId)->reporting_settings]);
    }

    public function saveSettings(Request $request, int $datasetId, DatasetRecurringReportingService $service): JsonResponse
    {
        $data = $request->validate([
            'responsibleUserId' => ['sometimes', 'required', 'integer', Rule::exists('users', 'id')->whereNull('deleted_at')],
            // Legacy fields are optional; global periods, not these defaults, control dates/deadlines.
            'yearType' => ['sometimes', Rule::in(['financial', 'calendar'])],
            'yearStartMonth' => ['sometimes', 'integer', 'between:1,12'],
            'deadlineDays' => ['sometimes', 'integer', 'between:0,365'],
            'reminderDays' => ['required', 'array', 'max:10'],
            'reminderDays.*' => ['integer', 'distinct', 'between:0,365'],
            'remindersEnabled' => ['required', 'boolean'],
        ]);
        foreach (['responsibleUserId', 'yearStartMonth', 'deadlineDays'] as $key) {
            if (isset($data[$key])) {
                $data[$key] = (int) $data[$key];
            }
        }
        $data['reminderDays'] = array_map('intval', $data['reminderDays']);
        $data['remindersEnabled'] = (bool) $data['remindersEnabled'];

        return response()->json(['data' => $service->settings($request, $datasetId, $data)->reporting_settings]);
    }

    public function year(Request $request, int $datasetId, DatasetRecurringReportingService $service): JsonResponse
    {
        $data = $request->validate($this->yearRules());

        return response()->json(['data' => $service->prepareYear($request, $datasetId, (int) $data['startYear'], $data['frequency'])]);
    }

    public function context(Request $request, int $datasetId, DatasetRecurringReportingService $service): JsonResponse
    {
        $data = $request->validate($this->yearRules() + [
            'periodNumber' => ['exclude_if:frequency,annual', 'required', 'integer', 'between:1,366'],
        ]);

        return response()->json(['data' => $service->context($request, $datasetId, (int) $data['startYear'],
            $data['frequency'], isset($data['periodNumber']) ? (int) $data['periodNumber'] : null)]);
    }

    public function selectionStatus(Request $request, int $datasetId, DatasetRecurringReportingService $service): JsonResponse
    {
        $data = $request->validate($this->yearRules() + [
            'periodNumber' => ['exclude_if:frequency,annual', 'required', 'integer', 'between:1,366'],
        ]);

        return response()->json(['data' => $service->selectionStatus($request, $datasetId, (int) $data['startYear'],
            $data['frequency'], isset($data['periodNumber']) ? (int) $data['periodNumber'] : null)]);
    }

    private function yearRules(): array
    {
        return ['startYear' => ['required', 'integer', 'between:2000,2100'],
            'frequency' => ['required', Rule::in(DatasetFrequency::ALLOWED)]];
    }
}
