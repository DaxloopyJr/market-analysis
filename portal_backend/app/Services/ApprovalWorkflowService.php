<?php

namespace App\Services;

use App\Models\ApprovalCircle;
use App\Models\ApprovalCircleStep;
use App\Models\Submission;
use Carbon\CarbonImmutable;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ApprovalWorkflowService
{
    public function __construct(private SubmissionService $submissions, private WorkflowConfigurationService $workflows, private WorkflowActorPolicy $policy) {}

    public function submit(Request $request, int $id, int $revision): Submission
    {
        return DB::transaction(function () use ($request, $id, $revision) {
            $s = $this->submissions->locked($request, $id);
            $this->submissions->expected($s, $revision);
            $this->submissions->editable($s, $request->user());
            $this->submissions->complete($s);
            app(AnnualTargetService::class)->freeze($s);
            app(AnnualBudgetService::class)->freeze($s);
            app(AnnualObjectiveService::class)->freeze($s);
            $before = $this->submissions->snapshot($s, $request->user());
            // Corrections restart the last selected path; forward transitions resolve active versions.
            if (! $s->approval_circle_id) {
                $circle = $this->workflows->resolve($s->calendar->dataset);
                $ministry = $s->calendar->dataset->department_id === null ? $this->workflows->resolveMinistry() : $circle;
                $s->approval_circle_id = $circle->id;
                $s->ministry_approval_circle_id = $ministry->id;
                $s->workflow_stage = $circle->scope_key === 'global' ? 'ministry' : 'institution';
            } else {
                $circle = ApprovalCircle::findOrFail($s->approval_circle_id);
                if ($s->workflow_stage !== null) {
                    $s->workflow_stage = (int) $s->approval_circle_id === (int) $s->ministry_approval_circle_id ? 'ministry' : 'institution';
                }
            }
            $first = $circle->steps()->firstOrFail();
            $recipients = $this->submissions->recipients($s, $first);
            abort_if($recipients === [], 409, 'No eligible reviewer is available for the first step.');
            $s->fill(['approval_circle_id' => $circle->id, 'current_step' => $first->sequence, 'status' => 'submitted', 'submitted_at' => now(), 'correction_deadline' => null,
                'attempt' => $s->attempt + 1, 'revision' => $s->revision + 1])->save();
            $s->unsetRelation('circle');
            $s->unsetRelation('ministryCircle');
            DB::table('submission_revisions')->insert(['submission_id' => $s->id, 'attempt' => $s->attempt,
                'values' => json_encode($s->values()->get()->map->input()->all(), JSON_THROW_ON_ERROR),
                'objective_snapshot' => $s->objective_snapshot === null ? null : json_encode($s->objective_snapshot, JSON_THROW_ON_ERROR),
                'annual_targets_snapshot' => $s->annual_targets_snapshot === null ? null : json_encode($s->annual_targets_snapshot, JSON_THROW_ON_ERROR),
                'performance_snapshot' => json_encode(app(AnnualBudgetService::class)->performance($s), JSON_THROW_ON_ERROR),
                'submitted_by' => $request->user()->id, 'submitted_at' => now()]);
            $s->calendar->update(['submitted_at' => now()]);
            $this->submissions->record($request, $s, 'submitted', $before, null, $first, $recipients);

            return $s;
        }, 3);
    }

    public function act(Request $r, int $id, string $action, int $revision, ?string $comments = null, ?string $correctionDeadline = null): Submission
    {
        return DB::transaction(function () use ($r, $id, $action, $revision, $comments, $correctionDeadline) {
            $s = $this->submissions->locked($r, $id);
            $this->submissions->expected($s, $revision);
            abort_unless(in_array($s->status, ['submitted', 'under_review', 'approved'], true), 409, 'Submission is not awaiting review.');
            $step = $s->currentStep();
            abort_unless($step, 409, 'No pending workflow step.');
            $dataset = $s->calendar->dataset;
            $this->policy->authorize($r->user(), $step, (int) $dataset->institution_id, $dataset->department_id);
            abort_if((int) $r->user()->id === (int) $s->created_by || (int) $r->user()->id === (int) $s->calendar->responsible_user_id, 403, 'An officer cannot review their own submission.');
            $before = $this->submissions->snapshot($s, $r->user());
            $recipients = [];
            if ($action === 'return') {
                abort_unless($step->can_return && filled($comments) && $correctionDeadline, 422, 'Return requires permission, comments and correctionDeadline.');
                abort_if($correctionDeadline < CarbonImmutable::now('Africa/Dar_es_Salaam')->toDateString(), 422, 'Correction deadline cannot be in the past.');
                $officer = $s->calendar->responsibleUser;
                abort_unless($officer && DatasetCalendarService::eligibleRecipient($dataset, $officer), 409, 'Assign an active officer before returning this submission.');
                $s->fill(['status' => 'returned', 'current_step' => null, 'correction_deadline' => $correctionDeadline]);
                $recipients = [$officer->id];
            } else {
                abort_unless($step->action === $action, 403, 'This step expects '.$step->action.'.');
                if ($action === 'publish') {
                    abort_if($s->workflow_stage === 'institution', 409, 'Institution approval must continue to ministry before publication.');
                    abort_unless($s->status === 'approved', 409, 'Submission must reach the publication step before publishing.');
                    $s->fill(['status' => 'published', 'published_at' => now(), 'current_step' => null]);
                    $recipients = [$s->calendar->responsible_user_id];
                } else {
                    abort_unless(in_array($s->status, ['submitted', 'under_review'], true), 409);
                    $next = $this->nextActiveStep($s, $step);
                    if (! $next && $s->workflow_stage === 'institution') {
                        abort_unless($action === 'approve', 409, 'Institution approval is required before ministry review.');
                        $ministry = $this->workflows->resolveMinistry();
                        $s->ministry_approval_circle_id = $ministry->id;
                        $s->setRelation('ministryCircle', $ministry);
                        $next = $ministry->steps()->firstOrFail();
                        $s->workflow_stage = 'ministry';
                    }
                    abort_unless($next, 409, 'No next workflow step is configured.');
                    $recipients = $this->submissions->recipients($s, $next);
                    abort_if($recipients === [], 409, 'No eligible reviewer is available for the next step.');
                    // Keep the existing ready-for-publication status. A review -> publish
                    // workflow reaches it without requiring a separate approve action.
                    $s->fill(['current_step' => $next->sequence, 'status' => $next->action === 'publish' ? 'approved' : 'under_review']);
                }
            }
            $s->revision++;
            $s->save();
            $this->submissions->record($r, $s, $action, $before, $comments, $step, $recipients);

            return $s;
        }, 3);
    }

    /**
     * Finish the assigned step, then move forward in the currently active version.
     * A role/action pair identifies a stage across renamed or resequenced versions.
     * Repeated pairs cannot be mapped safely across versions and require configuration repair.
     */
    private function nextActiveStep(Submission $submission, ApprovalCircleStep $completed): ?ApprovalCircleStep
    {
        $previous = $submission->currentCircle();

        // Legacy mixed workflows have no separate institution/ministry stage to resolve.
        if ($submission->workflow_stage === null) {
            return $previous->steps()->where('sequence', '>', $completed->sequence)->first();
        }

        // Activation takes this same lock, so a transition sees one consistent active version.
        DB::table('roles')->where('code', 'MOA')->lockForUpdate()->first();
        $active = $submission->workflow_stage === 'ministry'
            ? $this->workflows->resolveMinistry()
            : $this->workflows->resolve($submission->calendar->dataset);

        if ((int) $previous->id === (int) $active->id) {
            return $active->steps()->where('sequence', '>', $completed->sequence)->first();
        }

        $oldSteps = $previous->steps()->get();
        $newSteps = $active->steps()->get();
        foreach ([$oldSteps, $newSteps] as $steps) {
            abort_if($steps->groupBy(fn ($step) => $this->stageKey($step))->contains(fn ($group) => $group->count() > 1),
                409, 'Cannot map repeated role/action stages between workflow versions. Configure distinct stages before forwarding.');
        }

        $completedKeys = [];
        foreach ($oldSteps as $oldStep) {
            if ($oldStep->sequence <= $completed->sequence) {
                $completedKeys[] = $this->stageKey($oldStep);
            }
        }

        // Include earlier versions in this attempt so a removed/reintroduced stage cannot run twice.
        $previousStage = null;
        foreach ($submission->approvals()->get() as $approval) {
            if ((int) ($approval->meta['attempt'] ?? 0) !== $submission->attempt) {
                continue;
            }
            $recordedStage = $approval->meta['workflowStage'] ?? null;
            $crossedStage = $recordedStage !== $previousStage;
            $previousStage = $recordedStage;
            if (! in_array($approval->action, ['review', 'approve'], true)) {
                continue;
            }
            // Older handoff records describe the destination, but their sequence belongs
            // to the institution. Never interpret that AO approval as ministry approval.
            if (! isset($approval->meta['completedStepId']) && $crossedStage) {
                continue;
            }
            $historicalStep = isset($approval->meta['completedStepId'])
                ? ApprovalCircleStep::find($approval->meta['completedStepId'])
                : ApprovalCircleStep::where('approval_circle_id', $approval->meta[
                    ($approval->meta['workflowStage'] ?? null) === 'ministry' ? 'ministryWorkflowVersionId' : 'workflowVersionId'
                ] ?? null)->where('sequence', $approval->meta['step'] ?? null)->where('action', $approval->action)->first();
            if ($historicalStep && $historicalStep->level === $completed->level) {
                $completedKeys[] = $this->stageKey($historicalStep);
            }
        }

        $lastCompletedSequence = 0;
        foreach ($newSteps as $candidate) {
            if (in_array($this->stageKey($candidate), $completedKeys, true)) {
                $lastCompletedSequence = max($lastCompletedSequence, $candidate->sequence);
            }
        }

        // Never move from approval back to review, even if the old stage was removed entirely.
        $ranks = ['review' => 0, 'approve' => 1, 'publish' => 2];
        $next = $newSteps->first(fn ($candidate) => $candidate->sequence > $lastCompletedSequence
            && $ranks[$candidate->action] >= $ranks[$completed->action]
            && ! in_array($this->stageKey($candidate), $completedKeys, true));

        if ($submission->workflow_stage === 'ministry') {
            $submission->ministry_approval_circle_id = $active->id;
            $submission->setRelation('ministryCircle', $active);
            if ($submission->calendar->dataset->department_id !== null) {
                $submission->approval_circle_id = $active->id;
                $submission->setRelation('circle', $active);
            }
        } else {
            $submission->approval_circle_id = $active->id;
            $submission->setRelation('circle', $active);
        }

        return $next;
    }

    private function stageKey(ApprovalCircleStep $step): string
    {
        return $step->level.':'.$step->required_role_code.':'.$step->action;
    }
}
