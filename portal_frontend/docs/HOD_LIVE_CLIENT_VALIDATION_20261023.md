# HOD live indicator total validation (2026-10-23)

## Problem
Previously, `validateHodIndicator` ran only for a narrow class of indicators
when the Laravel snapshot returned an integer `dataType`. A count such as
`Number of Staff` could be normalized as `type: text` when `dataType` was absent,
so the UI silently treated all breakdown categories as valid. Dimension
attachments with singular `indicatorId` were also not always mapped, preventing
per-category validation from running.

## Implementation
- `hodReviewRules.js` recognizes unambiguous count indicators by configured
  aggregation rule or label, even without backend type metadata. Explicit
  non-additive indicators are excluded.
- `categoriesForIndicator` maps either `indicatorIds[]` or `indicatorId`, and
  uses saved `dimensionValues` keys to display unmatched references as
  **unverified**, not falsely valid.
- `validateHodIndicator` computes separate totals for each dimension category
  on every state change (e.g. Gender 30+20=50; Role 35+15=50).
- The HOD UI immediately shows each category's total, mismatches and field
  errors; Save and Review cannot proceed when additive totals are invalid.
- `saveHodReview` validates again in the service before any PATCH is sent.
- Data Officer Data Entry accepts both singular and plural indicator mappings.

## Distinct Laravel error
`HTTP 422: A correction cannot change the reporting format` is not the same as
`breakdown total does not equal indicator total`. It may arise from server-side
business restrictions even when all client-side counts match. The frontend now
shows a user-friendly explanation; it does **not** bypass or claim to fix the
backend reporting-format rule. Validate the precise Laravel PATCH response and
submission method if this remains.

## Confirmed APIs unchanged
- HOD correction: `PATCH /submissions/{id}/values` with `expectedRevision`,
  `reason`, and `values[]` records.
- Officer draft: `PUT /submissions/{id}/values` (separate flow).
- Routing: `POST /submissions/{id}/review|return|approve|publish` according
  to permission and configured workflow.

## Scope
No changes to approved HOD Inbox/History layout, Approval Circle, Sidebar,
notification popup, or SweetAlert2 toast design.
