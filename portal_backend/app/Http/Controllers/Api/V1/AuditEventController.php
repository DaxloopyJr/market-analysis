<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\ListAuditEventsRequest;
use App\Http\Resources\AuditEventResource;
use App\Services\AuditQueryService;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class AuditEventController extends Controller
{
    public function index(ListAuditEventsRequest $request, AuditQueryService $auditQueryService): AnonymousResourceCollection
    {
        return AuditEventResource::collection($auditQueryService->paginate($request->validated()));
    }

    public function show(string $id): AuditEventResource
    {
        // Ruhusa hukaguliwa kwenye route kabla ya kutafuta rekodi husika.
        return new AuditEventResource(app(AuditQueryService::class)->scopedQuery()->findOrFail($id));
    }
}
