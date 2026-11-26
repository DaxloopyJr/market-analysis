<?php

namespace App\Services;

use App\DTOs\AuditEventData;
use App\Models\Institution;
use App\Models\User;
use Illuminate\Database\Query\Builder;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class StrategicPlanService
{
    /** Ministry departments share MIT's plan; institutional codes have their own namespace. */
    public function authorize(User $actor, int $institutionId, bool $write = false, bool $objectiveWrite = false): void
    {
        abort_unless($actor->is_active && $actor->status === 'active', 403);
        $home = $actor->institution;
        abort_unless($home && $home->is_active && $home->status === 'active', 403);
        $ministry = $home->code === 'MIT';
        if ($write) {
            $institutionWriter = (int) $actor->institution_id === $institutionId
                && (($ministry && $actor->hasRole('MDO', 'MDD'))
                    || (! $ministry && ($actor->hasRole('IA') || ($objectiveWrite && $actor->hasRole('IDO')))));
            abort_unless(($ministry && $actor->hasRole('MOA'))
                || $institutionWriter, 403);
        } else {
            abort_unless((int) $actor->institution_id === $institutionId
                || ($ministry && $actor->hasRole('MOA', 'MDO', 'MDD', 'MAU', 'PREVIEW')), 404);
        }
        $owner = Institution::findOrFail($institutionId);
        abort_unless($owner->is_active && $owner->status === 'active', 422, 'The plan owner must be active.');
    }

    public function query(User $actor): Builder
    {
        $this->authorize($actor, (int) $actor->institution_id);
        $query = DB::table('strategic_plans');
        if ($actor->institution->code !== 'MIT' || ! $actor->hasRole('MOA', 'MDO', 'MDD', 'MAU', 'PREVIEW')) {
            $query->where('institution_id', $actor->institution_id);
        }

        return $query;
    }

    public function find(User $actor, int $id, bool $write = false, bool $objectiveWrite = false): object
    {
        $plan = $this->query($actor)->where('id', $id)->first();
        abort_unless($plan, 404);
        $this->authorize($actor, (int) $plan->institution_id, $write, $objectiveWrite);

        return $plan;
    }

    public function create(Request $request, array $data): array
    {
        $owner = (int) ($data['institutionId'] ?? $request->user()->institution_id);
        $this->authorize($request->user(), $owner, true);

        return DB::transaction(function () use ($request, $data, $owner) {
            $id = DB::table('strategic_plans')->insertGetId([
                'institution_id' => $owner, 'name' => trim($data['name']),
                'start_date' => $data['startDate'], 'end_date' => $data['endDate'],
                'status' => 'draft', 'created_by' => $request->user()->id,
                'created_at' => now(), 'updated_at' => now(),
            ]);
            $result = $this->snapshot(DB::table('strategic_plans')->find($id));
            $this->audit($request, 'strategic_plan_created', 'strategic_plan', $id, null, $result);

            return $result;
        }, 3);
    }

    /** Draft plans can be corrected; activated plan metadata is part of historical snapshots. */
    public function updateDraft(Request $request, int $id, array $data): array
    {
        $this->find($request->user(), $id, true);

        return DB::transaction(function () use ($request, $id, $data) {
            $plan = DB::table('strategic_plans')->where('id', $id)->lockForUpdate()->first();
            abort_unless($plan->status === 'draft', 409, 'Activated plan metadata is immutable.');
            $start = $data['startDate'] ?? $plan->start_date;
            $end = $data['endDate'] ?? $plan->end_date;
            abort_unless($end > $start, 422, 'Plan end date must be after its start date.');
            abort_if($this->versions()->where('p.id', $id)->where(fn ($q) => $q->where('v.effective_from', '<', $start)
                ->orWhere('v.effective_from', '>', $end))->exists(), 422, 'Plan dates must include all its objective versions.');
            $before = $this->snapshot($plan);
            DB::table('strategic_plans')->where('id', $id)->update([
                'name' => trim($data['name'] ?? $plan->name), 'start_date' => $start, 'end_date' => $end, 'updated_at' => now(),
            ]);
            $result = $this->snapshot(DB::table('strategic_plans')->find($id));
            $this->audit($request, 'strategic_plan_updated', 'strategic_plan', $id, $before, $result);

            return $result;
        }, 3);
    }

    public function updateDraftObjective(Request $request, int $planId, int $objectiveId, array $data): array
    {
        $this->find($request->user(), $planId, true, true);

        return DB::transaction(function () use ($request, $planId, $objectiveId, $data) {
            $plan = DB::table('strategic_plans')->where('id', $planId)->lockForUpdate()->first();
            abort_unless($plan->status === 'draft', 409, 'Create a new objective version for an activated plan.');
            abort_unless(DB::table('strategic_objectives')->where('id', $objectiveId)->where('strategic_plan_id', $planId)->exists(), 404);
            $latest = DB::table('strategic_objective_versions')->where('strategic_objective_id', $objectiveId)->orderByDesc('version_number')->first();
            $before = $this->versionSnapshot((int) $latest->id);
            $date = $data['effectiveFrom'] ?? $latest->effective_from;
            $this->effectiveDate($plan, $date);
            abort_if(DB::table('strategic_objective_versions')->where('strategic_objective_id', $objectiveId)
                ->where('id', '!=', $latest->id)->where('effective_from', '>=', $date)->exists(), 422, 'Effective date must follow preceding versions.');
            DB::table('strategic_objective_versions')->where('id', $latest->id)->update([
                'description' => trim($data['description'] ?? $latest->description), 'effective_from' => $date, 'updated_at' => now(),
            ]);
            $result = $this->versionSnapshot((int) $latest->id);
            $this->audit($request, 'strategic_objective_draft_updated', 'strategic_objective', $objectiveId, $before, $result);

            return $result;
        }, 3);
    }

    /** Activated metadata and all objective versions are immutable through the API. */
    public function activate(Request $request, int $id): array
    {
        $plan = $this->find($request->user(), $id, true);

        return DB::transaction(function () use ($request, $id, $plan) {
            // Serializes competing activations for the same owner, including empty date ranges.
            Institution::whereKey($plan->institution_id)->lockForUpdate()->firstOrFail();
            $plan = DB::table('strategic_plans')->where('id', $id)->lockForUpdate()->first();
            abort_unless($plan->status === 'draft', 409, 'Plan is already active.');
            abort_if(DB::table('strategic_plans')->where('institution_id', $plan->institution_id)
                ->where('status', 'active')->where('start_date', '<=', $plan->end_date)
                ->where('end_date', '>=', $plan->start_date)->exists(), 409, 'An active strategic plan already covers this date range.');
            abort_unless(DB::table('strategic_objectives as o')->join('strategic_objective_versions as v', 'v.strategic_objective_id', '=', 'o.id')
                ->where('o.strategic_plan_id', $id)->where('v.effective_from', '<=', $plan->start_date)->exists(), 422, 'Add an objective effective at the start of the plan before activation.');
            $before = $this->snapshot($plan);
            DB::table('strategic_plans')->where('id', $id)->update(['status' => 'active', 'activated_at' => now(), 'updated_at' => now()]);
            $result = $this->snapshot(DB::table('strategic_plans')->find($id));
            $this->audit($request, 'strategic_plan_activated', 'strategic_plan', $id, $before, $result);

            return $result;
        }, 3);
    }

    public function addObjective(Request $request, int $planId, array $data): array
    {
        $this->find($request->user(), $planId, true, true);

        return DB::transaction(function () use ($request, $planId, $data) {
            $plan = DB::table('strategic_plans')->where('id', $planId)->lockForUpdate()->first();
            $code = mb_strtoupper(trim($data['code']));
            abort_if(DB::table('strategic_objectives')->where('strategic_plan_id', $planId)->where('code', $code)->exists(), 409, 'Objective code already exists in this plan. Create a new version instead.');
            $this->effectiveDate($plan, $data['effectiveFrom']);
            $objective = DB::table('strategic_objectives')->insertGetId([
                'strategic_plan_id' => $planId, 'code' => $code, 'created_at' => now(), 'updated_at' => now(),
            ]);
            $id = $this->insertVersion($request, $objective, 1, $data);
            $result = $this->versionSnapshot($id);
            $this->audit($request, 'strategic_objective_created', 'strategic_objective', $objective, null, $result);

            return $result;
        }, 3);
    }

    public function addVersion(Request $request, int $planId, int $objectiveId, array $data): array
    {
        $this->find($request->user(), $planId, true, true);

        return DB::transaction(function () use ($request, $planId, $objectiveId, $data) {
            $plan = DB::table('strategic_plans')->where('id', $planId)->lockForUpdate()->first();
            $objective = DB::table('strategic_objectives')->where('strategic_plan_id', $planId)->where('id', $objectiveId)->first();
            abort_unless($objective, 404);
            $latest = DB::table('strategic_objective_versions')->where('strategic_objective_id', $objectiveId)->orderByDesc('version_number')->first();
            $this->effectiveDate($plan, $data['effectiveFrom']);
            abort_unless($data['effectiveFrom'] > $latest->effective_from, 422, 'A new version must start after the previous version.');
            $id = $this->insertVersion($request, $objectiveId, (int) $latest->version_number + 1, $data);
            $result = $this->versionSnapshot($id);
            $this->audit($request, 'strategic_objective_version_created', 'strategic_objective', $objectiveId,
                $this->versionSnapshot((int) $latest->id), $result, $data['reason']);

            return $result;
        }, 3);
    }

    private function effectiveDate(object $plan, string $date): void
    {
        abort_unless($date >= $plan->start_date && $date <= $plan->end_date, 422, 'Objective effective date must fall within the strategic plan.');
    }

    private function insertVersion(Request $request, int $objectiveId, int $number, array $data): int
    {
        return DB::table('strategic_objective_versions')->insertGetId([
            'strategic_objective_id' => $objectiveId, 'version_number' => $number,
            'description' => trim($data['description']), 'effective_from' => $data['effectiveFrom'],
            'reason' => $data['reason'] ?? null, 'created_by' => $request->user()->id,
            'created_at' => now(), 'updated_at' => now(),
        ]);
    }

    public function snapshot(object $plan, bool $includeObjectives = false): array
    {
        $result = ['id' => (int) $plan->id, 'institutionId' => (int) $plan->institution_id,
            'name' => $plan->name, 'startDate' => $plan->start_date, 'endDate' => $plan->end_date,
            'status' => $plan->status, 'createdBy' => (int) $plan->created_by, 'activatedAt' => $plan->activated_at];
        if ($includeObjectives) {
            $result['objectiveVersions'] = $this->versions()->where('p.id', $plan->id)
                ->orderBy('o.code')->orderBy('v.version_number')->get()->map(fn ($row) => $this->mapVersion($row))->all();
        }

        return $result;
    }

    public function versions(): Builder
    {
        return DB::table('strategic_objective_versions as v')
            ->join('strategic_objectives as o', 'o.id', '=', 'v.strategic_objective_id')
            ->join('strategic_plans as p', 'p.id', '=', 'o.strategic_plan_id')
            ->select('v.*', 'o.code', 'p.id as plan_id', 'p.name as plan_name', 'p.institution_id', 'p.start_date', 'p.end_date');
    }

    public function versionSnapshot(int $id): array
    {
        $row = $this->versions()->where('v.id', $id)->first();
        abort_unless($row, 404);

        return $this->mapVersion($row);
    }

    public function mapVersion(object $row): array
    {
        return ['objectiveVersionId' => (int) $row->id, 'objectiveId' => (int) $row->strategic_objective_id,
            'versionNumber' => (int) $row->version_number, 'code' => $row->code, 'description' => $row->description,
            'effectiveFrom' => $row->effective_from, 'strategicPlanId' => (int) $row->plan_id,
            'strategicPlanName' => $row->plan_name, 'planStartDate' => $row->start_date, 'planEndDate' => $row->end_date,
            'institutionId' => (int) $row->institution_id, 'createdBy' => (int) $row->created_by, 'reason' => $row->reason];
    }

    public function audit(Request $request, string $event, string $entity, int $id, ?array $before, array $after, ?string $reason = null): void
    {
        app(AuditService::class)->record(new AuditEventData(
            eventType: $event, userId: $request->user()->id, entityType: $entity, entityId: (string) $id,
            oldValues: $before, newValues: $after, reason: $reason,
            ipAddress: $request->ip(), requestId: $request->attributes->get('auditRequestId'),
        ));
    }
}
