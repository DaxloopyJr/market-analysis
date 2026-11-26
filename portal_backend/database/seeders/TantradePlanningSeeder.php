<?php

namespace Database\Seeders;

use App\DTOs\AuditEventData;
use App\DTOs\DatasetIndicatorData;
use App\DTOs\DatasetPlanningData;
use App\DTOs\IndicatorData;
use App\DTOs\ReportingPeriodData;
use App\Models\DatasetDefinition;
use App\Models\DatasetReportingCalendar;
use App\Models\Institution;
use App\Models\ReferenceDataType;
use App\Models\ReferenceDataValue;
use App\Models\ReportingPeriod;
use App\Models\Role;
use App\Models\User;
use App\Services\AuditService;
use App\Services\DatasetCalendarService;
use App\Services\DatasetCodeGenerator;
use App\Services\DatasetIndicatorService;
use App\Services\DatasetPlanningService;
use App\Services\ReportingPeriodService;
use Illuminate\Database\Seeder;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class TantradePlanningSeeder extends Seeder
{
    public function run(): void
    {
        // Sample ni ya development pekee; records zilizopo na passwords hazibadilishwi.
        if (app()->environment('production')) {
            throw new \RuntimeException('Sample hii hairuhusiwi production.');
        }
        DB::transaction(function () {
            $institution = Institution::where('code', 'TANTRADE')->firstOrFail();
            // Sample haitafungua taasisi iliyositishwa; hutumia taasisi tofauti ya majaribio.
            if (! $institution->is_active || $institution->status !== 'active') {
                $institution = Institution::firstOrCreate(['code' => 'TANTRADE_DEMO'], [
                    'name' => '[TEST] TANTRADE Planning', 'type' => 'agency', 'status' => 'active', 'is_active' => true,
                ]);
            }
            $actor = User::whereHas('roles', fn ($query) => $query->where('code', 'MOA'))
                ->where('status', 'active')->where('is_active', true)->firstOrFail();
            $request = Request::create('/sample', 'POST');
            $request->setUserResolver(fn () => $actor);
            $officer = User::where('institution_id', $institution->id)
                ->where('is_active', true)->where('status', 'active')
                ->whereHas('roles', fn ($query) => $query->where('code', 'IDO'))->first();
            if (! $officer) {
                // Password ya random haitoi credential ya pamoja; admin anaweza kupanga activation baadaye.
                $officer = User::firstOrCreate(['email' => strtolower($institution->code).'.planning.sample@example.test'], [
                    'name' => 'TANTRADE Planning Sample Officer', 'institution_id' => $institution->id,
                    'password' => Str::random(48), 'is_active' => true, 'status' => 'active',
                ]);
                $officer->roles()->syncWithoutDetaching([Role::where('code', 'IDO')->firstOrFail()->id => ['status' => 'active']]);
            }
            $type = ReferenceDataType::firstOrCreate(['data_type_code' => 'SECTOR'], ['data_type_name_en' => 'Sector', 'status' => 'active']);
            $sector = ReferenceDataValue::firstOrCreate(['data_type_id' => $type->id, 'data_value_code' => 'TRADE'],
                ['data_value_name_en' => 'Trade', 'data_value_name_sw' => 'Biashara', 'status' => 'active']);
            $dataset = DatasetDefinition::where('institution_id', $institution->id)
                ->where('dataset_name', '[TEST] TANTRADE Market Access Planning')->first();
            if (! $dataset) {
                $dataset = DatasetDefinition::create(['institution_id' => $institution->id,
                    'dataset_code' => app(DatasetCodeGenerator::class)->next($institution->id),
                    'dataset_name' => '[TEST] TANTRADE Market Access Planning',
                    'description' => 'Sample ya testing ya market access; si taarifa rasmi za taasisi.',
                    'created_by' => $actor->id, 'status' => 'draft']);
                $dataset->frequencies()->createMany([['frequency' => 'annual'], ['frequency' => 'quarterly']]);
                $dataset->sectors()->attach($sector->id);
                app(DatasetPlanningService::class)->apply($dataset, new DatasetPlanningData([
                    'collectionMethod' => 'manual', 'sourceDescription' => 'Sample: taarifa zinazokusanywa kutoka kwa waratibu wa matukio.',
                    'consumers' => [['name' => 'National Bureau of Statistics', 'shortName' => 'NBS']],
                ]), $actor->id);
                app(AuditService::class)->record(new AuditEventData(eventType: 'dataset_sample_created', actorType: 'system',
                    entityType: 'dataset_definition', entityId: (string) $dataset->id, newValues: $dataset->attributesToArray()));
                $unitType = ReferenceDataType::firstOrCreate(['data_type_code' => 'UNIT'], ['data_type_name_en' => 'Unit of Measurement', 'status' => 'active']);
                $unit = ReferenceDataValue::firstOrCreate(['data_type_id' => $unitType->id, 'data_value_code' => 'NUMBER'],
                    ['data_value_name_en' => 'Number', 'data_value_name_sw' => 'Idadi', 'status' => 'active']);
                app(DatasetIndicatorService::class)->attach($dataset->id, $actor, new DatasetIndicatorData,
                    null, new IndicatorData(nameEn: 'Number of trade promotion events coordinated',
                        dataType: 'integer', nameSw: 'Idadi ya matukio ya kukuza biashara', unitId: $unit->id, aggregationRule: 'sum'),
                    null, null);
            }
            $periodService = app(ReportingPeriodService::class);
            $annual = ReportingPeriod::whereNull('institution_id')->where('period_type', 'annual')
                ->where('year_type', 'financial')->whereDate('start_date', '2026-07-01')->first()
                ?? $periodService->create($request, new ReportingPeriodData(
                    institutionId: null, periodType: 'annual', deadline: null, yearType: 'financial',
                    startDate: '2026-07-01', endDate: '2027-06-30', deadlineDays: 15));
            $quarters = $periodService->generateQuarters($request, $annual->id, 15);
            foreach ($quarters as $period) {
                if (! DatasetReportingCalendar::where('dataset_definition_id', $dataset->id)->where('reporting_period_id', $period->id)->exists()) {
                    app(DatasetCalendarService::class)->save($request, $dataset->id, [
                        'reportingPeriodId' => $period->id, 'responsibleUserId' => $officer->id,
                        'deadlineDays' => 15, 'reminderDays' => [7, 1], 'remindersEnabled' => false,
                    ]);
                }
            }
            $this->command?->info("Sample dataset ID: {$dataset->id}; annual ID: {$annual->id}; officer ID: {$officer->id}");
            $this->command?->info('Indicator IDs: '.$dataset->indicators()->pluck('indicators.id')->implode(', '));
            $this->command?->info('Quarter IDs: '.collect($quarters)->pluck('id')->implode(', '));
            $this->command?->info('Dataset ni draft; dimension na activation vitafanywa kwenye Postman. Reminders zimezimwa kwa sample.');
        });
    }
}
