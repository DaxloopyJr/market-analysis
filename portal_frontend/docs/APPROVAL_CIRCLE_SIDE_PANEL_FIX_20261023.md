# VIWANDA PORTAL — Approval Circle Side Panel Fix (2026-10-23)

**Baseline:** `VIWANDA_REV26_APPROVAL_CIRCLE_UIUX_REFERENCE_V2_20261023_FULL_FRONTEND.zip`

## User-approved interaction

- Approval Circle Create / Edit opens as a **non-modal panel on the right of Workflow Details**.
- Workflow Versions table stays full width at the top. Workflow Details / steps remain visible on the left.
- **No screen-covering backdrop, no centered modal, no `aria-modal`**: the surrounding page remains usable.
- Close, Cancel, Create Workflow, and Save Draft Changes are retained.
- Narrow displays stack the panel above Workflow Details rather than shrinking controls below usable widths.

## Changed code

- `src/pages/Admin/ApprovalCircle.jsx`: position panel next to details; remove backdrop and modal semantics.
- `src/pages/Admin/approvalCircle.css`: in-page responsive two-column editor layout; remove fixed overlay styling.
- `tests/approval-circle-side-panel-not-modal.test.mjs`: regression checks for layout and API behavior preservation.

**No changes** to API services, submission handling, dataset management, user permissions, Approval Circle payloads, role/assignee logic, Sidebar, Topbar, or SweetAlert2 notifications.

## How to use

Extract the patch ZIP into the directory containing `portal_frontend`, overwrite matching files, and restart Vite. Open **Administration → Approval Circle**, then click **Create Workflow** or **Edit Draft** to verify the form appears on the **right** without hiding the rest of the page.

Regression tests: `cd portal_frontend && node --test tests/*.test.mjs`.

The tests validate source behavior only; live browser and Laravel API tests are not claimed.
