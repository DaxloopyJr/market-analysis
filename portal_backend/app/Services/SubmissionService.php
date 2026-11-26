<?php

namespace App\Services;

use App\DTOs\AuditEventData;
use App\DTOs\NotificationData;
use App\DTOs\SubmissionValuesData;
use App\Models\ApprovalCircleStep;
use App\Models\DatasetDefinition;
use App\Models\DatasetReportingCalendar;
use App\Models\IndicatorTarget;
use App\Models\ReportingPeriod;
use App\Models\Submission;
use App\Models\SubmissionApproval;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class SubmissionService
{
    public function __construct(private SubmissionValueValidator $validator, private WorkflowActorPolicy $policy, private AuditService $audit, private NotificationService $notifications) {}

    public function query(User $actor): Builder
    {
        abort_unless($actor->is_active && $actor->status === 'active', 403);
        $q = Submission::query();
        if ($actor->hasRole('MOA')) {
            return $q;
        }
        if ($actor->hasRole('MAU')) {
            abort_unless($actor->institution?->code === 'MIT' && $actor->institution->is_active && $actor->institution->status === 'active', 403);

            return $q;
        }
        if ($actor->hasRole('IAU')) {
            abort_unless($actor->institution_id !== null, 403);

            return $q->whereHas('calendar.dataset', fn ($dataset) => $dataset->where('institution_id', $actor->institution_id));
        }
        $codes = array_unique(array_merge($actor->roles->pluck('code')->all(), $actor->delegatedRoleCodes()));

        return $q->where(function ($q) use ($actor, $codes) {
            $q->whereHas('calendar', fn ($c) => $c->where('responsible_user_id', $actor->id));
            if ($actor->hasRole('IA') && $actor->institution_id) {
                $q->orWhereHas('calendar.dataset', fn ($d) => $d->where('institution_id', $actor->institution_id));
            }
            // Institutional reviewers retain visibility through the ministry stage, scoped to their own data.
            if ($actor->institution_id !== null) {
                $q->orWhere(function ($query) use ($actor, $codes) {
                    $query->whereHas('circle.steps', fn ($steps) => $steps->where('level', 'institution')
                        ->whereIn('required_role_code', $codes)
                        ->where(fn ($assigned) => $assigned->whereNull('assigned_user_id')->orWhere('assigned_user_id', $actor->id)))
                        ->whereHas('calendar.dataset', fn ($dataset) => $dataset->where('institution_id', $actor->institution_id));
                });
            }
            if ($actor->institution?->code === 'MIT' && $actor->institution->is_active && $actor->institution->status === 'active') {
                $q->orWhere(function ($query) use ($actor, $codes) {
                    // A pinned ministry version is not permission to see data before AO releases it.
                    $query->where(function ($path) use ($actor, $codes) {
                        $eligibleStep = fn ($steps) => $steps->where('level', 'ministry')
                            ->whereIn('required_role_code', $codes)
                            ->where(fn ($assigned) => $assigned->whereNull('assigned_user_id')->orWhere('assigned_user_id', $actor->id));
                        $path->where(fn ($current) => $current->where('workflow_stage', 'ministry')->whereHas('ministryCircle.steps', $eligibleStep))
                            ->orWhere(fn ($legacy) => $legacy->whereNull('workflow_stage')->whereHas('circle.steps', $eligibleStep));
                    })->whereHas('calendar.dataset', function ($dataset) use ($actor) {
                        if ($actor->hasRole('MDO', 'MDD')) {
                            return;
                        }
                        $dataset->where(function ($scope) use ($actor) {
                            $scope->whereNull('department_id');
                            if ($actor->department_id !== null) {
                                $scope->orWhere(fn ($department) => $department->where('institution_id', $actor->institution_id)
                                    ->where('department_id', $actor->department_id));
                            }
                        });
                    });
                });
            }
        });
    }

    public function start(Request $r, int $calendarId): Submission
    {
        return DB::transaction(function () use ($r, $calendarId) {
            $calendar = DatasetReportingCalendar::findOrFail($calendarId);
            $dataset = DatasetDefinition::lockForUpdate()->findOrFail($calendar->dataset_definition_id);
            $calendar = DatasetReportingCalendar::lockForUpdate()->findOrFail($calendarId);
            $calendar->setRelation('dataset', $dataset);
            $this->officer($r->user(), $calendar);
            $existing = Submission::where('reporting_calendar_id', $calendarId)->first();
            if ($existing) {
                return $existing;
            }
            $this->entry($calendar);
            if (! $calendar->template_version_id) {
                $targetVersions = IndicatorTarget::where('dataset_definition_id', $dataset->id)->where('reporting_period_id', $calendar->reporting_period_id)->where('status', 'active')->whereNotNull('template_version_id')->distinct()->pluck('template_version_id');
                abort_if($targetVersions->count() > 1, 422, 'Targets have conflicting template versions.');
                $calendar->template_version_id = $targetVersions->first() ?? $dataset->templateVersions()->orderByDesc('version_number')->firstOrFail()->id;
                $calendar->save();
            }
            $template = $dataset->templateVersions()->findOrFail($calendar->template_version_id);
            abort_unless(in_array($calendar->period->period_type, $template->template_content['frequencies'] ?? [], true), 422, 'Period frequency is not supported by the template.');
            $submission = Submission::create(['reporting_calendar_id' => $calendarId, 'template_version_id' => $template->id, 'created_by' => $r->user()->id,
                'reference' => 'SUB-'.$dataset->id.'-'.$calendar->reporting_period_id, 'status' => 'draft']);
            $this->record($r, $submission, 'draft_created', null);

            return $submission;
        }, 3);
    }

    public function locked(Request $r, int $id): Submission
    {
        $visible = $this->query($r->user())->findOrFail($id);
        $calendar = DatasetReportingCalendar::findOrFail($visible->reporting_calendar_id);
        $dataset = DatasetDefinition::lockForUpdate()->findOrFail($calendar->dataset_definition_id);
        $calendar = DatasetReportingCalendar::lockForUpdate()->findOrFail($calendar->id);
        $calendar->setRelation('dataset', $dataset);
        $s = Submission::lockForUpdate()->findOrFail($id);
        $s->setRelation('calendar', $calendar);

        return $s;
    }

    public function save(Request $r, int $id, SubmissionValuesData $data): Submission
    {
        return DB::transaction(function () use ($r, $id, $data) {
            $s = $this->locked($r, $id);
            $this->expected($s, $data->expectedRevision);
            $this->editable($s, $r->user());
            $rows = $this->validator->validate($s->template->template_content, $data->values, false);
            $before = $this->snapshot($s, $r->user());
            // PUT replaces the draft values as a whole; a failed validation/audit rolls everything back.
            app(AnnualTargetService::class)->save($r, $s, $data->annualTargets);
            if ($data->objectiveVersionId !== null) {
                app(AnnualObjectiveService::class)->save($r, $s, $data->objectiveVersionId, $data->expectedObjectiveVersionId);
            }
            $s->values()->delete();
            $s->values()->createMany($rows);
            app(AnnualBudgetService::class)->save($r, $s, $data->performance);
            $s->increment('revision');
            $s->unsetRelation('values');
            $this->record($r, $s, 'draft_saved', $before);

            return $s;
        }, 3);
    }

    public function canCorrect(Submission $submission, User $actor): bool
    {
        $step = $submission->currentStep();
        $dataset = $submission->calendar->dataset;

        return in_array($submission->status, ['submitted', 'under_review'], true)
            && $step && $step->level === 'institution' && $step->action === 'review'
            && $step->required_role_code === 'IHOD' && $actor->hasRole('IHOD')
            && (int) $actor->id !== (int) $submission->created_by
            && (int) $actor->id !== (int) $submission->calendar->responsible_user_id
            && $this->policy->allows($actor, $step, (int) $dataset->institution_id, $dataset->department_id);
    }

    public function correct(Request $request, int $id, SubmissionValuesData $data, string $reason): Submission
    {
        return DB::transaction(function () use ($request, $id, $data, $reason) {
            $submission = $this->locked($request, $id);
            abort_unless($this->canCorrect($submission, $request->user()), 403, 'Only the assigned IHOD at the current review step may correct values.');
            $this->expected($submission, $data->expectedRevision);
            abort_unless(trim($reason) !== '' && $data->values !== [], 422, 'Provide corrected values and a reason.');
            $before = $this->snapshot($submission, $request->user());
            $existing = $submission->values()->get()->keyBy(fn ($row) => $row->indicator_id.':'.$row->dimension_key);
            $patches = $this->validator->validate($submission->template->template_content, $data->values, false);
            $changed = false;
            foreach ($patches as $index => $patch) {
                $row = $existing->get($patch['indicator_id'].':'.$patch['dimension_key']);
                abort_unless($row, 422, 'Corrections must identify an existing indicator/dimension row.');
                abort_unless(($row->breakdowns !== null) === ($patch['breakdowns'] !== null), 422, 'A correction cannot change the reporting format.');
                if (! array_key_exists('remarks', $data->values[$index])) {
                    unset($patch['remarks']);
                }
                $row->fill($patch);
                $changed = $row->isDirty() || $changed;
            }
            abort_unless($changed, 422, 'No values have changed.');
            $this->validator->validate($submission->template->template_content, $existing->values()->map->input()->all(), true);
            foreach ($existing as $row) {
                if ($row->isDirty()) {
                    $row->save();
                }
            }
            $submission->increment('revision');
            $submission->unsetRelation('values');
            $this->record($request, $submission, 'reviewer_corrected', $before, trim($reason), $submission->currentStep(),
                [(int) $submission->calendar->responsible_user_id]);

            return $submission;
        }, 3);
    }

    public function expected(Submission $s, int $revision): void
    {
        abort_unless($s->revision === $revision, 409, 'Submission changed. Reload it and use the latest revision.');
    }

    public function officer(User $actor, DatasetReportingCalendar $calendar): void
    {
        abort_unless((int) $calendar->responsible_user_id === (int) $actor->id && DatasetCalendarService::eligibleRecipient($calendar->dataset, $actor), 403, 'Only the assigned active data officer may enter or submit data.');
    }

    public function editable(Submission $s, User $actor): void
    {
        $this->officer($actor, $s->calendar);
        abort_unless(in_array($s->status, ['draft', 'returned'], true), 409, 'Submission is locked for review.');
        $this->entry($s->calendar, $s);
    }

    public function entry(DatasetReportingCalendar $calendar, ?Submission $s = null): void
    {
        $dataset = $calendar->dataset;
        abort_unless($dataset->status === 'active' && $dataset->institution?->is_active && $dataset->institution?->status === 'active', 422, 'Dataset or institution is not active.');
        $period = ReportingPeriod::findOrFail($calendar->reporting_period_id);
        if ($period->parent_id) {
            $parent = ReportingPeriod::lockForUpdate()->findOrFail($period->parent_id);
        }
        $period = ReportingPeriod::lockForUpdate()->findOrFail($period->id);
        if (isset($parent)) {
            $period->setRelation('parent', $parent);
        }
        $calendar->setRelation('period', $period);
        if ($s) {
            // A removed reporting frequency cannot be submitted through a stale open browser form.
            abort_unless(in_array($period->period_type, $s->template->template_content['frequencies'] ?? [], true),
                422, 'This reporting frequency is no longer supported by the submission template.');
        }
        abort_unless($period->institution_id === null && ! app(ReportingPeriodStatusService::class)->manuallyClosed($period), 422, 'Reporting period is closed.');
        $today = CarbonImmutable::now('Africa/Dar_es_Salaam')->toDateString();
        $deadline = $s?->status === 'returned' && $s->correction_deadline ? $s->correction_deadline->toDateString() : $period->deadline->toDateString();
        abort_unless($today >= $period->start_date->toDateString() && $today <= $deadline, 422, 'Entry window or correction deadline does not allow this action.');
        abort_if($calendar->submitted_at && ! $s, 409, 'This calendar already has a submitted record.');
    }

    public function complete(Submission $s): void
    {
        $this->validator->validate($s->template->template_content, $s->values()->get()->map->input()->all(), true);
    }

    public function recipients(Submission $s, ApprovalCircleStep $step): array
    {
        $dataset = $s->calendar->dataset;
        $q = User::where('is_active', true)->where('status', 'active')->where('id', '!=', $s->calendar->responsible_user_id)->where('id', '!=', $s->created_by);
        if ($step->assigned_user_id) {
            $q->whereKey($step->assigned_user_id);
        }
        if ($step->level === 'institution') {
            $q->where('institution_id', $dataset->institution_id);
        } elseif ($dataset->department_id && ! in_array($step->required_role_code, ['MDO', 'MDD'], true)) {
            $q->where('department_id', $dataset->department_id);
        }

        return $q->get()->filter(fn ($u) => $this->policy->allows($u, $step, (int) $dataset->institution_id, $dataset->department_id))->modelKeys();
    }

    public function record(Request $r, Submission $s, string $action, ?array $before, ?string $comments = null, ?ApprovalCircleStep $step = null, array $recipients = []): void
    {
        // Submit receives the destination step; it is not the submitter's role.
        $actingRole = in_array($action, ['review', 'approve', 'return', 'publish', 'reviewer_corrected'], true)
            ? $step?->required_role_code : null;
        if (in_array($action, ['draft_created', 'draft_saved', 'submitted'], true)) {
            $actingRole = $s->calendar->dataset->department_id === null ? 'IDO' : 'DDO';
        }
        $event = $this->audit->record(new AuditEventData(eventType: 'submission_'.$action, userId: $r->user()->id, entityType: 'submission', entityId: (string) $s->id,
            oldValues: $before, newValues: $this->snapshot($s, $r->user()), reason: $comments, ipAddress: $r->ip(), requestId: $r->attributes->get('auditRequestId'), actingRole: $actingRole));
        SubmissionApproval::create(['submission_id' => $s->id, 'actor_id' => $r->user()->id, 'action' => $action, 'step_name' => $step?->step_name, 'comments' => $comments,
            'meta' => ['status' => $s->status, 'revision' => $s->revision, 'attempt' => $s->attempt, 'workflowVersionId' => $s->approval_circle_id, 'ministryWorkflowVersionId' => $s->ministry_approval_circle_id, 'workflowStage' => $s->workflow_stage, 'step' => $step?->sequence,
                'completedStepId' => in_array($action, ['review', 'approve', 'publish'], true) ? $step?->id : null,
                'actor' => $event->actor_snapshot,
                'correctionDeadline' => $s->correction_deadline?->toDateString()], 'acted_at' => now()]);
        if ($action === 'submitted') {
            // snapshot() may have cached the previous submitter before this history row existed.
            $s->unsetRelation('latestSubmittedApproval');
        }
        foreach (array_unique($recipients) as $userId) {
            if ((int) $userId === (int) $r->user()->id) {
                continue;
            }
            $message = $action === 'reviewer_corrected'
                ? "{$s->reference}: Submission yako imerekebishwa na IHOD {$r->user()->name}. Sababu: {$comments}"
                : "{$s->reference}: {$action}".($comments ? '. '.$comments : '');
            $this->notifications->notifyUser(new NotificationData(userId: (int) $userId, auditEventId: $event->id, type: 'SubmissionWorkflow', message: $message, sentAt: now()));
        }
    }

    public function snapshot(Submission $s, User $actor): array
    {
        $calendar = $s->calendar;
        $dataset = $calendar->dataset;
        $step = $s->currentStep();
        $actions = [];
        if (in_array($s->status, ['draft', 'returned'], true) && (int) $calendar->responsible_user_id === (int) $actor->id && DatasetCalendarService::eligibleRecipient($dataset, $actor)) {
            $today = CarbonImmutable::now('Africa/Dar_es_Salaam')->toDateString();
            $deadline = $s->status === 'returned' && $s->correction_deadline ? $s->correction_deadline->toDateString() : $calendar->period->deadline->toDateString();
            if ($dataset->status === 'active' && ! app(ReportingPeriodStatusService::class)->manuallyClosed($calendar->period) && $today >= $calendar->period->start_date->toDateString() && $today <= $deadline) {
                $actions = ['save', 'submit'];
            }
        } elseif ($step && ! in_array($s->status, ['draft', 'returned', 'published'], true) && (int) $actor->id !== (int) $s->created_by && (int) $actor->id !== (int) $calendar->responsible_user_id && $this->policy->allows($actor, $step, (int) $dataset->institution_id, $dataset->department_id)) {
            $actions = [$step->action];
            if ($step->can_return) {
                $actions[] = 'return';
            }
        }

        if ($this->canCorrect($s, $actor)) {
            $actions[] = 'correct';
        }

        return ['annualBudgetContext' => app(AnnualBudgetService::class)->context($calendar, $s),
            'annualObjectiveContext' => app(AnnualObjectiveService::class)->context($calendar, $s),
            'annualTargetContext' => app(AnnualTargetService::class)->context($calendar, $s->template->template_content, $s),
            'id' => $s->id, 'reference' => $s->reference, 'reportingCalendarId' => (int) $s->reporting_calendar_id,
            'datasetId' => (int) $dataset->id, 'reportingPeriodId' => (int) $calendar->reporting_period_id, 'periodLabel' => $calendar->period->label,
            'templateVersionId' => (int) $s->template_version_id, 'workflowVersionId' => $s->approval_circle_id, 'ministryWorkflowVersionId' => $s->ministry_approval_circle_id, 'workflowStage' => $s->workflow_stage, 'status' => $s->status, 'revision' => $s->revision, 'attempt' => $s->attempt,
            'currentStep' => $step?->toArray(), 'allowedActions' => $actions, 'deadline' => $calendar->period->deadline->toDateString(), 'correctionDeadline' => $s->correction_deadline?->toDateString(),
            'values' => $s->values()->get()->map->input()->all(), 'submittedBy' => $s->latestSubmittedApproval?->actor,
            'performance' => app(AnnualBudgetService::class)->performance($s),
            'submittedAt' => $s->submitted_at?->toIso8601String(), 'publishedAt' => $s->published_at?->toIso8601String()];
    }
}
