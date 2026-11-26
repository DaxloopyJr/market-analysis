<?php

namespace Tests\Feature;

use App\Models\DatasetDefinition;
use App\Models\Institution;
use App\Models\Submission;
use Database\Seeders\DatabaseSeeder;
use Database\Seeders\ResetSmallTestingDatasetsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class SmallTestingDatasetsSeederTest extends TestCase
{
    use RefreshDatabase;

    public function test_small_fixture_has_ten_datasets_and_only_completed_publications(): void
    {
        $this->seed(DatabaseSeeder::class);
        $this->assertSame(10, DatasetDefinition::count());
        $this->assertSame(50, Submission::count());
        $this->assertSame(42, Submission::where('status', 'published')->count());
        $this->assertSame(8, Submission::where('status', 'draft')->count());
        foreach (['FCC' => 3, 'TANTRADE' => 3] as $code => $count) {
            $this->assertSame($count, DatasetDefinition::whereHas('institution', fn ($q) => $q->where('code', $code))->count());
        }
        $this->assertSame(2, DatasetDefinition::where('reporting_purpose', 'sector_performance')->count());
        $this->assertSame(2, DatasetDefinition::whereHas('department', fn ($q) => $q->where('code', 'ICT'))->count());
        foreach (Submission::with('calendar.period')->get() as $submission) {
            $this->assertContains((int) $submission->calendar->period->start_date->format('Y'), [2025, 2026]);
            if ($submission->status === 'draft') {
                $this->assertNull($submission->submitted_at);
                $this->assertNull($submission->published_at);
                $this->assertSame(0, $submission->approvals()->count());
            } else {
                $this->assertNotNull($submission->objective_snapshot);
                $this->assertTrue(collect($submission->annual_targets_snapshot)->every(fn ($t) => is_numeric($t['baselineValue'])));
            }
        }
        $this->assertSame(20, DB::table('dataset_annual_budgets')->count());
        $this->seed(DatabaseSeeder::class);
        $this->assertSame(10, DatasetDefinition::count());
        $this->assertSame(50, Submission::count());
        Institution::create(['code' => 'NCAC', 'name' => 'Removed fixture', 'type' => 'institution']);
        $this->seed(ResetSmallTestingDatasetsSeeder::class);
        $this->assertSame(10, DatasetDefinition::count());
        $this->assertSame(50, Submission::count());
        $this->assertFalse(Institution::where('code', 'NCAC')->exists());
    }
}
