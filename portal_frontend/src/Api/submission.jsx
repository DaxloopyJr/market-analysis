/**
 * Submission API – supplied Laravel routes, 22 Oct 2026.
 * DataEntry / My Submissions -> idoSubmissionService -> this module -> axios -> Laravel.
 * IMPORTANT: Route segments are case-sensitive; use lowercase /submissions for all plural submission paths.
 * IA/MOA approval-circle administration is NOT modified by this file.
 */
import api from './axios';
import { operationResult, listResult, validationErrors } from './resourceHelpers';
import {approvalActionPayload, APPROVAL_ACTIONS} from '../utils/submissionApprovalActions.js';

function checkedId(value, name = 'submission') {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error(`A valid ${name} ID is required.`);
  return encodeURIComponent(String(id));
}
export async function postSubmissionContext(datasetId, payload) {
  return operationResult(await api.post(`/datasets/${checkedId(datasetId, 'dataset')}/submission-context`, payload));
}
export async function postSubmissionTemplate(reportingCalendarId) {
  const id = Number(checkedId(reportingCalendarId, 'reportingCalendar'));
  return operationResult(await api.post('/submissions', { reportingCalendarId: id }));
}
export async function listSubmissionsPage(params = {}) {
  return listResult(await api.get('/submissions', { params }));
}
export async function fetchSubmission(id) {
  const response = await api.get(`/submissions/${checkedId(id)}`);
  // Preserve the full envelope: some Laravel responses expose `revision`
  // beside `data`, not inside the submission record itself.
  return {...operationResult(response), envelope:response.data};
}
/**
 * PUT /submissions/{id}/values – exact path and body structure:
 * {expectedRevision, values:[
 *   {indicatorId, value, remarks, breakdowns:[{dimensionId,optionId,value}]}
 * ]}
 * `value` is the indicator total; each breakdown `value` is the count for
 * that dimension option. The serializer lives in utils/submissionValues.js.
 * HTTP 403 at POST /datasets/{datasetId}/submission-context is a distinct
 * Laravel authorization/scope issue: changing this PUT body cannot fix it.
 */
export async function putSubmissionValues(id, payload) {
  const path = `/submissions/${checkedId(id)}/values`;
  try {
    return operationResult(await api.put(`/submissions/${checkedId(id)}/values`, payload));
  } catch(error) {
    if (error?.response?.status === 422) {
      // Laravel's generic message may only say "(and 1 more error)".
      // Display ALL returned validation field keys so the backend contract
      // discrepancy can be corrected without repeated guesswork.
      const errors = validationErrors(error);
      const details = Object.entries(errors).map(([field, message]) => `${field}: ${message}`).join(' | ');
      const generic = typeof error.response?.data?.message === 'string' ? error.response.data.message : 'Validation failed';
      const result = new Error(`Save Draft rejected (HTTP 422, PUT ${path}): ${details || generic}`.slice(0, 1200));
      result.cause = error;
      throw result;
    }
    throw error;
  }
}
/**
 * CONFIRMED HOD correction endpoint (23 October 2026):
 * PATCH /api/v1/submissions/{submissionId}/values
 * { expectedRevision: 1, reason: "...", values:[{indicatorId:8,value:"125"}] }
 * Our shared Axios client already prefixes /api/v1. Do not prefix it again.
 * Optional breakdowns/remarks on PATCH need explicit Laravel validation confirmation.
 */
export async function patchSubmissionReviewValues(id, payload) {
  const path = `/submissions/${checkedId(id)}/values`;
  try {
    return operationResult(await api.patch(path,payload));
  } catch(error) {
    if(error?.response?.status===422) {
      const fields=Object.entries(validationErrors(error)).map(([field,msg])=>`${field}: ${msg}`).join(' | ');
      const exception=new Error(`HOD Review PATCH rejected (HTTP 422, PATCH ${path}): ${fields||error.response?.data?.message||'Validation failed'}`);
      exception.cause=error;
      throw exception;
    }
    throw error;
  }
}

/** SUBMIT ROUTE — POST /submissions/{id}/submit (plural, lowercase).
 * REQUEST BODY: {expectedRevision: GET /submissions/{id}.revision}.
 * This is NOT the revision used on the previous PUT: always GET the current one.
 * Keep the existing submission ID; Laravel selects the next approver using
 * the active/pinned configured approval circle and locks officer editing.
 * The former singular /submission/{id}/submit returned HTTP 404.
 * Backend route registration must still be verified by Laravel route:list.
 */
export async function postSubmitSubmission(id, {expectedRevision} = {}) {
  // Laravel requires an optimistic-lock revision on FINAL SUBMIT as well as
  // PUT values. Read it from GET /submissions/{id}; do not guess 0 or 1.
  if (expectedRevision === undefined || expectedRevision === null ||
      !Number.isSafeInteger(Number(expectedRevision)) || Number(expectedRevision) < 0 ||
      String(expectedRevision).trim() === '') {
    throw new Error('The submission could not be sent because it changed. Reload it and try again.');
  }
  const path = `/submissions/${checkedId(id)}/submit`;
  try {
    return operationResult(await api.post(path, {expectedRevision:Number(expectedRevision)}));
  } catch (error) {
    if (error?.response?.status === 422) {
      const details = Object.entries(validationErrors(error))
        .map(([field,message]) => `${field}: ${message}`).join(' | ');
      const failure = new Error(`Submit rejected (HTTP 422, POST ${path}): ${details || error?.response?.data?.message || 'Validation failed'}`.slice(0,1200));
      failure.cause = error;
      throw failure;
    }
    throw error;
  }
}
/**
 * CONFIRMED APPROVAL ACTIONS (23 October 2026).
 * HOD/reviewers POST /submissions/{id}/review, approvers /approve,
 * reviewers /return, final ministry publisher /publish.
 * Payloads validated in submissionApprovalActions.js; never use /forward.
 * The backend selects the next approver from the pinned Approval Circle.
 */
export async function postSubmissionApprovalAction(id, action, input = {}) {
  if (!APPROVAL_ACTIONS.includes(action)) throw new Error(`Invalid approval action: ${action}`);
  const path = `/submissions/${checkedId(id)}/${action}`;
  const payload = approvalActionPayload(action,input);
  try {
    return operationResult(await api.post(path,payload));
  } catch (error) {
    const code=error?.response?.status;
    if(code===422 || code===409) {
      const fields=Object.entries(validationErrors(error)).map(([field,msg])=>`${field}: ${msg}`).join(' | ');
      const message=fields || error.response?.data?.message || (code===409?'Next recipient unavailable or revision conflict.':'Validation failed');
      const failure=new Error(`Approval ${action} rejected (HTTP ${code}, POST ${path}): ${message}`);
      failure.cause=error;
      throw failure;
    }
    throw error;
  }
}
export const postReviewSubmission=(id,input)=>postSubmissionApprovalAction(id,'review',input);
export const postApproveSubmission=(id,input)=>postSubmissionApprovalAction(id,'approve',input);
export const postReturnSubmission=(id,input)=>postSubmissionApprovalAction(id,'return',input);
export const postPublishSubmission=(id,input)=>postSubmissionApprovalAction(id,'publish',input);
