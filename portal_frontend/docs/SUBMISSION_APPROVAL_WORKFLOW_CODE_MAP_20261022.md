# VIWANDA PORTAL — Submission, Dataset ID, Approval Circle

**Build date:** 22 October 2026  
**Source baseline:** `VIWANDA_REV26_SUBMISSION_WORKFLOW_APPROVAL_CIRCLE_AUDIT_20261022_FULL_FRONTEND.zip`  
**Scope of change:** Fix dataset ID/context path validation & readable errors; implement confirmed approval-circle scope/version API contracts; add traceable code/docs.  
**IMPORTANT:** The previously rejected REMARKS_DATA_ENTRY_ONLY build was NOT used.

## A. Submission — real frontend-to-Laravel call chain

```
DataEntry.jsx (Step 1)
  GET /datasets?status=active       <- Laravel dataset array contains id
  user selects dataset.id           <- REQUIRED saved master Dataset ID; e.g. 6
  GET /reporting-periods            <- lists all four quarters (including closed/upcoming)
  GET /datasets/6/reporting-calendar
  GET /datasets/6/indicators + GET /datasets/6/dimensions

On Save Draft (DataEntry.jsx -> idoSubmissionService.jsx -> API/submission.jsx -> axios.jsx):
  1) Validate selected datasetId (positive integer, belongs to selected dataset)
  2) POST /datasets/6/submission-context
     {"startYear":2026,"frequency":"quarterly","periodNumber":2}
  3) Read `reportingCalendarId` from context response
     If response omits it, GET /datasets/6/reporting-calendar and match
     this selected reportingPeriodId to exactly one calendar row.
     409 duplicate context may reuse an EXACT match only (no guess).
  4) POST /submissions
     {"reportingCalendarId":9}  <- calendar ID, NOT dataset ID, NOT global period ID
  5) Response gives {id:105,status:"draft"} (backend team confirmed id/status)
  6) GET /submissions/105           <- verify editable Draft; read revision
  7) IF no data entered: keep the Draft instance; do not PUT fabricated values.
     ELSE PUT /submissions/105/values <- {expectedRevision:revision, values:[{indicatorId,value,...},...]}
          Each values[0] must be a PHP associative array (JSON object). indicatorId required and value present.
  8) IF PUT was sent: GET /submissions/105 and verify all values actually persisted
     DRAFT editable; submission ID reused for Save and correction.

On Submit for Review (same ID):
  Save pending changes; verify via GET; then POST /submission/105/submit
  GET /submissions/105 to verify status and lock editing.
  Laravel decides current stage/next reviewer based on active/pinned Approval Circle.

NEW reporting period => new submission instance/ID, blank Current Values & Remarks.
The previous submission is never autofilled as the new current values.
```

## B. Code responsibilities

| File | What to follow | Notes |
|---|---|---|
| `src/pages/DataEntry/DataEntry.jsx` | Step 1 dataset picker -> ensureSubmissionInstance -> persistDraft -> submitForReview | Validates selectedDatasetId; passes it in URL, never period ID |
| `src/services/idoSubmissionService.jsx` | `createSubmissionContext`, `resolveReportingCalendarId`, `createSubmissionTemplate`, `saveDraft`, `submitDraft` | Documented read/write gates; context HTTP errors include stage/status |
| `src/API/submission.jsx` | Exact endpoint spelling and HTTP methods | `/datasets/{id}/submission-context`, `/submissions`, `/submissions/{id}/values`, `/submissions/{id}/submit` |
| `src/utils/submissionContext.js` | financialYear/frequency/period -> context POST body | `2026/2027` -> `startYear:2026`; `Q2` -> `periodNumber:2` |
| `src/utils/submissionWorkflowTrace.js` | HTTP phase/status/validation messages | No Authorization headers or token logging |
| `src/utils/submissionValues.js` | PUT serializer, saved-values read-back, status lock | Dimension/value shape confirmed by supplied example (23 Oct); remarks and multi-dimension intersection rules still need confirmation |
| `src/API/axios.jsx` | Bearer token, server baseURL | Browser Network: capture URL, method, status and safe response only |
| `src/pages/Admin/ApprovalCircle.jsx` | MOA/IA create/edit/activate/clone UI | Unpaginated GET search/page handled locally |
| `src/API/approvalCircle.jsx` | Verified Approval Circle routes | Laravel infers scope; POST/PUT never sends institution_id |
| `src/utils/approvalCircleContract.js` | Pure workflow POST/PUT payload builder | IA: own institution; MOA: global ministry |

## C. Troubleshooting if `POST /datasets/6/submission-context` fails

| Status | Likely issue and what to check |
|---|---|
| 400/422 | Confirm body exactly `{startYear,frequency,periodNumber}`; period number in range, dataset active and period valid; read `errors` response |
| 401 | Bearer token invalid/expired; check auth in frontend |
| 403 | User role, dataset institution scope, responsible officer assignment or backend policy restricts access |
| 404 | Exact route `/datasets/{datasetId}/submission-context` missing, wrong API prefix or dataset ID not present |
| 409 | Duplicate context/period: GET `/datasets/{datasetId}/reporting-calendar` and find exact reportingPeriodId; do not blindly repost |
| 500 | Laravel server exception; check Laravel logs (frontend never displays server stack trace) |
| NO RESPONSE | Network/CORS/backend down; inspect URL & Request Method in DevTools |

**Example debugging in Chrome**: F12 -> Network -> Fetch/XHR -> choose `submission-context` -> inspect Request URL, Request Payload, HTTP Status and Response JSON. Do not share tokens.

**Critical distinction:** The new document includes contract for `/datasets/{id}/dimensions`, targets, activation and version snapshots but DOES NOT include an example RESPONSE for `POST /datasets/{id}/submission-context`. Therefore the frontend accepts a documented `reportingCalendarId` (or a bare ID compatibility fallback), and uses an EXACT scoped calendar match when that value is absent. Ask the backend team to confirm context response explicitly to remove this ambiguity.

**PUT /submissions/{id}/values:** The backend team's updated 23-Oct contract replaces `dimensionValues` in the outbound JSON with `breakdowns`. `values` is an array of one object **per indicator**, with `{indicatorId, value, remarks, breakdowns:[{dimensionId,optionId,value}]}`. The total (`values[].value`) is separate from each breakdown count (`breakdowns[].value`). The UI internally uses `dimensionValues["indicatorId:dimensionId:optionId"]` but the serializer translates this into grouped breakdowns. `expectedRevision` comes from `GET /submissions/{id}`; never invent a revision. GET read-back checks indicator totals, remarks and breakdowns before confirming Save Draft. Completely blank Drafts retain their submission ID without a dummy PUT. Clearing all saved values remains blocked until Laravel supplies a clear/delete contract. See `docs/SUBMISSION_VALUES_DIMENSION_CONTRACT_20261023.md` for the exact five-breakdown example.

## D. Approval Circle — confirmed Laravel contract #62–68

| Action | Method/path | Scope and rule |
|---|---|---|
| List | GET `/approval-circles` | NOT paginated. Laravel filters MOA-global / IA-own institution |
| Create Draft | POST `/approval-circles` | `{name,steps:[...]}` only; NO institution_id / department_id / scope_key |
| Read | GET `/approval-circles/{id}` | Full ordered steps; outside scope returns 404 |
| Replace Draft | PUT `/approval-circles/{id}` | `{name,steps:[...]}`; draft only; ALL step IDs recreated |
| Update Draft Step | PUT `/approval-circle-steps/{step}` | Allowed fields; refresh all step IDs after success |
| Activate | POST `/approval-circles/{id}/activate` | Required approval sequence validated; previous active in SAME scope retires |
| Clone | POST `/approval-circles/{id}/clone` | Returns NEW draft/version; activate separately |

**Ministry (MOA)**: only global workflow, ministry-level `review`, `approve`, exactly one final `publish`; cannot assign specific `assigned_user_id` to ministry steps. Sample required role codes `MDO`, `MDD` (examples; use actual backend roles).

**Institution (IA)**: only own institution; may assign matching institution users; must end at `approve` (no `publish`). Laravel determines institution from authenticated admin, not a posted institution picker.

**No deactivate route** was documented. Thus active workflow is immutable; **Clone as Draft -> Edit Draft -> Activate**. Existing submissions keep the pinned version they began with.

**Approval operations are distinct from approval administration:** `POST /submissions/{id}/{action}` for reviewer actions is a separate adapter and stays uninvoked until backend supplies accepted `action` enums and payload schema. No hardcoded HOD/next officer.

## E. Additional dataset API contracts newly supplied (#43–61)

These already have corresponding centralized calls in `src/API/dataset.jsx`:

- Dimensions: GET/POST `/datasets/{datasetId}/dimensions`, PATCH/DELETE `/datasets/{datasetId}/dimensions/{dimensionId}`. Attachment PATCH supports **only** `isRequired` and `displayOrder`; it must not attempt to edit `indicatorIds` or catalogue options.
- Dimension catalogue: GET `/dimensions`, GET/PATCH/DELETE `/dimensions/{id}`; no standalone POST `/dimensions`; PATCH excludes options, and code is immutable.
- Targets: GET/POST `/datasets/{datasetId}/targets`, GET/PATCH/DELETE `/datasets/{datasetId}/targets/{targetId}`. Numeric `targetValue` is a string, and targets are **not** the submitted current values.
- Activation: GET `/datasets/{datasetId}/configuration-progress`, POST `/datasets/{datasetId}/activate`, POST `/datasets/{datasetId}/draft`.
- Templates: GET `/datasets/{datasetId}/template-versions`, GET `/datasets/{datasetId}/template-versions/{versionId}`. Activated version is immutable and submissions should use snapshot, not mutable draft structure.
- Sectors: GET `/datasets/{datasetId}/sectors`.

### What remains unconfirmed (backend follow-up)

1. Exact **response JSON** for POST `/datasets/{datasetId}/submission-context` to identify calendar ID reliably.
2. Exact **request body** for PUT `/submissions/{id}/values` beyond confirmed `expectedRevision`, including dimension combinations and remark handling, plus exact location of revision in GET responses.
3. Allowed action names/payloads for POST `/submissions/{id}/{action}` and full approval inbox read API.
4. Exact returned statuses after POST `/submissions/{id}/submit` (frontend presently understands several common variants).

**Testing:** Automated source/contract tests can pass without a live Laravel database. A browser+Laravel integration test must verify IDs, status transitions and persistence before declaring production-ready.
