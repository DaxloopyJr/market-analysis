<?php

namespace Tests\Feature;

use App\Models\AuditEvent;
use App\Models\DatasetDefinition;
use App\Models\DatasetReportingCalendar;
use App\Models\Institution;
use App\Models\ReferenceDataType;
use App\Models\ReferenceDataValue;
use App\Models\ReportingPeriod;
use App\Models\Role;
use App\Models\Submission;
use App\Models\User;
use App\Services\AuditService;
use App\Services\DatasetRecurringReportingService;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use PHPUnit\Framework\Attributes\TestWith;
use Tests\TestCase;

class DatasetMasterReportingTest extends TestCase
{
    use RefreshDatabase;

    private function fixture(): array
    {
        $institution = Institution::create(['code' => 'WMA', 'name' => 'WMA', 'is_active' => true, 'status' => 'active']);
        $officer = User::factory()->create(['institution_id' => $institution->id, 'status' => 'active', 'is_active' => true]);
        $role = Role::create(['code' => 'IDO', 'name' => 'Officer']);
        $officer->roles()->attach($role->id, ['status' => 'active', 'effective_from' => '2020-01-01']);
        Sanctum::actingAs($officer);
        $type = ReferenceDataType::create(['data_type_code' => 'SECTOR', 'data_type_name_en' => 'Sector']);
        $sector = ReferenceDataValue::create(['data_type_id' => $type->id, 'data_value_code' => 'TRADE', 'data_value_name_en' => 'Trade']);
        $id = $this->postJson('/api/v1/datasets', ['responsibleUserId' => $officer->id, 'institutionId' => $institution->id, 'datasetName' => 'Inspections',
            'frequencies' => ['quarterly', 'monthly', 'annual'], 'sectors' => [['sectorId' => $sector->id]]])->assertCreated()->json('data.id');
        $url = '/api/v1/datasets/'.$id;
        $indicator = $this->postJson($url.'/indicators', ['indicator' => ['nameEn' => 'Inspections', 'dataType' => 'integer']])
            ->assertCreated()->json('data.indicatorId');
        $version = $this->postJson($url.'/activate')->assertCreated()->assertJsonMissingPath('data.template_content.reportingCalendar')->json('data.id');
        $settings = ['responsibleUserId' => $officer->id, 'yearType' => 'financial', 'yearStartMonth' => 7,
            'deadlineDays' => 0, 'reminderDays' => [10], 'remindersEnabled' => true];
        $this->putJson($url.'/reporting-settings', $settings)->assertOk();

        $moa = User::factory()->create(['status' => 'active', 'is_active' => true]);
        $moa->roles()->attach(Role::firstOrCreate(['code' => 'MOA'], ['name' => 'Admin'])->id, ['status' => 'active', 'effective_from' => '2020-01-01']);
        Sanctum::actingAs($moa);
        foreach ([2026, 2027] as $year) {
            $annual = $this->postJson('/api/v1/reporting-periods', ['periodType' => 'annual', 'yearType' => 'financial',
                'startDate' => "$year-07-01", 'endDate' => ($year + 1).'-06-30', 'deadlineDays' => 0])->assertCreated()->json('data.id');
            foreach (['quarters', 'months'] as $route) {
                $this->postJson("/api/v1/reporting-periods/$annual/$route", ['deadlineDays' => 0])->assertOk();
            }
        }
        Sanctum::actingAs($officer);

        return compact('institution', 'officer', 'id', 'url', 'indicator', 'version', 'settings');
    }

    public function test_master_is_reused_across_years_without_reactivation_or_duplicate_calendars(): void
    {
        $f = $this->fixture();
        $this->assertDatabaseCount('reporting_periods', 34);
        $this->assertDatabaseCount('indicator_targets', 0);
        foreach ([2026, 2027] as $year) {
            $body = ['startYear' => $year, 'frequency' => 'quarterly'];
            $result = $this->postJson($f['url'].'/reporting-years', $body)->assertOk()->assertJsonCount(4, 'data')
                ->assertJsonPath('data.0.calendar.deadline', $year.'-09-30')->json('data');
            $this->postJson($f['url'].'/reporting-years', $body)->assertOk()->assertJsonPath('data', $result);
        }
        $this->assertDatabaseCount('dataset_definitions', 1);
        $this->assertDatabaseCount('template_versions', 1);
        $this->assertDatabaseCount('reporting_periods', 34);
        $this->assertDatabaseCount('dataset_reporting_calendars', 8);
    }

    public function test_responsible_officer_is_required_eligible_and_updateable_without_versioning(): void
    {
        $f = $this->fixture();
        $payload = ['institutionId' => $f['institution']->id, 'datasetName' => 'Another master',
            'frequencies' => ['annual'], 'sectors' => [['sectorId' => ReferenceDataValue::firstOrFail()->id]]];
        $this->postJson('/api/v1/datasets', $payload)->assertUnprocessable()->assertJsonValidationErrors('responsibleUserId');
        $other = User::factory()->create(['institution_id' => null, 'is_active' => true, 'status' => 'active']);
        $this->postJson('/api/v1/datasets', [...$payload, 'responsibleUserId' => $other->id])->assertUnprocessable();
        $this->assertDatabaseCount('dataset_definitions', 1);
        $this->patchJson($f['url'], ['responsibleUserId' => $other->id])->assertUnprocessable();
        $other->update(['institution_id' => $f['institution']->id]);
        $this->patchJson($f['url'], ['responsibleUserId' => $other->id])->assertUnprocessable();
        $other->roles()->attach(Role::where('code', 'IDO')->value('id'), ['status' => 'active', 'effective_from' => '2020-01-01']);
        $this->patchJson($f['url'], ['responsibleUserId' => $other->id])->assertOk()
            ->assertJsonPath('data.responsibleUserId', $other->id)->assertJsonPath('data.status', 'active')
            ->assertJsonPath('data.reportingSettings.responsibleUserId', $other->id);
        $settings = $f['settings'];
        unset($settings['responsibleUserId']);
        $this->putJson($f['url'].'/reporting-settings', $settings)->assertOk()->assertJsonPath('data.responsibleUserId', $other->id);
        $this->assertDatabaseHas('dataset_definitions', ['id' => $f['id'], 'responsible_user_id' => $other->id]);
        $this->assertDatabaseCount('template_versions', 1);
        $this->assertDatabaseHas('audit_events', ['event_type' => 'dataset_updated', 'entity_id' => (string) $f['id']]);
        $this->postJson($f['url'].'/reporting-years', ['startYear' => 2027, 'frequency' => 'annual'])->assertOk()
            ->assertJsonPath('data.0.calendar.responsibleUserId', $other->id);
        $this->mock(AuditService::class)->shouldReceive('record')->andThrow(new \RuntimeException('Audit failure'));
        $this->patchJson($f['url'], ['responsibleUserId' => $f['officer']->id])->assertStatus(500);
        $this->assertDatabaseHas('dataset_definitions', ['id' => $f['id'], 'responsible_user_id' => $other->id]);
    }

    #[TestWith(['PATCH', ''])]
    #[TestWith(['PUT', '/reporting-settings'])]
    public function test_officer_change_transfers_pending_calendars_and_drafts_but_preserves_submitted_history(string $method, string $suffix): void
    {
        $this->travelTo(Carbon::parse('2026-10-23', 'Africa/Dar_es_Salaam'));
        $f = $this->fixture();
        $rows = $this->postJson($f['url'].'/reporting-years', ['startYear' => 2026, 'frequency' => 'quarterly'])
            ->assertOk()->json('data');
        $first = DatasetReportingCalendar::findOrFail($rows[0]['calendar']['id']);
        $first->update(['submitted_at' => now(), 'template_version_id' => $f['version']]);
        $submitted = Submission::create(['reporting_calendar_id' => $first->id, 'template_version_id' => $f['version'],
            'created_by' => $f['officer']->id, 'reference' => 'SUBMITTED-Q1', 'status' => 'submitted', 'submitted_at' => now()]);
        $contextBody = ['startYear' => 2026, 'frequency' => 'quarterly', 'periodNumber' => 2];
        $calendarId = $this->postJson($f['url'].'/submission-context', $contextBody)->assertOk()->json('data.reportingCalendarId');
        $draftId = $this->postJson('/api/v1/submissions', ['reportingCalendarId' => $calendarId])->assertCreated()->json('data.id');
        $values = [['indicatorId' => $f['indicator'], 'value' => 25]];
        $this->putJson('/api/v1/submissions/'.$draftId.'/values', ['expectedRevision' => 0, 'values' => $values])->assertOk();
        $other = User::factory()->create(['institution_id' => $f['institution']->id, 'is_active' => true, 'status' => 'active']);
        $other->roles()->attach(Role::where('code', 'IDO')->value('id'), ['status' => 'active', 'effective_from' => '2020-01-01']);
        $payload = ['responsibleUserId' => $other->id];
        if ($suffix !== '') {
            $payload += ['reminderDays' => [10], 'remindersEnabled' => true];
        }

        $this->json($method, $f['url'].$suffix, $payload)->assertOk();

        $this->assertDatabaseHas('dataset_definitions', ['id' => $f['id'], 'responsible_user_id' => $other->id]);
        $this->assertDatabaseHas('dataset_reporting_calendars', ['id' => $first->id, 'responsible_user_id' => $f['officer']->id]);
        $this->assertSame('submitted', $submitted->fresh()->status);
        foreach (array_slice($rows, 1) as $row) {
            $this->assertDatabaseHas('dataset_reporting_calendars', ['id' => $row['calendar']['id'], 'responsible_user_id' => $other->id]);
            $this->assertDatabaseHas('audit_events', ['event_type' => 'dataset_calendar_reassigned',
                'entity_id' => (string) $row['calendar']['id'], 'user_id' => $f['officer']->id]);
        }
        $this->assertDatabaseHas('submissions', ['id' => $draftId, 'created_by' => $f['officer']->id, 'revision' => 1, 'status' => 'draft']);
        $this->assertSame('25', Submission::findOrFail($draftId)->values()->firstOrFail()->input()['value']);
        $this->postJson($f['url'].'/submission-context', $contextBody)->assertForbidden();
        $this->postJson('/api/v1/submissions', ['reportingCalendarId' => $calendarId])->assertForbidden();

        Sanctum::actingAs($other);
        $this->postJson($f['url'].'/submission-context', $contextBody)->assertOk()->assertJsonPath('data.reportingCalendarId', $calendarId);
        $this->postJson('/api/v1/submissions', ['reportingCalendarId' => $calendarId])->assertOk()->assertJsonPath('data.id', $draftId);
        $this->putJson('/api/v1/submissions/'.$draftId.'/values', ['expectedRevision' => 1, 'values' => $values])->assertOk();
        $this->json($method, $f['url'].$suffix, $payload)->assertOk();
        $this->assertSame(3, AuditEvent::where('event_type', 'dataset_calendar_reassigned')->count());
    }

    #[TestWith(['PATCH', ''])]
    #[TestWith(['PUT', '/reporting-settings'])]
    public function test_calendar_reassignment_rolls_back_with_dataset_when_audit_fails(string $method, string $suffix): void
    {
        $f = $this->fixture();
        $rows = $this->postJson($f['url'].'/reporting-years', ['startYear' => 2026, 'frequency' => 'quarterly'])->assertOk()->json('data');
        $other = User::factory()->create(['institution_id' => $f['institution']->id, 'is_active' => true, 'status' => 'active']);
        $other->roles()->attach(Role::where('code', 'IDO')->value('id'), ['status' => 'active', 'effective_from' => '2020-01-01']);
        $payload = ['responsibleUserId' => $other->id];
        if ($suffix !== '') {
            $payload += ['reminderDays' => [10], 'remindersEnabled' => true];
        }
        $this->mock(AuditService::class)->shouldReceive('record')->andThrow(new \RuntimeException('Audit failure'));

        $this->json($method, $f['url'].$suffix, $payload)->assertStatus(500);

        $this->assertDatabaseHas('dataset_definitions', ['id' => $f['id'], 'responsible_user_id' => $f['officer']->id]);
        foreach ($rows as $row) {
            $this->assertDatabaseHas('dataset_reporting_calendars', ['id' => $row['calendar']['id'], 'responsible_user_id' => $f['officer']->id]);
        }
        $this->assertDatabaseMissing('audit_events', ['event_type' => 'dataset_calendar_reassigned']);
    }

    public function test_unsubmitted_context_adopts_new_template_after_reactivation_and_targets_are_optional(): void
    {
        $f = $this->fixture();
        $body = ['startYear' => 2026, 'frequency' => 'quarterly', 'periodNumber' => 2];
        $context = $this->postJson($f['url'].'/submission-context', $body)->assertOk()
            ->assertJsonPath('data.templateVersionId', $f['version'])->assertJsonPath('data.targets', [])->json('data');
        $this->postJson($f['url'].'/draft')->assertOk();
        $this->patchJson($f['url'], ['datasetName' => 'Updated master'])->assertOk();
        $newVersion = $this->postJson($f['url'].'/activate')->assertCreated()->json('data.id');
        $this->postJson($f['url'].'/submission-context', $body)->assertOk()
            ->assertJsonPath('data.templateVersionId', $newVersion)->assertJsonPath('data.template.datasetName', 'Updated master');
        $this->travelTo(Carbon::parse('2027-01-05', 'Africa/Dar_es_Salaam'));
        $this->postJson($f['url'].'/submission-context', [...$body, 'periodNumber' => 3])->assertOk()
            ->assertJsonPath('data.templateVersionId', $newVersion);
        $target = ['indicatorId' => $f['indicator'], 'reportingPeriodId' => $context['reportingPeriod']['reportingPeriodId'], 'targetValue' => '20'];
        $this->postJson($f['url'].'/targets', $target)->assertCreated()->assertJsonPath('data.templateVersionId', $newVersion);
        $this->postJson($f['url'].'/targets', [...$target, 'templateVersionId' => $f['version']])->assertUnprocessable();
        $this->assertDatabaseCount('dataset_reporting_calendars', 4);
    }

    public function test_activation_archives_draft_and_removes_dropped_breakdowns_without_losing_total(): void
    {
        $this->travelTo(Carbon::parse('2026-10-24', 'Africa/Dar_es_Salaam'));
        $f = $this->fixture();
        $this->postJson($f['url'].'/draft')->assertOk();
        $crossIndicator = $this->postJson($f['url'].'/indicators', ['indicator' => ['nameEn' => 'Cross tab staff', 'dataType' => 'integer']])
            ->assertCreated()->json('data.indicatorId');
        $dimension = $this->postJson($f['url'].'/dimensions', ['indicatorIds' => [$f['indicator'], $crossIndicator], 'dimension' => [
            'dimensionCode' => 'STAFF-CATEGORY', 'nameEn' => 'Staff category', 'dataType' => 'reference',
            'options' => [['code' => 'A', 'nameEn' => 'A'], ['code' => 'B', 'nameEn' => 'B']],
        ]])->assertCreated()->json('data');
        $v1 = $this->postJson($f['url'].'/activate')->assertCreated()->json('data.id');
        $body = ['startYear' => 2026, 'frequency' => 'quarterly', 'periodNumber' => 2];
        $context = $this->postJson($f['url'].'/submission-context', $body)->assertOk()->json('data');
        $id = $this->postJson('/api/v1/submissions', ['reportingCalendarId' => $context['reportingCalendarId']])->assertCreated()->json('data.id');
        $rows = [['indicatorId' => $f['indicator'], 'value' => '30', 'breakdowns' => [
            ['dimensionId' => $dimension['dimensionId'], 'optionId' => $dimension['dimension']['options'][0]['id'], 'value' => '20'],
            ['dimensionId' => $dimension['dimensionId'], 'optionId' => $dimension['dimension']['options'][1]['id'], 'value' => '10'],
        ]]];
        $rows[] = ['indicatorId' => $crossIndicator, 'value' => '20', 'dimensionValues' => [
            ['dimensionId' => $dimension['dimensionId'], 'value' => $dimension['dimension']['options'][0]['id']],
        ]];
        $this->putJson('/api/v1/submissions/'.$id.'/values', ['expectedRevision' => 0, 'values' => $rows])->assertOk();
        $totalTarget = $this->postJson($f['url'].'/targets', ['indicatorId' => $f['indicator'],
            'reportingPeriodId' => $context['reportingPeriod']['reportingPeriodId'], 'targetValue' => '100'])->assertCreated()->json('data.id');
        $dimensionTarget = $this->postJson($f['url'].'/targets', ['indicatorId' => $f['indicator'],
            'reportingPeriodId' => $context['reportingPeriod']['reportingPeriodId'], 'targetValue' => '40',
            'targetScope' => 'dimensions', 'dimensionValues' => [['dimensionId' => $dimension['dimensionId'],
                'value' => $dimension['dimension']['options'][0]['id']]]])->assertCreated()->json('data.id');
        $this->postJson($f['url'].'/draft')->assertOk();
        $this->deleteJson($f['url'].'/dimensions/'.$dimension['dimensionId'])->assertOk();
        $v2 = $this->postJson($f['url'].'/activate')->assertCreated()->json('data.id');
        $this->getJson('/api/v1/submissions/'.$id)->assertOk()->assertJsonPath('data.templateVersionId', $v2)
            ->assertJsonPath('data.revision', 2)->assertJsonCount(0, 'data.template.dimensions')
            ->assertJsonCount(1, 'data.values')->assertJsonPath('data.values.0.value', '30')->assertJsonPath('data.values.0.breakdowns', []);
        $this->getJson('/api/v1/submissions/'.$id.'/template-archives')->assertOk()
            ->assertJsonPath('data.0.from_template_version_id', $v1)
            ->assertJsonPath('data.0.snapshot.values.0.breakdowns.0.value', '20')->assertJsonCount(1, 'data.0.snapshot.template.dimensions');
        $this->assertDatabaseHas('indicator_targets', ['id' => $totalTarget, 'template_version_id' => $v2, 'status' => 'active', 'target_value' => 100]);
        $this->assertDatabaseHas('indicator_targets', ['id' => $dimensionTarget, 'template_version_id' => $v1, 'status' => 'inactive', 'target_value' => 40]);
        $this->putJson('/api/v1/submissions/'.$id.'/values', ['expectedRevision' => 1, 'values' => $rows])->assertStatus(409);
        $this->putJson('/api/v1/submissions/'.$id.'/values', ['expectedRevision' => 2, 'values' => $rows])->assertUnprocessable();
        $other = User::factory()->create(['status' => 'active', 'is_active' => true]);
        Sanctum::actingAs($other);
        $this->getJson('/api/v1/submissions/'.$id.'/template-archives')->assertNotFound();
    }

    public function test_selection_preflight_is_read_only_and_resumes_existing_draft_or_blocks_submitted(): void
    {
        $this->travelTo(Carbon::parse('2026-10-24', 'Africa/Dar_es_Salaam'));
        $f = $this->fixture();
        $url = $f['url'].'/submission-status?startYear=2026&frequency=quarterly&periodNumber=2';
        $this->getJson($url)->assertOk()->assertJsonPath('data.action', 'start')->assertJsonPath('data.submissionId', null);
        $this->assertDatabaseCount('dataset_reporting_calendars', 0);
        $this->assertDatabaseCount('submissions', 0);
        $context = $this->postJson($f['url'].'/submission-context', ['startYear' => 2026, 'frequency' => 'quarterly', 'periodNumber' => 2])->assertOk()->json('data');
        $id = $this->postJson('/api/v1/submissions', ['reportingCalendarId' => $context['reportingCalendarId']])->assertCreated()->json('data.id');
        $this->getJson($url)->assertOk()->assertJsonPath('data.action', 'resume')->assertJsonPath('data.submissionId', $id);
        // Even a legacy record missing calendar.submitted_at must not be offered as a fresh form.
        Submission::findOrFail($id)->update(['status' => 'under_review', 'attempt' => 1, 'submitted_at' => now()]);
        $this->getJson($url)->assertOk()->assertJsonPath('data.action', 'view')->assertJsonPath('data.canEnterData', false);
        $this->postJson($f['url'].'/submission-context', ['startYear' => 2026, 'frequency' => 'quarterly', 'periodNumber' => 2])->assertUnprocessable();
        Submission::findOrFail($id)->update(['status' => 'returned', 'correction_deadline' => '2026-10-25']);
        $this->getJson($url)->assertOk()->assertJsonPath('data.action', 'resume');
        $this->travelTo(Carbon::parse('2026-10-26', 'Africa/Dar_es_Salaam'));
        $this->getJson($url)->assertOk()->assertJsonPath('data.action', 'blocked')->assertJsonPath('data.entryStatus', 'overdue');
    }

    #[TestWith(['submitted'])]
    #[TestWith(['under_review'])]
    #[TestWith(['returned'])]
    #[TestWith(['approved'])]
    #[TestWith(['published'])]
    public function test_activation_does_not_change_a_previously_submitted_period(string $status): void
    {
        $this->travelTo(Carbon::parse('2026-10-24', 'Africa/Dar_es_Salaam'));
        $f = $this->fixture();
        $context = $this->postJson($f['url'].'/submission-context', ['startYear' => 2026, 'frequency' => 'quarterly', 'periodNumber' => 2])->assertOk()->json('data');
        $id = $this->postJson('/api/v1/submissions', ['reportingCalendarId' => $context['reportingCalendarId']])->assertCreated()->json('data.id');
        $this->putJson('/api/v1/submissions/'.$id.'/values', ['expectedRevision' => 0,
            'values' => [['indicatorId' => $f['indicator'], 'value' => '20']]])->assertOk();
        Submission::findOrFail($id)->update(['status' => $status, 'attempt' => 1, 'submitted_at' => now()]);
        $this->postJson($f['url'].'/draft')->assertOk();
        $this->postJson($f['url'].'/activate')->assertCreated();
        $this->assertDatabaseHas('submissions', ['id' => $id, 'status' => $status, 'template_version_id' => $f['version'], 'revision' => 1]);
        $this->assertDatabaseHas('dataset_reporting_calendars', ['id' => $context['reportingCalendarId'], 'template_version_id' => $f['version']]);
        $this->assertDatabaseMissing('submission_template_archives', ['submission_id' => $id]);
        $this->assertSame('20', Submission::findOrFail($id)->values()->firstOrFail()->input()['value']);
    }

    public function test_archiving_and_draft_migration_roll_back_when_audit_fails(): void
    {
        $this->travelTo(Carbon::parse('2026-10-24', 'Africa/Dar_es_Salaam'));
        $f = $this->fixture();
        $context = $this->postJson($f['url'].'/submission-context', ['startYear' => 2026, 'frequency' => 'quarterly', 'periodNumber' => 2])->assertOk()->json('data');
        $id = $this->postJson('/api/v1/submissions', ['reportingCalendarId' => $context['reportingCalendarId']])->assertCreated()->json('data.id');
        $this->postJson($f['url'].'/draft')->assertOk();
        $this->mock(AuditService::class)->shouldReceive('record')->andThrow(new \RuntimeException('Audit unavailable'));
        $this->postJson($f['url'].'/activate')->assertStatus(500);
        $this->assertDatabaseCount('submission_template_archives', 0);
        $this->assertDatabaseCount('template_versions', 1);
        $this->assertDatabaseHas('submissions', ['id' => $id, 'template_version_id' => $f['version'], 'revision' => 0]);
        $this->assertDatabaseHas('dataset_definitions', ['id' => $f['id'], 'status' => 'draft']);
    }

    public function test_selection_rejects_wrong_frequency_closed_period_and_foreign_scope(): void
    {
        $f = $this->fixture();
        $this->postJson($f['url'].'/submission-context', ['startYear' => 2026, 'frequency' => 'weekly', 'periodNumber' => 1])->assertUnprocessable();
        $this->postJson($f['url'].'/submission-context', ['startYear' => 2026, 'frequency' => 'quarterly', 'periodNumber' => 5])->assertUnprocessable();
        $this->assertDatabaseCount('reporting_periods', 34);
        $this->getJson($f['url'].'/submission-status?startYear=2026&frequency=annual&periodNumber=1')
            ->assertOk()->assertJsonPath('data.action', 'start');
        $context = $this->postJson($f['url'].'/submission-context', [
            'startYear' => 2026, 'frequency' => 'annual', 'periodNumber' => 1,
        ])->assertOk()->json('data');
        ReportingPeriod::findOrFail($context['reportingPeriod']['reportingPeriodId'])->update(['status' => 'closed', 'automatic_status' => false]);
        $this->postJson($f['url'].'/reporting-years', ['startYear' => 2026, 'frequency' => 'quarterly'])->assertOk()->assertJsonPath('data.0.entryStatus', 'closed');
        $f['officer']->update(['institution_id' => null]);
        $this->postJson($f['url'].'/reporting-years', ['startYear' => 2027, 'frequency' => 'quarterly'])->assertForbidden();
    }

    public function test_year_creation_rolls_back_on_audit_failure(): void
    {
        $f = $this->fixture();
        $this->mock(AuditService::class)->shouldReceive('record')->andThrow(new \RuntimeException('Audit failure'));
        $this->postJson($f['url'].'/reporting-years', ['startYear' => 2026, 'frequency' => 'monthly'])->assertStatus(500);
        $this->assertDatabaseCount('reporting_periods', 34);
        $this->assertDatabaseCount('dataset_reporting_calendars', 0);
    }

    public function test_scheduler_prepares_years_before_submission_and_preserves_calendar_overrides(): void
    {
        $this->travelTo(Carbon::parse('2026-09-01', 'Africa/Dar_es_Salaam'));
        $f = $this->fixture();
        $this->assertSame(6, app(DatasetRecurringReportingService::class)->prepareDueYears());
        $this->assertDatabaseCount('dataset_reporting_calendars', 34);
        $calendar = DatasetReportingCalendar::firstOrFail();
        $calendar->update(['reminder_days' => [5], 'submitted_at' => now()]);
        app(DatasetRecurringReportingService::class)->prepareDueYears();
        $this->assertSame([5], $calendar->fresh()->reminder_days);
        $this->assertNotNull($calendar->fresh()->submitted_at);
        $this->assertDatabaseCount('dataset_reporting_calendars', 34);
        $this->travelBack();
    }

    public function test_monthly_selection_and_settings_validation(): void
    {
        $f = $this->fixture();
        $this->putJson($f['url'].'/reporting-settings', [...$f['settings'], 'yearType' => 'calendar'])->assertUnprocessable();
        $this->travelTo(Carbon::parse('2026-08-15', 'Africa/Dar_es_Salaam'));
        $this->postJson($f['url'].'/submission-context', ['startYear' => 2026, 'frequency' => 'monthly', 'periodNumber' => 2])
            ->assertOk()->assertJsonPath('data.reportingPeriod.startDate', '2026-08-01')
            ->assertJsonPath('data.calendar.deadline', '2026-08-31');
        $this->getJson($f['url'].'/reporting-settings')->assertOk()->assertJsonPath('data.yearStartMonth', 7);
        $this->assertSame('active', DatasetDefinition::findOrFail($f['id'])->status);
    }
}
