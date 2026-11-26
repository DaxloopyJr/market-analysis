# Approval workflows

## Ownership and handoff

- IA creates and activates the institution workflow using institution roles. It ends in approval and cannot contain publication: for example IHOD review ? AO approve.
- MOA creates and activates the shared ministry workflow using ministry roles. It requires approval followed by one final publication step: for example MDO review ? MDD approve ? MDD publish.
- Final institution approval automatically forwards the same submission to ministry and notifies its eligible reviewers.
- Department data starts directly in the ministry workflow.
- Roles and review steps remain configurable; the sample roles below are not hardcoded.

Institution reviewers act on their own institution's data. Ministry reviewers must be active users in the active institution with code MIT. For department data their department must match the dataset; for institution data the configured roles receive it across MIT. There is currently no separate institution-to-ministry-department routing map. A fixed assignee is allowed on an institution step, but not on shared ministry steps.

Both workflow versions are pinned at first submission. Replacing an active version does not change an in-flight submission. Corrections restart at the first step of the original institution workflow (or ministry for department data), preserving both versions.

Response fields:
- workflowVersionId: first workflow version (institution, or ministry for department data).
- ministryWorkflowVersionId: pinned ministry workflow version.
- workflowStage: institution or ministry; null for drafts and legacy paths.
- currentStep: pending step in that stage; allowedActions: actions permitted for the signed-in user.

MOA retains administrative read access. Ministry reviewers see data after it reaches ministry, not simply when its version is pinned. During an institutional correction cycle they wait for AO's release again.

## Existing records

The additive migration does not rewrite existing submissions. Previously submitted records with null workflow_stage retain their original single-workflow path, including any old publication step. Existing drafts use the combined flow on first submission.

An old institution configuration ending in publication must be cloned before new submissions can use it. Cloning omits the obsolete publication step only in the new draft; review and activate that draft. The original steps and historical submissions remain unchanged. This implementation does not seed sample accounts or configurations.

## Configuration endpoints

- GET|POST /api/v1/approval-circles: list or create drafts in the current administrator's scope.
- GET|PUT /api/v1/approval-circles/{id}: read or update a draft.
- POST /api/v1/approval-circles/{id}/activate: activate; retire the previous active version in that scope.
- POST /api/v1/approval-circles/{id}/clone: create a new draft copy.
- PUT /api/v1/approval-circle-steps/{step}: update a step in a draft.

Omit institution_id, department_id and scope_key. Scope comes from the signed-in IA or MOA.

## Postman example: TANTRADE dataset 2

Set baseUrl to the API base ending in /api/v1. Use Authorization: Bearer {{token}}, Accept: application/json, and Content-Type: application/json. Switch token to the actor indicated. Calendar 9 and indicator 12 come from the user's sample response; use current response IDs if different.

### 1. MOA: create ministry workflow

POST {{baseUrl}}/approval-circles

~~~json
{
  "name": "Ministry data approval",
  "steps": [
    {"step_name": "Ministry review", "required_role_code": "MDO", "action": "review", "level": "ministry", "can_return": true},
    {"step_name": "Ministry approval", "required_role_code": "MDD", "action": "approve", "level": "ministry", "can_return": true},
    {"step_name": "Publication", "required_role_code": "MDD", "action": "publish", "level": "ministry", "can_return": true}
  ]
}
~~~

Store response data.id as ministryWorkflowId. Activate with POST {{baseUrl}}/approval-circles/{{ministryWorkflowId}}/activate (no body).

### 2. TANTRADE IA: create institution workflow

POST {{baseUrl}}/approval-circles

~~~json
{
  "name": "TANTRADE institutional approval",
  "steps": [
    {"step_name": "Institution review", "required_role_code": "IHOD", "action": "review", "level": "institution", "can_return": true},
    {"step_name": "Institution approval", "required_role_code": "AO", "action": "approve", "level": "institution", "can_return": true}
  ]
}
~~~

Store data.id as institutionWorkflowId. Activate with POST {{baseUrl}}/approval-circles/{{institutionWorkflowId}}/activate (no body).

### 3. Assigned officer: open or reuse draft

For the supplied calendar the assigned officer is user 10.

POST {{baseUrl}}/submissions

~~~json
{"reportingCalendarId": 9}
~~~

Store data.id as submissionId. A new draft returns 201; an existing one returns 200. Always use its latest revision as expectedRevision.

### 4. Save values

PUT {{baseUrl}}/submissions/{{submissionId}}/values

~~~json
{
  "expectedRevision": 0,
  "values": [
    {"indicatorId": 12, "dimensionValues": [], "value": "20"}
  ]
}
~~~

This replaces all draft rows. Numeric values should be exact strings. A fresh draft becomes revision 1. Values use the frozen template. Targets are optional.

### 5. Submit and review

Every successful action increments revision. These revisions assume exactly the fresh path above:

| Actor | POST endpoint suffix | Body | Result |
| --- | --- | --- | --- |
| Assigned IDO | /submissions/{{submissionId}}/submit | {"expectedRevision":1} | submitted, institution, IHOD |
| Institution IHOD | /submissions/{{submissionId}}/review | {"expectedRevision":2} | under_review, institution, AO |
| Institution AO | /submissions/{{submissionId}}/approve | {"expectedRevision":3} | under_review, ministry, MDO |
| MIT MDO | /submissions/{{submissionId}}/review | {"expectedRevision":4} | under_review, ministry, MDD |
| MIT MDD | /submissions/{{submissionId}}/approve | {"expectedRevision":5} | approved, awaiting publication |
| MIT MDD | /submissions/{{submissionId}}/publish | {"expectedRevision":6} | published |

Prefix endpoints with {{baseUrl}}. Read revision from each response instead of hardcoding it. This example assigns ministry approval and publication to the same role as separate actions; a different ministry role can be configured.

### Return for correction

The pending reviewer can use POST {{baseUrl}}/submissions/{{submissionId}}/return:

~~~json
{
  "expectedRevision": 4,
  "comments": "Hakiki idadi na urekebishe taarifa.",
  "correctionDeadline": "2026-10-30"
}
~~~

Use the current revision and a deadline on or after today's date in Africa/Dar_es_Salaam. The assigned officer receives an in-app notification, saves corrections and resubmits. The reporting period must remain open.

### Common responses

- 403: wrong role, ineligible actor or self-review.
- 404: submission/workflow outside actor scope.
- 409: stale revision, missing active workflow, no eligible reviewer or invalid state transition.
- 422: invalid values/configuration, closed period or expired entry/correction deadline.

Submission endpoints are unchanged; there is no separate handoff request.
