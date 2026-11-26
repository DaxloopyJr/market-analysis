<?php

namespace Tests\Feature;

use App\Models\AuditEvent;
use App\Models\DatasetDefinition;
use App\Models\DatasetReportingCalendar;
use App\Models\Department;
use App\Models\Institution;
use App\Models\ReferenceDataType;
use App\Models\ReferenceDataValue;
use App\Models\ReportingPeriod;
use App\Models\Role;
use App\Models\User;
use App\Services\AuditService;
use App\Services\DatasetCalendarService;
use App\Services\DatasetReminderService;
use App\Services\NotificationService;
use Carbon\Carbon;
use Database\Seeders\RolesPermissionsSeeder;
use Database\Seeders\TantradePlanningSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use PHPUnit\Framework\Attributes\TestWith;
use Tests\TestCase;

class DatasetPlanningApiTest extends TestCase
{
    use RefreshDatabase;

    private function fixture(): array
    {
        $this->seed(RolesPermissionsSeeder::class);
        $institution = Institution::create(['code' => 'TANTRADE', 'name' => 'Tantrade', 'status' => 'active', 'is_active' => true]);
        $actor = User::factory()->create(['institution_id' => $institution->id, 'is_active' => true, 'status' => 'active']);
        $actor->roles()->attach(Role::where('code', 'MOA')->value('id'), ['status' => 'active', 'effective_from' => '2026-01-01']);
        $officer = User::factory()->create(['institution_id' => $institution->id, 'is_active' => true, 'status' => 'active']);
        $officer->roles()->attach(Role::where('code', 'IDO')->value('id'), ['status' => 'active', 'effective_from' => '2026-01-01']);
        Sanctum::actingAs($actor);
        $type = ReferenceDataType::create(['data_type_code' => 'SECTOR', 'data_type_name_en' => 'Sector']);
        $sector = ReferenceDataValue::create(['data_type_id' => $type->id, 'data_value_code' => 'TRADE', 'data_value_name_en' => 'Trade']);
        $payload = ['responsibleUserId' => $officer->id, 'institutionId' => $institution->id, 'datasetName' => 'Market access', 'frequencies' => ['quarterly'],
            'sectors' => [['sectorId' => $sector->id]], 'collectionMethod' => 'manual',
            'consumers' => [['name' => 'National Bureau of Statistics', 'shortName' => 'NBS']]];
        $datasetId = $this->postJson('/api/v1/datasets', $payload)->assertCreated()->assertJsonPath('data.collectionMethod', 'manual')->json('data.id');
        $annualId = $this->postJson('/api/v1/reporting-periods', ['periodType' => 'annual', 'yearType' => 'financial', 'startDate' => '2026-07-01', 'endDate' => '2027-06-30',
            'deadlineDays' => 15])->assertCreated()->assertJsonPath('data.deadline', '2027-07-15')->json('data.id');
        $periodId = $this->postJson("/api/v1/reporting-periods/$annualId/quarters", ['deadlineDays' => 15])
            ->assertOk()->assertJsonCount(4, 'data')->assertJsonPath('data.0.deadline', '2026-10-15')->json('data.0.id');

        return compact('institution', 'actor', 'officer', 'payload', 'datasetId', 'annualId', 'periodId');
    }

    public function test_sources_consumers_normalization_validation_and_audit_rollback(): void
    {
        $f = $this->fixture();
        $payload = $f['payload'];
        $payload['consumers'][0]['name'] = '  NATIONAL   bureau of statistics ';
        $this->postJson('/api/v1/datasets', $payload)->assertCreated()->assertJsonCount(1, 'data.consumers');
        $this->assertDatabaseCount('data_consumers', 1);
        $url = '/api/v1/datasets/'.$f['datasetId'];
        $this->patchJson($url, ['collectionMethod' => 'system'])->assertUnprocessable();
        $this->patchJson($url, ['collectionMethod' => 'hybrid', 'sourceSystemName' => 'Trade registry'])
            ->assertOk()->assertJsonPath('data.sourceSystemName', 'Trade registry');
        $this->patchJson($url, ['priority' => 'high'])->assertUnprocessable();
        $this->getJson('/api/v1/data-consumers?search=NATIONAL')->assertOk()->assertJsonCount(1, 'data');
        $this->mock(AuditService::class)->shouldReceive('record')->andThrow(new \RuntimeException('Audit failed'));
        $this->patchJson($url, ['consumers' => [['name' => 'New consumer']]])->assertStatus(500);
        $this->assertDatabaseMissing('data_consumers', ['name' => 'New consumer']);
        $this->assertDatabaseCount('dataset_consumers', 2);
    }

    public function test_dataset_assignees_are_filtered_by_active_status_institution_department_and_role(): void
    {
        $f = $this->fixture();
        $url = '/api/v1/datasets/'.$f['datasetId'].'/assignees';
        $this->getJson($url)->assertOk()->assertJsonPath('data.0.id', $f['officer']->id);

        $otherInstitution = Institution::create(['code' => 'OTHER', 'name' => 'Other', 'status' => 'active', 'is_active' => true]);
        $inactiveOfficer = User::factory()->create([
            'institution_id' => $f['institution']->id, 'is_active' => false, 'status' => 'inactive',
        ]);
        $wrongRole = User::factory()->create([
            'institution_id' => $f['institution']->id, 'is_active' => true, 'status' => 'active',
        ]);
        $wrongInstitutionOfficer = User::factory()->create([
            'institution_id' => $otherInstitution->id, 'is_active' => true, 'status' => 'active',
        ]);
        $inactiveOfficer->roles()->attach(Role::where('code', 'IDO')->value('id'), [
            'status' => 'active', 'effective_from' => '2026-01-01',
        ]);
        $wrongRole->roles()->attach(Role::where('code', 'IA')->value('id'), [
            'status' => 'active', 'effective_from' => '2026-01-01',
        ]);
        $wrongInstitutionOfficer->roles()->attach(Role::where('code', 'IDO')->value('id'), [
            'status' => 'active', 'effective_from' => '2026-01-01',
        ]);
        $this->getJson($url)->assertOk()->assertJsonCount(1, 'data');

        $this->getJson($url.'?search=not-found')->assertOk()->assertJsonCount(0, 'data');
        $this->getJson('/api/v1/datasets/999999/assignees')->assertNotFound();
    }

    public function test_department_dataset_assignees_only_include_active_ddos_in_that_department(): void
    {
        $this->seed(RolesPermissionsSeeder::class);
        $institution = Institution::create(['code' => 'MIT', 'name' => 'MIT', 'status' => 'active', 'is_active' => true]);
        $department = Department::create(['code' => 'AHRD', 'name' => 'AHRD', 'status' => 'active', 'is_active' => true]);
        $otherDepartment = Department::create(['code' => 'FIN', 'name' => 'Finance', 'status' => 'active', 'is_active' => true]);
        $actor = User::factory()->create([
            'institution_id' => $institution->id, 'department_id' => $department->id, 'is_active' => true, 'status' => 'active',
        ]);
        $actor->roles()->attach(Role::where('code', 'DDO')->value('id'), [
            'status' => 'active', 'effective_from' => '2026-01-01',
        ]);
        $officer = User::factory()->create([
            'institution_id' => $institution->id, 'department_id' => $department->id, 'is_active' => true, 'status' => 'active',
        ]);
        $officer->roles()->attach(Role::where('code', 'DDO')->value('id'), [
            'status' => 'active', 'effective_from' => '2026-01-01',
        ]);
        $otherDepartmentOfficer = User::factory()->create([
            'institution_id' => $institution->id, 'department_id' => $otherDepartment->id, 'is_active' => true, 'status' => 'active',
        ]);
        $otherDepartmentOfficer->roles()->attach(Role::where('code', 'DDO')->value('id'), [
            'status' => 'active', 'effective_from' => '2026-01-01',
        ]);
        Sanctum::actingAs($actor);
        $datasetId = DatasetDefinition::create([
            'institution_id' => $institution->id, 'department_id' => $department->id,
            'dataset_code' => 'MIT/2026/0001', 'dataset_name' => 'Department data', 'created_by' => $actor->id,
        ])->id;

        $this->getJson("/api/v1/datasets/$datasetId/assignees")
            ->assertOk()->assertJsonCount(2, 'data')
            ->assertJsonFragment(['id' => $actor->id])
            ->assertJsonFragment(['id' => $officer->id])
            ->assertJsonMissing(['id' => $otherDepartmentOfficer->id]);
    }

    public function test_calendars_quarters_scoping_and_idempotent_reminders(): void
    {
        $f = $this->fixture();
        $this->postJson('/api/v1/reporting-periods/'.$f['annualId'].'/quarters', ['deadlineDays' => 30])
            ->assertOk()->assertJsonPath('data.0.deadline', '2026-10-15');
        $this->assertDatabaseCount('reporting_periods', 5);
        $url = '/api/v1/datasets/'.$f['datasetId'].'/reporting-calendar';
        $body = ['reportingPeriodId' => $f['periodId'], 'responsibleUserId' => $f['officer']->id, 'deadlineDays' => 15,
            'reminderDays' => [7, 1], 'remindersEnabled' => true];
        $this->putJson($url, $body)->assertOk()->assertJsonPath('data.deadline', '2026-10-15');
        $body['responsibleUserId'] = $f['actor']->id;
        $this->putJson($url, $body)->assertUnprocessable();
        $this->travelTo(Carbon::parse('2026-10-08 10:00:00', 'Africa/Dar_es_Salaam'));
        $this->assertSame(0, app(DatasetReminderService::class)->sendDue()); // Draft haitumi.
        DatasetDefinition::findOrFail($f['datasetId'])->update(['status' => 'active', 'effective_from' => '2026-01-01']);
        $this->assertSame(1, app(DatasetReminderService::class)->sendDue());
        $this->assertSame(0, app(DatasetReminderService::class)->sendDue());
        $this->assertDatabaseCount('notifications', 1);
        $this->assertDatabaseHas('notifications', ['user_id' => $f['officer']->id, 'type' => 'DatasetDeadlineReminder']);
        app(DatasetCalendarService::class)->markSubmitted($f['datasetId'], $f['periodId']);
        $this->travelTo(Carbon::parse('2026-10-14 10:00:00', 'Africa/Dar_es_Salaam'));
        $this->assertSame(0, app(DatasetReminderService::class)->sendDue());
        $this->putJson($url, $body)->assertUnprocessable();
        $this->travelBack();
        $other = Institution::create(['code' => 'OTHER', 'name' => 'Other']);
        $f['actor']->roles()->sync([Role::where('code', 'IA')->value('id') => ['status' => 'active', 'effective_from' => '2020-01-01']]);
        $f['actor']->update(['institution_id' => $other->id]);
        $this->getJson($url)->assertNotFound();
    }

    public function test_bulk_calendars_upsert_each_quarter_and_preserve_single_response(): void
    {
        $f = $this->fixture();
        $ids = ReportingPeriod::where('parent_id', $f['annualId'])->orderBy('quarter')->pluck('id')->all();
        $url = '/api/v1/datasets/'.$f['datasetId'].'/reporting-calendar';
        $settings = ['responsibleUserId' => $f['officer']->id, 'deadlineDays' => 0,
            'reminderDays' => [10], 'remindersEnabled' => true];
        $existingId = $this->putJson($url, ['reportingPeriodId' => $ids[0], ...$settings])
            ->assertOk()->assertJsonPath('data.reportingPeriodId', $ids[0])->json('data.id');
        $body = ['reportingPeriodIds' => $ids, ...$settings];
        $this->putJson($url, $body)->assertOk()->assertJsonCount(4, 'data')
            ->assertJsonPath('data.0.id', $existingId)
            ->assertJsonPath('data.0.deadline', '2026-10-15')
            ->assertJsonPath('data.1.deadline', '2027-01-15')
            ->assertJsonPath('data.2.deadline', '2027-04-15')
            ->assertJsonPath('data.3.deadline', '2027-07-15');
        $this->assertDatabaseCount('dataset_reporting_calendars', 4);
        $this->assertSame(4, AuditEvent::where('event_type', 'dataset_calendar_saved')->count());
        $this->putJson($url, $body)->assertOk();
        $this->assertSame(4, AuditEvent::where('event_type', 'dataset_calendar_saved')->count());
        $body['reminderDays'] = [5];
        $this->putJson($url, $body)->assertOk()->assertJsonPath('data.3.reminderDays', [5]);
        $this->assertDatabaseCount('dataset_reporting_calendars', 4);
        $this->assertSame(8, AuditEvent::where('event_type', 'dataset_calendar_saved')->count());
    }

    public function test_bulk_calendars_validate_period_selection_and_scope(): void
    {
        $f = $this->fixture();
        $url = '/api/v1/datasets/'.$f['datasetId'].'/reporting-calendar';
        $settings = ['responsibleUserId' => $f['officer']->id, 'deadlineDays' => 0];
        foreach ([[], ['reportingPeriodIds' => []], ['reportingPeriodIds' => 'invalid'],
            ['reportingPeriodIds' => [$f['periodId'], $f['periodId']]],
            ['reportingPeriodIds' => [999999]],
            ['reportingPeriodId' => $f['periodId'], 'reportingPeriodIds' => [$f['periodId']]],
            ['reportingPeriodId' => null, 'reportingPeriodIds' => [$f['periodId']]],
            ['reportingPeriodIds' => array_fill(0, 367, $f['periodId'])],
        ] as $selection) {
            $this->putJson($url, [...$settings, ...$selection])->assertUnprocessable()->assertJsonStructure(['errors']);
        }
        $this->putJson($url, [...$settings, 'reportingPeriodIds' => [$f['periodId']], 'responsibleUserId' => $f['actor']->id])
            ->assertUnprocessable();
        $other = Institution::create(['code' => 'OTHER', 'name' => 'Other']);
        $f['actor']->roles()->sync([Role::where('code', 'IA')->value('id') => ['status' => 'active', 'effective_from' => '2020-01-01']]);
        $f['actor']->update(['institution_id' => $other->id]);
        $this->putJson($url, [...$settings, 'reportingPeriodIds' => [$f['periodId']]])->assertNotFound();
        $this->assertDatabaseCount('dataset_reporting_calendars', 0);
    }

    public function test_bulk_calendars_roll_back_when_later_period_is_ineligible_or_submitted(): void
    {
        $f = $this->fixture();
        $ids = ReportingPeriod::where('parent_id', $f['annualId'])->orderBy('quarter')->pluck('id')->all();
        $url = '/api/v1/datasets/'.$f['datasetId'].'/reporting-calendar';
        $body = ['reportingPeriodIds' => [$ids[0], $ids[1]], 'responsibleUserId' => $f['officer']->id, 'deadlineDays' => 0];
        $other = Institution::create(['code' => 'OTHER', 'name' => 'Other']);
        foreach ([['status' => 'closed', 'automatic_status' => false], ['institution_id' => $other->id], ['period_type' => 'monthly']] as $invalid) {
            $period = ReportingPeriod::findOrFail($ids[1]);
            $before = $period->only(array_keys($invalid));
            $period->update($invalid);
            $this->putJson($url, $body)->assertUnprocessable();
            $this->assertDatabaseCount('dataset_reporting_calendars', 0);
            $this->assertDatabaseMissing('audit_events', ['event_type' => 'dataset_calendar_saved']);
            $period->update($before);
        }
        $this->putJson($url, $body)->assertOk();
        app(DatasetCalendarService::class)->markSubmitted($f['datasetId'], $ids[1]);
        $body['deadlineDays'] = 5;
        $this->putJson($url, $body)->assertUnprocessable();
        $this->assertDatabaseHas('dataset_reporting_calendars', ['reporting_period_id' => $ids[0], 'deadline_days' => 15]);
        $this->assertSame(2, AuditEvent::where('event_type', 'dataset_calendar_saved')->count());
    }

    public function test_bulk_calendars_roll_back_earlier_calendar_and_audit_when_audit_fails(): void
    {
        $f = $this->fixture();
        $ids = ReportingPeriod::where('parent_id', $f['annualId'])->orderBy('quarter')->pluck('id')->all();
        $realAudit = app(AuditService::class);
        $calls = 0;
        $this->mock(AuditService::class)->shouldReceive('record')->twice()
            ->andReturnUsing(function ($event) use ($realAudit, &$calls) {
                if (++$calls === 2) {
                    throw new \RuntimeException('Audit failed');
                }

                return $realAudit->record($event);
            });
        $this->putJson('/api/v1/datasets/'.$f['datasetId'].'/reporting-calendar', [
            'reportingPeriodIds' => [$ids[0], $ids[1]], 'responsibleUserId' => $f['officer']->id, 'deadlineDays' => 0,
        ])->assertStatus(500);
        $this->assertDatabaseCount('dataset_reporting_calendars', 0);
        $this->assertDatabaseMissing('audit_events', ['event_type' => 'dataset_calendar_saved']);
    }

    public function test_bulk_calendars_support_monthly_periods_without_changing_unselected_calendars(): void
    {
        $f = $this->fixture();
        DatasetDefinition::findOrFail($f['datasetId'])->frequencies()->create(['frequency' => 'monthly']);
        $ids = [];
        foreach ([1, 2] as $month) {
            $ids[] = $this->postJson('/api/v1/reporting-periods', ['periodType' => 'monthly', 'parentId' => $f['annualId'], 'periodNumber' => $month, 'deadlineDays' => 0])
                ->assertCreated()->json('data.id');
        }
        $url = '/api/v1/datasets/'.$f['datasetId'].'/reporting-calendar';
        $settings = ['responsibleUserId' => $f['officer']->id, 'deadlineDays' => 0];
        $this->putJson($url, [...$settings, 'reportingPeriodId' => $f['periodId']])->assertOk();
        $this->putJson($url, [...$settings, 'reportingPeriodIds' => $ids])->assertOk()->assertJsonCount(2, 'data')
            ->assertJsonPath('data.0.deadline', '2026-07-31')->assertJsonPath('data.1.deadline', '2026-08-31');
        $this->assertDatabaseCount('dataset_reporting_calendars', 3);
        $this->assertSame(1, DatasetReportingCalendar::where('reporting_period_id', $f['periodId'])->count());
    }

    public function test_month_generation_preserves_existing_month_and_returns_all_twelve_in_order(): void
    {
        $f = $this->fixture();
        $existing = $this->postJson('/api/v1/reporting-periods', ['periodType' => 'monthly', 'parentId' => $f['annualId'], 'periodNumber' => 1, 'deadlineDays' => 5])
            ->assertCreated()->json('data.id');
        $url = '/api/v1/reporting-periods/'.$f['annualId'].'/months';
        $response = $this->postJson($url, ['deadlineDays' => 0])->assertOk()->assertJsonCount(12, 'data')
            ->assertJsonPath('data.0.id', $existing)->assertJsonPath('data.0.deadline', '2026-08-05')
            ->assertJsonPath('data.1.startDate', '2026-08-01')->assertJsonPath('data.1.deadline', '2026-08-31')
            ->assertJsonPath('data.7.endDate', '2027-02-28')->assertJsonPath('data.11.deadline', '2027-06-30');
        $this->assertSame(range(1, 12), array_column($response->json('data'), 'periodNumber'));
        $this->assertDatabaseCount('reporting_periods', 17);
        $auditCount = AuditEvent::count();
        $this->postJson($url, ['deadlineDays' => 10])->assertOk()->assertJsonPath('data.1.deadline', '2026-08-31');
        $this->assertDatabaseCount('reporting_periods', 17);
        $this->assertSame($auditCount, AuditEvent::count());
        $this->assertDatabaseCount('dataset_reporting_calendars', 0);
    }

    public function test_month_generation_rejects_invalid_parent_and_scope_and_rolls_back_audit_failure(): void
    {
        $f = $this->fixture();
        $url = '/api/v1/reporting-periods/'.$f['annualId'].'/months';
        $this->postJson($url, [])->assertUnprocessable()->assertJsonValidationErrors('deadlineDays');
        $this->postJson($url, ['deadlineDays' => -1])->assertUnprocessable();
        $this->postJson('/api/v1/reporting-periods/'.$f['periodId'].'/months', ['deadlineDays' => 0])->assertUnprocessable();
        ReportingPeriod::findOrFail($f['annualId'])->update(['status' => 'closed', 'automatic_status' => false]);
        $this->postJson($url, ['deadlineDays' => 0])->assertUnprocessable();
        ReportingPeriod::findOrFail($f['annualId'])->update(['status' => 'open']);
        $other = Institution::create(['code' => 'OTHER', 'name' => 'Other']);
        $f['actor']->roles()->sync([Role::where('code', 'IA')->value('id') => ['status' => 'active', 'effective_from' => '2020-01-01']]);
        $f['actor']->update(['institution_id' => $other->id]);
        $this->postJson($url, ['deadlineDays' => 0])->assertForbidden();
        $f['actor']->roles()->sync([Role::where('code', 'MOA')->value('id') => ['status' => 'active', 'effective_from' => '2020-01-01']]);
        $f['actor']->update(['institution_id' => $f['institution']->id]);
        $realAudit = app(AuditService::class);
        $calls = 0;
        $auditCount = AuditEvent::count();
        $this->mock(AuditService::class)->shouldReceive('record')->twice()->andReturnUsing(function ($event) use ($realAudit, &$calls) {
            if (++$calls === 2) {
                throw new \RuntimeException('Audit failed');
            }

            return $realAudit->record($event);
        });
        $this->postJson($url, ['deadlineDays' => 0])->assertStatus(500);
        $this->assertDatabaseCount('reporting_periods', 5);
        $this->assertSame($auditCount, AuditEvent::count());
    }

    #[TestWith(['semiannual', 2, '2026-12-31'])]
    #[TestWith(['weeks', 53, '2026-07-07'])]
    #[TestWith(['days', 365, '2026-07-01'])]
    public function test_generation_covers_whole_year_and_reuses_periods(string $path, int $count, string $firstEnd): void
    {
        $f = $this->fixture();
        $url = '/api/v1/reporting-periods/'.$f['annualId'].'/'.$path;
        $this->postJson($url, [])->assertUnprocessable()->assertJsonValidationErrors('deadlineDays');
        $response = $this->postJson($url, ['deadlineDays' => 0])->assertOk()->assertJsonCount($count, 'data')
            ->assertJsonPath('data.0.startDate', '2026-07-01')->assertJsonPath('data.0.deadline', $firstEnd)
            ->assertJsonPath('data.'.($count - 1).'.endDate', '2027-06-30');
        $this->assertDatabaseCount('reporting_periods', 5 + $count);
        $auditCount = AuditEvent::count();
        $this->postJson($url, ['deadlineDays' => 10])->assertOk()->assertJsonPath('data', $response->json('data'));
        $this->assertSame($auditCount, AuditEvent::count());
        $this->assertDatabaseCount('reporting_periods', 5 + $count);
        ReportingPeriod::findOrFail($f['annualId'])->update(['status' => 'closed', 'automatic_status' => false]);
        $this->postJson($url, ['deadlineDays' => 0])->assertUnprocessable();
    }

    public function test_generated_daily_periods_include_leap_day_and_weekly_tail_stays_inside_year(): void
    {
        $f = $this->fixture();
        $annualId = $this->postJson('/api/v1/reporting-periods', ['periodType' => 'annual', 'yearType' => 'calendar', 'startDate' => '2028-01-01', 'endDate' => '2028-12-31', 'deadlineDays' => 0])
            ->assertCreated()->json('data.id');
        $this->postJson('/api/v1/reporting-periods/'.$annualId.'/days', ['deadlineDays' => 0])
            ->assertOk()->assertJsonCount(366, 'data')->assertJsonPath('data.59.startDate', '2028-02-29')
            ->assertJsonPath('data.365.deadline', '2028-12-31');
        $this->postJson('/api/v1/reporting-periods/'.$annualId.'/weeks', ['deadlineDays' => 0])
            ->assertOk()->assertJsonCount(53, 'data')->assertJsonPath('data.52.startDate', '2028-12-30')
            ->assertJsonPath('data.52.endDate', '2028-12-31');
    }

    private function ministryDataOfficer(): User
    {
        $ministry = Institution::create(['code' => 'MIT', 'name' => 'Ministry', 'status' => 'active', 'is_active' => true]);
        $mdo = User::factory()->create(['institution_id' => $ministry->id, 'is_active' => true, 'status' => 'active']);
        $mdo->roles()->attach(Role::where('code', 'MDO')->value('id'), ['status' => 'active']);

        return $mdo;
    }

    public function test_priority_patch_initializes_and_updates_with_change_history(): void
    {
        $f = $this->fixture();
        $url = '/api/v1/datasets/'.$f['datasetId'].'/priority';
        $this->patchJson($url, ['priority' => 'high', 'reason' => 'Policy'])->assertForbidden();
        $mdo = $this->ministryDataOfficer();
        Sanctum::actingAs($mdo);
        $this->assertNull(DatasetDefinition::findOrFail($f['datasetId'])->priority);
        $this->patchJson($url, ['priority' => 'medium', 'reason' => 'Initial planning'])
            ->assertOk()->assertJsonPath('data.priority', 'medium')
            ->assertJsonPath('data.priorityUpdatedBy', $mdo->id);
        $first = AuditEvent::where('event_type', 'dataset_priority_changed')->firstOrFail();
        $this->assertSame(['priority' => null], $first->old_values);
        $this->assertSame(['priority' => 'medium'], $first->new_values);
        $this->assertSame('Initial planning', $first->reason);
        $this->assertNotNull(DatasetDefinition::findOrFail($f['datasetId'])->priority_updated_at);
        $this->patchJson($url, ['priority' => 'high', 'reason' => 'Maelekezo mapya ya kisera'])
            ->assertOk()->assertJsonPath('data.priority', 'high');
        $this->assertDatabaseHas('audit_events', ['event_type' => 'dataset_priority_changed', 'reason' => 'Maelekezo mapya ya kisera']);
        $last = AuditEvent::where('event_type', 'dataset_priority_changed')->orderByDesc('id')->firstOrFail();
        $this->assertSame(['priority' => 'medium'], $last->old_values);
        $this->assertSame(['priority' => 'high'], $last->new_values);
        $this->assertDatabaseHas('dataset_definitions', ['id' => $f['datasetId'], 'priority' => 'high', 'priority_updated_by' => $mdo->id]);
        $this->patchJson($url, ['priority' => 'low'])->assertUnprocessable();
        $this->patchJson($url, ['priority' => 'low', 'reason' => '   '])->assertUnprocessable();
        $this->patchJson($url, ['priority' => 'urgent', 'reason' => 'Policy'])->assertUnprocessable();
        $this->assertSame(2, AuditEvent::where('event_type', 'dataset_priority_changed')->count());
    }

    public function test_priority_mdo_can_initialize_another_ministry_departments_dataset(): void
    {
        $f = $this->fixture();
        $mdo = $this->ministryDataOfficer();
        $meu = Department::create(['code' => 'MEU', 'name' => 'Monitoring', 'status' => 'active', 'is_active' => true]);
        $ict = Department::create(['code' => 'ICT', 'name' => 'ICT', 'status' => 'active', 'is_active' => true]);
        $mdo->update(['department_id' => $meu->id]);
        DatasetDefinition::findOrFail($f['datasetId'])->update(['institution_id' => $mdo->institution_id, 'department_id' => $ict->id]);
        Sanctum::actingAs($mdo);

        $this->patchJson('/api/v1/datasets/'.$f['datasetId'].'/priority', ['priority' => 'high', 'reason' => 'Ministry plan'])
            ->assertOk()->assertJsonPath('data.priority', 'high');
        $this->assertDatabaseHas('dataset_definitions', ['id' => $f['datasetId'], 'priority' => 'high', 'priority_reason' => 'Ministry plan']);
    }

    #[TestWith(['foreign'])]
    #[TestWith(['missing_institution'])]
    #[TestWith(['inactive_institution'])]
    #[TestWith(['inactive_user'])]
    public function test_priority_rejects_mdo_outside_active_ministry_scope(string $state): void
    {
        $f = $this->fixture();
        $mdo = $this->ministryDataOfficer();
        match ($state) {
            'foreign' => $mdo->update(['institution_id' => $f['institution']->id]),
            'missing_institution' => $mdo->update(['institution_id' => null]),
            'inactive_institution' => $mdo->institution->update(['is_active' => false, 'status' => 'inactive']),
            'inactive_user' => $mdo->update(['is_active' => false, 'status' => 'inactive']),
        };
        Sanctum::actingAs($mdo->fresh());

        $this->patchJson('/api/v1/datasets/'.$f['datasetId'].'/priority', ['priority' => 'high', 'reason' => 'Policy'])->assertForbidden();
        $this->assertNull(DatasetDefinition::findOrFail($f['datasetId'])->priority);
        $this->assertSame(0, AuditEvent::where('event_type', 'dataset_priority_changed')->count());
    }

    public function test_priority_initialization_rolls_back_when_audit_fails(): void
    {
        $f = $this->fixture();
        Sanctum::actingAs($this->ministryDataOfficer());
        $this->mock(AuditService::class)->shouldReceive('record')->andThrow(new \RuntimeException('Audit failed'));

        $this->patchJson('/api/v1/datasets/'.$f['datasetId'].'/priority', ['priority' => 'high', 'reason' => 'Policy'])->assertStatus(500);
        $dataset = DatasetDefinition::findOrFail($f['datasetId']);
        $this->assertNull($dataset->priority);
        $this->assertNull($dataset->priority_updated_by);
        $this->assertNull($dataset->priority_updated_at);
        $this->assertNull($dataset->priority_reason);
    }

    public function test_reminder_failure_rolls_back_audit_and_delivery(): void
    {
        $f = $this->fixture();
        $this->putJson('/api/v1/datasets/'.$f['datasetId'].'/reporting-calendar',
            ['reportingPeriodId' => $f['periodId'], 'responsibleUserId' => $f['officer']->id, 'deadlineDays' => 15,
                'remindersEnabled' => true])->assertOk();
        DatasetDefinition::findOrFail($f['datasetId'])->update(['status' => 'active', 'effective_from' => '2026-01-01']);
        $this->travelTo(Carbon::parse('2026-10-08 10:00:00', 'Africa/Dar_es_Salaam'));
        $this->mock(NotificationService::class)->shouldReceive('notifyUser')->andThrow(new \RuntimeException('Notification failed'));
        try {
            app(DatasetReminderService::class)->sendDue();
            $this->fail('Exception expected');
        } catch (\RuntimeException $exception) {
            $this->assertSame('Notification failed', $exception->getMessage());
        }
        $this->assertDatabaseMissing('audit_events', ['event_type' => 'dataset_deadline_reminder']);
        $this->assertDatabaseCount('dataset_reminders', 0);
    }

    public function test_sample_seeder_is_repeatable_without_overwriting_existing_data(): void
    {
        $f = $this->fixture();
        $f['actor']->roles()->attach(Role::where('code', 'MOA')->value('id'), ['status' => 'active']);
        $this->seed(TantradePlanningSeeder::class);
        $sample = DatasetDefinition::where('dataset_name', '[TEST] TANTRADE Market Access Planning')->firstOrFail();
        $this->assertSame('draft', $sample->status);
        $this->assertNull($sample->priority);
        $this->seed(TantradePlanningSeeder::class);
        $this->assertDatabaseCount('dataset_definitions', 2);
        $this->assertDatabaseCount('dataset_reporting_calendars', 4);
        $this->assertDatabaseCount('indicators', 1);
        $this->assertDatabaseCount('notifications', 0);
        $this->assertSame('Market access', DatasetDefinition::findOrFail($f['datasetId'])->dataset_name);
    }

    public function test_sample_does_not_reactivate_inactive_institution(): void
    {
        $f = $this->fixture();
        $f['actor']->roles()->attach(Role::where('code', 'MOA')->value('id'), ['status' => 'active']);
        $f['institution']->update(['is_active' => false]);
        $this->seed(TantradePlanningSeeder::class);
        $this->assertFalse((bool) $f['institution']->fresh()->is_active);
        $demo = Institution::where('code', 'TANTRADE_DEMO')->firstOrFail();
        $this->assertDatabaseHas('dataset_definitions', ['institution_id' => $demo->id, 'dataset_name' => '[TEST] TANTRADE Market Access Planning']);
    }
}
