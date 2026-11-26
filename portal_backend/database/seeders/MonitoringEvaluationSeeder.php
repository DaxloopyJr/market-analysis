<?php

namespace Database\Seeders;

use App\DTOs\AuditEventData;
use App\DTOs\DatasetIndicatorData;
use App\DTOs\IndicatorData;
use App\DTOs\ReportingPeriodData;
use App\Models\DatasetDefinition;
use App\Models\Department;
use App\Models\Institution;
use App\Models\ReferenceDataType;
use App\Models\ReferenceDataValue;
use App\Models\ReportingPeriod;
use App\Models\Role;
use App\Models\User;
use App\Services\ActorSnapshotService;
use App\Services\AuditService;
use App\Services\DatasetCodeGenerator;
use App\Services\DatasetConfigurationService;
use App\Services\DatasetIndicatorService;
use App\Services\DatasetRecurringReportingService;
use App\Services\ReportingPeriodService;
use Illuminate\Database\Seeder;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use RuntimeException;

class MonitoringEvaluationSeeder extends Seeder
{
    public function run(bool $seedDatasets = true): void
    {
        if (app()->environment('production')) {
            throw new RuntimeException('M&E testing configuration must not be seeded in production.');
        }

        DB::transaction(function () use ($seedDatasets) {
            $ministry = Institution::where('code', 'MIT')->where('is_active', true)->where('status', 'active')->firstOrFail();
            $department = Department::firstOrCreate(['code' => 'MEU'], [
                'name' => 'Monitoring and Evaluation Unit', 'is_active' => true, 'status' => 'active',
            ]);
            if (! $department->is_active || $department->status !== 'active') {
                throw new RuntimeException('M&E unit is inactive; configuration was not changed.');
            }
            $role = Role::where('code', 'DDO')->where('is_active', true)->where('status', 'active')->firstOrFail();
            $officers = [];
            foreach ([1, 2] as $number) {
                $officer = User::withTrashed()->firstOrCreate(['email' => "ddo{$number}.meu@mit.go.tz"], [
                    'name' => "[TEST] M&E Data Entry Officer {$number}", 'password' => 'Password@123',
                    'institution_id' => $ministry->id, 'department_id' => $department->id,
                    'is_active' => true, 'status' => 'active',
                ]);
                // Preserve passwords, suspensions and manually assigned roles on every rerun.
                if ($officer->wasRecentlyCreated) {
                    $officer->roles()->attach($role->id, [
                        'institution_id' => $ministry->id, 'department_id' => $department->id,
                        'status' => 'active', 'effective_from' => today()->toDateString(),
                    ]);
                }
                if ($officer->trashed() || ! $officer->is_active || $officer->status !== 'active'
                    || (int) $officer->institution_id !== (int) $ministry->id
                    || (int) $officer->department_id !== (int) $department->id || ! $officer->hasRole('DDO')) {
                    throw new RuntimeException('Existing M&E officer is not eligible; no accounts were reset.');
                }
                $officers[] = $officer;
            }

            if (! $seedDatasets) {
                return;
            }

            $admin = User::where('institution_id', $ministry->id)->where('is_active', true)->where('status', 'active')
                ->whereHas('roles', fn ($query) => $query->where('code', 'MOA'))->firstOrFail();
            $request = Request::create('/seed/monitoring-evaluation', 'POST');
            $request->setUserResolver(fn () => $admin);

            $definitions = [
                ['BUSINESS', 'Trade', 'Utendaji wa Sekta ya Biashara', [
                    ['Trade and repair activities share of GDP', 'decimal', 'PERCENT', 'Percent', 'latest'],
                    ['Trade and repair activities real growth rate', 'decimal', 'PERCENT', 'Percent', 'latest'],
                    ['Goods exports value', 'decimal', 'USD_MILLION', 'USD million', 'sum'],
                ]],
                ['VIWANDA', 'Industry', 'Utendaji wa Sekta ya Viwanda', [
                    ['Manufacturing share of GDP', 'decimal', 'PERCENT', 'Percent', 'latest'],
                    ['Manufacturing real growth rate', 'decimal', 'PERCENT', 'Percent', 'latest'],
                    ['Persons employed in manufacturing', 'integer', 'NUMBER', 'Number', 'latest'],
                    ['New manufacturing establishments', 'integer', 'NUMBER', 'Number', 'sum'],
                ]],
            ];
            foreach ($definitions as $index => [$sectorCode, $sectorName, $name, $indicators]) {
                $sector = $this->reference('SECTOR', $sectorCode, $sectorName);
                // Purpose + owner + sector is the durable identity, independent of editable titles.
                $existing = DatasetDefinition::where('institution_id', $ministry->id)->where('department_id', $department->id)
                    ->where('reporting_purpose', 'sector_performance')
                    ->whereHas('sectors', fn ($query) => $query->whereKey($sector->id))->exists();
                if ($existing) {
                    continue;
                }
                $officer = $officers[$index];
                $dataset = new DatasetDefinition([
                    'institution_id' => $ministry->id, 'department_id' => $department->id,
                    'dataset_code' => app(DatasetCodeGenerator::class)->next($ministry->id),
                    'dataset_name' => $name, 'responsible_user_id' => $officer->id,
                    'created_by' => $admin->id, 'creator_snapshot' => app(ActorSnapshotService::class)->capture($admin),
                    'description' => 'Annual calendar-year sector statistics. Record source, observation period and coverage in each value remarks. No estimates or sample actuals are prefilled.',
                    'collection_method' => 'manual',
                    'source_description' => 'M&E verifies the official source for each observation. Never substitute financial-year data for calendar-year data.',
                ]);
                // Classification is controlled by configuration, not inferred from the dataset name.
                $dataset->reporting_purpose = 'sector_performance';
                $dataset->save();
                $dataset->sectors()->attach($sector->id);
                $dataset->frequencies()->create(['frequency' => 'annual']);
                app(AuditService::class)->record(new AuditEventData(eventType: 'dataset_created', userId: $admin->id,
                    entityType: 'dataset_definition', entityId: (string) $dataset->id, newValues: $dataset->attributesToArray()));
                foreach ($indicators as $order => [$indicatorName, $type, $unitCode, $unitName, $aggregation]) {
                    $unit = $this->reference('UNIT', $unitCode, $unitName);
                    app(DatasetIndicatorService::class)->attach($dataset->id, $admin,
                        new DatasetIndicatorData(isRequired: false, displayOrder: $order + 1), null,
                        new IndicatorData(nameEn: $indicatorName, dataType: $type, unitId: $unit->id,
                            descriptionEn: 'Use a verified source for the selected calendar year. Missing data must remain blank, not zero.',
                            aggregationRule: $aggregation), null, null);
                }
                app(DatasetRecurringReportingService::class)->settings($request, $dataset->id, [
                    'yearType' => 'calendar', 'yearStartMonth' => 1, 'responsibleUserId' => $officer->id,
                    'deadlineDays' => 30, 'reminderDays' => [7, 1], 'remindersEnabled' => false,
                ]);
                app(DatasetConfigurationService::class)->activate($request, $dataset->id);
                $year = (int) now('Africa/Dar_es_Salaam')->format('Y');
                if (! ReportingPeriod::whereNull('institution_id')->where('period_type', 'annual')
                    ->where('year_type', 'calendar')->whereDate('start_date', "{$year}-01-01")->exists()) {
                    app(ReportingPeriodService::class)->create($request, new ReportingPeriodData(
                        institutionId: null, periodType: 'annual', deadline: null, yearType: 'calendar',
                        startDate: "{$year}-01-01", endDate: "{$year}-12-31", deadlineDays: 30));
                }
                app(DatasetRecurringReportingService::class)->prepareYear($request, $dataset->id, $year, 'annual');
                $this->command?->info("{$name}: dataset {$dataset->id}; officer {$officer->email}; calendar year {$year}.");
            }
        });
    }

    private function reference(string $typeCode, string $code, string $name): ReferenceDataValue
    {
        $type = ReferenceDataType::firstOrCreate(['data_type_code' => $typeCode], [
            'data_type_name_en' => $typeCode === 'SECTOR' ? 'Sector' : 'Unit of Measurement', 'status' => 'active',
        ]);

        return ReferenceDataValue::firstOrCreate(['data_type_id' => $type->id, 'data_value_code' => $code], [
            'data_value_name_en' => $name, 'status' => 'active',
        ]);
    }
}
