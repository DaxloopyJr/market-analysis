<?php

namespace App\Services;

use App\DTOs\AuditEventData;
use App\Models\DatasetDefinition;
use App\Models\DatasetReportingCalendar;
use App\Models\IndicatorTarget;
use App\Models\Submission;
use App\Models\TemplateVersion;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class DraftTemplateMigrationService
{
    public function __construct(private SubmissionValueValidator $validator) {}

    /** Activation holds the dataset lock; archive, adoption and audit commit together. */
    public function adopt(Request $request, DatasetDefinition $dataset, TemplateVersion $version): void
    {
        $periodIds = DatasetReportingCalendar::where('dataset_definition_id', $dataset->id)->pluck('reporting_period_id')
            ->merge(IndicatorTarget::where('dataset_definition_id', $dataset->id)->where('status', 'active')->pluck('reporting_period_id'))
            ->unique()->sort()->values();

        foreach ($periodIds as $periodId) {
            $calendar = DatasetReportingCalendar::where('dataset_definition_id', $dataset->id)
                ->where('reporting_period_id', $periodId)->lockForUpdate()->first();
            $submission = $calendar ? Submission::where('reporting_calendar_id', $calendar->id)->lockForUpdate()->first() : null;

            // Returned records have already been submitted and must retain their historical form.
            if ($calendar?->submitted_at !== null || ($submission && ($submission->status !== 'draft'
                || $submission->submitted_at !== null || $submission->attempt > 0
                || DB::table('submission_revisions')->where('submission_id', $submission->id)->exists()))) {
                continue;
            }

            $targets = IndicatorTarget::where('dataset_definition_id', $dataset->id)->where('reporting_period_id', $periodId)
                ->where('status', 'active')->lockForUpdate()->get();
            $fromId = $submission?->template_version_id ?? $calendar?->template_version_id
                ?? $targets->pluck('template_version_id')->filter()->first();
            // Legacy unversioned targets still require the existing explicit validation/adoption flow.
            if ($fromId === null) {
                continue;
            }
            if ((int) $fromId === (int) $version->id || DB::table('submission_template_archives')
                ->where('dataset_definition_id', $dataset->id)->where('reporting_period_id', $periodId)->where('to_template_version_id', $version->id)->exists()) {
                continue;
            }

            $oldTemplate = $fromId ? TemplateVersion::findOrFail($fromId)->template_content : [];
            $oldRows = $submission ? $submission->values()->get()->map->input()->all() : [];
            $newRows = $this->compatibleRows($oldTemplate, $version->template_content, $oldRows);

            // Nothing is discarded: keep the complete original form, values, targets and draft metadata.
            $archiveId = DB::table('submission_template_archives')->insertGetId([
                'dataset_definition_id' => $dataset->id, 'reporting_period_id' => $periodId,
                'submission_id' => $submission?->id, 'from_template_version_id' => $fromId,
                'to_template_version_id' => $version->id, 'archived_by' => $request->user()->id,
                'snapshot' => json_encode(['template' => $oldTemplate, 'values' => $oldRows,
                    'submission' => $submission?->attributesToArray(), 'targets' => $targets->toArray()], JSON_THROW_ON_ERROR),
                'reason' => 'A new dataset template was activated; unsubmitted data adopted the new version.',
                'created_at' => now(), 'updated_at' => now(),
            ]);

            if ($submission) {
                $submission->values()->delete();
                $submission->values()->createMany($this->validator->validate($version->template_content, $newRows, false));
                $submission->template_version_id = $version->id;
                // A form already open in the browser must reload before saving against the new schema.
                $submission->revision++;
                $submission->save();
            }
            if ($calendar) {
                $calendar->update(['template_version_id' => $version->id]);
            }
            foreach ($targets as $target) {
                if ($target->template_version_id === null) {
                    continue;
                }
                $targetTemplate = $target->template_version_id ? TemplateVersion::findOrFail($target->template_version_id)->template_content : [];
                $value = rtrim(rtrim((string) $target->target_value, '0'), '.');
                $candidate = ['indicatorId' => (int) $target->indicator_id, 'dimensionValues' => $target->dimension_values, 'value' => $value ?: '0'];
                $compatible = $this->compatibleRows($targetTemplate, $version->template_content, [$candidate]);
                if ($compatible === [] || ! in_array($target->period->period_type, $version->template_content['frequencies'] ?? [], true)) {
                    $target->status = 'inactive';
                } else {
                    $target->template_version_id = $version->id;
                }
                $target->save();
            }
            app(AuditService::class)->record(new AuditEventData(eventType: 'draft_template_migrated', userId: $request->user()->id,
                entityType: 'submission_template_archive', entityId: (string) $archiveId,
                oldValues: ['templateVersionId' => $fromId], newValues: ['templateVersionId' => $version->id, 'submissionId' => $submission?->id],
                ipAddress: $request->ip(), requestId: $request->attributes->get('auditRequestId')));
        }
    }

    private function compatibleRows(array $old, array $new, array $rows): array
    {
        $result = [];
        foreach ($rows as $row) {
            $oldIndicator = collect($old['indicators'] ?? [])->firstWhere('id', $row['indicatorId']);
            $newIndicator = collect($new['indicators'] ?? [])->firstWhere('id', $row['indicatorId']);
            if (! $oldIndicator || ! $newIndicator || $oldIndicator['data_type'] !== $newIndicator['data_type']) {
                continue;
            }
            // A cross-tab value loses its meaning when a coordinate is removed. Do not turn it into a total.
            foreach ($row['dimensionValues'] ?? [] as $entry) {
                if (! $this->compatibleDimension($old, $new, (int) $row['indicatorId'], (int) $entry['dimensionId'], $entry['value'])) {
                    continue 2;
                }
            }
            if (array_key_exists('breakdowns', $row)) {
                $row['breakdowns'] = array_values(array_filter($row['breakdowns'], fn ($entry) => $this->compatibleDimension($old, $new, (int) $row['indicatorId'], (int) $entry['dimensionId'], $entry['optionId'])));
            }
            try {
                $this->validator->validate($new, [$row], false);
                $result[] = $row;
            } catch (ValidationException) {
                // The original remains in the archive; the user must enter a compatible value explicitly.
            }
        }

        return $result;
    }

    private function compatibleDimension(array $old, array $new, int $indicatorId, int $dimensionId, mixed $value): bool
    {
        $before = collect($old['dimensions'] ?? [])->firstWhere('id', $dimensionId);
        $after = collect($new['dimensions'] ?? [])->firstWhere('id', $dimensionId);
        if (! $before || ! $after || $before['data_type'] !== $after['data_type']
            || (! empty($after['indicatorIds']) && ! in_array($indicatorId, $after['indicatorIds'], true))) {
            return false;
        }
        if ($after['data_type'] !== 'reference') {
            return true;
        }
        if (($before['optionSource'] ?? null) !== ($after['optionSource'] ?? null)
            || ($before['reference_type_id'] ?? null) !== ($after['reference_type_id'] ?? null)) {
            return false;
        }
        $options = ($after['optionSource'] ?? null) === 'manual' ? ($after['options'] ?? []) : ($after['referenceValues'] ?? []);

        return collect($options)->contains(fn ($option) => (string) $option['id'] === (string) $value);
    }
}
