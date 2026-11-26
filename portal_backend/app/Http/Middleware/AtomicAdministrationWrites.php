<?php

namespace App\Http\Middleware;

use App\Http\Controllers\Api\V1\AdministrationController;
use App\Http\Controllers\Api\V1\AuthController;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class AtomicAdministrationWrites
{
    public function handle(Request $request, Closure $next)
    {
        $controller = ltrim($request->route()?->getActionName() ?? '', '\\');
        if ($request->isMethodSafe() || ! in_array(explode('@', $controller)[0], [AdministrationController::class, AuthController::class], true)) {
            return $next($request);
        }

        // Audit ikifeli, mabadiliko ya account yasibaki huku API ikirudisha kosa.
        DB::beginTransaction();
        try {
            $response = $next($request);
            // Failed attempts ni taarifa halali hata login/reset ikikataliwa.
            $keepAttempts = $response->getStatusCode() === 422
                && in_array($controller, [AuthController::class.'@login', AuthController::class.'@resetPassword', AuthController::class.'@verifyMfa'], true);
            // Login ya account inactive hurudisha 403, lakini audit ya kukataliwa ihifadhiwe.
            $keepLoginRejection = $response->getStatusCode() === 403
                && $controller === AuthController::class.'@login';
            if ($response->getStatusCode() >= 400 && ! $keepAttempts && ! $keepLoginRejection) {
                DB::rollBack();
            } else {
                DB::commit();
            }

            return $response;
        } catch (\Throwable $error) {
            DB::rollBack();
            throw $error;
        }
    }
}
