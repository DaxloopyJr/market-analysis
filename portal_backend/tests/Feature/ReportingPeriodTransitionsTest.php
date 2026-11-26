<?php

namespace Tests\Feature;

use App\Models\AuditEvent;
use App\Models\Role;
use App\Models\User;
use App\Services\AuditService;
use App\Services\ReportingPeriodStatusService;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ReportingPeriodTransitionsTest extends TestCase
{
    use RefreshDatabase;

    private function annual(): int
    {
        $this->travelTo(Carbon::parse('2026-06-30 23:59:59', 'Africa/Dar_es_Salaam'));
        $user = User::factory()->create(['is_active' => true, 'status' => 'active']);
        $role = Role::firstOrCreate(['code' => 'MOA'], ['name' => 'MOA']);
        $user->roles()->attach($role, ['status' => 'active', 'effective_from' => '2020-01-01']);
        Sanctum::actingAs($user);

        return $this->postJson('/api/v1/reporting-periods', ['periodType' => 'annual', 'yearType' => 'financial',
            'startDate' => '2026-07-01', 'endDate' => '2027-06-30', 'deadlineDays' => 0])
            ->assertCreated()->assertJsonPath('data.status', 'closed')->assertJsonPath('data.entryStatus', 'upcoming')
            ->assertJsonPath('data.automaticStatus', true)->json('data.id');
    }

    public function test_opens_and_closes_at_local_midnight_and_retries_do_not_duplicate_audits(): void
    {
        $id = $this->annual();
        $this->artisan('reporting-periods:sync-status')->expectsOutput('Periods updated: 0')->assertSuccessful();
        $this->travelTo(Carbon::parse('2026-06-30 21:00:00', 'UTC'));
        $this->getJson('/api/v1/reporting-periods?status=open')->assertOk()->assertJsonCount(1, 'data');
        $this->artisan('reporting-periods:sync-status')->expectsOutput('Periods updated: 1')->assertSuccessful();
        $this->assertDatabaseHas('reporting_periods', ['id' => $id, 'status' => 'open']);
        $this->artisan('reporting-periods:sync-status')->expectsOutput('Periods updated: 0')->assertSuccessful();
        $this->assertSame(1, AuditEvent::where('event_type', 'reporting_period_automatically_open')->count());
        $this->travelTo(Carbon::parse('2027-06-30 23:59:59', 'Africa/Dar_es_Salaam'));
        $this->getJson('/api/v1/reporting-periods/'.$id)->assertOk()->assertJsonPath('data.isOpen', true);
        $this->travelTo(Carbon::parse('2027-07-01 00:00:00', 'Africa/Dar_es_Salaam'));
        $this->getJson('/api/v1/reporting-periods?status=closed')->assertOk()->assertJsonCount(1, 'data');
        $this->artisan('reporting-periods:sync-status')->expectsOutput('Periods updated: 1')->assertSuccessful();
        $this->assertDatabaseHas('reporting_periods', ['id' => $id, 'status' => 'closed']);
        $this->assertDatabaseHas('audit_events', ['event_type' => 'reporting_period_automatically_closed', 'actor_type' => 'system']);
    }

    public function test_manual_closure_survives_scheduler_and_deadline_extension_until_explicit_reopening(): void
    {
        $id = $this->annual();
        $this->travelTo(Carbon::parse('2026-10-24', 'Africa/Dar_es_Salaam'));
        $this->deleteJson('/api/v1/reporting-periods/'.$id)->assertOk()->assertJsonPath('data.automaticStatus', false);
        $this->patchJson('/api/v1/reporting-periods/'.$id, ['deadline' => '2027-07-15'])->assertOk()->assertJsonPath('data.status', 'closed');
        $this->artisan('reporting-periods:sync-status')->expectsOutput('Periods updated: 0')->assertSuccessful();
        $this->patchJson('/api/v1/reporting-periods/'.$id, ['status' => 'open'])->assertOk()->assertJsonPath('data.status', 'open')->assertJsonPath('data.automaticStatus', true);
        $this->travelTo(Carbon::parse('2027-07-16', 'Africa/Dar_es_Salaam'));
        $this->artisan('reporting-periods:sync-status')->assertSuccessful();
        $this->patchJson('/api/v1/reporting-periods/'.$id, ['deadline' => '2027-07-20'])->assertOk()->assertJsonPath('data.status', 'open');
    }

    public function test_future_year_can_be_prepared_and_parent_manual_closure_blocks_children(): void
    {
        $id = $this->annual();
        $quarters = $this->postJson('/api/v1/reporting-periods/'.$id.'/quarters', ['deadlineDays' => 10])->assertOk()->assertJsonCount(4, 'data')->json('data');
        $this->travelTo(Carbon::parse('2027-07-05', 'Africa/Dar_es_Salaam'));
        $this->artisan('reporting-periods:sync-status')->assertSuccessful();
        $this->getJson('/api/v1/reporting-periods/'.$quarters[3]['id'])->assertOk()->assertJsonPath('data.status', 'open');
        $this->getJson('/api/v1/reporting-periods/'.$id)->assertOk()->assertJsonPath('data.status', 'closed');
        $this->patchJson('/api/v1/reporting-periods/'.$id, ['status' => 'closed'])->assertOk();
        $this->getJson('/api/v1/reporting-periods/'.$quarters[3]['id'])->assertOk()->assertJsonPath('data.entryStatus', 'closed');
        $this->patchJson('/api/v1/reporting-periods/'.$quarters[3]['id'], ['status' => 'open'])->assertUnprocessable();
        $this->artisan('reporting-periods:sync-status')->assertSuccessful();
        $this->assertDatabaseHas('reporting_periods', ['id' => $quarters[3]['id'], 'status' => 'closed', 'automatic_status' => true]);
        $this->patchJson('/api/v1/reporting-periods/'.$id, ['status' => 'open'])->assertOk();
        $this->getJson('/api/v1/reporting-periods?status=open')->assertOk()->assertJsonCount(1, 'data');
        $this->artisan('reporting-periods:sync-status')->assertSuccessful();
        $this->assertDatabaseHas('reporting_periods', ['id' => $quarters[3]['id'], 'status' => 'open']);
    }

    public function test_transition_rolls_back_if_audit_cannot_be_written(): void
    {
        $id = $this->annual();
        $this->travelTo(Carbon::parse('2026-07-01', 'Africa/Dar_es_Salaam'));
        $this->mock(AuditService::class)->shouldReceive('record')->once()->andThrow(new \RuntimeException('audit unavailable'));
        try {
            app(ReportingPeriodStatusService::class)->synchronize();
            $this->fail('Audit failure must abort the transition.');
        } catch (\RuntimeException $exception) {
            $this->assertSame('audit unavailable', $exception->getMessage());
        }
        $this->assertDatabaseHas('reporting_periods', ['id' => $id, 'status' => 'closed']);
    }
}
