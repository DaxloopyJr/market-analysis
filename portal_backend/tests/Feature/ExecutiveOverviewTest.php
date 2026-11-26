<?php

namespace Tests\Feature;

use App\Models\Institution;
use App\Models\Role;
use App\Models\User;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ExecutiveOverviewTest extends TestCase
{
    use RefreshDatabase;

    public function test_year_filter_published_only_and_existing_report_calculations(): void
    {
        $this->seed(DatabaseSeeder::class);
        Sanctum::actingAs(User::where('email', 'moa@mit.go.tz')->firstOrFail());
        $url = '/api/v1/reports/executive-overview';
        $previous = $this->getJson($url.'?financialYear=2025/2026')->assertOk()
            ->assertJsonPath('data.summary.publishedSubmissions', 34)
            ->assertJsonCount(2, 'data.sectors')->json('data');
        $this->assertSame('2025/2026', $previous['financialYear']);
        $this->assertSame($previous['summary']['budgetUtilisationPercent'], $previous['budget']['budgetUtilisationPercent']);
        $this->assertSame(['sector_growth', 'trade_growth', 'gdp_share', 'industrial_licences', 'new_industries', 'exports_usd', 'companies', 'business_licences'], array_column($previous['headline'], 'key'));
        $this->assertSame(array_fill(0, 8, null), array_column($previous['headline'], 'actual'));
        $this->assertNull($previous['headline'][0]['previousActual']);
        $this->assertNull($previous['headline'][2]['target']);
        $this->assertSame('USD', $previous['headline'][5]['unit']);
        $this->assertCount(3, $previous['institutions']);
        $expectedExceptions = $this->getJson('/api/v1/reports/target-exceptions?financialYear=2025/2026')->assertOk()->json('data.rows');
        $this->assertSame($expectedExceptions, $previous['exceptions']);
        $annual = $this->getJson('/api/v1/reports/annual-me?financialYear=2025/2026')->assertOk()->json('data.summary');
        foreach (['indicators', 'deliveryPercent', 'fullyAchieved', 'underperforming', 'budgetUtilisationPercent', 'publishedSubmissions'] as $field) {
            $this->assertSame($annual[$field], $previous['summary'][$field]);
        }
        $sector = $this->getJson('/api/v1/reports/sector-performance?financialYear=2025/2026')->assertOk()->json('data.rows');
        foreach ($sector as $index => $row) {
            $this->assertSame($row['deliveryPercent'], $previous['sectors'][$index]['deliveryPercent']);
            $this->assertNull($previous['sectors'][$index]['growthPercent']);
            $this->assertSame(['MIT'], $previous['sectors'][$index]['institutionCodes']);
        }
        $this->getJson($url.'?financialYear=2026/2027&status=draft')->assertOk()
            ->assertJsonPath('data.filters.financialYear', '2026/2027')
            ->assertJsonPath('data.filters.status', 'published')
            ->assertJsonPath('data.summary.publishedSubmissions', 8)
            ->assertJsonPath('data.sectorDataStatus', 'no_data')->assertJsonCount(0, 'data.sectors');
        $this->getJson($url.'?financialYear=2030/2031')->assertOk()
            ->assertJsonPath('data.dataStatus', 'no_data')
            ->assertJsonPath('data.summary.publishedSubmissions', 0)
            ->assertJsonPath('data.summary.deliveryPercent', null)
            ->assertJsonPath('data.summary.targetsMetPercent', null)
            ->assertJsonPath('data.summary.budgetUtilisationPercent', null)
            ->assertJsonPath('data.budget.budgetUtilisationPercent', null)
            ->assertJsonCount(8, 'data.headline')->assertJsonCount(0, 'data.institutions')->assertJsonCount(0, 'data.exceptions');
        $this->getJson($url)->assertUnprocessable()->assertJsonValidationErrors('financialYear');
        $this->getJson($url.'?financialYear=2026/2027&frequency=invalid')->assertUnprocessable();

        $institution = Institution::where('code', 'FCC')->firstOrFail();
        $officer = User::factory()->create(['institution_id' => $institution->id, 'is_active' => true, 'status' => 'active']);
        $officer->roles()->attach(Role::where('code', 'IDO')->value('id'), ['status' => 'active', 'effective_from' => '2020-01-01']);
        Sanctum::actingAs($officer);
        $this->getJson($url.'?financialYear=2025/2026')->assertOk()
            ->assertJsonPath('data.accessScope', 'institution')
            ->assertJsonPath('data.summary.institutions', 1)
            ->assertJsonCount(1, 'data.institutions')
            ->assertJsonPath('data.institutions.0.institutionCode', 'FCC')
            ->assertJsonPath('data.summary.publishedSubmissions', 12);
        $otherInstitution = Institution::where('code', 'TANTRADE')->value('id');
        $this->getJson($url.'?financialYear=2025/2026&institutionId='.$otherInstitution)->assertOk()
            ->assertJsonPath('data.dataStatus', 'no_data');
    }

    public function test_authentication_and_report_permissions_are_required(): void
    {
        $url = '/api/v1/reports/executive-overview?financialYear=2026/2027';
        $this->getJson($url)->assertUnauthorized();
        Sanctum::actingAs(User::factory()->create(['is_active' => true, 'status' => 'active']));
        $this->getJson($url)->assertForbidden();
    }
}
