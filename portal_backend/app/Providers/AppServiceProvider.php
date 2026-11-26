<?php

namespace App\Providers;

use App\Models\User;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        Gate::define('audit.read', function (User $user): bool {
            return $user->can('audit.readAll') || ($user->is_active && $user->status === 'active'
                && $user->institution_id !== null && $user->canDo('audit_logs.view.institution'));
        });
        // Kusoma audit zote kunahitaji akaunti hai na ruhusa ya ngazi ya wizara.
        // Ruhusa ya taasisi pekee haitoshi kwa endpoint isiyochuja rekodi kwa taasisi.
        Gate::define('audit.readAll', function (User $user): bool {
            return $user->is_active
                && $user->status === 'active'
                && (! $user->hasRole('MAU') || $user->hasRole('MOA') || ($user->institution?->code === 'MIT'
                    && $user->institution->is_active && $user->institution->status === 'active'))
                && $user->canDo('audit_logs.view.ministry');
        });
    }
}
