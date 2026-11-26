<?php

namespace Tests\Feature;

use App\Models\Institution;
use App\Models\Role;
use App\Models\User;
use App\Services\AuditService;
use Database\Seeders\RolesPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class StrategicPlanApiTest extends TestCase
{
    use RefreshDatabase;

    private function actor(string $role, Institution $institution): User
    {
        $actor = User::factory()->create(['institution_id' => $institution->id, 'status' => 'active', 'is_active' => true]);
        $actor->roles()->attach(Role::where('code', $role)->firstOrFail()->id, ['status' => 'active', 'effective_from' => '2020-01-01']);

        return $actor;
    }

    private function setupOwner(): array
    {
        $this->seed(RolesPermissionsSeeder::class);
        $owner = Institution::create(['code' => 'CBE', 'name' => 'CBE', 'status' => 'active', 'is_active' => true]);
        $actor = $this->actor('IA', $owner);
        Sanctum::actingAs($actor);

        return [$owner, $actor];
    }

    private function createPlan(): int
    {
        return $this->postJson('/api/v1/strategic-plans', ['name' => 'Strategic Plan 2026-2031',
            'startDate' => '2026-07-01', 'endDate' => '2031-06-30'])->assertCreated()->json('data.id');
    }

    public function test_objectives_are_owner_scoped_versioned_and_audited(): void
    {
        [$owner, $actor] = $this->setupOwner();
        $plan = $this->createPlan();
        $url = '/api/v1/strategic-plans/'.$plan;
        $this->postJson($url.'/activate')->assertUnprocessable();
        $v1 = $this->postJson($url.'/objectives', ['code' => 'a', 'description' => 'Increase production', 'effectiveFrom' => '2026-07-01'])
            ->assertCreated()->assertJsonPath('data.code', 'A')->json('data');
        $this->postJson($url.'/objectives', ['code' => 'A', 'description' => 'Duplicate', 'effectiveFrom' => '2026-07-01'])->assertConflict();
        $this->postJson($url.'/activate')->assertOk()->assertJsonPath('data.status', 'active');
        $versionUrl = $url.'/objectives/'.$v1['objectiveId'].'/versions';
        $this->postJson($versionUrl, ['description' => 'Production and quality', 'effectiveFrom' => '2027-07-01'])->assertUnprocessable();
        $this->postJson($versionUrl, ['description' => 'Production and quality', 'effectiveFrom' => '2027-07-01', 'reason' => 'Annual review'])
            ->assertCreated()->assertJsonPath('data.versionNumber', 2);
        $this->getJson($url)->assertOk()->assertJsonCount(2, 'data.objectiveVersions')
            ->assertJsonPath('data.objectiveVersions.0.description', 'Increase production');
        $this->assertDatabaseHas('audit_events', ['event_type' => 'strategic_objective_version_created', 'reason' => 'Annual review']);
        $this->assertDatabaseHas('strategic_plans', ['id' => $plan, 'institution_id' => $owner->id, 'created_by' => $actor->id]);
        $this->postJson($versionUrl, ['description' => 'Backdated', 'effectiveFrom' => '2026-07-01', 'reason' => 'Review'])->assertUnprocessable();
        $this->postJson($versionUrl, ['description' => 'Outside plan', 'effectiveFrom' => '2032-07-01', 'reason' => 'Review'])->assertUnprocessable();
    }

    public function test_ido_can_manage_objectives_but_not_strategic_plans(): void
    {
        [$owner] = $this->setupOwner();
        $plan = $this->createPlan();
        $other = Institution::create(['code' => 'TIRDO', 'name' => 'TIRDO', 'status' => 'active', 'is_active' => true]);
        Sanctum::actingAs($this->actor('IA', $other));
        $this->getJson('/api/v1/strategic-plans/'.$plan)->assertNotFound();
        $this->getJson('/api/v1/strategic-plans')->assertOk()->assertJsonCount(0, 'data');
        $this->postJson('/api/v1/strategic-plans', ['institutionId' => $owner->id, 'name' => 'Stolen',
            'startDate' => '2026-07-01', 'endDate' => '2031-06-30'])->assertForbidden();
        Sanctum::actingAs($this->actor('IDO', $owner));
        $this->getJson('/api/v1/strategic-plans/'.$plan)->assertOk();
        $this->postJson('/api/v1/strategic-plans', ['name' => 'No authority',
            'startDate' => '2026-07-01', 'endDate' => '2031-06-30'])->assertForbidden();
        $objective = $this->postJson('/api/v1/strategic-plans/'.$plan.'/objectives', [
            'code' => 'A', 'description' => 'Created by IDO', 'effectiveFrom' => '2026-07-01',
        ])->assertCreated()->json('data');
        $objectiveUrl = '/api/v1/strategic-plans/'.$plan.'/objectives/'.$objective['objectiveId'];
        $this->patchJson($objectiveUrl, ['description' => 'Updated by IDO'])
            ->assertOk()->assertJsonPath('data.description', 'Updated by IDO');
        $this->postJson('/api/v1/strategic-plans/'.$plan.'/activate')->assertForbidden();

        Sanctum::actingAs($this->actor('IA', $owner));
        $this->postJson('/api/v1/strategic-plans/'.$plan.'/activate')->assertOk();
        Sanctum::actingAs($this->actor('IDO', $owner));
        $this->postJson($objectiveUrl.'/versions', [
            'description' => 'New version by IDO', 'effectiveFrom' => '2027-07-01', 'reason' => 'Annual review',
        ])->assertCreated()->assertJsonPath('data.versionNumber', 2);
    }

    public function test_ministry_managers_own_mit_plan_and_cannot_write_institution_plan(): void
    {
        [$owner] = $this->setupOwner();
        $plan = $this->createPlan();
        $mit = Institution::create(['code' => 'MIT', 'name' => 'Ministry', 'status' => 'active', 'is_active' => true]);
        Sanctum::actingAs($this->actor('MDO', $mit));
        $ministryPlan = $this->createPlan();
        $this->assertDatabaseHas('strategic_plans', ['id' => $ministryPlan, 'institution_id' => $mit->id]);
        $this->getJson('/api/v1/strategic-plans/'.$plan)->assertOk();
        $this->postJson('/api/v1/strategic-plans/'.$plan.'/activate')->assertForbidden();
    }

    public function test_plan_activation_rejects_overlaps_but_accepts_next_plan(): void
    {
        $this->setupOwner();
        $first = $this->createPlan();
        $second = $this->createPlan();
        foreach ([$first, $second] as $plan) {
            $this->postJson('/api/v1/strategic-plans/'.$plan.'/objectives', ['code' => 'A', 'description' => 'Objective', 'effectiveFrom' => '2026-07-01'])->assertCreated();
        }
        $this->postJson('/api/v1/strategic-plans/'.$first.'/activate')->assertOk();
        $this->postJson('/api/v1/strategic-plans/'.$second.'/activate')->assertConflict();
        $next = $this->postJson('/api/v1/strategic-plans', ['name' => 'Next plan', 'startDate' => '2031-07-01', 'endDate' => '2036-06-30'])->assertCreated()->json('data.id');
        $this->postJson('/api/v1/strategic-plans/'.$next.'/objectives', ['code' => 'A', 'description' => 'New meaning', 'effectiveFrom' => '2031-07-01'])->assertCreated();
        $this->postJson('/api/v1/strategic-plans/'.$next.'/activate')->assertOk();
    }

    public function test_authentication_and_valid_dates_are_required(): void
    {
        $this->getJson('/api/v1/strategic-plans')->assertUnauthorized();
        $this->setupOwner();
        $this->postJson('/api/v1/strategic-plans', ['name' => 'Invalid', 'startDate' => '2031-07-01', 'endDate' => '2026-06-30'])
            ->assertUnprocessable()->assertJsonValidationErrors('endDate');
        $this->assertDatabaseCount('strategic_plans', 0);
    }

    public function test_draft_edits_are_allowed_but_active_history_is_immutable(): void
    {
        [$owner] = $this->setupOwner();
        $id = $this->createPlan();
        $url = '/api/v1/strategic-plans/'.$id;
        $this->patchJson($url, ['name' => 'Corrected plan'])->assertOk()->assertJsonPath('data.name', 'Corrected plan');
        $this->patchJson($url, ['startDate' => '2032-01-01'])->assertUnprocessable();
        $v = $this->postJson($url.'/objectives', ['code' => 'A', 'description' => 'Draft text', 'effectiveFrom' => '2026-07-01'])->assertCreated()->json('data');
        $objectiveUrl = $url.'/objectives/'.$v['objectiveId'];
        $this->patchJson($url, ['startDate' => '2027-07-01'])->assertUnprocessable();
        $this->patchJson($objectiveUrl, ['description' => 'Approved text'])->assertOk()->assertJsonPath('data.description', 'Approved text');
        $this->postJson($url.'/activate')->assertOk();
        $this->patchJson($objectiveUrl, ['description' => 'Overwrite'])->assertConflict();
        $this->patchJson($url, ['name' => 'Overwrite'])->assertConflict();
        $this->getJson($url)->assertOk()->assertJsonPath('data.name', 'Corrected plan')
            ->assertJsonPath('data.objectiveVersions.0.description', 'Approved text');
        $this->assertDatabaseHas('audit_events', ['event_type' => 'strategic_objective_draft_updated', 'institution_id' => $owner->id]);
    }

    public function test_audit_failure_rolls_back_created_plan(): void
    {
        $this->setupOwner();
        $this->mock(AuditService::class)->shouldReceive('record')->once()->andThrow(new \RuntimeException('Audit unavailable'));
        $this->postJson('/api/v1/strategic-plans', ['name' => 'Atomic plan', 'startDate' => '2026-07-01', 'endDate' => '2031-06-30'])->assertServerError();
        $this->assertDatabaseCount('strategic_plans', 0);
    }
}
