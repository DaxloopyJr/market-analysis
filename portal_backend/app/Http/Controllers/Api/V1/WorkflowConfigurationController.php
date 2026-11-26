<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\ApprovalCircleStep;
use App\Services\WorkflowConfigurationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class WorkflowConfigurationController extends Controller
{
    public function index(Request $r, WorkflowConfigurationService $s): JsonResponse
    {
        return response()->json(['data' => $s->query($r->user())->with('steps')->orderByDesc('id')->get()]);
    }

    public function show(Request $r, int $id, WorkflowConfigurationService $s): JsonResponse
    {
        return response()->json(['data' => $s->query($r->user())->with('steps')->findOrFail($id)]);
    }

    public function store(Request $r, WorkflowConfigurationService $s): JsonResponse
    {
        return response()->json(['data' => $s->save($r, $r->validate($this->rules()))], 201);
    }

    public function update(Request $r, int $id, WorkflowConfigurationService $s): JsonResponse
    {
        return response()->json(['data' => $s->save($r, $r->validate($this->rules()), $id)]);
    }

    public function activate(Request $r, int $id, WorkflowConfigurationService $s): JsonResponse
    {
        return response()->json(['data' => $s->activate($r, $id)]);
    }

    public function clone(Request $r, int $id, WorkflowConfigurationService $s): JsonResponse
    {
        return response()->json(['data' => $s->clone($r, $id)], 201);
    }

    public function updateStep(Request $r, int $step, WorkflowConfigurationService $s): JsonResponse
    {
        $model = ApprovalCircleStep::findOrFail($step);
        $circle = $s->query($r->user())->with('steps')->findOrFail($model->approval_circle_id);
        $rules = $this->rules();
        $fields = [];
        foreach ($rules as $key => $rule) {
            if (str_starts_with($key, 'steps.*.')) {
                $fields[substr($key, 8)] = array_merge(['sometimes'], $rule);
            }
        }
        $data = $r->validate($fields);
        $steps = $circle->steps->map(fn ($item) => array_replace($item->only(['step_name', 'required_role_code', 'assigned_user_id', 'action', 'level', 'can_return']), $item->id === $model->id ? $data : []))->all();

        return response()->json(['data' => $s->save($r, ['steps' => $steps], $circle->id)]);
    }

    private function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:120'], 'institution_id' => ['prohibited'], 'department_id' => ['prohibited'], 'scope_key' => ['prohibited'],
            'steps' => ['required', 'array', 'list', 'min:1', 'max:30'], 'steps.*' => ['array:step_name,required_role_code,assigned_user_id,action,level,can_return'],
            'steps.*.step_name' => ['required', 'string', 'max:120'], 'steps.*.required_role_code' => ['required', 'string', 'exists:roles,code'],
            'steps.*.assigned_user_id' => ['nullable', 'integer', 'exists:users,id'], 'steps.*.action' => ['required', Rule::in(['review', 'approve', 'publish'])],
            'steps.*.level' => ['required', Rule::in(['institution', 'ministry'])], 'steps.*.can_return' => ['sometimes', 'boolean'],
        ];
    }
}
