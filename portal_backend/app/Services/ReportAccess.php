<?php

namespace App\Services;

use App\Models\User;
use Illuminate\Database\Eloquent\Builder;

/**
 * Report capability checks and organisational data boundaries.
 *
 * Individual report-view permissions control what a role can open. The legacy
 * reports.view.ministry permission controls whether ministry staff can see all
 * institutions; institutional users can never exceed their own institution.
 */
class ReportAccess
{
    public const PERMISSION_PREFIX = 'reports.view.';

    public static function permissionFor(string $reportType): string
    {
        return self::PERMISSION_PREFIX.$reportType;
    }

    public static function canView(User $user, string $reportType): bool
    {
        if (! $user->is_active || $user->status !== 'active') {
            return false;
        }

        // MOA is the system-wide reporting administrator. Keep full access even
        // on installations that have not yet seeded the individual report grants.
        if ($user->hasRole('MOA')) {
            return true;
        }

        return in_array(self::permissionFor($reportType), $user->permissionCodes(), true);
    }

    public static function canAccessAny(User $user, array $reportTypes): bool
    {
        if (! $user->is_active || $user->status !== 'active') {
            return false;
        }

        if ($user->hasRole('MOA')) {
            return true;
        }

        $permissions = $user->permissionCodes();
        foreach ($reportTypes as $reportType) {
            if (in_array(self::permissionFor($reportType), $permissions, true)) {
                return true;
            }
        }

        return false;
    }

    public static function scope(User $user): string
    {
        if ($user->institution?->code !== 'MIT') {
            return 'institution';
        }

        if ($user->canDo('reports.view.ministry')) {
            return 'ministry';
        }

        return $user->department_id !== null ? 'department' : 'institution';
    }

    public static function scopeDatasets(Builder $query, User $user): Builder
    {
        abort_unless($user->is_active && $user->status === 'active', 403);
        abort_unless($user->institution_id !== null, 403, 'A reporting institution is required.');

        // Institutional accounts are always restricted, even if a ministry-wide
        // permission is accidentally assigned to their role.
        if ($user->institution?->code !== 'MIT') {
            return $query->where('institution_id', $user->institution_id);
        }

        if ($user->canDo('reports.view.ministry')) {
            return $query;
        }

        $query->where('institution_id', $user->institution_id);
        if ($user->department_id !== null) {
            $query->where('department_id', $user->department_id);
        }

        return $query;
    }
}
