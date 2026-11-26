# REV26 — Global notifications and Draft Values contract

## Global Toast workflow
`src/components/Toast/ToastProvider.jsx` -> `src/utils/portalAlerts.js` -> SweetAlert2.
All `useToast().showToast({ type, title, message, duration })` and legacy informational `Swal.fire({icon,title,text})` pass through one top-right SweetAlert2 toast style.
Supported types: `success`, `error`, `warning` / `attention`, `info` / `details`.
**Destructive / workflow confirmations still use SweetAlert2 interactive modal with Confirm/Cancel.**
No `toastr` runtime imports are needed. Toast rendering is plain text (not injected HTML).

## Save Draft workflow (single source of truth)
Data Entry -> `src/services/idoSubmissionService.jsx` -> `src/utils/submissionValues.js` ->
`src/API/submission.jsx` -> `PUT /submissions/{id}/values` -> `GET /submissions/{id}` read-back.
The submission ID is from `POST /submissions` (not the dataset ID).
The required `expectedRevision` is read from GET. Never guess it.

Laravel 422 has confirmed:
- `values.0` must be an array (PHP associative array; JSON **object**).
- `values.0.indicatorId` is required.
- `values.0.value` must be present, even if empty/null.

Correct container shape, **not** nested arrays:

```json
{
  "expectedRevision": 2,
  "values": [
    { "indicatorId": 8, "value": "20", "remarks": "Verified" }
  ]
}
```

Bad shape that masked named keys: `"values": [[{"indicatorId":8,"value":"20"}]]`.
This change addresses the reported dot-key errors; **live Laravel Save Draft remains unverified** and the exact extra dimensions/remarks write schema still needs a backend sample.
Draft stays editable; submit locks it and delegates approvers to the backend approval circle.
