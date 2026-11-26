# VIWANDA Portal — Save Values Before Submit (23 Oct 2026)

## Problem resolved

The previous `DataEntry.jsx` submit handler used the local `hasUnsavedChanges` and `savedVersion` flags to decide whether to call `persistDraft()`. When the user clicked **Submit** after having already saved a draft, that branch skipped the PUT and the only visible HTTP request was `POST /submissions/{id}/submit` with `{"expectedRevision": 5}`. This was misleading: the backend team's **full values payload is for PUT /submissions/{id}/values**, not for the final status-transition POST.

## Correct sequence (every Submit click)

1. Read the current Data Entry fields: indicator total/current value, per-indicator remarks, and one value per selected dimension option.
2. Ensure a valid persisted submission ID; POST context/template only if this submission has not yet been created.
3. `GET /submissions/{id}` retrieves **latest** revision, checks Draft/Returned editability.
4. **Always** `PUT /submissions/{id}/values` using the confirmed payload:

   ```json
   {
     "expectedRevision": 4,
     "values": [{
       "indicatorId": 8,
       "value": "123",
       "remarks": "Idadi ya staff mwisho wa kipindi",
       "breakdowns": [
         {"dimensionId": 2, "optionId": 3, "value": "70"},
         {"dimensionId": 2, "optionId": 4, "value": "23"},
         {"dimensionId": 2, "optionId": 5, "value": "30"},
         {"dimensionId": 4, "optionId": 8, "value": "73"},
         {"dimensionId": 4, "optionId": 9, "value": "50"}
       ]
     }]
   }
   ```

   Values are populated from live form state, and the revision is read from Laravel; neither are hardcoded.
5. `GET /submissions/{id}` confirms that the **same total, remarks and breakdown values** persisted. On failure, stop: **do not submit**.
6. `GET /submissions/{id}` retrieves the revision again (a PUT may increment it), then `POST /submissions/{id}/submit` sends **only** `{"expectedRevision": latest}`. That POST changes the submission status and hands the **same ID** into the configured Approval Circle. It does not accept the indicator rows under the known contract.
7. GET the submission once more to verify the locked/review status. If save or submit fails, show the error and leave the form in Draft/Returned status if Laravel has not transitioned it.

**Key distinction:** Seeing only `expectedRevision` in **POST /submit** is normal; **the immediately preceding PUT /values** must contain the full indicator/breakdowns payload. Check both Network requests separately.

### Impact scope

- `src/pages/DataEntry/DataEntry.jsx` — only Submit sequence and concise flow comments; wizard, table and layout unchanged.
- `tests/submit-always-persists-values-before-approval-20261023.test.mjs` — regression tests for sequence and backend payload.
- No edits to Approval Circle, Dataset Builder, Axios, Sidebar, or SweetAlert2 toast.

## Live verification not yet done

Requires a real Laravel session with correct dataset/role permissions, a writable Draft, and the documented GET revision and values read-back format.
