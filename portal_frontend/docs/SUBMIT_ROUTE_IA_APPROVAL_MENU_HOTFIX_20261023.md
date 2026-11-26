# VIWANDA REV26 — Submission Submit 404 & IA Approval Circle visibility

## Submission workflow (no template/values change)
1. `POST /datasets/{datasetId}/submission-context` — dataset ID and reporting details.
2. `POST /submissions` — create the submission record, receive its ID/status.
3. `PUT /submissions/{id}/values` — persist values with `expectedRevision`.
4. `GET /submissions/{id}` — verify draft and current revision.
5. **`POST /submissions/{id}/submit`** — send the SAME ID to the configured approval workflow. The previously used `POST /submission/{id}/submit` returned 404 in the user's environment; only the URL was updated.
6. Laravel selects the next review step based on the active/pinned Approval Circle, no frontend hard-coded HOD routing.

**API validation:** The package tests exact client-side strings but cannot inspect a live Laravel route table. Backend team should verify `php artisan route:list --path=submissions` (including method POST and API prefix). A 404 with the plural endpoint would mean Laravel route registration still differs.

## Institution Admin (IA) Approval Circle visibility
- `src/config/sidebarMenu.js` uses explicit `/me.permissions` to expose the Approval Circle entry even if `/me.menu` omits its root or child.
- An IA must have `approval_circle.manage.institution` to see it. MOA uses `approval_circle.manage.ministry`. These roles remain separately scoped by Laravel.
- The change **does not grant permission**, override IA institution scope, modify API queries or change Approval Circle's UI.
- If IA permissions omit the grant, the menu remains hidden. Backend must fix `/me.permissions` / the role assignment. If the menu is visible but GET `/approval-circles` responds 403, check Laravel policy, not sidebar.

## Unchanged
Dataset management, dimension values payload, Save Draft serializer, SweetAlert2 toast, Approval Circle side-panel UI and approval-level restrictions.
