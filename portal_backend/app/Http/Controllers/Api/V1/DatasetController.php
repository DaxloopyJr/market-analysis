<?php

namespace App\Http\Controllers\Api\V1;

use App\DTOs\AuditEventData;
use App\DTOs\DatasetDefinitionData;
use App\DTOs\DatasetDefinitionUpdateData;
use App\DTOs\DatasetPlanningData;
use App\DTOs\DatasetSectorsData;
use App\Events\AuditEventOccurred;
use App\Http\Controllers\Controller;
use App\Models\DatasetDefinition;
use App\Models\DatasetFrequency;
use App\Models\Department;
use App\Models\Institution;
use App\Models\User;
use App\Services\ActorSnapshotService;
use App\Services\DatasetCalendarService;
use App\Services\DatasetCodeGenerator;
use App\Services\DatasetConfigurationService;
use App\Services\DatasetPlanningService;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class DatasetController extends Controller
{
    public function eligibleOfficers(Request $request): JsonResponse
    {
        $actor = $this->actor($request);
        $data = $request->validate([
            'institutionId' => ['sometimes', 'required', 'integer', 'min:1'],
            'departmentId' => ['nullable', 'integer', 'min:1'],
        ]);
        $institutionId = (int) ($data['institutionId'] ?? $actor->institution_id);
        $departmentId = array_key_exists('departmentId', $data)
            ? ($data['departmentId'] === null ? null : (int) $data['departmentId'])
            : ($actor->hasRole('MOA', 'IA', 'IDO') ? null : $actor->department_id);
        abort_unless($institutionId > 0, 422, 'Chagua institutionId kwanza.');
        $this->authorizeOwner($actor, $institutionId, $departmentId);
        $dataset = new DatasetDefinition(['institution_id' => $institutionId, 'department_id' => $departmentId]);

        // Dropdown uses the same eligibility rules as assignment, without granting user-management access.
        $query = User::where('institution_id', $institutionId)->where('is_active', true)->where('status', 'active');
        if ($departmentId !== null) {
            $query->where('department_id', $departmentId);
        }
        $officers = $query->orderBy('name')->get()
            ->filter(fn (User $user) => DatasetCalendarService::eligibleRecipient($dataset, $user))
            ->map(fn (User $user) => [
                'id' => $user->id, 'name' => $user->name,
                'institutionId' => (int) $user->institution_id,
                'departmentId' => $user->department_id === null ? null : (int) $user->department_id,
            ])->values();

        return response()->json(['data' => $officers]);
    }

    public function index(Request $request): JsonResponse
    {
        $user = $this->reader($request);
        $filters = $request->validate([
            'status' => ['sometimes', Rule::in(['draft', 'active', 'inactive'])],
            'institutionId' => ['sometimes', 'integer', 'min:1'],
            'departmentId' => ['sometimes', 'integer', 'min:1'],
            'perPage' => ['sometimes', 'integer', 'between:1,100'],
            'page' => ['sometimes', 'integer', 'min:1'],
        ]);
        $activeOnly = ! $user->hasRole('MOA') && $user->hasRole('MDO', 'MDD');
        $query = $this->readableQuery($user);
        foreach (['institutionId' => 'institution_id', 'departmentId' => 'department_id'] as $key => $column) {
            if (isset($filters[$key])) {
                $query->where($column, $filters[$key]);
            }
        }
        if ($activeOnly) {
            $query->where('status', 'active');
        } elseif (isset($filters['status'])) {
            $query->where('status', $filters['status']);
        }
        $datasets = $query->with('frequencies')->orderByDesc('id')
            ->paginate($filters['perPage'] ?? 20)->appends($filters);
        $datasets->through(fn (DatasetDefinition $dataset) => $this->snapshot($dataset));

        return response()->json(array_merge($datasets->toArray(), [
            'message' => 'All DataSets retrieved successfully.',
        ]));
    }

    public function show(Request $request, string $id): JsonResponse
    {
        $user = $this->reader($request);
        $query = $this->readableQuery($user);
        if (! $user->hasRole('MOA') && $user->hasRole('MDO', 'MDD')) {
            $query->where('status', 'active');
        }
        $dataset = $query->with('frequencies')->findOrFail($id);

        return response()->json(['data' => $this->snapshot($dataset)]);
    }

    public function store(Request $request, DatasetCodeGenerator $codeGenerator, DatasetConfigurationService $configuration): JsonResponse
    {
        $user = $this->actor($request);
        $data = $request->validate(DatasetPlanningData::rules() + [
            'institutionId' => ['required', 'integer', Rule::exists('institutions', 'id')->whereNull('deleted_at')],
            'departmentId' => ['nullable', 'integer', Rule::exists('departments', 'id')->whereNull('deleted_at')],
            'datasetCode' => ['prohibited'],
            'datasetName' => ['required', 'string', 'max:255'],
            'responsibleUserId' => ['required', 'integer', Rule::exists('users', 'id')->whereNull('deleted_at')],
            'description' => ['nullable', 'string', 'max:10000'],
            'frequencies' => ['required', 'array', 'min:1'],
            'frequencies.*' => ['required', 'string', 'distinct', Rule::in(DatasetFrequency::ALLOWED)],
            'status' => ['sometimes', Rule::in(['draft'])],
            'createdBy' => ['prohibited'],
            'sectors' => ['required', 'array', 'min:1', 'max:100'],
            'sectors.*' => ['required', 'array:sectorId,subsectorIds'],
            'sectors.*.sectorId' => ['required', 'integer', 'distinct', Rule::exists('reference_data_values', 'id')],
            'sectors.*.subsectorIds' => ['sometimes', 'array', 'max:1000'],
            'sectors.*.subsectorIds.*' => ['required', 'integer', 'distinct', Rule::exists('reference_data_values', 'id')],
        ]);
        $institutionId = (int) $data['institutionId'];
        $departmentId = isset($data['departmentId']) ? (int) $data['departmentId'] : null;
        $this->authorizeOwner($user, $institutionId, $departmentId);
        // DTO hubeba data zilizohakikiwa; hatua ya kuunda dataset haitumi notification.
        $dto = new DatasetDefinitionData(
            $institutionId, $departmentId, $data['datasetName'],
            $data['description'] ?? null, $data['frequencies'],
            new DatasetSectorsData($data['sectors']),
            (int) $data['responsibleUserId'],
        );

        $dataset = DB::transaction(function () use ($dto, $data, $user, $request, $codeGenerator, $configuration) {
            $datasetCode = $codeGenerator->next($dto->institutionId);
            $dataset = DatasetDefinition::create($dto->attributes() + [
                'dataset_code' => $datasetCode, 'created_by' => $user->id, 'status' => 'draft',
                'creator_snapshot' => app(ActorSnapshotService::class)->capture($user),
            ]);
            abort_unless(DatasetCalendarService::eligibleRecipient($dataset, User::findOrFail($dto->responsibleUserId)), 422, 'Chagua IDO/DDO active wa taasisi au idara ya dataset.');
            $this->syncFrequencies($dataset, $dto->frequencies);
            // Dataset na sectors huhifadhiwa pamoja; hitilafu hurudisha transaction yote nyuma.
            $configuration->assignInitialSectors($request, $dataset->id, $dto->sectors);
            app(DatasetPlanningService::class)->apply($dataset, new DatasetPlanningData($data), $user->id);
            $this->audit($request, $dataset, 'dataset_created', null);

            return $dataset;
        });

        return response()->json(['data' => $this->snapshot($dataset)], 201);
    }

    public function update(Request $request, string $id): JsonResponse
    {
        $dataset = $this->scopedQuery($request)->findOrFail($id);
        $data = $request->validate(DatasetPlanningData::rules() + [
            'datasetCode' => ['prohibited'],
            'datasetName' => ['sometimes', 'required', 'string', 'max:255'],
            'responsibleUserId' => ['sometimes', 'required', 'integer', Rule::exists('users', 'id')->whereNull('deleted_at')],
            'description' => ['sometimes', 'nullable', 'string', 'max:10000'],
            'frequencies' => ['sometimes', 'required', 'array', 'min:1'],
            'frequencies.*' => ['required', 'string', 'distinct', Rule::in(DatasetFrequency::ALLOWED)],
            // Activation hutumia endpoint maalumu inayohakiki configuration na kutoa template version.
            'status' => ['sometimes', 'required', Rule::in(['draft', 'inactive'])],
            'institutionId' => ['prohibited'],
            'sectors' => ['sometimes', 'required', 'array', 'min:1', 'max:100'],
            'sectors.*' => ['required', 'array:sectorId,subsectorIds'],
            'sectors.*.sectorId' => ['required', 'integer', 'distinct', Rule::exists('reference_data_values', 'id')],
            'sectors.*.subsectorIds' => ['sometimes', 'array', 'max:1000'],
            'sectors.*.subsectorIds.*' => ['required', 'integer', 'distinct', Rule::exists('reference_data_values', 'id')],
            'sectorIds' => ['prohibited'],
            'subsectorIds' => ['prohibited'],
            'departmentId' => ['prohibited'],
            'createdBy' => ['prohibited'],
        ]);

        return DB::transaction(function () use ($request, $id, $data): JsonResponse {
            // Hold the master lock through both updates; invalid sectors must roll back all fields and audits.
            $dataset = $this->scopedQuery($request)->lockForUpdate()->findOrFail($id);
            if (array_key_exists('sectors', $data)) {
                abort_unless($dataset->status === 'draft', 422, 'Dataset lazima iwe draft kabla ya kubadilisha sectors.');
            }
            $this->change($request, $id, new DatasetDefinitionUpdateData($data), new DatasetPlanningData($data));
            if (array_key_exists('sectors', $data)) {
                app(DatasetConfigurationService::class)->replaceSectors($request, (int) $id, new DatasetSectorsData($data['sectors']));
            }

            // The dataset endpoint always returns its normal snapshot, including the updated sector IDs.
            return response()->json(['data' => $this->snapshot($dataset->fresh())]);
        });
    }

    public function destroy(Request $request, string $id): JsonResponse
    {
        // Kufuta kupitia API husitisha matumizi; record na historia yake hubaki.
        return $this->change($request, $id, new DatasetDefinitionUpdateData(['status' => 'inactive']));
    }

    private function change(Request $request, string $id, DatasetDefinitionUpdateData $dto, ?DatasetPlanningData $planning = null): JsonResponse
    {
        $dataset = DB::transaction(function () use ($request, $id, $dto, $planning) {
            $dataset = $this->scopedQuery($request)->lockForUpdate()->findOrFail($id);
            $before = $this->snapshot($dataset);
            // Muundo active hubadilishwa baada ya endpoint ya draft; snapshot ya zamani hubaki.
            if ($dataset->status === 'active') {
                abort_if($planning && ($planning->attributes() !== [] || array_key_exists('consumers', $planning->data)), 422, 'Rudisha dataset kuwa draft kabla ya kubadili source au consumers.');
                $structuralChanges = array_diff_key($dto->attributes(), ['responsible_user_id' => true]);
                abort_unless(($structuralChanges === [] || $structuralChanges === ['status' => 'inactive']) && $dto->frequencies() === null, 422,
                    'Dataset active inaweza kuwekwa inactive pekee katika hatua hii.');
            }
            $dataset->fill($dto->attributes());
            if (array_key_exists('responsible_user_id', $dto->attributes())) {
                abort_unless(DatasetCalendarService::eligibleRecipient($dataset, User::findOrFail($dataset->responsible_user_id)), 422, 'Chagua IDO/DDO active wa taasisi au idara ya dataset.');
                // Officer is operational metadata: keep reporting defaults aligned without changing template history.
                if ($dataset->reporting_settings !== null) {
                    $dataset->reporting_settings = [...$dataset->reporting_settings, 'responsibleUserId' => (int) $dataset->responsible_user_id];
                }
            }
            if ($dataset->isDirty('responsible_user_id')) {
                app(DatasetCalendarService::class)->reassignPending($request, $dataset);
            }
            if ($dataset->isDirty()) {
                $dataset->save();
            }
            if ($dto->frequencies() !== null) {
                $this->syncFrequencies($dataset, $dto->frequencies());
            }
            if ($planning) {
                app(DatasetPlanningService::class)->apply($dataset, $planning, $request->user()->id);
            }
            if ($before !== $this->snapshot($dataset)) {
                $this->audit($request, $dataset, $dataset->status === 'inactive' ? 'dataset_deactivated' : 'dataset_updated', $before);
            }

            return $dataset;
        });

        return response()->json(['data' => $this->snapshot($dataset)]);
    }

    private function actor(Request $request): User
    {
        $user = $request->user();
        abort_unless($user, 401);
        abort_unless($user->is_active && $user->status === 'active', 403);
        abort_unless($user->hasRole('MOA', 'IA', 'IDO', 'DDO'), 403);

        return $user;
    }

    private function reader(Request $request): User
    {
        $user = $request->user();
        abort_unless($user, 401);
        abort_unless($user->is_active && $user->status === 'active', 403);
        abort_unless($user->hasRole('MOA', 'IA', 'IDO', 'DDO', 'MDO', 'MDD', 'IAU', 'MAU'), 403);

        return $user;
    }

    private function readableQuery(User $user): Builder
    {
        $query = DatasetDefinition::query();
        if ($user->hasRole('MOA')) {
            return $query;
        }
        if ($user->hasRole('MDO', 'MDD', 'MAU')) {
            abort_unless($user->canDo('datasets.view.ministry') && $user->institution?->code === 'MIT'
                && $user->institution->is_active && $user->institution->status === 'active', 403);

            return $query;
        }
        abort_unless($user->institution_id !== null, 403);
        $query->where('institution_id', $user->institution_id);
        if (! $user->hasRole('IA', 'IDO', 'IAU')) {
            abort_unless($user->department_id !== null, 403);
            $query->where('department_id', $user->department_id);
        }

        return $query;
    }

    private function scopedQuery(Request $request): Builder
    {
        $user = $this->actor($request);
        $query = DatasetDefinition::query();
        if ($user->hasRole('MOA')) {
            return $query;
        }
        abort_unless($user->institution_id !== null, 403);
        $query->where('institution_id', $user->institution_id);
        if (! $user->hasRole('IA', 'IDO')) {
            abort_unless($user->department_id !== null, 403);
            $query->where('department_id', $user->department_id);
        }

        return $query;
    }

    private function authorizeOwner(User $user, int $institutionId, ?int $departmentId): void
    {
        // Umiliki hauhamishwi kwa kutegemea IDs zilizotumwa na client pekee.
        if (! $user->hasRole('MOA')) {
            abort_unless((int) $user->institution_id === $institutionId, 403);
            if (! $user->hasRole('IA', 'IDO')) {
                abort_unless($user->department_id !== null && (int) $user->department_id === $departmentId, 403);
            } else {
                abort_unless($departmentId === null, 403);
            }
        }
        $institution = Institution::findOrFail($institutionId);
        abort_unless($institution->is_active && $institution->status === 'active', 422, 'Taasisi haiko active.');
        if ($departmentId !== null) {
            // Departments za schema hii ni za wizara inayotambuliwa kwa code MIT.
            abort_unless($institution->code === 'MIT', 422, 'Department lazima iwe chini ya ministry MIT.');
            $department = Department::findOrFail($departmentId);
            abort_unless($department->is_active && $department->status === 'active', 422, 'Department haiko active.');
        }
    }

    private function syncFrequencies(DatasetDefinition $dataset, array $frequencies): void
    {
        $dataset->frequencies()->whereNotIn('frequency', $frequencies)->delete();
        foreach ($frequencies as $frequency) {
            $dataset->frequencies()->firstOrCreate(['frequency' => $frequency]);
        }
        $dataset->unsetRelation('frequencies');
    }

    private function snapshot(DatasetDefinition $dataset): array
    {
        return [
            'id' => $dataset->id,
            'institutionId' => (int) $dataset->institution_id,
            'departmentId' => $dataset->department_id === null ? null : (int) $dataset->department_id,
            'datasetCode' => $dataset->dataset_code,
            'datasetName' => $dataset->dataset_name,
            'reportingPurpose' => $dataset->reporting_purpose,
            'responsibleUserId' => $dataset->responsible_user_id === null ? null : (int) $dataset->responsible_user_id,
            'description' => $dataset->description,
            'collectionMethod' => $dataset->collection_method,
            'reportingSettings' => $dataset->reporting_settings,
            'sourceSystemName' => $dataset->source_system_name,
            'sourceDescription' => $dataset->source_description,
            'priority' => $dataset->priority,
            'priorityUpdatedBy' => $dataset->priority_updated_by,
            'priorityUpdatedAt' => $dataset->priority_updated_at?->toIso8601String(),
            'consumers' => $dataset->consumers->map(fn ($consumer) => [
                'id' => $consumer->id, 'name' => $consumer->name, 'shortName' => $consumer->short_name,
                'description' => $consumer->description,
            ])->all(),
            'status' => $dataset->status,
            'createdBy' => (int) $dataset->created_by,
            'creator' => $dataset->creator_snapshot,
            'frequencies' => $dataset->frequencies->pluck('frequency')->sort()->values()->all(),
            'sectorIds' => $dataset->sectors()->pluck('reference_data_values.id')->all(),
            'subsectorIds' => $dataset->subsectors()->pluck('reference_data_values.id')->all(),
            'latestTemplateVersionId' => $dataset->templateVersions()->orderByDesc('version_number')->value('id'),
            'createdAt' => $dataset->created_at?->toIso8601String(),
            'updatedAt' => $dataset->updated_at?->toIso8601String(),
        ];
    }

    private function audit(Request $request, DatasetDefinition $dataset, string $eventType, ?array $before): void
    {
        // Listener ni synchronous; ikishindwa, transaction ya dataset nayo hurudishwa nyuma.
        AuditEventOccurred::dispatch(new AuditEventData(
            eventType: $eventType,
            userId: $request->user()->id,
            entityType: 'dataset_definition',
            entityId: (string) $dataset->id,
            ipAddress: $request->ip(),
            requestId: $request->attributes->get('auditRequestId'),
            oldValues: $before,
            newValues: $this->snapshot($dataset),
        ));
    }
}
