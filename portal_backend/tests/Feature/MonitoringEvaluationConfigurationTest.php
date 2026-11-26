<?php

namespace Tests\Feature;

use App\Models\DatasetDefinition;
use App\Models\DatasetReportingCalendar;
use App\Models\User;
use Database\Seeders\DatabaseSeeder;
use Database\Seeders\MonitoringEvaluationSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class MonitoringEvaluationConfigurationTest extends TestCase
{
    use RefreshDatabase;

    public function test_sector_officers_can_submit_and_separate_reviewers_can_publish(): void
    {
        $this->travelTo(now()->setDate(2026, 10, 26));
        $this->seed(DatabaseSeeder::class);
        $datasets = DatasetDefinition::where('reporting_purpose', 'sector_performance')->get();
        $this->assertCount(2, $datasets);
        $mdo = User::where('email', 'mdo@mit.go.tz')->firstOrFail();
        $mdd = User::where('email', 'dd@mit.go.tz')->firstOrFail();
        foreach ($datasets as $dataset) {
            $officer = User::findOrFail($dataset->responsible_user_id);
            $this->assertTrue($officer->hasRole('DDO'));
            $this->assertFalse($officer->hasRole('MDO', 'MDD'));
            Sanctum::actingAs($officer);
            $this->getJson('/api/v1/datasets/'.$dataset->id)->assertOk()
                ->assertJsonPath('data.reportingPurpose', 'sector_performance');
            $context = $this->postJson('/api/v1/datasets/'.$dataset->id.'/submission-context', [
                'startYear' => 2026, 'frequency' => 'annual',
            ])->assertOk()->json('data');
            $calendar = DatasetReportingCalendar::findOrFail($context['reportingCalendarId']);
            $this->assertSame('calendar', $calendar->period->year_type);
            $id = $this->postJson('/api/v1/submissions', ['reportingCalendarId' => $calendar->id])
                ->assertSuccessful()->json('data.id');
            $url = '/api/v1/submissions/'.$id;
            $values = $dataset->indicators->map(fn ($indicator) => [
                'indicatorId' => $indicator->id, 'value' => '10', 'remarks' => 'Test source; calendar year 2026.',
            ])->all();
            $this->putJson($url.'/values', ['expectedRevision' => 0, 'values' => $values])->assertOk();
            $this->postJson($url.'/submit', ['expectedRevision' => 1])->assertOk()
                ->assertJsonPath('data.currentStep.required_role_code', 'MDO');
            $this->postJson($url.'/review', ['expectedRevision' => 2])->assertForbidden();
            Sanctum::actingAs($mdo);
            $this->postJson($url.'/review', ['expectedRevision' => 2])->assertOk()
                ->assertJsonPath('data.currentStep.required_role_code', 'MDD');
            Sanctum::actingAs($mdd);
            $this->postJson($url.'/publish', ['expectedRevision' => 3])->assertOk()
                ->assertJsonPath('data.status', 'published');
            $this->getJson($url)->assertOk()->assertJsonPath('data.template.reportingPurpose', 'sector_performance');
        }
    }

    public function test_rerun_preserves_dataset_edits_assignments_and_passwords(): void
    {
        $this->seed(DatabaseSeeder::class);
        $dataset = DatasetDefinition::firstOrFail();
        $dataset->update(['dataset_name' => 'Renamed by M&E']);
        $officer = User::findOrFail($dataset->responsible_user_id);
        $officer->update(['password' => 'ChangedTestingPassword@456']);
        $password = $officer->password;
        $this->seed(MonitoringEvaluationSeeder::class);
        $this->assertDatabaseCount('dataset_definitions', 2);
        $this->assertDatabaseCount('template_versions', 2);
        $this->assertDatabaseCount('dataset_reporting_calendars', 2);
        $this->assertSame('Renamed by M&E', $dataset->fresh()->dataset_name);
        $this->assertSame($password, $officer->fresh()->password);
        $this->assertDatabaseCount('submissions', 0);
    }

    public function test_existing_ineligible_account_is_not_reactivated(): void
    {
        $this->seed(DatabaseSeeder::class);
        $officer = User::where('email', 'ddo1.meu@mit.go.tz')->firstOrFail();
        $officer->update(['is_active' => false, 'status' => 'inactive']);
        try {
            $this->seed(MonitoringEvaluationSeeder::class);
            $this->fail('Inactive account must not be reused.');
        } catch (\RuntimeException $exception) {
            $this->assertStringContainsString('not eligible', $exception->getMessage());
        }
        $this->assertFalse($officer->fresh()->is_active);
    }
}
