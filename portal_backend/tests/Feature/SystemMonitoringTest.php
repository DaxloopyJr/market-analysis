<?php

namespace Tests\Feature;

use App\Jobs\MonitoringHeartbeat;
use App\Models\Institution;
use App\Models\Role;
use App\Models\User;
use App\Services\SystemMonitoringService;
use Database\Seeders\RolesPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Route;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class SystemMonitoringTest extends TestCase
{
    use RefreshDatabase;

    private function loginAs(string $role, string $institution = 'MIT'): User
    {
        $this->seed(RolesPermissionsSeeder::class);
        $owner = Institution::firstOrCreate(['code' => $institution], ['name' => $institution, 'status' => 'active', 'is_active' => true]);
        $user = User::factory()->create(['institution_id' => $owner->id, 'is_active' => true, 'status' => 'active']);
        $user->roles()->attach(Role::where('code', $role)->firstOrFail()->id, ['status' => 'active', 'effective_from' => '2020-01-01']);
        Sanctum::actingAs($user);

        return $user;
    }

    private function sample(int $minutesAgo = 0): void
    {
        DB::table('monitoring_samples')->insert(['collected_at' => now()->utc()->subMinutes($minutesAgo),
            'payload' => json_encode(['resources' => ['cpu' => 20, 'memory' => 40, 'uptimeSeconds' => 7200],
                'storage' => ['status' => 'available', 'totalGB' => 100, 'usedGB' => 25, 'usedPercent' => 25],
                'checks' => [['id' => 'database', 'name' => 'Database', 'status' => 'healthy']]])]);
    }

    public function test_dashboard_logs_are_recent_bounded_and_do_not_expose_context_or_traces(): void
    {
        $this->freezeTime();
        $this->loginAs('MOA');
        $path = tempnam(sys_get_temp_dir(), 'portal-log-');
        config(['logging.default' => 'dashboard_test', 'logging.channels.dashboard_test' => ['driver' => 'single', 'path' => $path]]);
        try {
            $lines = '['.now()->subDays(2)->format('Y-m-d H:i:s')."] local.WARNING: Database old event\n";
            for ($index = 60; $index >= 1; $index--) {
                $lines .= '['.now()->subSeconds($index)->format('Y-m-d H:i:s')."] local.ERROR: SMTP password=secret-123 token=private-token {\"email\":\"private@example.test\"}\n#0 sensitive stack trace\n";
            }
            file_put_contents($path, $lines);
            $response = $this->getJson('/api/v1/admin/dashboard?window=24h')->assertOk()->assertJsonCount(50, 'data.logs')
                ->assertJsonPath('data.logs.0.module', 'mail')->assertJsonPath('data.logs.0.level', 'error')
                ->assertJsonPath('data.logs.0.time', now()->subSecond()->toIso8601String());
            foreach (['secret-123', 'private-token', 'private@example.test', 'sensitive stack trace'] as $secret) {
                $this->assertStringNotContainsString($secret, json_encode($response->json('data.logs')));
            }
            file_put_contents($path, '['.now()->subDays(2)->format('Y-m-d H:i:s')."] local.WARNING: Database old event\n");
            $this->getJson('/api/v1/admin/dashboard?window=24h')->assertOk()->assertJsonCount(0, 'data.logs');
            $this->getJson('/api/v1/admin/dashboard?window=7d')->assertOk()->assertJsonCount(1, 'data.logs');
        } finally {
            unlink($path);
        }
        $this->getJson('/api/v1/admin/dashboard')->assertOk()->assertJsonCount(0, 'data.logs');
    }

    public function test_monitoring_is_private_to_active_mit_moa_and_validates_window(): void
    {
        $this->getJson('/api/v1/admin/dashboard')->assertUnauthorized();
        foreach (['IA', 'IDO', 'MDO', 'MDD', 'PREVIEW', 'MAU'] as $role) {
            $this->loginAs($role);
            $this->getJson('/api/v1/admin/dashboard')->assertForbidden();
        }
        $this->loginAs('MOA', 'CBE');
        $this->getJson('/api/v1/admin/dashboard')->assertForbidden();
        $this->loginAs('MOA');
        $this->getJson('/api/v1/admin/dashboard?window=invalid')->assertUnprocessable();
        $this->getJson('/api/v1/admin/dashboard')->assertOk()->assertJsonPath('data.status', 'not_collected')
            ->assertJsonPath('data.summary.averageResponseMs', null)->assertJsonPath('data.storage.usedGB', null);
    }

    public function test_request_aggregates_and_freshness_are_not_fabricated(): void
    {
        $this->freezeTime();
        $this->loginAs('MOA');
        config(['queue.default' => 'database']);
        $this->sample();
        Cache::put('monitoring.scheduler', now()->timestamp, 86400);
        Cache::put('monitoring.worker', now()->subMinutes(4)->timestamp, 86400);
        $service = app(SystemMonitoringService::class);
        $service->recordRequest(200, 100);
        $service->recordRequest(500, 300);
        $service->recordRequest(422, 200);
        $response = $this->getJson('/api/v1/admin/dashboard?window=24h')->assertOk()
            ->assertJsonPath('data.status', 'available')->assertJsonPath('data.summary.requestCount', 3)
            ->assertJsonPath('data.summary.averageResponseMs', 200)
            ->assertJsonPath('data.summary.serverErrorPercent', 33.33)
            ->assertJsonPath('data.summary.clientErrorCount', 1)->assertJsonPath('data.storage.usedGB', 25);
        $servers = collect($response->json('data.servers'))->keyBy('id');
        $this->assertSame('healthy', $servers['scheduler']['status']);
        $this->assertSame('stale', $servers['worker']['status']);
        $this->travel(16)->minutes();
        $this->getJson('/api/v1/admin/dashboard')->assertOk()->assertJsonPath('data.status', 'stale')
            ->assertJsonPath('data.storage.usedGB', null)->assertJsonPath('data.summary.uptime', null);
    }

    public function test_collection_prunes_only_old_telemetry_and_cannot_fake_scheduler_health(): void
    {
        $this->freezeTime();
        Cache::forget('monitoring.scheduler');
        Cache::forget('monitoring.worker');
        $service = $this->partialMock(SystemMonitoringService::class, function ($mock) {
            $mock->shouldReceive('resources')->once()->andReturn(['cpu' => null, 'memory' => null, 'uptimeSeconds' => null]);
        });
        $this->sample(32 * 1440);
        DB::table('monitoring_request_minutes')->insert(['minute' => now()->subDays(32)]);
        $this->artisan('monitoring:collect')->assertSuccessful();
        $this->assertDatabaseCount('monitoring_samples', 1);
        $this->assertDatabaseCount('monitoring_request_minutes', 0);
        $data = $service->dashboard('24h');
        $this->assertNull($data['performance'][0]['cpu']);
        $this->assertSame('unknown', collect($data['servers'])->keyBy('id')['scheduler']['status']);
        config(['monitoring.disk_path' => storage_path('missing-disk-directory')]);
        $this->assertNull($service->storage()['usedGB']);
    }

    public function test_final_error_response_is_measured_and_monitoring_failure_does_not_break_api(): void
    {
        Route::middleware('api')->get('/api/monitoring-test-error', fn () => abort(503));
        $this->getJson('/api/monitoring-test-error')->assertStatus(503);
        $this->assertSame(1, (int) DB::table('monitoring_request_minutes')->sum('server_errors'));
        $this->mock(SystemMonitoringService::class)->shouldReceive('recordRequest')->andThrow(new \RuntimeException('telemetry storage failed'));
        $this->getJson('/api/monitoring-test-error')->assertStatus(503);
    }

    public function test_worker_requires_recent_job_and_sync_is_not_a_running_worker(): void
    {
        $this->freezeTime();
        Cache::forget('monitoring.worker');
        (new MonitoringHeartbeat(time() - 400))->handle();
        $this->assertNull(Cache::get('monitoring.worker'));
        (new MonitoringHeartbeat(time()))->handle();
        $this->assertSame(now()->timestamp, Cache::get('monitoring.worker'));
        config(['queue.default' => 'sync']);
        $data = app(SystemMonitoringService::class)->dashboard('24h');
        $this->assertSame('not_applicable', collect($data['servers'])->keyBy('id')['worker']['status']);
    }

    public function test_disabled_capture_does_not_record_or_claim_fresh_sample(): void
    {
        config(['monitoring.enabled' => false]);
        $this->sample();
        Route::middleware('api')->get('/api/monitoring-test-disabled', fn () => response()->json(['ok' => true]));
        $this->getJson('/api/monitoring-test-disabled')->assertOk();
        $this->assertDatabaseCount('monitoring_request_minutes', 0);
        $this->assertSame('disabled', app(SystemMonitoringService::class)->dashboard('24h')['status']);
    }
}
