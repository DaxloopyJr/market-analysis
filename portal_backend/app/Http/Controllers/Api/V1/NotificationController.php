<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\NotificationResource;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class NotificationController extends Controller
{
    public function index(Request $request): AnonymousResourceCollection
    {
        $filters = $request->validate([
            'isRead' => ['sometimes', 'boolean'],
            'perPage' => ['sometimes', 'integer', 'between:1,100'],
            'page' => ['sometimes', 'integer', 'min:1'],
        ]);

        // Umiliki hutokana na token; userId ya client haiwezi kubadilisha wigo wa query.
        $query = $request->user()->portalNotifications();
        if (array_key_exists('isRead', $filters)) {
            $query->where('is_read', $filters['isRead']);
        }

        return NotificationResource::collection(
            $query->orderByDesc('created_at')->orderByDesc('id')
                ->paginate($filters['perPage'] ?? 20)->appends($filters)
        );
    }

    public function unreadCount(Request $request): JsonResponse
    {
        return response()->json(['data' => [
            'unreadCount' => $request->user()->portalNotifications()->where('is_read', false)->count(),
        ]]);
    }

    public function show(Request $request, string $id): NotificationResource
    {
        return new NotificationResource($request->user()->portalNotifications()->findOrFail($id));
    }

    public function markRead(Request $request, string $id): NotificationResource
    {
        // Rekodi ya mpokeaji mwingine hurudisha 404; kurudia request hakubadili ujumbe.
        $notification = $request->user()->portalNotifications()->findOrFail($id);
        $notification->update(['is_read' => true]);

        return new NotificationResource($notification);
    }
}
