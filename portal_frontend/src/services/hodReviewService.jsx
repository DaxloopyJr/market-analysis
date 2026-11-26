/**
 * VIWANDA: HOD Approval Inbox -> Review Details -> Save Review -> Forward/Return.
 * GET list/detail, HOD PATCH values and POST approval actions use the
 * exact Laravel contracts confirmed on 23 October 2026.
 * Authorization and institution/department scoping MUST be enforced by Laravel.
 */
import { fetchSubmission, patchSubmissionReviewValues, postSubmissionApprovalAction } from '../API/submission';
import {allSubmissionRows, cachedSubmissionDetail, listCarriesHistory, listRowIsComplete,mayHavePassedStep} from './submissionReadService.js';
import { normalizeSubmissionRecord, submissionExpectedRevision } from '../utils/submissionValues';
import { getDatasetIndicators, getDatasetDimensions } from './idoSubmissionService';
import { canHodAct, canHodReopenReturned, hodInboxRows, hodHistoryRows, reviewerAssignment, reviewValueIssues } from '../utils/hodReviewRules';
import { buildHodReviewPatch, hodPatchMatches } from '../utils/hodReviewPatch';
import {approvalAccess} from '../utils/submissionApprovalActions.js';
import {loadVerifiedHodHistory} from '../utils/hodHistoryData.js';

export async function getHodSubmissions(user,{history=false}={}) {
  // Shared list: pages in parallel, cached 45 s, cleared by any submission write.
  const raw=await allSubmissionRows();
  const rows=raw.map(normalizeSubmissionRecord);
  // Backend must return current assignedUserId/currentStep.assignedUserId.
  // Fail closed if it does not: NEVER show all drafts as an approval inbox.
  if(!history)return hodInboxRows(rows,user);
  // 16 Nov 2026: without history in the list (original backend) no detail read per row; office-level list of
  // submissions past the HOD step.
  if(!listCarriesHistory(raw))return rows.filter(row=>mayHavePassedStep(row.raw??row,['IDO','DDO','IHOD','HOD']));
  // History: rows whose list item already carries its history are judged as they are (no detail read).
  // Drafts and rows still waiting at the HOD step have no HOD decision yet: no detail read (5 Nov 2026).
  const complete=new Set(raw.filter(row=>listRowIsComplete(row)||!mayHavePassedStep(row,['IDO','DDO','IHOD','HOD'])).map(r=>String(r.id)));
  return loadVerifiedHodHistory(rows,user,id=>complete.has(String(id))?Promise.reject(Object.assign(new Error('complete'),{skip:true})):cachedSubmissionDetail(id));
}
/**
 * GET /submissions/{id} includes an immutable template/snapshot. Prefer it for
 * HOD: dataset definition GET /datasets/{id}/indicators|dimensions may be
 * denied to HOD and may already have changed since this was submitted.
 */
export function snapshotReviewDefinitions(record) {
  const snapshot = record.template?.template_content ?? record.template?.templateContent ?? record.template?.template ?? record.template ?? {};
  const indicatorRows = Array.isArray(snapshot.indicators) ? snapshot.indicators : [];
  const indicators = indicatorRows.map(link=>{
    const row=link.indicator ?? link;
    const id=Number(row.id ?? link.indicatorId);
    return {id,key:String(id),label:row.nameEn ?? row.name_en ?? row.label ?? `Indicator ${id}`,
      description:row.descriptionEn ?? row.description_en ?? '',
      type:['integer','decimal','number','numeric','count','bigint'].includes(String(row.dataType??row.data_type).toLowerCase())?'number':'text',
      precision:['integer','count','bigint'].includes(String(row.dataType??row.data_type).toLowerCase())?0:undefined,
      raw:link};
  }).filter(item=>Number.isSafeInteger(item.id)&&item.id>0);
  const attachments = Array.isArray(snapshot.dimensions)?snapshot.dimensions:[];
  // Use saved indicator IDs when template returns an incomplete indicator list.
  const known=new Set(indicators.map(item=>String(item.id)));
  for(const id of Object.keys(record.values||{})) {
    if(!known.has(String(id))) indicators.push({id:Number(id),key:String(id),label:`Indicator ${id}`,type:'text',raw:{}});
  }
  return {indicators,dimensions:attachments};
}

export async function getHodSubmission(id,user,{history=false}={}) {
  const result=await fetchSubmission(id);
  const record=normalizeSubmissionRecord(result.envelope ?? result.data);
  if (!record?.id) throw new Error('The system did not return a valid submission ID.');
  if (history) {
    if(!hodHistoryRows([record],user).length)
      throw new Error('This submission is not in your verified HOD review history.');
  } else if (!canHodAct(record,user) && !canHodReopenReturned(record,user)) {
    throw new Error(reviewerAssignment(record,user).reason || 'This submission is not currently assigned to your HOD approval step.');
  }
  const fromSnapshot=snapshotReviewDefinitions(record);
  // When snapshot fields are missing, try the scoped dataset API, but do not
  // block HOD's view of saved values on a 403 for dataset-configuration reads.
  const [indicatorRead, dimensionRead]=await Promise.allSettled([
    fromSnapshot.indicators.length ? Promise.resolve(fromSnapshot.indicators) : getDatasetIndicators(record.dataset_id),
    fromSnapshot.dimensions.length ? Promise.resolve(fromSnapshot.dimensions) : getDatasetDimensions(record.dataset_id),
  ]);
  const indicators=indicatorRead.status==='fulfilled'?indicatorRead.value:fromSnapshot.indicators;
  const dimensions=dimensionRead.status==='fulfilled'?dimensionRead.value:fromSnapshot.dimensions;
  // If neither endpoint nor snapshot supplies indicator definitions, still
  // render saved indicator values by ID so no submission content disappears.
  if(!indicators.length) for(const key of Object.keys(record.values||{})) {
    indicators.push({id:Number(key),key,label:`Indicator ${key}`,type:'text',raw:{}});
  }
  return {record,indicators,dimensions};
}

/**
 * HOD correction is PATCH, unlike Data Officer's PUT draft save.
 * Reason is mandatory, and the request only contains changed indicator rows.
 * Never report success until Laravel GET confirms the changed data.
 */
export async function saveHodReview({id,user,values,remarks,dimensionValues,reason}) {
  const {record:before,indicators,dimensions}=await getHodSubmission(id,user);
  const issues=reviewValueIssues(indicators,dimensions,values,dimensionValues);
  if(issues.length) throw new Error(issues.map(item=>`${item.indicator}: ${item.reason}`).join(' | '));
  const expectedRevision=submissionExpectedRevision(before);
  if (expectedRevision===null) throw new Error('The system did not supply current revision. Cannot safely save review edits.');
  const payload=buildHodReviewPatch({expectedRevision,reason,original:before,values,remarks,dimensionValues});
  await patchSubmissionReviewValues(id,payload);
  const {record:after}=await getHodSubmission(id,user);
  if(!hodPatchMatches(after,payload)) {
    throw new Error('The correction could not be confirmed. Refresh the submission.');
  }
  return after;
}

/**
 * CONFIRMED HOD ROUTING FLOW (backend contract #74 and #76):
 * 1. GET /submissions/{id} and verify the HOD is the current assignee.
 * 2. Read the latest revision and currentStep.action from Laravel.
 * 3a. Review & Forward -> POST /submissions/{id}/review
 *     {expectedRevision, comments?}; Laravel moves to the next configured
 *     approver (e.g. Account Officer); returned currentStep is NEXT.
 * 3b. Return for Correction -> POST /submissions/{id}/return
 *     {expectedRevision, comments, correctionDeadline}; Laravel returns the
 *     SAME submission ID to its original assigned officer, not a prior reviewer.
 * 4. GET /submissions/{id} to confirm revision/status/step/history changed.
 *
 * AO/ministry steps use /approve and /publish through the shared API module;
 * they are not exposed as actions on a HOD review step.
 * No frontend action skips backend role/scope or no-self-review checks.
 */
export async function actOnHodSubmission({id,user,action,comment='',correctionDeadline}) {
  if(!['review','return'].includes(action)) throw new Error('Invalid HOD review action.');
  const {record:before}=await getHodSubmission(id,user);
  const permission=approvalAccess(before,action);
  if(!permission.allowed) throw new Error(permission.reason);
  const revision=submissionExpectedRevision(before);
  if(revision===null) throw new Error('Cannot route approval: the system did not return revision.');
  const result=await postSubmissionApprovalAction(id,action,{
    expectedRevision:revision, comments:comment, ...(action==='return'?{correctionDeadline}:{})
  });
  // Re-fetch from Laravel; do not infer success from HTTP status alone.
  // The POST response is authoritative when it includes the new revision,
  // status and next step. A reviewer may lose GET access immediately after
  // Return or Review, because the submission is no longer assigned to them.
  const confirmed=result.data;
  const revisionChanged=Number.isSafeInteger(Number(confirmed?.revision)) &&
    Number(confirmed.revision)>Number(revision);
  const expectedStatus=action==='return' ? 'returned' : 'under_review';
  const responseConfirmed=revisionChanged &&
    String(confirmed?.status).toLowerCase()===expectedStatus &&
    (action!=='return' || confirmed.currentStep===null || confirmed.current_step===null);
  if(responseConfirmed) return {result,after:null,confirmed,nextStep:confirmed.currentStep??confirmed.current_step??null};
  // Fallback for older responses that omit revision/step details.
  const refresh=await fetchSubmission(id);
  const after=normalizeSubmissionRecord(refresh.envelope ?? refresh.data);
  const oldStep=before.raw?.currentStep ?? before.raw?.current_step ?? null;
  const newStep=after.raw?.currentStep ?? after.raw?.current_step ?? null;
  const progressed=String(after.status)!==String(before.status) ||
    (after.revision!==null && after.revision!==before.revision) ||
    JSON.stringify(after.history)!==JSON.stringify(before.history) ||
    JSON.stringify(oldStep)!==JSON.stringify(newStep);
  if(!progressed) throw new Error(`The action could not be confirmed. Refresh the submission.`);
  return {result,after,confirmed:after.raw};
}
