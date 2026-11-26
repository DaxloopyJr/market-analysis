<?php

namespace App\Http\Middleware;

use App\Models\User;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class CheckPermission
{
    /**
     * Thibitisha kuwa mtumiaji ana angalau ruhusa moja kati ya zilizotajwa.
     *
     * Ruhusa huandikwa zikitenganishwa kwa koma, mfano:
     * permission:institutions.manage,institutions.view.own
     *
     * @param  Closure(Request): (Response)  $next
     */
    public function handle(Request $request, Closure $next, string ...$permissions): Response
    {
        $user = $request->user();

        abort_unless($user instanceof User, 401);
        abort_unless($user->is_active && $user->status === 'active', 403, 'Account haiko active.');

        // Ruhusa yoyote iliyotajwa ikitosha, tumia ukaguzi wa scope wa mfumo wa RBAC.
        $hasPermission = collect($permissions)
            ->contains(fn (string $permission): bool => $user->canDo($permission));

        abort_unless($hasPermission, 403, 'Huna ruhusa ya kufanya kitendo hiki.');

        return $next($request);
    }
}
