<?php

namespace App\Http\Middleware;

use App\Services\SystemMonitoringService;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class CaptureApiMetrics
{
    /**
     * Handle an incoming request.
     *
     * @param  Closure(Request): (Response)  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        $request->attributes->set('monitoringStarted', hrtime(true));

        return $next($request);
    }

    /** Record the final status, including exceptions rendered by Laravel, after the response. */
    public function terminate(Request $request, Response $response): void
    {
        $started = $request->attributes->get('monitoringStarted');
        if (! config('monitoring.enabled') || ! $started || $request->is('api/v1/admin/dashboard', 'api/health', 'api/v1/health')) {
            return;
        }
        try {
            app(SystemMonitoringService::class)->recordRequest(
                $response->getStatusCode(), (int) round((hrtime(true) - $started) / 1000000));
        } catch (\Throwable) {
            // Telemetry must never break login/submission or log request bodies, tokens or credentials.
        }
    }
}
