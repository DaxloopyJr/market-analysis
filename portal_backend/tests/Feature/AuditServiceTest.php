<?php

namespace Tests\Feature;

use App\DTOs\AuditEventData;
use App\Events\AuditEventOccurred;
use App\Http\Resources\AuditEventResource;
use App\Models\AuditEvent;
use App\Models\Delegation;
use App\Models\Role;
use App\Models\User;
use App\Services\ActorSnapshotService;
use App\Services\AuditService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use LogicException;
use RuntimeException;
use Tests\TestCase;

class AuditServiceTest extends TestCase
{
    public function test_event_dispatch_records_one_audit_event(): void
    {
        AuditEventOccurred::dispatch(
            new AuditEventData(
                eventType: 'auditTest',
                actorType: 'system',
                entityType: 'test',
                entityId: '1',
            ),
        );

        $this->assertDatabaseCount('audit_events', 1);

        $this->assertDatabaseHas('audit_events', [
            'event_type' => 'auditTest',
            'actor_type' => 'system',
            'entity_type' => 'test',
            'entity_id' => '1',
            'user_id' => null,
        ]);
    }

    use RefreshDatabase;

    public function test_actor_snapshot_keeps_identity_and_delegation_after_accounts_change(): void
    {
        $user = User::factory()->create(['name' => 'Reviewer Original']);
        $owner = User::factory()->create(['name' => 'Director Original']);
        $role = Role::create(['code' => 'MDD', 'name' => 'Director', 'is_active' => true, 'status' => 'active']);
        $grant = Delegation::create([
            'delegate_user_id' => $user->id, 'delegator_user_id' => $owner->id,
            'role_id' => $role->id, 'effective_from' => today()->subDay(), 'effective_to' => today()->addDay(), 'status' => 'active',
        ]);
        $event = app(AuditService::class)->record(new AuditEventData(eventType: 'submission_publish', userId: $user->id, actingRole: 'MDD'));
        $user->update(['name' => 'New Name']);
        $owner->update(['name' => 'New Director']);
        $grant->update(['status' => 'revoked']);
        $role->update(['name' => 'Renamed Role']);

        $actor = (new AuditEventResource($event->fresh()))->resolve()['actor'];
        $this->assertSame('Reviewer Original', $actor['name']);
        $this->assertSame('MDD', $actor['actingRole']);
        $this->assertSame('Director', $actor['delegatedRoles'][0]['name']);
        $this->assertSame('Director Original', $actor['delegations'][0]['delegatorName']);
        $this->assertSame($grant->id, $actor['delegations'][0]['id']);
        $this->assertSame([], app(ActorSnapshotService::class)->capture($user, 'MDD')['delegations']);
    }

    public function test_direct_role_does_not_claim_delegated_action_and_legacy_actor_is_unknown(): void
    {
        $user = User::factory()->create();
        $role = Role::create(['code' => 'IHOD', 'name' => 'Head', 'is_active' => true, 'status' => 'active']);
        $user->roles()->attach($role->id, ['status' => 'active']);
        $owner = User::factory()->create();
        Delegation::create(['delegate_user_id' => $user->id, 'delegator_user_id' => $owner->id,
            'role_id' => $role->id, 'effective_from' => today(), 'status' => 'active']);
        $event = app(AuditService::class)->record(new AuditEventData(eventType: 'review', userId: $user->id, actingRole: 'IHOD'));
        $user->roles()->detach();
        $this->assertSame('IHOD', $event->fresh()->actor_snapshot['roles'][0]['code']);
        $this->assertSame([], $event->actor_snapshot['delegations']);
        $legacy = AuditEvent::create(['user_id' => $user->id, 'actor_type' => 'user', 'event_type' => 'legacy']);
        $this->assertNull((new AuditEventResource($legacy))->resolve()['actor']);
    }

    public function test_it_persists_context_and_sanitizes_nested_values(): void
    {
        $user = User::factory()->create();
        $values = [
            'status' => 'draft',
            'password' => 'secret-value',
            'profile' => ['accessToken' => 'secret-token', 'name' => 'Example'],
            'items' => [['client_secret' => 'secret-key', 'count' => 2]],
            'rawObject' => (object) ['password' => 'secret-object'],
        ];
        $eventData = new AuditEventData(
            eventType: 'submissionUpdated',
            userId: $user->id,
            entityType: 'submission',
            entityId: '25',
            ipAddress: '127.0.0.1',
            requestId: '550e8400-e29b-41d4-a716-446655440000',
            oldValues: $values,
            newValues: $values,
            reason: 'Correction',
        );

        $auditEvent = app(AuditService::class)->record($eventData)->fresh();

        $expected = [
            'status' => 'draft',
            'profile' => ['name' => 'Example'],
            'items' => [['count' => 2]],
        ];
        $this->assertSame($expected, $auditEvent->old_values);
        $this->assertSame($expected, $auditEvent->new_values);
        $this->assertTrue($auditEvent->user->is($user));
        $this->assertSame('submission', $auditEvent->entity_type);
        $this->assertSame('25', $auditEvent->entity_id);
        $this->assertSame($eventData->requestId, $auditEvent->request_id);
        $this->assertNotNull($auditEvent->created_at);
        $this->assertArrayNotHasKey('updated_at', $auditEvent->getAttributes());
        $this->assertSame($values, $eventData->oldValues);
    }

    public function test_system_events_can_have_no_user_or_values(): void
    {
        $auditEvent = app(AuditService::class)->record(new AuditEventData(
            eventType: 'periodClosed', actorType: 'system',
        ))->fresh();

        $this->assertNull($auditEvent->user_id);
        $this->assertNull($auditEvent->old_values);
        $this->assertNull($auditEvent->new_values);
        $this->assertSame('system', $auditEvent->actor_type);
    }

    public function test_model_updates_and_deletes_are_rejected(): void
    {
        $auditEvent = app(AuditService::class)->record(new AuditEventData(eventType: 'created'));

        foreach (['update', 'delete'] as $operation) {
            try {
                if ($operation === 'update') {
                    $auditEvent->update(['reason' => 'Tampered']);
                } else {
                    $auditEvent->delete();
                }
                $this->fail('Audit mutation was allowed.');
            } catch (LogicException $exception) {
                $this->assertStringContainsString('Audit events cannot', $exception->getMessage());
            }
        }

        $this->assertSame(1, AuditEvent::count());
        $this->assertNull($auditEvent->fresh()->reason);
    }

    public function test_audit_insert_rolls_back_with_the_callers_transaction(): void
    {
        try {
            DB::transaction(function (): void {
                app(AuditService::class)->record(new AuditEventData(eventType: 'created'));
                throw new RuntimeException('Business action failed');
            });
        } catch (RuntimeException $exception) {
            $this->assertSame('Business action failed', $exception->getMessage());
        }

        $this->assertSame(0, AuditEvent::count());
    }

    public function test_event_listener_participates_in_the_business_transaction(): void
    {
        try {
            DB::transaction(function (): void {
                User::factory()->create();
                AuditEventOccurred::dispatch(new AuditEventData(eventType: 'userCreated'));
                throw new RuntimeException('Rollback');
            });
        } catch (RuntimeException $exception) {
            $this->assertSame('Rollback', $exception->getMessage());
        }

        $this->assertDatabaseCount('audit_events', 0);
        $this->assertDatabaseCount('users', 0);
    }
}
