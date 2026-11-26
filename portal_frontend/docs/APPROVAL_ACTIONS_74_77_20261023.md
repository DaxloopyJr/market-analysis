# VIWANDA — Approval Actions API Contract (#74–77)

Confirmed by Laravel backend team on 23 October 2026. This replaces all
older HOD `/forward` and `comment` (singular) examples. Use lowercase paths.
Axios `src/API/axios.jsx` already handles `/api/v1` and the Bearer token.

## Full workflow

1. IDO/DDO fills a *new submission instance* and saves `PUT /submissions/{id}/values`
   with `{expectedRevision, values:[{indicatorId,value,remarks,breakdowns}]}`.
2. IDO/DDO submits via `POST /submissions/{id}/submit` with
   `{expectedRevision}`; Laravel pins and routes to the configured Approval Circle.
3. HOD retrieves only the submission currently assigned to their user ID.
   HOD may correct a value via `PATCH /submissions/{id}/values` with
   `{expectedRevision,reason,values:[{indicatorId,value}]}` (distinct from IDO PUT).
4. HOD **Review & Forward** invokes `POST /submissions/{id}/review` with
   `{expectedRevision,comments?}`. Response's `currentStep` is the **next**
   approver (e.g. `required_role_code:"AO"`), selected entirely by Laravel.
5. Account Officer invokes `POST /submissions/{id}/approve` with
   `{expectedRevision,comments?}`. Institution final approval automatically
   hands to the configured ministry workflow, no separate handoff request.
6. At any allowed review/approve step, **Return** invokes
   `POST /submissions/{id}/return` with `{expectedRevision,comments,correctionDeadline}`.
   Date is required, `YYYY-MM-DD`, and today/future in `Africa/Dar_es_Salaam`.
   Backend returns the SAME submission ID to its assigned Data Officer, not
   the preceding reviewer. On officer resubmission, original pinned route restarts.
7. Final ministry publication uses `POST /submissions/{id}/publish` with
   `{expectedRevision,comments?}`. Only the approved ministry publish step may
   use this; response status `published` locks changes.

## Implementation map

- `src/utils/submissionApprovalActions.js`: validates action name, allowedActions,
  currentStep.action, revision, comments and Return correction deadline.
- `src/API/submission.jsx`: `postReviewSubmission`, `postApproveSubmission`,
  `postReturnSubmission`, `postPublishSubmission` route functions.
- `src/services/hodReviewService.jsx`: HOD action orchestrator; reads current
  assignment/revision, sends action, checks the authoritative POST response
  (important because reviewer may lose GET access *after* Return).
- `src/pages/HOD/HodReview.jsx`: HOD review/return UI. Return asks for deadline
  in a confirmation dialog. Review reads the pinned step and only shows allowed
  actions. Both HOD pages retain their approved three-stage Approval History.

No HOD approval access is inferred from button visibility. Laravel must enforce
permission, institution scope, no self-review, current step, `can_return`, and
missing-recipient HTTP 409 transaction rollback. The shared approve/publish APIs
are ready for authorized Account Officer and Ministry screens, which are not
created by this patch.
