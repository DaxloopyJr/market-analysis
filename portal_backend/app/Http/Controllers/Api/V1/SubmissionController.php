<?php

namespace App\Http\Controllers\Api\V1;

use App\DTOs\SubmissionValuesData;
use App\Http\Controllers\Controller;
use App\Models\IndicatorTarget;
use App\Services\AnnualTargetService;
use App\Services\ApprovalWorkflowService;
use App\Services\SubmissionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class SubmissionController extends Controller
{
    public function index(Request $r, SubmissionService $s): JsonResponse
    {
        $data = $r->validate(['status' => ['sometimes', Rule::in(['draft', 'submitted', 'under_review', 'returned', 'approved', 'published'])],
            'datasetId' => ['sometimes', 'integer'], 'reportingPeriodId' => ['sometimes', 'integer'], 'perPage' => ['sometimes', 'integer', 'between:1,100'], 'page' => ['sometimes', 'integer', 'min:1']]);
        $q = $s->query($r->user());
        if (isset($data['status'])) {
            $q->where('status', $data['status']);
        }
        foreach (['datasetId' => 'dataset_definition_id', 'reportingPeriodId' => 'reporting_period_id'] as $key => $col) {
            if (isset($data[$key])) {
                $q->whereHas('calendar', fn ($c) => $c->where($col, $data[$key]));
            }
        }
        $page = $q->orderByDesc('id')->paginate($data['perPage'] ?? 20)->appends($data);
        $page->getCollection()->load('latestSubmittedApproval');
        $page->through(fn ($model) => $s->snapshot($model, $r->user()));

        return response()->json($page);
    }

    public function store(Request $r, SubmissionService $s): JsonResponse
    {
        $data = $r->validate(['reportingCalendarId' => ['required', 'integer', 'exists:dataset_reporting_calendars,id']]);
        $model = $s->start($r, (int) $data['reportingCalendarId']);

        return response()->json(['data' => $s->snapshot($model, $r->user())], $model->wasRecentlyCreated ? 201 : 200);
    }

    public function show(Request $r, int $id, SubmissionService $s): JsonResponse
    {
        $model = $s->query($r->user())->with('latestSubmittedApproval')->findOrFail($id);

        return response()->json(['data' => $s->snapshot($model, $r->user()) + ['template' => $model->template->template_content,
            'targets' => IndicatorTarget::where('dataset_definition_id', $model->calendar->dataset_definition_id)->where('reporting_period_id', $model->calendar->reporting_period_id)->where('template_version_id', $model->template_version_id)->where('status', 'active')->get(),
            'history' => $model->approvals()->get(), 'submittedVersions' => DB::table('submission_revisions')->where('submission_id', $id)->orderBy('attempt')->get()->map(function ($row) {
                $row->values = json_decode($row->values, true);
                $row->performance_snapshot = $row->performance_snapshot === null ? null : json_decode($row->performance_snapshot, true);
                $row->objective_snapshot = $row->objective_snapshot === null ? null : json_decode($row->objective_snapshot, true);
                $row->annual_targets_snapshot = $row->annual_targets_snapshot === null ? null : json_decode($row->annual_targets_snapshot, true);

                return $row;
            })]]);
    }

    public function values(Request $r, int $id, SubmissionService $s): JsonResponse
    {
        $data = $this->validatedValues($r);
        $model = $s->save($r, $id, new SubmissionValuesData(
            values: $data['values'],
            expectedRevision: (int) $data['expectedRevision'],
            annualTargets: $data['annualTargets'] ?? [],
            objectiveVersionId: $data['objectiveVersionId'] ?? null,
            expectedObjectiveVersionId: $data['expectedObjectiveVersionId'] ?? null,
            performance: $data['performance'] ?? [],
        ));

        return response()->json(['data' => $s->snapshot($model, $r->user())]);
    }

    public function templateArchives(Request $request, int $id, SubmissionService $service): JsonResponse
    {
        // Use the same visibility boundary as submission details; archives may contain sensitive old values.
        $submission = $service->query($request->user())->findOrFail($id);
        $filters = $request->validate(['perPage' => ['sometimes', 'integer', 'between:1,100'], 'page' => ['sometimes', 'integer', 'min:1']]);
        $archives = DB::table('submission_template_archives')
            ->where('dataset_definition_id', $submission->calendar->dataset_definition_id)
            ->where('reporting_period_id', $submission->calendar->reporting_period_id)
            ->orderByDesc('id')->paginate($filters['perPage'] ?? 20)->appends($filters);
        $archives->through(function ($archive) {
            $archive->snapshot = json_decode($archive->snapshot, true, 512, JSON_THROW_ON_ERROR);

            return $archive;
        });

        return response()->json($archives);
    }

    public function correctAnnualTargets(Request $request, int $id, SubmissionService $service): JsonResponse
    {
        $data = $request->validate([
            'reason' => ['required', 'string', 'max:10000'],
            'annualTargets' => ['required', 'array', 'list', 'min:1', 'max:10000'],
            'annualTargets.*' => ['required', 'array:indicatorId,targetValue,expectedTargetValue,baselineValue,expectedBaselineValue'],
            'annualTargets.*.indicatorId' => ['required', 'integer', 'distinct'],
            'annualTargets.*.targetValue' => ['required', 'string', 'max:26'],
            'annualTargets.*.baselineValue' => ['sometimes', 'nullable', 'string', 'max:26'],
            'annualTargets.*.expectedBaselineValue' => ['present_with:annualTargets.*.baselineValue', 'nullable', 'string', 'max:26'],
            'annualTargets.*.expectedTargetValue' => ['required', 'string', 'max:26'],
        ]);

        return DB::transaction(function () use ($request, $id, $service, $data) {
            $submission = $service->locked($request, $id);
            $targets = app(AnnualTargetService::class);
            $targets->correct($request, $submission, $data['annualTargets'], $data['reason']);

            // Return the current annual plan; submitted submission snapshots remain unchanged.
            return response()->json(['data' => $targets->context($submission->calendar, $submission->template->template_content)]);
        }, 3);
    }

    public function correctValues(Request $r, int $id, SubmissionService $s): JsonResponse
    {
        $r->validate(['annualTargets' => ['prohibited'], 'performance' => ['prohibited'], 'objectiveVersionId' => ['prohibited'], 'expectedObjectiveVersionId' => ['prohibited']]);
        $reason = $r->validate(['reason' => ['required', 'string', 'max:10000']])['reason'];
        $data = $this->validatedValues($r);
        $model = $s->correct($r, $id, new SubmissionValuesData($data['values'], (int) $data['expectedRevision']), $reason);

        return response()->json(['data' => $s->snapshot($model, $r->user())]);
    }

    private function validatedValues(Request $r): array
    {
        return $r->validate(['objectiveVersionId' => ['sometimes', 'integer', 'min:1'],
            'expectedObjectiveVersionId' => ['present_with:objectiveVersionId', 'nullable', 'integer', 'min:1'],
            'performance' => ['sometimes', 'array:approved_budget,actual_received,actual_expenditure,achievements,implementation_challenges,corrective_actions,me_comments'],
            'performance.approved_budget' => ['sometimes', 'nullable', 'regex:/^\d{1,22}(\.\d{1,2})?$/'],
            'performance.actual_received' => ['sometimes', 'nullable', 'regex:/^\d{1,22}(\.\d{1,2})?$/'],
            'performance.actual_expenditure' => ['sometimes', 'nullable', 'regex:/^\d{1,22}(\.\d{1,2})?$/'],
            'performance.achievements' => ['sometimes', 'nullable', 'string', 'max:10000'],
            'performance.implementation_challenges' => ['sometimes', 'nullable', 'string', 'max:10000'],
            'performance.corrective_actions' => ['sometimes', 'nullable', 'string', 'max:10000'],
            'performance.me_comments' => ['sometimes', 'nullable', 'string', 'max:10000'],
            'annualTargets' => ['sometimes', 'nullable', 'array', 'list', 'max:10000'],
            'annualTargets.*' => ['required', 'array:indicatorId,targetValue,baselineValue'],
            'annualTargets.*.indicatorId' => ['required', 'integer', 'distinct'],
            'annualTargets.*.baselineValue' => ['sometimes', 'nullable', 'string', 'max:26'],
            'annualTargets.*.targetValue' => ['present', 'nullable', 'string', 'max:26'],
            'expectedRevision' => ['required', 'integer', 'min:0'], 'values' => ['present', 'array', 'list', 'max:10000'],
            'values.*' => ['array:indicatorId,dimensionValues,value,breakdowns,remarks'], 'values.*.indicatorId' => ['required', 'integer'],
            'values.*.remarks' => ['sometimes', 'nullable', 'string', 'max:10000'],
            'values.*.breakdowns' => ['sometimes', 'array', 'list', 'max:10000'],
            'values.*.breakdowns.*' => ['array:dimensionId,optionId,value'],
            'values.*.breakdowns.*.dimensionId' => ['required', 'integer'],
            'values.*.breakdowns.*.optionId' => ['required', 'integer'],
            'values.*.breakdowns.*.value' => ['present', 'nullable'],
            'values.*.value' => ['present', 'nullable'], 'values.*.dimensionValues' => ['sometimes', 'array', 'list', 'max:100'],
            'values.*.dimensionValues.*' => ['array:dimensionId,value'], 'values.*.dimensionValues.*.dimensionId' => ['required', 'integer'],
            'values.*.dimensionValues.*.value' => ['present']]);
    }

    public function submit(Request $r, int $id, ApprovalWorkflowService $flow, SubmissionService $s): JsonResponse
    {
        $data = $r->validate(['expectedRevision' => ['required', 'integer', 'min:0']]);

        return response()->json(['data' => $s->snapshot($flow->submit($r, $id, (int) $data['expectedRevision']), $r->user())]);
    }

    public function action(Request $r, int $id, string $action, ApprovalWorkflowService $flow, SubmissionService $s): JsonResponse
    {
        abort_unless(in_array($action, ['review', 'approve', 'return', 'publish'], true), 404);
        $data = $r->validate(['expectedRevision' => ['required', 'integer', 'min:0'],
            'comments' => [$action === 'return' ? 'required' : 'nullable', 'string', 'max:10000'],
            'correctionDeadline' => [$action === 'return' ? 'required' : 'prohibited', 'date_format:Y-m-d']]);

        return response()->json(['data' => $s->snapshot($flow->act($r, $id, $action, (int) $data['expectedRevision'], $data['comments'] ?? null, $data['correctionDeadline'] ?? null), $r->user())]);
    }
}
