<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Services\StrategicPlanService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class StrategicPlanController extends Controller
{
    public function index(Request $request, StrategicPlanService $service): JsonResponse
    {
        $data = $request->validate([
            'institutionId' => ['sometimes', 'integer', 'min:1'],
            'status' => ['sometimes', Rule::in(['draft', 'active'])],
            'perPage' => ['sometimes', 'integer', 'between:1,100'], 'page' => ['sometimes', 'integer', 'min:1'],
        ]);
        $query = $service->query($request->user());
        if (isset($data['institutionId'])) {
            $query->where('institution_id', $data['institutionId']);
        }
        if (isset($data['status'])) {
            $query->where('status', $data['status']);
        }
        $page = $query->orderByDesc('start_date')->orderByDesc('id')->paginate($data['perPage'] ?? 20)->appends($data);
        $page->through(fn ($row) => $service->snapshot($row));

        return response()->json($page);
    }

    public function store(Request $request, StrategicPlanService $service): JsonResponse
    {
        $data = $request->validate([
            'institutionId' => ['sometimes', 'integer', 'min:1'],
            'name' => ['required', 'string', 'max:255'],
            'startDate' => ['required', 'date_format:Y-m-d'],
            'endDate' => ['required', 'date_format:Y-m-d', 'after:startDate'],
        ]);

        return response()->json(['data' => $service->create($request, $data)], 201);
    }

    public function show(Request $request, int $id, StrategicPlanService $service): JsonResponse
    {
        return response()->json(['data' => $service->snapshot($service->find($request->user(), $id), true)]);
    }

    public function update(Request $request, int $id, StrategicPlanService $service): JsonResponse
    {
        $data = $request->validate([
            'name' => ['sometimes', 'required', 'string', 'max:255'],
            'startDate' => ['sometimes', 'required', 'date_format:Y-m-d'],
            'endDate' => ['sometimes', 'required', 'date_format:Y-m-d'],
        ]);
        abort_if($data === [], 422, 'Provide a plan field to update.');

        return response()->json(['data' => $service->updateDraft($request, $id, $data)]);
    }

    public function updateObjective(Request $request, int $id, int $objective, StrategicPlanService $service): JsonResponse
    {
        $data = $request->validate([
            'description' => ['sometimes', 'required', 'string', 'max:10000'],
            'effectiveFrom' => ['sometimes', 'required', 'date_format:Y-m-d'],
        ]);
        abort_if($data === [], 422, 'Provide an objective field to update.');

        return response()->json(['data' => $service->updateDraftObjective($request, $id, $objective, $data)]);
    }

    public function activate(Request $request, int $id, StrategicPlanService $service): JsonResponse
    {
        return response()->json(['data' => $service->activate($request, $id)]);
    }

    public function storeObjective(Request $request, int $id, StrategicPlanService $service): JsonResponse
    {
        $data = $request->validate([
            'code' => ['required', 'string', 'max:40', 'regex:/^[A-Za-z0-9][A-Za-z0-9._-]*$/'],
            'description' => ['required', 'string', 'max:10000'],
            'effectiveFrom' => ['required', 'date_format:Y-m-d'],
        ]);

        return response()->json(['data' => $service->addObjective($request, $id, $data)], 201);
    }

    public function storeVersion(Request $request, int $id, int $objective, StrategicPlanService $service): JsonResponse
    {
        $data = $request->validate([
            'description' => ['required', 'string', 'max:10000'],
            'effectiveFrom' => ['required', 'date_format:Y-m-d'],
            'reason' => ['required', 'string', 'max:2000'],
        ]);

        return response()->json(['data' => $service->addVersion($request, $id, $objective, $data)], 201);
    }
}
