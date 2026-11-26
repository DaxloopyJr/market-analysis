<?php

namespace App\Http\Controllers\Api\V1;

use App\DTOs\IndicatorData;
use App\DTOs\IndicatorUpdateData;
use App\Http\Controllers\Controller;
use App\Models\Indicator;
use App\Models\User;
use App\Services\IndicatorService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class IndicatorController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $this->actor($request);
        $filters = $request->validate([
            'status' => ['sometimes', Rule::in(['active', 'inactive'])],
            'dataType' => ['sometimes', Rule::in(Indicator::DATA_TYPES)],
            'perPage' => ['sometimes', 'integer', 'between:1,100'],
            'page' => ['sometimes', 'integer', 'min:1'],
        ]);
        $query = Indicator::query();
        if (isset($filters['status'])) {
            $query->where('status', $filters['status']);
        }
        if (isset($filters['dataType'])) {
            $query->where('data_type', $filters['dataType']);
        }
        $page = $query->orderByDesc('id')->paginate($filters['perPage'] ?? 20)->appends($filters);
        $page->through(fn (Indicator $indicator) => $this->snapshot($indicator));

        return response()->json($page);
    }

    public function show(Request $request, int $id): JsonResponse
    {
        $this->actor($request);

        return response()->json(['data' => $this->snapshot(Indicator::findOrFail($id))]);
    }

    public function store(Request $request, IndicatorService $service): JsonResponse
    {
        $actor = $this->actor($request);
        $data = $request->validate($this->rules());
        $indicator = $service->create(new IndicatorData(
            nameEn: $data['nameEn'], dataType: $data['dataType'],
            nameSw: $data['nameSw'] ?? null, descriptionEn: $data['descriptionEn'] ?? null,
            descriptionSw: $data['descriptionSw'] ?? null, unitId: $data['unitId'] ?? null,
            aggregationRule: $data['aggregationRule'] ?? 'none', status: $data['status'] ?? 'active',
            performanceDirection: $data['performanceDirection'] ?? 'higher_is_better',
        ), $actor,
            $request->attributes->get('auditIpAddress', $request->ip()), $request->attributes->get('auditRequestId'));

        return response()->json(['data' => $this->snapshot($indicator)], 201);
    }

    public function update(Request $request, int $id, IndicatorService $service): JsonResponse
    {
        $actor = $this->actor($request);
        $indicator = Indicator::findOrFail($id);
        abort_unless($actor->hasRole('MOA') || (int) $indicator->created_by === (int) $actor->id, 403);
        $data = $request->validate($this->rules($id));
        $indicator = $service->update($id, new IndicatorUpdateData($data), $actor,
            $request->attributes->get('auditIpAddress', $request->ip()), $request->attributes->get('auditRequestId'));

        return response()->json(['data' => $this->snapshot($indicator)]);
    }

    public function destroy(Request $request, int $id, IndicatorService $service): JsonResponse
    {
        // DELETE husitisha matumizi; indicator na historia yake havifutwi kwenye database.
        $indicator = $service->update($id, new IndicatorUpdateData(['status' => 'inactive']), $this->actor($request),
            $request->attributes->get('auditIpAddress', $request->ip()), $request->attributes->get('auditRequestId'));

        return response()->json(['data' => $this->snapshot($indicator)]);
    }

    private function actor(Request $request): User
    {
        $user = $request->user();
        abort_unless($user, 401);
        abort_unless($user->is_active && $user->status === 'active', 403);
        // Roles za kuandaa datasets hutumia catalogue ya indicators inayoshirikiwa.
        abort_unless($user->hasRole('MOA', 'IA', 'IDO', 'DDO'), 403);

        return $user;
    }

    private function rules(?int $id = null): array
    {
        $required = $id === null ? ['required'] : ['sometimes', 'required'];

        return [
            'indicatorCode' => ['prohibited'],
            'nameEn' => [...$required, 'string', 'max:255'],
            'nameSw' => ['sometimes', 'nullable', 'string', 'max:255'],
            'descriptionEn' => ['sometimes', 'nullable', 'string', 'max:10000'],
            'descriptionSw' => ['sometimes', 'nullable', 'string', 'max:10000'],
            'dataType' => [...$required, Rule::in(Indicator::DATA_TYPES)],
            'unitId' => ['sometimes', 'nullable', 'integer', Rule::exists('reference_data_values', 'id')],
            'performanceDirection' => ['sometimes', 'required', Rule::in(Indicator::PERFORMANCE_DIRECTIONS)],
            'aggregationRule' => ['sometimes', 'required', Rule::in(Indicator::AGGREGATION_RULES)],
            'status' => ['sometimes', 'required', Rule::in(['active', 'inactive'])],
            'createdBy' => ['prohibited'],
        ];
    }

    private function snapshot(Indicator $indicator): array
    {
        return [
            'id' => $indicator->id, 'indicatorCode' => $indicator->indicator_code,
            'nameEn' => $indicator->name_en, 'nameSw' => $indicator->name_sw,
            'descriptionEn' => $indicator->description_en, 'descriptionSw' => $indicator->description_sw,
            'dataType' => $indicator->data_type, 'unitId' => $indicator->unit_id,
            'performanceDirection' => $indicator->performance_direction,
            'aggregationRule' => $indicator->aggregation_rule, 'status' => $indicator->status,
            'createdBy' => (int) $indicator->created_by,
            'createdAt' => $indicator->created_at?->toIso8601String(),
            'updatedAt' => $indicator->updated_at?->toIso8601String(),
        ];
    }
}
