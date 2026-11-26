# Submission submit expectedRevision + IA Approval Circle menu (23 Oct 2026)

## Workflow from source
1. Officer selects a dataset/reporting period -> `POST /datasets/{datasetId}/submission-context`.
2. `POST /submissions` returns the ID/status (`Draft`).
3. `GET /submissions/{id}` provides the current revision; `PUT /submissions/{id}/values` uses `{expectedRevision,values}`; re-read using GET to confirm.
4. **Before Submit**, call `GET /submissions/{id}` again, since a successful value PUT can advance revision. `POST /submissions/{id}/submit` must send `{expectedRevision:<currentRevision>}`. Never hardcode revision and never send an empty body.
5. Laravel assigns to the next approval step from the pinned/active Approval Circle. Frontend must not hardcode HOD. Officer editing becomes locked only after Laravel confirms submit.
6. If Laravel returns 422, show validation keys; if revision absent, stop and leave it Draft.

## IA navigation
- `/me.permissions` containing `approval_circle.manage.institution` is sufficient to show Approval Circle, even when `/me.menu` omits it.
- Documented active IA role also shows the link if older `/me` lacks menu/permission. This is **navigation only**, NOT authorization; Laravel must grant `approval_circle.manage.institution` and enforce own-institution scope, or `GET /approval-circles` will return 403.
- MOA uses only `approval_circle.manage.ministry` and ministry/global workflow; no IA cross-institution access.
- Existing Approval Circle UI side panel, roles and save payload were not changed.

## Change set
`src/API/submission.jsx`, `src/services/idoSubmissionService.jsx`, `src/config/sidebarMenu.js`, regression tests and this document. Note base ZIP already incorporated previous correction `/submission/{id}/submit` -> `/submissions/{id}/submit`.
