# VIWANDA Portal — Submission Values Contract (backend team, 23 October 2026)

## Confirmed PUT body and route

`PUT /submissions/{id}/values` (lowercase, **plural `values`**):

```json
{
  "expectedRevision": 4,
  "values": [
    {
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
    }
  ]
}
```

`expectedRevision` comes from the latest `GET /submissions/{id}`, not a fixed constant. One **indicator** has one values[] record: overall Current Value, Remarks, and all of its independent By Gender / By Role (etc.) `breakdowns`.

The existing React inputs retain their shape: `values['8'] = '123'`, `remarks['8'] = 'Idadi ya staff mwisho wa kipindi'`, `dimensionValues['8:2:3'] = '70'`. `src/utils/submissionValues.js` is the **single** converter into Laravel JSON; the name `dimensionValues` is internal React state only. `dimensionValues` **must not** appear as a request field. `breakdowns[].value` is the count/metric for the selected `optionId`, whereas `values[].value` is the indicator total. All five breakdowns can be attached to indicator 8 in one call. `0` is a valid value; an absent total is represented as JSON `null` (subject to Laravel's field-type rules).

## Draft and Submit lifecycle

1. User selects persisted Dataset ID -> `POST /datasets/{datasetId}/submission-context` `{startYear,frequency,periodNumber}`. HTTP 403 at this step is a permission/assignment/scope failure, **not** a breakdown JSON failure.
2. Use returned `reportingCalendarId` -> `POST /submissions` to create its own ID/status; a fresh period has empty values.
3. `GET /submissions/{id}` supplies the **latest** optimistic-lock revision and existing draft values.
4. `PUT /submissions/{id}/values` sends the JSON above (only when something has been entered), then `GET /submissions/{id}` must verify Current Value, Remarks and option-specific breakdowns before indicating Save succeeded.
5. `POST /submissions/{id}/submit` includes fresh `expectedRevision` and routes the existing ID through the assigned Approval Circle; editing locks when Laravel changes status.
6. Returned submissions may resume editing the **same** ID. New submissions never prefill past-period current values.

**Read-back:** `normalizeSubmissionRecord` maps backend `breakdowns:[{dimensionId,optionId,value}]` back to React's `dimensionValues['indicator:dimension:option']` fields. It still understands old GET formats for historical records only. This document supersedes the previous `dimensionValues:[{dimensionId,value:optionId}]` request example.

**Scope:** Changes are restricted to the Submission values mapper, its API/service comments, one Data Entry explanation, this documentation and regression tests. Approval Circle, Dataset Builder, Sidebar, Toast and unrelated API calls are unchanged. Unit tests validate the supplied request/response shapes; real Laravel integration tests are still required.
