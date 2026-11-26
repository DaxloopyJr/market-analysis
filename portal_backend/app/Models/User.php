<?php

namespace App\Models;

use App\Models\Concerns\Filterable;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable
{
    use Filterable, HasApiTokens, HasFactory, Notifiable, SoftDeletes;

    protected $searchable = ['name', 'email', 'username'];

    protected $fillable = ['name', 'username', 'email', 'phone', 'password', 'institution_id', 'department_id', 'is_active', 'status', 'last_login_at', 'failed_attempts', 'locked_until', 'mfa_enabled', 'mfa_method'];

    protected $hidden = ['password', 'remember_token'];

    protected function casts(): array
    {
        return ['email_verified_at' => 'datetime', 'password' => 'hashed', 'is_active' => 'boolean', 'mfa_enabled' => 'boolean', 'last_login_at' => 'datetime', 'locked_until' => 'datetime'];
    }

    /** user_role pivot per schema: scoped assignment with effective dates + status. */
    public function roles()
    {
        return $this->belongsToMany(Role::class, 'user_role')
            ->withPivot(['institution_id', 'department_id', 'effective_from', 'effective_to', 'status'])
            ->wherePivot('status', 'active')
            // Role haitumiki kabla ya muda wake wala baada ya kusitishwa.
            ->where('roles.is_active', true)->where('roles.status', 'active')
            ->where(fn ($q) => $q->whereNull('user_role.effective_from')->orWhere('user_role.effective_from', '<=', now()))
            ->where(fn ($q) => $q->whereNull('user_role.effective_to')->orWhereDate('user_role.effective_to', '>=', today()));
    }

    public function isLocked(): bool
    {
        return $this->locked_until !== null && $this->locked_until->isFuture();
    }

    // Notifications za portal zina schema tofauti na database notifications za Laravel.
    public function portalNotifications(): HasMany
    {
        return $this->hasMany(Notification::class);
    }

    public function institution()
    {
        return $this->belongsTo(Institution::class);
    }

    public function department()
    {
        return $this->belongsTo(Department::class);
    }

    public function delegationsGiven()
    {
        return $this->hasMany(Delegation::class, 'delegator_user_id');
    }

    public function delegationsReceived()
    {
        return $this->hasMany(Delegation::class, 'delegate_user_id');
    }

    public function hasRole(string ...$codes): bool
    {
        if ($this->roles()->whereIn('code', $codes)->exists()) {
            return true;
        }

        return (bool) array_intersect($codes, $this->delegatedRoleCodes());
    }

    /** Roles delegated to this user that are currently in their effective window. */
    public function delegatedRoles(): Collection
    {
        // whereIn with an empty set returns an (empty) Eloquent Collection, so
        // ->load('permissions') is always safe on the result.
        return Role::whereIn('code', $this->delegatedRoleCodes())->get();
    }

    public function permissionCodes(): array
    {
        $assigned = $this->roles()->with('permissions:id,code')
            ->get()->pluck('permissions')->flatten()->pluck('code');
        $delegated = $this->delegatedRoles()->load('permissions:id,code')
            ->pluck('permissions')->flatten()->pluck('code');

        return $assigned->merge($delegated)->unique()->values()->all();
    }

    public function canDo(string $permissionCode, ?Institution $targetInstitution = null): bool
    {
        if (! $this->is_active || $this->status !== 'active') {
            return false;
        }
        $assigned = $this->roles()->with('permissions')->get()
            ->pluck('permissions')->flatten()->keyBy('code');

        $perm = $assigned->get($permissionCode);
        $delegatedOnly = false;

        if (! $perm) {
            // Fall back to roles delegated to this user within their effective window
            $delegatedPerms = $this->delegatedRoles()->load('permissions')
                ->pluck('permissions')->flatten()->keyBy('code');
            $perm = $delegatedPerms->get($permissionCode);
            $delegatedOnly = $perm !== null;
        }
        if (! $perm) {
            return false;
        }

        $scope = $perm->scope;

        if (! $delegatedOnly) {
            return match ($scope) {
                'ministry' => $this->isMinistryStaff(),
                'institution' => $targetInstitution === null
                                ? $this->institution_id !== null
                                : $this->institution_id === $targetInstitution->id || $this->hasRole('MOA'),
                default => true,
            };
        }

        // Delegated-only grant: ministry-scope permissions require the delegated role to be
        // ministry-level (or the user to be ministry staff); institution-scope stays within
        // the delegate's own institution.
        return match ($scope) {
            'ministry' => $this->isMinistryStaff()
                            || $this->delegatedRoles()->contains('level', 'ministry'),
            'institution' => $targetInstitution === null
                            ? $this->institution_id !== null
                            : $this->institution_id === $targetInstitution->id,
            default => true,
        };
    }

    public function isMinistryStaff(): bool
    {
        return $this->department_id !== null
            || $this->hasRole('MOA', 'MDO', 'MDD', 'ME', 'OMU', 'DDO', 'MAU');
    }

    /** Roles delegated TO this user (active window) - union with assigned roles via hasRole/permissionCodes. */
    public function delegatedRoleCodes(): array
    {
        return Delegation::where('delegate_user_id', $this->id)
            ->where('delegations.status', 'active')
            ->where(fn ($q) => $q->whereNull('delegations.effective_from')->orWhere('delegations.effective_from', '<=', now()))
            ->where(fn ($q) => $q->whereNull('delegations.effective_to')->orWhereDate('delegations.effective_to', '>=', today()))
            ->join('roles', 'roles.id', '=', 'delegations.role_id')
            ->where('roles.is_active', true)->where('roles.status', 'active')
            ->pluck('roles.code')->all();
    }
}
