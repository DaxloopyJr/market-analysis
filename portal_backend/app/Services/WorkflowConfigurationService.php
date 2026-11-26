<?php

namespace App\Services;

use App\DTOs\AuditEventData;
use App\Events\AuditEventOccurred;
use App\Models\ApprovalCircle;
use App\Models\ApprovalCircleStep;
use App\Models\DatasetDefinition;
use App\Models\Role;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class WorkflowConfigurationService
{
    public function query(User $actor): Builder
    {
        abort_unless($actor->is_active && $actor->status === 'active', 403);

        if ($actor->hasRole('MOA')) {
            return ApprovalCircle::where('scope_key', 'global');
        }

        abort_unless($actor->hasRole('IA') && $actor->canDo('approval_circle.manage.institution')
            && $actor->institution_id !== null, 403);

        return ApprovalCircle::where('scope_key', $this->institutionScope((int) $actor->institution_id))
            ->where('institution_id', $actor->institution_id);
    }

    public function save(Request $request, array $data, ?int $id = null): ApprovalCircle
    {
        return DB::transaction(function () use ($request, $data, $id) {
            $actor = $request->user();
            $this->query($actor);
            $scopeKey = $this->scopeKey($actor);
            $institutionId = $actor->hasRole('MOA') ? null : (int) $actor->institution_id;
            DB::table('roles')->where('code', 'MOA')->lockForUpdate()->first();
            $circle = $id ? $this->query($actor)->lockForUpdate()->findOrFail($id) : null;
            abort_if($circle && $circle->status !== 'draft', 409, 'Clone workflow to a new draft before changing an activated version.');
            if (! $circle) {
                $circle = new ApprovalCircle(['name' => $data['name'], 'institution_id' => $institutionId, 'department_id' => null,
                    'scope_key' => $scopeKey, 'version_number' => ((int) ApprovalCircle::where('scope_key', $scopeKey)->max('version_number')) + 1,
                    'status' => 'draft', 'is_active' => false, 'created_by' => $actor->id]);
            }
            $before = $circle->exists ? $circle->load('steps')->toArray() : null;
            $circle->name = $data['name'] ?? $circle->name;
            if (isset($data['steps'])) {
                $this->validateSteps($circle, $data['steps']);
            }
            $circle->save();
            if (isset($data['steps'])) {
                $circle->steps()->delete();
                foreach ($data['steps'] as $index => $step) {
                    $circle->steps()->create($step + ['sequence' => $index + 1, 'can_return' => true]);
                }
            }
            $circle->unsetRelation('steps');
            $this->audit($request, $circle, 'workflow_draft_saved', $before);

            return $circle->load('steps');
        });
    }

    public function activate(Request $request, int $id): ApprovalCircle
    {
        $this->query($request->user());

        return DB::transaction(function () use ($request, $id) {
            DB::table('roles')->where('code', 'MOA')->lockForUpdate()->first();
            $circle = $this->query($request->user())->lockForUpdate()->findOrFail($id);
            abort_unless($circle->status === 'draft', 409, 'Only a draft can be activated.');
            $steps = $circle->steps()->get();
            $this->validateSteps($circle, $steps->map(fn ($s) => $s->only(['step_name', 'required_role_code', 'assigned_user_id', 'action', 'level', 'can_return']))->all());
            $this->validatePath($circle);
            $before = $circle->toArray();
            foreach (ApprovalCircle::where('scope_key', $circle->scope_key)->where('is_active', true)->lockForUpdate()->get() as $old) {
                $oldBefore = $old->toArray();
                $old->update(['status' => 'retired', 'is_active' => false]);
                $this->audit($request, $old, 'workflow_retired', $oldBefore);
            }
            $circle->update(['status' => 'active', 'is_active' => true, 'activated_at' => now()]);
            $this->audit($request, $circle, 'workflow_activated', $before);

            return $circle->load('steps');
        });
    }

    public function clone(Request $request, int $id): ApprovalCircle
    {
        $circle = $this->query($request->user())->with('steps')->findOrFail($id);
        // Old institution paths published locally. Only their new draft drops that obsolete step.
        $steps = $circle->steps->reject(fn ($step) => $circle->scope_key !== 'global' && $step->action === 'publish')->values();

        return $this->save($request, ['name' => $circle->name, 'institution_id' => $circle->institution_id, 'department_id' => $circle->department_id,
            'steps' => $steps->map(fn ($s) => $s->only(['step_name', 'required_role_code', 'assigned_user_id', 'action', 'level', 'can_return']))->all()]);
    }

    public function resolve(DatasetDefinition $dataset): ApprovalCircle
    {
        abort_if($dataset->department_id !== null && $dataset->institution?->code !== 'MIT', 422, 'Department workflows belong to ministry datasets only.');
        $scopeKey = $dataset->department_id === null
            ? $this->institutionScope((int) $dataset->institution_id)
            : 'global';
        $query = ApprovalCircle::where('scope_key', $scopeKey)->where('is_active', true)->where('status', 'active');
        if ($scopeKey === 'global') {
            $query->whereHas('steps')->whereDoesntHave('steps', fn ($steps) => $steps->where('level', '!=', 'ministry')
                ->orWhereNotNull('assigned_user_id'));
        }
        $circle = $query->lockForUpdate()->first();
        abort_unless($circle, 409, $dataset->department_id === null
            ? 'Configure and activate the institution approval workflow first.'
            : 'Configure and activate the ministry approval workflow first.');
        $this->validateSteps($circle, $circle->steps->toArray());
        $this->validatePath($circle);

        return $circle;
    }

    public function resolveMinistry(): ApprovalCircle
    {
        $circle = ApprovalCircle::where('scope_key', 'global')->where('is_active', true)
            ->where('status', 'active')->lockForUpdate()->first();
        abort_unless($circle, 409, 'Configure and activate the ministry workflow before submitting.');
        $this->validateSteps($circle, $circle->steps->toArray());
        $this->validatePath($circle);

        return $circle;
    }

    private function validatePath(ApprovalCircle $circle): void
    {
        $actions = $circle->steps()->pluck('action')->all();
        if ($circle->scope_key === 'global') {
            abort_unless(count($actions) >= 2 && end($actions) === 'publish'
                && count(array_filter($actions, fn ($action) => $action === 'publish')) === 1,
                422, 'Ministry workflow requires review or approval followed by one final publication step.');
        } else {
            abort_unless($actions !== [] && end($actions) === 'approve' && ! in_array('publish', $actions, true),
                422, 'Institution workflow must end with approval for onward ministry review; clone old publication workflows before use.');
        }
        $rank = 0;
        foreach ($actions as $action) {
            $next = ['review' => 0, 'approve' => 1, 'publish' => 2][$action];
            abort_if($next < $rank, 422, 'Review must precede approval within each workflow stage.');
            $rank = $next;
        }
    }

    private function validateSteps(ApprovalCircle $circle, array $steps): void
    {
        foreach ($steps as $step) {
            $role = Role::where('code', $step['required_role_code'])->firstOrFail();
            abort_unless($role->is_active && $role->status === 'active' && $role->level === $step['level'], 422, 'Role must be active and match the step level.');
            $expectedLevel = $circle->scope_key === 'global' ? 'ministry' : 'institution';
            abort_unless($step['level'] === $expectedLevel, 422, 'Step level must match the workflow scope.');
            abort_if($expectedLevel === 'institution' && $step['action'] === 'publish', 422, 'Institution approval forwards data to ministry; publication belongs to the ministry workflow.');
            if (! empty($step['assigned_user_id'])) {
                abort_if($circle->scope_key === 'global', 422, 'Shared ministry steps select reviewers by role within the submitting department.');
                $user = User::findOrFail($step['assigned_user_id']);
                $model = new ApprovalCircleStep($step);
                abort_unless(app(WorkflowActorPolicy::class)->allows($user, $model, $circle->institution_id, $circle->department_id), 422, 'Assigned reviewer must have the active role and correct scope.');
            }
        }
    }

    private function audit(Request $request, ApprovalCircle $circle, string $type, ?array $before): void
    {
        AuditEventOccurred::dispatch(new AuditEventData(eventType: $type, userId: $request->user()->id, entityType: 'approval_circle', entityId: (string) $circle->id,
            oldValues: $before, newValues: $circle->fresh('steps')->toArray(), ipAddress: $request->ip(), requestId: $request->attributes->get('auditRequestId')));
    }

    private function scopeKey(User $actor): string
    {
        return $actor->hasRole('MOA') ? 'global' : $this->institutionScope((int) $actor->institution_id);
    }

    private function institutionScope(int $institutionId): string
    {
        return 'institution-'.$institutionId;
    }
}
