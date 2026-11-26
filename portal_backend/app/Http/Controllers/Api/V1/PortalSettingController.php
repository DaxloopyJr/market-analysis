<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\UpdatePortalSettingsRequest;
use App\Services\PortalSettingsService;
use Illuminate\Http\JsonResponse;

class PortalSettingController extends Controller
{
    public function index(PortalSettingsService $settingsService): JsonResponse
    {
        return response()->json([
            'status' => 'success',
            'data' => $settingsService->adminSettings(),
        ]);
    }

    public function publicIndex(PortalSettingsService $settingsService): JsonResponse
    {
        return response()->json([
            'status' => 'success',
            'data' => $settingsService->publicSettings(),
        ]);
    }

    public function update(
        UpdatePortalSettingsRequest $request,
        PortalSettingsService $settingsService,
    ): JsonResponse {
        $validated = $request->validated();

        $settingsService->update(
            $validated['settings'],
            $request->user()?->id,
            $request->ip(),
            $request->attributes->get('auditRequestId'),
        );

        return response()->json([
            'status' => 'success',
            'message' => 'Settings saved.',
            'data' => $settingsService->adminSettings(),
        ]);
    }
}
