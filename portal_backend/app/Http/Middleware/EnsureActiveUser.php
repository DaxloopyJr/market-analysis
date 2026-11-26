<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;

class EnsureActiveUser
{
    public function handle(Request $request, Closure $next)
    {
        // Token ya zamani haihalalishi account iliyositishwa baada ya login.
        $user = $request->user();
        abort_if($user && (!$user->is_active || $user->status !== 'active'), 403, 'Account haiko active.');
        return $next($request);
    }
}
