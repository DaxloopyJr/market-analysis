# VIWANDA REV26 — Reference Management: Code Flow & API Integration

**Scope:** Reference Management (Reference Types + their Reference Values).  
**Route:** `/dashboard/reference-data` under *Dataset Management*.  
**Approved UI:** `VIWANDA_REFERENCE_MANAGEMENT_UIUX_REVIEW.zip` / screenshots; Types/Values tabs, same REV26 layout, bordered table and Add/Edit/View modals.  
**Data source:** remote Laravel API; **no hardcoded SECTOR/UNIT master records**.

## 1. Trace the code

```text
Sidebar (Dataset Management / Reference Data)
  └─ src/config/sidebarMenu.js (server menu + reference_data.manage fallback)
  └─ src/config/moduleRoutes.js -> src/App.jsx
     └─ src/pages/ModulePage/ReferenceData.jsx
        ├─ tabs: Reference Types / Reference Values
        ├─ status filter; client search within returned page; pagination
        ├─ Dialog: Add/Edit/Details; confirmation: Activate/Deactivate
        └─ src/API/referenceData.jsx
           └─ src/API/axios.jsx (remote Laravel /api/v1)
              └─ /reference-data and /reference-data/{typeId}/values
```

CSS: `src/pages/ModulePage/referenceData.css` plus existing `src/pages/Admin/institutions.css` and `src/styles/admin-table-borders.css`.

## 2. Reference Types versus Values

- A **Type** is a group, e.g., an actual Laravel record whose `data_type_code` is `SECTOR` or `UNIT`.
- A **Value** is a selectable record within exactly one Type. `parent_id` references **another value of the same Type**, not a Type ID. This permits nested sectors/subsectors.
- `value` is a nullable text attribute on a reference value. `effectiveFrom` and `effectiveTo` are **optional** dates. Inactive or expired/not-yet-effective values should not appear as active Dataset Builder choices.
- `DELETE` means **deactivate preserving history**, not hard-delete. `PATCH status:"active"` reactivates subject to Laravel rules.
- The type list API does **not** expose `valuesCount`, so the approved implementation omits a fictitious count. Search is current-page client-side because no server `search` parameter was documented.

## 3. Verified endpoint map

| UI operation | Method | Endpoint | Service function |
|---|---|---|---|
| Types list | GET | `/reference-data` | `listReferenceTypes` |
| Type details | GET | `/reference-data/{id}` | `getReferenceType` |
| Create Type | POST | `/reference-data` | `createReferenceType` |
| Edit Type | PATCH | `/reference-data/{id}` | `updateReferenceType` |
| Deactivate Type | DELETE | `/reference-data/{id}` | `deactivateReferenceType` |
| Reactivate Type | PATCH | `/reference-data/{id}` | `reactivateReferenceType` |
| Values of one Type | GET | `/reference-data/{id}/values` | `listReferenceValues` |
| Value details | GET | `/reference-data/{id}/values/{valueId}` | `getReferenceValue` |
| Create Value | POST | `/reference-data/{id}/values` | `createReferenceValue` |
| Edit Value | PATCH | `/reference-data/{id}/values/{valueId}` | `updateReferenceValue` |
| Deactivate Value | DELETE | `/reference-data/{id}/values/{valueId}` | `deactivateReferenceValue` |
| Reactivate Value | PATCH | `/reference-data/{id}/values/{valueId}` | `reactivateReferenceValue` |

**GET authorization:** active authenticated users (subject to backend authentication). **Mutation authorization:** `reference_data.manage` (seeded MOA and IA) — buttons hidden if permission absent and backend is final authority. `/api/me` menu items are still backend-driven; existing menu fallback supports managers.

## 4. Fields used in UI and API

**Type POST/PATCH input (camelCase):** `dataTypeCode` (required/unique), `dataTypeNameEn` (required), `dataTypeNameSw`, `descriptionEn`, `descriptionSw`, `status` (`active`/`inactive`).

**Value POST/PATCH input (camelCase):** `dataValueCode` (required/unique within Type), `dataValueNameEn` (required), `dataValueNameSw`, `parentId` (same-Type value ID or `null`), `value` (`string|null`), `effectiveFrom`, `effectiveTo` (`YYYY-MM-DD|null`), `status`.

**Read response:** Laravel Type and Value fields are `snake_case` (`data_type_code`, `data_value_name_en`, `parent_id`, etc.). `src/API/referenceData.jsx` translates form input correctly. Laravel `errors` from 422 surface in the form via `src/API/resourceHelpers.js`.

## 5. How Dataset Builder uses Reference Management

```js
// Usage inside the Dataset page; these requests are LIVE, not hardcoded lists.
import { getActiveReferenceOptions } from '../../API/referenceData';
const sectors = await getActiveReferenceOptions('SECTOR');
const units = await getActiveReferenceOptions('UNIT');
```

`getActiveReferenceOptions(code)` fetches reference type records, finds the matching active type, then gets its paginated active/effective values. The result contains `{id,code,label,labelSw,parentId,value}`. Dataset Builder uses **value IDs** for sector/subsector and numeric unit selection, never the reference Type ID.

## 6. Testing and deployment

Run `node --test tests/dataset-reference-contract.test.mjs` for contract smoke checks. With dependencies installed run `npm run build` and test in a live browser using a real remote Laravel account. Validate status filters, two tabs, View/Edit/Add modals, Parent Value selection, optional date handling, 403/422 responses, soft deactivation and reactivation, and Dataset sector/unit dropdown reflecting changes. **Do not activate unsupported API calls or pretend to save local sample rows.**

**Note:** Reference Values can exceed one API page; `getReferenceValueOptions` paginates up to a guarded limit (5000). The main table itself remains server-paginated. If this becomes too large, ask backend for a server-side search endpoint.

## 7. Dataset wizard UI dependency (2026-10-21)

Dataset Management renders persistent, backend-confirmed green step completion ticks.
This change does **not** affect Reference Management APIs, its approved tabs/modals, or reference lookup semantics.
The Dataset indicators and source pickers continue to read reference type `SECTOR` and `UNIT`
using only value IDs returned by this module. No hardcoded IDs or mock records were added.
