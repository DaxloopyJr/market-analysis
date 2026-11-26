<?php

namespace Tests\Feature;

use App\Models\DatasetDefinition;
use App\Models\Submission;
use App\Models\User;
use Database\Seeders\DatabaseSeeder;
use Database\Seeders\HistoricalPublishedDatasetsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class HistoricalPublishedDatasetsSeederTest extends TestCase
{
    use RefreshDatabase;

    public function test_import_is_complete_published_valid_for_analytics_and_idempotent(): void
    {
        $this->seed(DatabaseSeeder::class);
        $before = DatasetDefinition::count();
        $this->seed(HistoricalPublishedDatasetsSeeder::class);
        $datasets = DatasetDefinition::where('source_system_name', 'like', HistoricalPublishedDatasetsSeeder::PREFIX.'%')->get();
        $this->assertCount(10, $datasets);
        $this->assertSame($before, DatasetDefinition::count());
        $this->assertCount(2, $datasets->where('reporting_purpose', 'sector_performance'));
        $submissions = Submission::whereHas('calendar', fn ($q) => $q->whereIn('dataset_definition_id', $datasets->modelKeys()))->where('status', 'published')->get();
        $this->assertNotEmpty($submissions);
        $this->assertTrue($submissions->every(fn ($s) => $s->status === 'published' && $s->published_at !== null));
        $this->assertSame($submissions->count(), DB::table('submission_revisions')->whereIn('submission_id', $submissions->modelKeys())->count());
        foreach ($datasets as $dataset) {
            $this->assertGreaterThan(0, $dataset->indicators()->count());
            $this->assertSame(1, $dataset->templateVersions()->count());
            $this->assertSame(2, DB::table('dataset_annual_budgets')->where('dataset_definition_id', $dataset->id)->count());
            $this->assertSame($dataset->reporting_purpose === 'sector_performance' ? 1 : 2, DB::table('dataset_annual_objectives')->where('dataset_definition_id', $dataset->id)->count());
        }
        foreach ($submissions as $historical) {
            $snapshot = $historical->objective_snapshot;
            $this->assertNotNull($snapshot);
            $this->assertSame((int) $historical->calendar->dataset->institution_id, (int) $snapshot['institutionId']);
            $this->assertSame((int) ($historical->calendar->period->parent_id ?? $historical->calendar->period->id), $snapshot['reportingYearId']);
            $revision = DB::table('submission_revisions')->where('submission_id', $historical->id)->first();
            $this->assertSame($snapshot, json_decode($revision->objective_snapshot, true));
            $this->assertTrue(collect($historical->annual_targets_snapshot)->every(fn ($target) => is_numeric($target['baselineValue'])));
            $this->assertSame($historical->annual_targets_snapshot, json_decode($revision->annual_targets_snapshot, true));
        }
        $cbe = $datasets->firstWhere('source_system_name', HistoricalPublishedDatasetsSeeder::PREFIX.'TANTRADE-01');
        $submission = $submissions->first(fn ($s) => $s->calendar->dataset_definition_id === $cbe->id);
        $value = $submission->values()->firstOrFail();
        $baseline = $submission->annual_targets_snapshot[0]['baselineValue'];
        $this->assertSame(0, DB::table('dataset_annual_targets')->whereIn('dataset_definition_id', $datasets->modelKeys())->whereNull('baseline_value')->count());
        $this->assertTrue($submission->approvals->every(fn ($a) => $a->meta['synthetic'] === true && isset($a->meta['actor']['userId'])));
        Sanctum::actingAs(User::where('email', 'moa@mit.go.tz')->firstOrFail());
        $this->getJson('/api/v1/reports/sector-performance?financialYear=2025/2026&frequency=annual')
            ->assertOk()->assertJsonCount(2, 'data.rows');
        $this->getJson('/api/v1/reports/quarterly-trend?datasetId='.$cbe->id.'&financialYear=2025/2026')
            ->assertOk()->assertJsonPath('data.rows.3.complete', true);
        $counts = [DatasetDefinition::count(), Submission::count(), DB::table('submission_values')->count(), DB::table('submission_approvals')->count()];
        $this->seed(HistoricalPublishedDatasetsSeeder::class);
        $this->assertSame($counts, [DatasetDefinition::count(), Submission::count(), DB::table('submission_values')->count(), DB::table('submission_approvals')->count()]);
        $assignments = DB::table('dataset_annual_objectives')->where('dataset_definition_id', $cbe->id)->get();
        $this->assertCount(2, $assignments->pluck('objective_version_id')->unique());
        // Repair missing fixture history without replacing frozen objectives or creating duplicates.
        $saved = $submission->objective_snapshot;
        $objectiveCount = DB::table('strategic_objective_versions')->count();
        DB::table('submissions')->where('id', $submission->id)->update(['objective_snapshot' => null]);
        DB::table('submission_revisions')->where('submission_id', $submission->id)->update(['objective_snapshot' => null]);
        $targets = $submission->annual_targets_snapshot;
        $targets[0]['baselineValue'] = null;
        $targets[1]['baselineValue'] = '999'; // Existing frozen baseline must never be overwritten.
        DB::table('submissions')->where('id', $submission->id)->update(['annual_targets_snapshot' => json_encode($targets)]);
        DB::table('submission_revisions')->where('submission_id', $submission->id)->update(['annual_targets_snapshot' => json_encode($targets)]);
        $this->seed(HistoricalPublishedDatasetsSeeder::class);
        $this->assertSame($baseline, $submission->fresh()->annual_targets_snapshot[0]['baselineValue']);
        $this->assertSame('999', $submission->fresh()->annual_targets_snapshot[1]['baselineValue']);
        $this->assertSame($saved, $submission->fresh()->objective_snapshot);
        $this->assertSame($objectiveCount, DB::table('strategic_objective_versions')->count());
    }

    public function test_import_refuses_production(): void
    {
        $this->app->instance('env', 'production');
        $this->expectException(\RuntimeException::class);
        app(HistoricalPublishedDatasetsSeeder::class)->run();
    }
}
