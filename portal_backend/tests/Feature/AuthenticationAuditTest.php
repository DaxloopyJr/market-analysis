<?php

namespace Tests\Feature;

use App\Models\AuditEvent;
use App\Models\User;
use Illuminate\Auth\Events\Failed;
use Illuminate\Auth\Events\Login;
use Illuminate\Auth\Events\Logout;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Route;
use PHPUnit\Framework\Attributes\TestWith;
use Tests\TestCase;

class AuthenticationAuditTest extends TestCase
{
    use RefreshDatabase;

    #[TestWith(['wrong_password', 422, 'invalid_credentials'])]
    #[TestWith(['unknown_user', 422, 'invalid_credentials'])]
    #[TestWith(['locked', 422, 'account_locked'])]
    #[TestWith(['threshold', 422, 'lockout_threshold_reached'])]
    #[TestWith(['inactive', 403, 'account_inactive'])]
    public function test_login_api_records_each_rejection_without_credentials(string $scenario, int $status, string $reason): void
    {
        $this->travelTo(now()->startOfSecond());
        $user = User::factory()->create([
            'password' => 'CorrectPassword@123', 'is_active' => true, 'status' => 'active',
            'failed_attempts' => $scenario === 'threshold' ? 2 : 0,
            'locked_until' => $scenario === 'locked' ? now()->addMinutes(30) : null,
        ]);
        if ($scenario === 'inactive') {
            $user->update(['is_active' => false, 'status' => 'inactive']);
        }
        $login = $scenario === 'unknown_user' ? 'unknown@example.test' : $user->email;
        $password = $scenario === 'inactive' ? 'CorrectPassword@123' : 'WrongSecret@123';

        $response = $this->withServerVariables(['REMOTE_ADDR' => '192.0.2.20'])
            ->postJson('/api/v1/login', ['login' => $login, 'password' => $password]);

        $response->assertStatus($status);
        $this->assertDatabaseCount('audit_events', 1);
        $event = AuditEvent::firstOrFail();
        $this->assertSame('loginFailed', $event->event_type);
        $this->assertSame($reason, $event->reason);
        $this->assertSame('anonymous', $event->actor_type);
        $this->assertNull($event->user_id);
        $this->assertNull($event->actor_snapshot);
        $this->assertSame($scenario === 'unknown_user' ? null : (string) $user->id, $event->entity_id);
        $this->assertSame('192.0.2.20', $event->ip_address);
        $this->assertNotNull($event->request_id);
        $this->assertSame($response->headers->get('X-Request-ID'), $event->request_id);
        $this->assertNotNull($event->created_at);
        $this->assertStringNotContainsString($password, $event->toJson());
        $this->assertStringNotContainsString($login, $event->toJson());
        $this->assertDatabaseCount('personal_access_tokens', 0);
        if ($scenario === 'threshold') {
            $this->assertTrue($user->fresh()->locked_until->equalTo(now()->addMinutes(30)));
        }
        if ($scenario === 'wrong_password') {
            $this->assertSame(1, (int) $user->fresh()->failed_attempts);
        }
    }

    public function test_authentication_events_are_recorded_without_credentials(): void
    {
        $user = User::factory()->create();
        event(new Login('web', $user, false));
        event(new Failed('web', $user, ['email' => $user->email, 'password' => 'never-store-this']));
        event(new Logout('web', $user));
        event(new Failed('web', null, ['password' => 'another-secret']));

        $this->assertDatabaseCount('audit_events', 4);
        $this->assertDatabaseHas('audit_events', ['event_type' => 'loginSucceeded', 'user_id' => $user->id]);
        $this->assertDatabaseHas('audit_events', ['event_type' => 'logout', 'user_id' => $user->id]);
        $failedEvent = AuditEvent::where('event_type', 'loginFailed')->firstOrFail();
        $this->assertNull($failedEvent->user_id);
        $this->assertSame('anonymous', $failedEvent->actor_type);
        $this->assertSame((string) $user->id, $failedEvent->entity_id);
        $serializedEvents = AuditEvent::all()->toJson();
        $this->assertStringNotContainsString('never-store-this', $serializedEvents);
        $this->assertStringNotContainsString($user->email, $serializedEvents);
    }

    public function test_authentication_listener_uses_http_context(): void
    {
        Route::middleware('api')->post('/api/_test/login-failed', function () {
            event(new Failed('web', null, ['password' => 'secret']));

            return response()->json(['message' => 'Rejected'], 401);
        });

        $response = $this->withServerVariables(['REMOTE_ADDR' => '192.0.2.20'])
            ->postJson('/api/_test/login-failed');
        $response->assertUnauthorized();
        $auditEvent = AuditEvent::firstOrFail();
        $this->assertSame($response->headers->get('X-Request-ID'), $auditEvent->request_id);
        $this->assertNotNull($auditEvent->request_id);
        $this->assertSame('192.0.2.20', $auditEvent->ip_address);
    }
}
