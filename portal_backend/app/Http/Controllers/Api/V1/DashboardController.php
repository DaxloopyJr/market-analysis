<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Services\DashboardService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class DashboardController extends Controller
{
    public function index(Request $request, DashboardService $dashboard): JsonResponse
    {
        $filters = $request->validate([
            'fy' => ['sometimes', 'required', 'string', 'regex:/^(all|20\d{2}\/(\d{2}|20\d{2}|2100))$/'],
            'institution_id' => ['sometimes', 'required', 'integer', 'min:1', 'exists:institutions,id'],
            'department_id' => ['sometimes', 'required', 'integer', 'min:1', 'exists:departments,id'],
        ]);

        return response()->json(['status' => 'success', 'data' => $dashboard->build($request->user(), $filters)]);
    }
}
