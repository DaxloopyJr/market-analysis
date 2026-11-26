<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Services\SystemMonitoringService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class SystemMonitoringController extends Controller
{
    public function index(Request $request, SystemMonitoringService $monitoring): JsonResponse
    {
        $user = $request->user();
        abort_unless($user->is_active && $user->status === 'active' && $user->hasRole('MOA')
            && $user->institution?->code === 'MIT' && $user->institution->is_active
            && $user->institution->status === 'active', 403);
        $data = $request->validate(['window' => ['sometimes', Rule::in(['24h', '7d', '30d'])]]);

        return response()->json(['status' => 'success', 'data' => $monitoring->dashboard($data['window'] ?? '24h')])
            ->header('Cache-Control', 'no-store');
    }
}
