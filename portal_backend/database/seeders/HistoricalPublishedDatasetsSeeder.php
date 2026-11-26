<?php

namespace Database\Seeders;

use App\DTOs\AuditEventData;
use App\DTOs\DatasetIndicatorData;
use App\DTOs\IndicatorData;
use App\DTOs\ReportingPeriodData;
use App\Models\ApprovalCircle;
use App\Models\DatasetDefinition;
use App\Models\DatasetReportingCalendar;
use App\Models\Department;
use App\Models\DimensionDefinition;
use App\Models\Institution;
use App\Models\ReferenceDataType;
use App\Models\ReferenceDataValue;
use App\Models\ReportingPeriod;
use App\Models\Submission;
use App\Models\User;
use App\Services\ActorSnapshotService;
use App\Services\AnnualBudgetService;
use App\Services\AuditService;
use App\Services\DatasetCodeGenerator;
use App\Services\DatasetConfigurationService;
use App\Services\DatasetIndicatorService;
use App\Services\ReportingPeriodService;
use App\Services\StrategicPlanService;
use App\Services\SubmissionValueValidator;
use Illuminate\Database\Seeder;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use RuntimeException;

class HistoricalPublishedDatasetsSeeder extends Seeder
{
    public const PREFIX = 'historical-testing-v1:';

    public function run(): void
    {
        if (! app()->environment(['local', 'testing'])) {
            throw new RuntimeException('Historical sample data is restricted to local/testing environments.');
        }
        // One transaction prevents half-imported datasets and makes reruns safe.
        DB::transaction(function () {
            $admin = $this->officer('MIT', 'MOA');
            $reviewer = $this->officer('MIT', 'MDO');
            $publisher = $this->officer('MIT', 'MDD');
            $request = Request::create('/seed/historical-testing', 'POST');
            $request->setUserResolver(fn () => $admin);
            $workflow = ApprovalCircle::firstOrCreate(['scope_key' => self::PREFIX.'workflow', 'version_number' => 1], [
                'name' => '[TEST] Historical import review and publication', 'status' => 'retired',
                'is_active' => false, 'created_by' => $admin->id,
            ]);
            foreach ([['MDO', 'review', $reviewer], ['MDD', 'publish', $publisher]] as $i => [$role, $action, $actor]) {
                $workflow->steps()->firstOrCreate(['sequence' => $i + 1], [
                    'step_name' => '[TEST] '.ucfirst($action), 'required_role_code' => $role,
                    'assigned_user_id' => $actor->id, 'action' => $action, 'level' => 'ministry', 'can_return' => true,
                ]);
            }
            $definitions = json_decode(file_get_contents(__DIR__.'/data/historical_testing_datasets.json'), true, 512, JSON_THROW_ON_ERROR);
            foreach ($definitions as $definition) {
                if (DatasetDefinition::where('source_system_name', self::PREFIX.$definition['key'])->exists()) {
                    continue; // Never overwrite an existing dataset, even if a tester edited it.
                }
                $this->seedDataset($definition, $admin, $reviewer, $publisher, $workflow, $request);
            }
            $this->linkHistoricalObjectives($definitions, $admin);
            $this->fillHistoricalBaselines($definitions);
            $this->command?->info('Historical testing import complete: 10 datasets; FY 2025/2026 and 2026/2027; 42 published and 8 Q2 drafts. Existing records preserved.');
        });
    }

    /** Fill only missing baselines in synthetic fixtures, including their frozen report snapshots. */
    private function fillHistoricalBaselines(array $definitions): void
    {
        foreach ($definitions as $definition) {
            $dataset = DatasetDefinition::where('source_system_name', self::PREFIX.$definition['key'])->firstOrFail();
            $indicators = $dataset->indicators()->orderBy('dataset_indicators.display_order')->get();
            $targets = DB::table('dataset_annual_targets')->where('dataset_definition_id', $dataset->id)->get();
            $baselines = [];
            $changed = 0;
            foreach ($targets as $target) {
                $year = ReportingPeriod::findOrFail($target->reporting_year_id);
                $yearNumber = (int) $year->start_date->format('Y');
                if (! in_array($yearNumber, [2025, 2026], true)) {
                    continue;
                }
                $index = $indicators->search(fn ($indicator) => (int) $indicator->id === (int) $target->indicator_id);
                $item = $index === false ? null : ($definition['indicators'][$index] ?? null);
                if ($item === null || $item['type'] === 'text' || $indicators[$index]->name_en !== $item['name']) {
                    continue;
                }
                $baseline = $target->baseline_value;
                if ($baseline === null) {
                    // Previous-year synthetic actual on the same annual aggregation basis, not the current quarter.
                    $periodCount = match ($definition['frequency']) {
                        'annual' => 1,
                        'monthly' => 12,
                        default => 4,
                    };
                    $values = collect(range(1, $periodCount))->map(fn ($period) => $this->sample($item, $yearNumber - 1, $period, $index));
                    $baseline = match ($item['aggregation']) {
                        'sum' => $values->sum(),
                        'average' => $values->avg(),
                        'latest' => $values->last(),
                        default => null,
                    };
                    if ($baseline === null) {
                        continue;
                    }
                    $baseline = (string) round($baseline, 6);
                    $changed += DB::table('dataset_annual_targets')->where('id', $target->id)->whereNull('baseline_value')
                        ->update(['baseline_value' => $baseline, 'updated_at' => now()]);
                }
                $baselines[$target->reporting_year_id][$target->indicator_id] = $baseline;
            }
            $submissions = Submission::whereHas('calendar', fn ($q) => $q->where('dataset_definition_id', $dataset->id))
                ->where('reference', 'like', 'TEST-HIST-'.$definition['key'].'-%')
                ->whereHas('approvals', fn ($q) => $q->where('meta->synthetic', true))->get();
            foreach (['submissions', 'submission_revisions'] as $table) {
                $key = $table === 'submissions' ? 'id' : 'submission_id';
                foreach (DB::table($table)->whereIn($key, $submissions->modelKeys())->get(['id', 'annual_targets_snapshot']) as $row) {
                    $snapshot = json_decode($row->annual_targets_snapshot ?? '[]', true, 512, JSON_THROW_ON_ERROR);
                    $updated = false;
                    foreach ($snapshot ?? [] as $i => $entry) {
                        $baseline = $baselines[$entry['reportingYearId']][$entry['indicatorId']] ?? null;
                        if (($entry['baselineValue'] ?? null) === null && $baseline !== null) {
                            $snapshot[$i]['baselineValue'] = $baseline;
                            $updated = true;
                        }
                    }
                    if ($updated) {
                        $changed += DB::table($table)->where('id', $row->id)->update([
                            'annual_targets_snapshot' => json_encode($snapshot, JSON_THROW_ON_ERROR),
                        ]);
                    }
                }
            }
            if ($changed > 0) {
                app(AuditService::class)->record(new AuditEventData(eventType: 'historical_test_baselines_linked',
                    actorType: 'system', entityType: 'dataset_definition', entityId: (string) $dataset->id,
                    newValues: ['synthetic' => true, 'recordsFilled' => $changed],
                    reason: 'Fill missing testing baselines using previous-year synthetic actuals; preserve existing values.'));
            }
        }
    }

    /** Repair only this fixture's missing history; never rewrite real or already frozen objectives. */
    private function linkHistoricalObjectives(array $definitions, User $admin): void
    {
        foreach ($definitions as $definition) {
            $dataset = DatasetDefinition::where('source_system_name', self::PREFIX.$definition['key'])->lockForUpdate()->firstOrFail();
            if ((int) $dataset->institution_id !== (int) Institution::where('code', $definition['owner'])->value('id')) {
                throw new RuntimeException('Historical fixture owner changed; objective repair stopped.');
            }
            $submissions = Submission::whereHas('calendar', fn ($q) => $q->where('dataset_definition_id', $dataset->id))
                ->where('reference', 'like', 'TEST-HIST-'.$definition['key'].'-%')
                ->whereHas('approvals', fn ($q) => $q->where('meta->synthetic', true))
                ->with('calendar.period.parent')->get();
            [$code, $description] = $this->objectiveDefinition($definition);
            foreach ($submissions->groupBy(fn ($s) => $s->calendar->period->parent_id ?? $s->calendar->period->id) as $yearId => $items) {
                $year = $items->first()->calendar->period->parent ?? $items->first()->calendar->period;
                if (! in_array((int) $year->start_date->format('Y'), [2025, 2026], true)) {
                    continue;
                }
                $assignment = DB::table('dataset_annual_objectives')->where('dataset_definition_id', $dataset->id)
                    ->where('reporting_year_id', $yearId)->first();
                $existing = $items->pluck('objective_snapshot')->filter()->values();
                if ($assignment !== null) {
                    $existing->push(json_decode($assignment->snapshot, true, 512, JSON_THROW_ON_ERROR));
                }
                if ($existing->pluck('objectiveVersionId')->unique()->count() > 1) {
                    throw new RuntimeException('Conflicting historical objective snapshots; no history was overwritten.');
                }
                $snapshot = $existing->first();
                if ($snapshot === null) {
                    // Keep these fixture plans draft so normal objective selectors are not polluted by overlapping test plans.
                    $planId = $this->fixtureRecord('strategic_plans', [
                        'institution_id' => $dataset->institution_id,
                        'name' => '[TEST 2FY] '.$definition['owner'].' historical strategic objectives',
                    ], ['start_date' => '2025-07-01', 'end_date' => '2027-06-30', 'status' => 'draft', 'created_by' => $admin->id]);
                    $objectiveId = $this->fixtureRecord('strategic_objectives', ['strategic_plan_id' => $planId, 'code' => $code], []);
                    $versionId = $this->fixtureRecord('strategic_objective_versions', [
                        'strategic_objective_id' => $objectiveId, 'version_number' => (int) $year->start_date->format('Y') - 2022,
                    ], ['description' => '[TEST] '.$description.' - '.$year->label,
                        'effective_from' => $year->start_date->toDateString(), 'created_by' => $admin->id,
                        'reason' => 'Synthetic annual objective version for historical testing; not an official strategic plan.']);
                    $snapshot = app(StrategicPlanService::class)->versionSnapshot($versionId)
                        + ['reportingYearId' => (int) $yearId, 'yearLabel' => $year->label];
                }
                if ((int) $snapshot['institutionId'] !== (int) $dataset->institution_id
                    || (int) $snapshot['reportingYearId'] !== (int) $yearId) {
                    throw new RuntimeException('Historical objective owner/year mismatch.');
                }
                $json = json_encode($snapshot, JSON_THROW_ON_ERROR);
                $changed = 0;
                if ($assignment === null) {
                    DB::table('dataset_annual_objectives')->insert(['dataset_definition_id' => $dataset->id,
                        'reporting_year_id' => $yearId, 'objective_version_id' => $snapshot['objectiveVersionId'],
                        'snapshot' => $json, 'locked_at' => $items->min('submitted_at'),
                        'created_by' => $admin->id, 'created_at' => now(), 'updated_at' => now()]);
                    $changed++;
                }
                $changed += DB::table('submissions')->whereIn('id', $items->modelKeys())->whereNull('objective_snapshot')
                    ->update(['objective_snapshot' => $json]);
                $changed += DB::table('submission_revisions')->whereIn('submission_id', $items->modelKeys())
                    ->whereNull('objective_snapshot')->update(['objective_snapshot' => $json]);
                if ($changed > 0) {
                    app(AuditService::class)->record(new AuditEventData(eventType: 'historical_test_objectives_linked',
                        actorType: 'system', entityType: 'dataset_definition', entityId: (string) $dataset->id,
                        newValues: ['reportingYearId' => (int) $yearId, 'objectiveVersionId' => $snapshot['objectiveVersionId'],
                            'synthetic' => true, 'recordsFilled' => $changed],
                        reason: 'Fill missing objective links only in explicitly requested synthetic testing history.'));
                }
            }
        }
    }

    private function fixtureRecord(string $table, array $identity, array $attributes): int
    {
        return (int) (DB::table($table)->where($identity)->value('id')
            ?? DB::table($table)->insertGetId($identity + $attributes + ['created_at' => now(), 'updated_at' => now()]));
    }

    private function objectiveDefinition(array $definition): array
    {
        if (($definition['department'] ?? null) === 'ICT') {
            return ['ICT', 'Improve ICT infrastructure and support services'];
        }
        $number = (int) substr($definition['key'], strrpos($definition['key'], '-') + 1);

        return match ($definition['owner']) {
            'CBE' => match (true) {
                in_array($number, [2, 3, 4, 7, 8, 9]) => ['B', 'Improve education, research and collaboration'],
                in_array($number, [10]) => ['C', 'Strengthen entrepreneurship and business incubation'],
                default => ['A', 'Strengthen institutional capacity, infrastructure and governance'],
            },
            'FCC' => match (true) {
                in_array($number, [2, 3, 4, 10, 11, 12, 13]) => ['B', 'Improve consumer protection and complaint resolution'],
                $number >= 14 => ['C', 'Strengthen market surveillance and enforcement'],
                default => ['A', 'Promote fair competition and effective market regulation'],
            },
            'TANTRADE' => match (true) {
                $number <= 2 => ['A', 'Expand market access and reliable trade information'],
                $number === 3 => ['B', 'Strengthen enterprise competitiveness and trade facilitation'],
                default => ['C', 'Improve institutional services, governance and resource management'],
            },
            default => ($definition['sector'] ?? 'BUSINESS') === 'BUSINESS'
                ? ['A', 'Monitor and improve trade sector performance']
                : ['B', 'Monitor and improve industrial sector performance'],
        };
    }

    private function officer(string $institution, string $role): User
    {
        return User::whereHas('institution', fn ($q) => $q->where('code', $institution))
            ->whereHas('roles', fn ($q) => $q->where('code', $role))
            ->where('is_active', true)->where('status', 'active')->orderBy('id')->firstOrFail();
    }

    private function reference(string $typeCode, string $code, string $name): ReferenceDataValue
    {
        $type = ReferenceDataType::firstOrCreate(['data_type_code' => $typeCode], [
            'data_type_name_en' => $typeCode, 'status' => 'active',
        ]);

        return ReferenceDataValue::firstOrCreate(['data_type_id' => $type->id, 'data_value_code' => $code], [
            'data_value_name_en' => $name, 'status' => 'active',
        ]);
    }

    private function seedDataset(array $definition, User $admin, User $reviewer, User $publisher, ApprovalCircle $workflow, Request $request): void
    {
        $institution = Institution::where('code', $definition['owner'])->firstOrFail();
        $sectorPerformance = isset($definition['sector']) && $definition['owner'] === 'MIT';
        $department = $definition['owner'] === 'MIT' ? Department::where('code', $definition['department'] ?? 'MEU')->firstOrFail() : null;
        $officer = $department !== null
            ? User::where('institution_id', $institution->id)->where('department_id', $department->id)
                ->whereHas('roles', fn ($q) => $q->where('code', 'DDO'))->where('is_active', true)->where('status', 'active')->firstOrFail()
            : $this->officer($definition['owner'], 'IDO');
        $dataset = new DatasetDefinition([
            'institution_id' => $institution->id, 'department_id' => $department?->id,
            'dataset_code' => app(DatasetCodeGenerator::class)->next($institution->id),
            'dataset_name' => '[TEST 2FY] '.$definition['name'],
            'description' => '[SYNTHETIC TEST DATA — NOT OFFICIAL STATISTICS] '.$definition['description'],
            'source_system_name' => self::PREFIX.$definition['key'],
            'source_description' => 'Structure: '.$definition['source'].'. Original frequency: '.$definition['sourceFrequency']
                .'. All historical values are synthetic; document examples are not asserted as actuals for these years.',
            'created_by' => $admin->id, 'creator_snapshot' => app(ActorSnapshotService::class)->capture($admin),
            'responsible_user_id' => $officer->id, 'collection_method' => 'manual',
            'reporting_settings' => ['yearType' => 'financial', 'yearStartMonth' => 7, 'responsibleUserId' => $officer->id,
                'deadlineDays' => 15, 'reminderDays' => [], 'remindersEnabled' => false],
        ]);
        $dataset->reporting_purpose = $sectorPerformance ? 'sector_performance' : 'operational';
        $dataset->priority = $definition['priority'];
        $dataset->save();
        $dataset->frequencies()->create(['frequency' => $definition['frequency']]);
        $sectorCode = $definition['sector'] ?? 'BUSINESS';
        $dataset->sectors()->attach($this->reference('SECTOR', $sectorCode, $sectorCode === 'VIWANDA' ? 'Industry' : 'Trade')->id);
        foreach ($definition['indicators'] as $i => $item) {
            $percent = str_contains($item['name'], '%') || str_contains(strtolower($item['name']), 'rate') || str_contains($item['name'], 'GDP');
            $unit = $this->reference('UNIT', $percent ? 'PERCENT' : ($item['type'] === 'decimal' ? (str_contains($item['name'], 'USD') ? 'USD_MILLION' : 'TZS') : 'NUMBER'),
                $percent ? 'Percent' : ($item['type'] === 'decimal' ? (str_contains($item['name'], 'USD') ? 'USD million' : 'TZS') : 'Number'));
            app(DatasetIndicatorService::class)->attach($dataset->id, $admin, new DatasetIndicatorData(displayOrder: $i + 1), null,
                new IndicatorData(nameEn: $item['name'], dataType: $item['type'],
                    descriptionEn: 'Synthetic testing indicator; source structure: '.$definition['source'],
                    unitId: $item['type'] === 'text' ? null : $unit->id, aggregationRule: $item['aggregation'],
                    performanceDirection: $item['type'] === 'text' ? 'neutral' : 'higher_is_better'), null, null);
        }
        $indicators = $dataset->indicators()->orderBy('dataset_indicators.display_order')->get();
        if ($definition['campus']) {
            $dimension = new DimensionDefinition(['dimension_code' => 'TEST-HIST-'.$definition['key'].'-CAMPUS',
                'name_en' => 'Campus', 'data_type' => 'reference']);
            $dimension->created_by = $admin->id;
            $dimension->save();
            foreach (['Dar es Salaam', 'Dodoma', 'Mwanza', 'Mbeya'] as $i => $name) {
                $dimension->options()->create(['code' => 'C'.($i + 1), 'name_en' => $name]);
            }
            $dataset->dimensions()->attach($dimension->id, ['is_required' => true, 'display_order' => 1]);
            $link = DB::table('dataset_dimensions')->where('dataset_definition_id', $dataset->id)->first();
            foreach ($indicators as $indicator) {
                DB::table('dataset_dimension_indicators')->insert(['dataset_dimension_id' => $link->id,
                    'dataset_indicator_id' => $indicator->pivot->id]);
            }
        }
        $template = $dataset->templateVersions()->create(['version_number' => 1, 'template_format' => 'json',
            'template_content' => app(DatasetConfigurationService::class)->configurationSnapshot($dataset),
            'effective_from' => '2025-07-01', 'created_by' => $admin->id]);
        $dataset->update(['status' => 'active']);
        foreach ([2025, 2026] as $yearNumber) {
            $year = ReportingPeriod::whereNull('institution_id')->whereNull('parent_id')->where('year_type', 'financial')
                ->whereDate('start_date', $yearNumber.'-07-01')->first()
                ?? app(ReportingPeriodService::class)->create($request, new ReportingPeriodData(
                    institutionId: null, periodType: 'annual', deadline: null, yearType: 'financial',
                    startDate: $yearNumber.'-07-01', endDate: ($yearNumber + 1).'-06-30', deadlineDays: 15));
            $periods = match ($definition['frequency']) {
                'annual' => [$year],
                'monthly' => app(ReportingPeriodService::class)->generateMonths($request, $year->id, 15),
                default => app(ReportingPeriodService::class)->generateQuarters($request, $year->id, 15),
            };
            $budget = (string) (100000000 + ($yearNumber - 2023) * 10000000);
            $budgetId = DB::table('dataset_annual_budgets')->insertGetId(['dataset_definition_id' => $dataset->id,
                'reporting_year_id' => $year->id, 'approved_budget' => $budget, 'created_by' => $admin->id,
                'created_at' => now(), 'updated_at' => now()]);
            $annualTargets = [];
            foreach ($indicators as $i => $indicator) {
                if ($indicator->data_type === 'text') {
                    continue;
                }
                $actuals = collect($periods)->map(fn ($period, $p) => $this->sample($definition['indicators'][$i], $yearNumber, $p + 1, $i));
                $target = $indicator->aggregation_rule === 'sum' ? $actuals->sum() * 1.1 : $actuals->max() * 1.1;
                if (str_contains($indicator->name_en, '%') || str_contains(strtolower($indicator->name_en), 'rate') || str_contains($indicator->name_en, 'GDP')) {
                    $target = min(100, $target);
                }
                $target = (string) ($indicator->data_type === 'integer' ? (int) ceil($target) : round($target, 2));
                DB::table('dataset_annual_targets')->insert(['dataset_definition_id' => $dataset->id, 'reporting_year_id' => $year->id,
                    'indicator_id' => $indicator->id, 'template_version_id' => $template->id, 'target_value' => $target,
                    'data_type' => $indicator->data_type, 'created_by' => $admin->id, 'created_at' => now(), 'updated_at' => now()]);
                $annualTargets[] = ['indicatorId' => $indicator->id, 'reportingYearId' => $year->id,
                    'targetValue' => $target, 'baselineValue' => null, 'dataType' => $indicator->data_type];
            }
            foreach ($periods as $p => $period) {
                // Fixed two-year test fixture: completed periods plus the open Q2 draft.
                if ($yearNumber === 2026 && ($definition['frequency'] === 'annual' || $p > 1)) {
                    continue;
                }
                $draft = $yearNumber === 2026 && $p === 1;
                $submittedAt = $period->end_date->copy()->addDay()->setTime(9, 0);
                $calendar = DatasetReportingCalendar::create(['dataset_definition_id' => $dataset->id,
                    'reporting_period_id' => $period->id, 'responsible_user_id' => $officer->id,
                    'template_version_id' => $template->id, 'deadline_days' => 15, 'deadline' => $period->deadline,
                    'reminder_days' => [], 'reminders_enabled' => false, 'submitted_at' => $draft ? null : $submittedAt, 'created_by' => $admin->id]);
                $submission = Submission::create(['reference' => 'TEST-HIST-'.$definition['key'].'-'.$yearNumber.'-'.($p + 1),
                    'reporting_calendar_id' => $calendar->id, 'template_version_id' => $template->id,
                    'ministry_approval_circle_id' => $workflow->id, 'workflow_stage' => 'ministry',
                    'created_by' => $officer->id, 'status' => $draft ? 'draft' : 'published', 'attempt' => $draft ? 0 : 1, 'revision' => $draft ? 0 : 3,
                    'submitted_at' => $draft ? null : $submittedAt, 'published_at' => $draft ? null : $submittedAt->copy()->addDays(2),
                    'annual_targets_snapshot' => $annualTargets, 'approved_budget' => $budget,
                    'annual_budget_snapshot' => ['id' => $budgetId, 'reportingYearId' => $year->id, 'approvedBudget' => $budget],
                    'actual_received' => round((float) $budget * 0.9 / count($periods), 2),
                    'actual_expenditure' => round((float) $budget * 0.8 / count($periods), 2),
                    'achievements' => 'Synthetic historical test submission; not an official institutional return.']);
                $inputs = [];
                foreach ($indicators as $i => $indicator) {
                    $value = $this->sample($definition['indicators'][$i], $yearNumber, $p + 1, $i);
                    $input = ['indicatorId' => $indicator->id, 'value' => (string) $value, 'dimensionValues' => [],
                        'remarks' => '[SYNTHETIC TEST VALUE] '.$definition['source'].'; FY '.$year->label];
                    if ($definition['campus']) {
                        $options = $template->template_content['dimensions'][0]['options'];
                        $parts = array_fill(0, 4, intdiv((int) $value, 4));
                        $parts[0] += (int) $value - array_sum($parts);
                        $input['breakdowns'] = [];
                        foreach ($options as $j => $option) {
                            $input['breakdowns'][] = ['dimensionId' => $dimension->id, 'optionId' => $option['id'], 'value' => (string) $parts[$j]];
                        }
                    }
                    $inputs[] = $input;
                }
                $submission->values()->createMany(app(SubmissionValueValidator::class)->validate($template->template_content, $inputs, true));
                if ($draft) {
                    continue;
                }
                DB::table('submission_revisions')->insert(['submission_id' => $submission->id, 'attempt' => 1,
                    'values' => json_encode($inputs, JSON_THROW_ON_ERROR), 'annual_targets_snapshot' => json_encode($annualTargets, JSON_THROW_ON_ERROR),
                    'performance_snapshot' => json_encode(app(AnnualBudgetService::class)->performance($submission), JSON_THROW_ON_ERROR),
                    'submitted_by' => $officer->id, 'submitted_at' => $submittedAt]);
                foreach ([['submitted', $officer], ['review', $reviewer], ['publish', $publisher]] as $i => [$action, $actor]) {
                    $submission->approvals()->create(['actor_id' => $actor->id, 'action' => $action, 'step_name' => '[TEST] '.$action,
                        'comments' => 'Simulated approval for synthetic historical testing, not a real historical user action.',
                        'acted_at' => $submittedAt->copy()->addDays($i),
                        'meta' => ['synthetic' => true, 'actor' => app(ActorSnapshotService::class)->capture($actor),
                            'status' => ['submitted', 'under_review', 'published'][$i], 'revision' => $i + 1, 'attempt' => 1,
                            'ministryWorkflowVersionId' => $workflow->id, 'workflowStage' => 'ministry']]);
                }
            }
        }
        app(AuditService::class)->record(new AuditEventData(eventType: 'historical_test_dataset_seeded', actorType: 'system',
            entityType: 'dataset_definition', entityId: (string) $dataset->id,
            newValues: ['source' => $definition['source'], 'synthetic' => true, 'years' => [2025, 2026]],
            reason: 'Explicitly requested non-production historical testing fixture.'));
        $this->command?->info($definition['key'].' seeded: '.$dataset->id);
    }

    private function sample(array $indicator, int $year, int $period, int $index): int|float|string
    {
        if ($indicator['type'] === 'text') {
            return '[TEST] Activity update for '.($year).'/'.($year + 1).', period '.$period;
        }
        $name = strtolower($indicator['name']);
        if (str_contains($name, '%') || str_contains($name, 'rate') || str_contains($name, 'gdp')) {
            return round(5 + ($index % 7) * 3 + ($year - 2023) * 1.5 + $period * 0.5, 2);
        }
        $base = 20 + $index * 7 + ($year - 2023) * 10 + $period * 3;

        return $indicator['type'] === 'decimal' ? $base * 1000000 : $base;
    }
}
