<?php

namespace App\Services;

use App\Models\User;

class ActorSnapshotService
{
    /** Freeze identity at action time, without guessing historical account details. */
    public function capture(?User $user, ?string $actingRole = null): ?array
    {
        if ($user === null) {
            return null;
        }

        $roles = $user->roles()->orderBy('code')->get(['roles.id', 'code', 'name']);
        $delegations = $user->delegationsReceived()->with(['role', 'delegator'])
            ->where('status', 'active')
            ->where(fn ($query) => $query->whereNull('effective_from')->orWhere('effective_from', '<=', now()))
            ->where(fn ($query) => $query->whereNull('effective_to')->orWhereDate('effective_to', '>=', today()))
            ->whereHas('role', fn ($query) => $query->where('is_active', true)->where('status', 'active'))
            ->orderBy('id')->get();

        // Direct role wins, as in hasRole; keep multiple matching grants explicit.
        $used = $actingRole !== null && ! $roles->contains('code', $actingRole)
            ? $delegations->filter(fn ($delegation) => $delegation->role->code === $actingRole)
            : collect();

        return [
            'userId' => $user->id,
            'name' => $user->name,
            'institutionId' => $user->institution_id,
            'departmentId' => $user->department_id,
            'roles' => $roles->map(fn ($role) => ['code' => $role->code, 'name' => $role->name])->all(),
            'delegatedRoles' => $delegations->map(fn ($grant) => ['code' => $grant->role->code, 'name' => $grant->role->name])->unique('code')->values()->all(),
            // Outside workflow, no single role is selected by authorization.
            'actingRole' => $actingRole,
            'availableDelegations' => $delegations->map(fn ($grant) => [
                'id' => $grant->id, 'roleCode' => $grant->role->code,
                'delegatorUserId' => $grant->delegator_user_id,
                'delegatorName' => $grant->delegator?->name,
            ])->values()->all(),
            'delegations' => $used->map(fn ($grant) => [
                'id' => $grant->id, 'roleCode' => $grant->role->code,
                'delegatorUserId' => $grant->delegator_user_id,
                'delegatorName' => $grant->delegator?->name,
            ])->values()->all(),
        ];
    }
}
