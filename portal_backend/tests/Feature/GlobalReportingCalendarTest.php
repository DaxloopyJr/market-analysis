<?php

namespace Tests\Feature;

use App\Models\DatasetDefinition;
use App\Models\DatasetReportingCalendar;
use App\Models\Institution;
use App\Models\Role;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class GlobalReportingCalendarTest extends TestCase
{
    use RefreshDatabase;

    private function actor(string $role, ?int $institution = null): User
    {
        $user = User::factory()->create(['institution_id' => $institution, 'is_active' => true, 'status' => 'active']);
        $r = Role::firstOrCreate(['code' => $role], ['name' => $role]);
        $user->roles()->attach($r->id, ['status' => 'active', 'effective_from' => '2020-01-01']);
        Sanctum::actingAs($user);

        return $user;
    }

    public function test_only_moa_manages_shared_years_and_all_frequencies(): void
    {
        $body = ['periodType' => 'annual', 'yearType' => 'financial', 'startDate' => '2026-07-01', 'endDate' => '2027-06-30', 'deadlineDays' => 0];
        $this->actor('IA');
        $this->postJson('/api/v1/reporting-periods', $body)->assertForbidden();
        $moa = $this->actor('MOA');
        $annual = $this->postJson('/api/v1/reporting-periods', $body)->assertCreated()->assertJsonPath('data.institutionId', null)->json('data.id');
        $this->postJson('/api/v1/reporting-periods', $body)->assertStatus(409);
        foreach (['quarters' => 4, 'months' => 12, 'semiannual' => 2, 'weeks' => 53, 'days' => 365] as $route => $count) {
            $this->postJson("/api/v1/reporting-periods/$annual/$route", ['deadlineDays' => 0])->assertOk()->assertJsonCount($count, 'data');
            $this->postJson("/api/v1/reporting-periods/$annual/$route", ['deadlineDays' => 0])->assertOk()->assertJsonCount($count, 'data');
        }
        $this->actor('IDO');
        $this->getJson('/api/v1/reporting-periods?periodType=annual')->assertOk()->assertJsonCount(1, 'data');
        $this->patchJson("/api/v1/reporting-periods/$annual", ['status' => 'closed'])->assertForbidden();
        $this->postJson("/api/v1/reporting-periods/$annual/quarters", ['deadlineDays' => 0])->assertForbidden();
        Sanctum::actingAs($moa);
        $this->patchJson("/api/v1/reporting-periods/$annual", ['status' => 'closed'])->assertOk();
    }

    public function test_dataset_uses_admin_periods_and_live_deadlines_with_entry_statuses(): void
    {
        $this->travelTo(Carbon::parse('2026-10-21 10:00:00', 'Africa/Dar_es_Salaam'));
        $moa = $this->actor('MOA');
        $year = $this->postJson('/api/v1/reporting-periods', ['periodType' => 'annual', 'yearType' => 'financial',
            'startDate' => '2026-07-01', 'endDate' => '2027-06-30', 'deadlineDays' => 0])->assertCreated()->json('data.id');
        $periods = $this->postJson("/api/v1/reporting-periods/$year/quarters", ['deadlineDays' => 0])->assertOk()->json('data');
        $inst = Institution::create(['code' => 'CAMARTEC', 'name' => 'CAMARTEC', 'is_active' => true, 'status' => 'active']);
        $officer = $this->actor('IDO', $inst->id);
        $dataset = DatasetDefinition::create(['institution_id' => $inst->id, 'dataset_code' => 'TEST', 'dataset_name' => 'Staff', 'status' => 'active', 'created_by' => $officer->id, 'responsible_user_id' => $officer->id]);
        $dataset->frequencies()->create(['frequency' => 'quarterly']);
        $version = $dataset->templateVersions()->create(['version_number' => 1, 'template_format' => 'json', 'effective_from' => '2026-07-01', 'template_content' => ['indicators' => [], 'dimensions' => []], 'status' => 'active', 'created_by' => $officer->id]);
        $url = '/api/v1/datasets/'.$dataset->id;
        $body = ['startYear' => 2026, 'frequency' => 'quarterly'];
        $rows = $this->postJson($url.'/reporting-years', $body)->assertOk()
            ->assertJsonPath('data.0.entryStatus', 'overdue')->assertJsonPath('data.1.entryStatus', 'available')
            ->assertJsonPath('data.2.entryStatus', 'upcoming')->json('data');
        $this->postJson($url.'/submission-context', [...$body, 'periodNumber' => 1])->assertUnprocessable();
        $this->postJson($url.'/submission-context', [...$body, 'periodNumber' => 3])->assertUnprocessable();
        $this->postJson($url.'/submission-context', [...$body, 'periodNumber' => 2])->assertOk()->assertJsonPath('data.reportingCalendarId', $rows[1]['calendar']['id']);
        $this->postJson($url.'/reporting-years', [...$body, 'startYear' => 2028])->assertUnprocessable();
        $this->assertDatabaseCount('reporting_periods', 5);
        Sanctum::actingAs($moa);
        $this->patchJson('/api/v1/reporting-periods/'.$periods[0]['id'], ['deadline' => '2026-10-21'])->assertOk();
        Sanctum::actingAs($officer);
        $this->travelTo(Carbon::parse('2026-10-21 23:59:59', 'Africa/Dar_es_Salaam'));
        $this->postJson($url.'/submission-context', [...$body, 'periodNumber' => 1])->assertOk()->assertJsonPath('data.calendar.deadline', '2026-10-21');
        $this->travelTo(Carbon::parse('2026-10-22 00:00:00', 'Africa/Dar_es_Salaam'));
        $this->postJson($url.'/submission-context', [...$body, 'periodNumber' => 1])->assertUnprocessable();
        DatasetReportingCalendar::findOrFail($rows[1]['calendar']['id'])->update(['submitted_at' => now()]);
        $this->postJson($url.'/reporting-years', $body)->assertOk()->assertJsonPath('data.1.entryStatus', 'submitted');
        $this->postJson($url.'/submission-context', [...$body, 'periodNumber' => 2])->assertUnprocessable();
        $this->travelBack();
    }
}
