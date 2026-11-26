# VIWANDA Approval Circle IA role and assigned user fix — 23 October 2026

## Reason for this patch

The old **Applicable User Roles** control in Additional Information displayed `/roles` options only when the user had `roles.manage`. That permission is MOA-only; IA saw no options. Worse, `role_ids` from that control were never persisted by the verified Approval Circle API.

## Actual Laravel-driven workflow

- Authenticated IA (`approval_circle.manage.institution`): **only own institution**. An IA who also has `users.manage.institution` can call `GET /users` via existing `src/API/users.jsx`. The backend must enforce institution scope. The UI rejects explicit mismatched `institution_id` and inactive users; `GET /users` must itself remain authorization-protected.
- IA selects an **Approver Role/Position** and (optionally) **Assigned User** in **Step 2: Approval Levels**. Role codes come from authorized scoped user data, plus known scoped approval-circle steps, not from an invented endpoint. The selected role filters users when role metadata is available; if absent, Laravel must validate eligibility on write.
- IA **without `users.manage.institution` permission** cannot load the user dropdown through the supplied `/users` contract. The UI shows this explicitly and allows role-based assignment without `assigned_user_id`. Backend team must grant the authorized permission or provide a dedicated scoped approval-assignees endpoint if named assignees are mandatory.
- Authenticated MOA (`approval_circle.manage.ministry`): global ministry-level workflow only; `GET /roles` if `roles.manage`; `assigned_user_id` is never sent for ministry steps. Ministry publish stage stays available; institution publish is blocked.
- `POST /approval-circles` and `PUT /approval-circles/{id}` receive `name` and `steps[]`, each with `step_name`, `required_role_code`, `action`, `level`, `can_return`, and **optional** `assigned_user_id` for IA. `institution_id`, `department_id`, and `scope_key` are not sent.
- Active workflow is immutable; Clone -> edit Draft -> Activate. Running submissions remain on their previously pinned workflow version.

## Files changed

- `src/pages/Admin/ApprovalCircle.jsx`: move role/assignee selection to Approval Levels; remove unsaved Applicable User Roles selector; IA scoped user load; read-only Step 3 workflow summary.
- `src/utils/approvalCircleAssignees.js`: pure helpers for scoped role/user options.
- `tests/approval-circle-ia-role-user-regression.test.mjs`: regression tests.

No changes to Data Entry, Submission, Dataset Builder, SweetAlert2 toast, Sidebar, Axios configuration, or Laravel backend.

## UAT checklist

1. Login as IA with `users.manage.institution`; open Approval Circle → Add → Approval Levels → Add Level. Check role and user dropdowns show only users in own institution.
2. Select HOD and an assigned user. Save Circle. Check `POST /approval-circles` payload has the selected `required_role_code` and numeric `assigned_user_id`, and no client-controlled scope fields.
3. Login as IA without Users permission: a specific permissions message appears; user list is not fabricated.
4. Login as MOA: only ministry roles and actions; no Assigned User control; cannot create institution workflow.
5. Verify Step 3 lists actual configured approval levels rather than an unsaved Applicable User Roles field.
6. Test Activate, Clone, Edit Draft. Final Submit routing needs Laravel live testing separately.
