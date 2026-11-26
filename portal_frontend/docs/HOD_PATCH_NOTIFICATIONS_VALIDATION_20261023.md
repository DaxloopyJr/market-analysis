# VIWANDA REV26 — HOD Review, Notifications, Validation (23 Oct 2026)

## Version / patch safety
Base: `VIWANDA_REV26_HOD_APPROVED_REFERENCE_UI_NOTIFICATIONS_20261023_FULL_FRONTEND.zip`.
Apply the PATCH over that exact baseline, or use the accompanying full frontend.
No changes to Dataset Builder, Approval Circle configuration, Sidebar styles, or the approved compact SweetAlert2 toast.

## 1. Notification bell and page
- Topbar **bell opens a compact right-aligned popover**, without navigating directly.
- It displays up to six recent messages from `GET /notifications`.
- Unread count comes from `GET /notifications/unread-count`.
- Selecting a message marks it read via `PATCH /notifications/{id}/read` and opens the dedicated Notifications page.
- "View all notifications" is the only explicit full-page navigation from the popover.
- The Notifications page is redesigned in the VIWANDA dashboard's white/navy/blue style, with summary cards, filters, search, list and a details panel.
- Uses authenticated user's notifications only. The frontend never fabricates notifications for approvers.

## 2. Three-step HOD history, same UI everywhere
- `HodApprovalJourney.jsx` is shared by HOD Inbox and Review.
- Visual stages are exactly **Submitted → Under Review (Current) → Next Step**.
- The next approver is taken from submission's `nextStep` or pinned Approval Circle ordered steps. Role code `AO` displays "Account Officer". No hardcoded approver for all submissions.
- Inbox fetches `GET /submissions/{id}` for the selected item so the right-side timeline can use the full current workflow where available.

## 3. HOD edits: PATCH, not Data Officer PUT
Confirmed route: `PATCH /api/v1/submissions/{submissionId}/values`.
The shared Axios client already prefixes `/api/v1`, so the code calls `/submissions/{id}/values`.

**Confirmed request for changing an indicator total:**
```json
{
  "expectedRevision": 1,
  "reason": "Kusahihisha idadi ya staff iliyokosewa.",
  "values": [{"indicatorId": 8, "value": "125"}]
}
```

- `saveHodReview` reads fresh revision with GET, builds a PATCH of **changed indicator records only**, submits it, then GETs to verify the changed values.
- A correction **reason is mandatory**. It is entered in the review comment field.
- Editing breakdowns or indicator remarks includes those fields within changed indicator records (using the known PUT shape); **Laravel PATCH acceptance of these optional fields has not been explicitly confirmed**. A 422 will be shown, never counted as a successful save.
- Forward and Return remain subject to the backend's exact `{action}` enumeration and authorization; their contracts were not expanded by this update.

## 4. Live data validation
- Both Data Entry and HOD Review calculate each additive/headcount category separately.
- Example: Staff=50; Gender=30+20=50 and Role=35+15=50. They are **not added together**.
- A mismatch, missing category value, negative number or fractional headcount produces an inline error and blocks final Submit/Forward.
- Data Entry marks fields touched on edits to show immediate feedback. Incomplete Save Draft is still allowed where the backend permits it.
- Only count/additive fields or explicitly configured `aggregationRule` use sum-to-total checks; percentages/averages are not forced to add up.
- Laravel validation remains authoritative.

## Checks
- Node regression tests cover exact HOD PATCH body, changed-only rows, breakdowns, validation, dropdown integration, and three-stage history.
- Syntax parsing uses TypeScript's JSX parser. These are source/unit checks; they do **not** establish successful live Laravel responses or visual browser rendering.
