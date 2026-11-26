<?php

namespace Tests\Feature;

use App\DTOs\AuditEventData;
use App\DTOs\NotificationData;
use App\Models\ApprovalCircleStep;
use App\Models\AuditEvent;
use App\Models\Delegation;
use App\Models\Institution;
use App\Models\Role;
use App\Models\User;
use App\Services\AuditService;
use App\Services\NotificationService;
use App\Services\WorkflowActorPolicy;
use Database\Seeders\RolesPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class BackendRepairTest extends TestCase
{
    use RefreshDatabase;

    private function actor(string $code = 'IA'): User
    {
        $this->seed(RolesPermissionsSeeder::class);
        $institution = Institution::firstOrCreate(['code' => 'CBE'], ['name' => 'CBE', 'is_active' => true, 'status' => 'active']);
        $user = User::factory()->create(['institution_id' => $institution->id, 'is_active' => true, 'status' => 'active']);
        $user->roles()->attach(Role::where('code', $code)->value('id'), ['status' => 'active', 'effective_from' => today()]);
        Sanctum::actingAs($user);
        return $user;
    }

    public function test_ia_cannot_assign_ministry_roles_or_access_another_institution_user(): void
    {
        $actor = $this->actor();
        $moa = Role::where('code', 'MOA')->value('id');
        $this->putJson('/api/v1/users/'.$actor->id, ['role_ids' => [$moa]])->assertForbidden();
        $this->assertFalse($actor->fresh()->hasRole('MOA'));
        $this->postJson('/api/v1/users', ['name' => 'Escalation', 'email' => 'bad@example.test',
            'password' => 'Password@123', 'role_ids' => [$moa]])->assertForbidden();
        $this->assertDatabaseMissing('users', ['email' => 'bad@example.test']);
        $other = Institution::create(['code' => 'FCC', 'name' => 'FCC']);
        $target = User::factory()->create(['institution_id' => $other->id, 'locked_until' => now()->addHour()]);
        $this->getJson('/api/v1/users/'.$target->id)->assertForbidden();
        $this->postJson('/api/v1/users/'.$target->id.'/unlock')->assertForbidden();
        $this->postJson('/api/v1/users/'.$target->id.'/send-reset-link')->assertForbidden();
        $this->assertNotNull($target->fresh()->locked_until);
    }

    public function test_allowed_user_update_and_unlock_record_actor_and_rollback_on_audit_failure(): void
    {
        $actor = $this->actor();
        $target = User::factory()->create(['institution_id' => $actor->institution_id, 'locked_until' => now()->addHour()]);
        $this->putJson('/api/v1/users/'.$target->id, ['name' => 'Updated'])->assertOk();
        $this->postJson('/api/v1/users/'.$target->id.'/unlock')->assertOk();
        $this->assertNull($target->fresh()->locked_until);
        $this->assertSame($actor->id, AuditEvent::latest('id')->first()->user_id);
        $this->mock(AuditService::class, fn ($mock) => $mock->shouldReceive('record')->andThrow(new \RuntimeException('audit offline')));
        $this->putJson('/api/v1/users/'.$target->id, ['name' => 'Must rollback'])->assertStatus(500);
        $this->assertSame('Updated', $target->fresh()->name);
    }

    public function test_inactive_user_is_denied_with_existing_token(): void
    {
        $actor = $this->actor();
        $token = $actor->createToken('existing')->plainTextToken;
        $actor->update(['status' => 'inactive', 'is_active' => false]);
        $this->app['auth']->forgetGuards();
        $this->withToken($token)->getJson('/api/v1/users')->assertForbidden();
        $this->withToken($token)->getJson('/api/v1/me')->assertForbidden();
    }

    public function test_future_expired_and_inactive_roles_do_not_authorize(): void
    {
        $actor = $this->actor();
        $role = Role::where('code', 'IA')->firstOrFail();
        $actor->roles()->updateExistingPivot($role->id, ['effective_from' => today()->addDay()]);
        $this->assertFalse($actor->hasRole('IA'));
        $actor->roles()->updateExistingPivot($role->id, ['effective_from' => today()->subDay(), 'effective_to' => today()->subDay()]);
        $this->assertFalse($actor->hasRole('IA'));
        $actor->roles()->updateExistingPivot($role->id, ['effective_to' => null]);
        $role->update(['is_active' => false]);
        $this->assertFalse($actor->hasRole('IA'));
        $role->update(['is_active' => true]);
        $this->assertTrue($actor->hasRole('IA'));
        $delegate = User::factory()->create(['is_active' => true, 'status' => 'active']);
        $delegation = Delegation::create(['delegator_user_id' => $actor->id, 'delegate_user_id' => $delegate->id,
            'role_id' => $role->id, 'effective_from' => today()->addDay(), 'status' => 'active']);
        $this->assertFalse($delegate->hasRole('IA'));
        $delegation->update(['effective_from' => today()]);
        $this->assertTrue($delegate->hasRole('IA'));
        $role->update(['status' => 'inactive']);
        $this->assertFalse($delegate->hasRole('IA'));
    }

    public function test_notifications_are_recorded_and_only_recipient_can_read(): void
    {
        $actor = $this->actor();
        $audit = app(AuditService::class)->record(new AuditEventData(eventType: 'test', userId: $actor->id));
        $notification = app(NotificationService::class)->notifyUser(new NotificationData($actor->id, $audit->id, 'test', 'Ujumbe'));
        $this->getJson('/api/v1/notifications/unread-count')->assertOk()->assertJsonPath('data.unreadCount', 1);
        $this->patchJson('/api/v1/notifications/'.$notification->id.'/read')->assertOk();
        $other = User::factory()->create(['is_active' => true, 'status' => 'active']);
        Sanctum::actingAs($other);
        $this->getJson('/api/v1/notifications/'.$notification->id)->assertNotFound();
    }

    public function test_workflow_assignee_and_institution_are_both_enforced(): void
    {
        $actor = $this->actor('IHOD');
        $step = new ApprovalCircleStep(['required_role_code' => 'IHOD', 'assigned_user_id' => $actor->id, 'level' => 'institution']);
        $policy = app(WorkflowActorPolicy::class);
        $policy->authorize($actor, $step, $actor->institution_id, null);
        foreach ([$actor->institution_id + 1, $actor->institution_id] as $institutionId) {
            if ($institutionId === $actor->institution_id) $step->assigned_user_id = $actor->id + 1;
            try {
                $policy->authorize($actor, $step, $institutionId, null);
                $this->fail('Unauthorized workflow actor accepted.');
            } catch (\Symfony\Component\HttpKernel\Exception\HttpException $error) {
                $this->assertSame(403, $error->getStatusCode());
            }
        }
    }

    public function test_profile_audit_failure_rolls_back_profile(): void
    {
        $actor = $this->actor();
        $original = $actor->name;
        $this->mock(AuditService::class, fn ($mock) => $mock->shouldReceive('record')->andThrow(new \RuntimeException('audit offline')));
        $this->putJson('/api/v1/profile', ['name' => 'Do not persist'])->assertStatus(500);
        $this->assertSame($original, $actor->fresh()->name);
    }

    public function test_failed_login_attempts_persist_and_lock_without_deleting_user(): void
    {
        $user = User::factory()->create(['is_active' => true, 'status' => 'active']);
        for ($attempt = 1; $attempt <= 3; $attempt++) {
            $this->postJson('/api/v1/login', ['email' => $user->email, 'password' => 'wrong'])->assertUnprocessable();
        }
        $this->assertNotNull($user->fresh()->locked_until);
        $this->assertSame(0, (int) $user->fresh()->failed_attempts);
        $this->assertDatabaseHas('users', ['id' => $user->id, 'status' => 'active']);
    }

    public function test_ia_can_create_an_institution_officer_and_audit_is_atomic(): void
    {
        $actor = $this->actor();
        $payload = ['name' => 'Officer', 'email' => 'officer@example.test', 'password' => 'Password@123',
            'role_ids' => [Role::where('code', 'IDO')->value('id')]];
        $this->postJson('/api/v1/users', $payload)->assertCreated()->assertJsonPath('data.institution_id', $actor->institution_id);
        $this->assertDatabaseHas('audit_events', ['user_id' => $actor->id, 'event_type' => 'create']);
        $payload['email'] = 'rollback@example.test';
        $this->mock(AuditService::class, fn ($mock) => $mock->shouldReceive('record')->andThrow(new \RuntimeException('audit offline')));
        $this->postJson('/api/v1/users', $payload)->assertStatus(500);
        $this->assertDatabaseMissing('users', ['email' => 'rollback@example.test']);
    }
}
