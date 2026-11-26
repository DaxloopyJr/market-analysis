<?php

namespace App\Services;

use App\Models\ApprovalCircleStep;
use App\Models\User;

class WorkflowActorPolicy
{
    public function allows(User $actor, ApprovalCircleStep $step, ?int $institutionId, ?int $departmentId): bool
    {
        if (in_array($step->required_role_code, ['IAU', 'MAU', 'PREVIEW'], true)) {
            return false;
        }
        if (! $actor->is_active || $actor->status !== 'active' || ! $actor->hasRole($step->required_role_code)) {
            return false;
        }
        if ($step->assigned_user_id !== null && (int) $step->assigned_user_id !== (int) $actor->id) {
            return false;
        }

        if ($step->level === 'institution') {
            return $institutionId !== null && (int) $actor->institution_id === $institutionId;
        }

        // Institution submissions reach ministry role holders; department data stays in its own department.
        return $step->level === 'ministry' && $actor->institution?->code === 'MIT'
            && $actor->institution->is_active && $actor->institution->status === 'active'
            && (in_array($step->required_role_code, ['MDO', 'MDD'], true) || $departmentId === null || ((int) $actor->institution_id === $institutionId
                && (int) $actor->department_id === $departmentId));
    }

    public function authorize(User $actor, ApprovalCircleStep $step, ?int $institutionId, ?int $departmentId): void
    {
        abort_unless($this->allows($actor, $step, $institutionId, $departmentId), 403, 'Role, assignment or scope does not permit this action.');
    }
}
