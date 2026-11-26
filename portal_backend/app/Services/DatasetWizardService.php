<?php

namespace App\Services;

use App\Models\DatasetDefinition;
use App\Models\DatasetReportingCalendar;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\HttpException;

class DatasetWizardService
{
    public function reportingPlan(DatasetDefinition $dataset): array
    {
        $rows = DatasetReportingCalendar::where('dataset_definition_id', $dataset->id)
            ->whereNull('submitted_at')->with(['period.parent', 'responsibleUser'])->lockForUpdate()->get();
        $result = [];
        foreach ($rows as $calendar) {
            $period = $calendar->period;
            // Vipindi vilivyofungwa ni historia; havizuii kupanga mwaka unaofuata.
            if ($period->status !== 'open' || ($period->parent_id && $period->parent->status !== 'open')) {
                continue;
            }
            abort_unless((int) $period->institution_id === (int) $dataset->institution_id
                && $dataset->frequencies()->where('frequency', $period->period_type)->exists(), 422, 'Calendar ina period au frequency isiyo ya dataset.');
            abort_unless($calendar->responsibleUser && DatasetCalendarService::eligibleRecipient($dataset, $calendar->responsibleUser),
                422, 'Calendar inahitaji data officer active wa taasisi/department husika.');
            abort_if($calendar->deadline->lt($period->end_date), 422, 'Deadline ya calendar iko kabla ya mwisho wa period.');
            $result[] = app(DatasetCalendarService::class)->snapshot($calendar);
        }
        abort_if($result === [], 422, 'Panga angalau reporting period moja iliyo open kabla ya activation.');

        return $result;
    }

    public function progress(Request $request, int $id): array
    {
        return DB::transaction(function () use ($request, $id) {
            $dataset = app(DatasetConfigurationService::class)->dataset($request, $id, true);
            $snapshot = null;
            $steps = [];
            $steps['datasetDetails'] = $this->check(fn () => app(DatasetConfigurationService::class)->validateDetails($dataset));
            // Ukaguzi uleule wa activation hutumika ili tiki isiwe ahadi ya uongo.
            $steps['indicatorsAndDimensions'] = $this->check(function () use ($dataset, &$snapshot) {
                $snapshot = app(DatasetConfigurationService::class)->configurationSnapshot($dataset);
            });
            // Year-specific calendars and targets are planned after master activation.

            return ['datasetId' => $dataset->id, 'status' => $dataset->status, 'steps' => $steps,
                'canActivate' => $dataset->status === 'draft' && collect($steps)->every(fn ($step) => $step['complete'])];
        });
    }

    private function check(callable $check): array
    {
        try {
            $check();

            return ['complete' => true, 'errors' => []];
        } catch (ValidationException $exception) {
            return ['complete' => false, 'errors' => collect($exception->errors())->flatten()->all()];
        } catch (HttpException $exception) {
            if (! in_array($exception->getStatusCode(), [404, 409, 422], true)) {
                throw $exception;
            }

            return ['complete' => false, 'errors' => [$exception->getMessage()]];
        }
    }
}
