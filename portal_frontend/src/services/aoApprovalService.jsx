/**
 * AO APPROVAL FLOW (Laravel contracts #75, #76):
 * GET /submissions -> GET /submissions/{id} -> verify AO assignment / no self-review
 * -> POST /submissions/{id}/approve {expectedRevision,comments?}
 * OR POST /submissions/{id}/return {expectedRevision,comments,correctionDeadline}
 * -> Laravel advances currentStep to next reviewer or returns to responsible officer.
 * HTTP 409 (missing next reviewer) is a REAL failure: no success notification.
 * AO never uses the HOD PATCH correction endpoint: submitted values are read-only.
 */
import {fetchSubmission,postApproveSubmission,postReturnSubmission} from '../API/submission';
import {allSubmissionRows,listCarriesHistory,mayHavePassedStep,submissionsWithWorkflow} from './submissionReadService.js';
import {normalizeSubmissionRecord,submissionExpectedRevision,positiveId} from '../utils/submissionValues';
import {canAoApprove,canAoReturn,hasAoHistory,isAccountOfficer} from '../utils/aoApprovalRules';

export async function getAoSubmission(id) {
  const result=await fetchSubmission(id);
  const record=normalizeSubmissionRecord(result.envelope??result.data);
  if(!record?.id || record.id!==positiveId(id))throw new Error('The system returned an unexpected submission ID.');
  return record;
}

/** Laravel listing can omit allowedActions / currentStep / history.
 * Fetch each eligible detail before placing it in an actionable inbox.
 * Keep a bounded concurrency so many submissions do not overload Laravel. */
export async function getAoList(user,{reviewed=false}={}) {
  if(!isAccountOfficer(user))throw new Error('AO approval permission is required.');
  // Shared list (parallel pages, 45 s cache); detail read only for rows missing workflow fields.
  // 16 Nov 2026: no GET /submissions/{id} per row for history; without history in the list (original backend)
  // Reviewed is office-level: submissions past the AO step.
  const historyInList=reviewed&&listCarriesHistory(await allSubmissionRows());
  const records=await submissionsWithWorkflow((raw,detail,error)=>{
    if(error)return null; // 403/404: not this officer's record
    const record=normalizeSubmissionRecord(detail?(detail.envelope??detail.data):raw);
    return record?.id?record:null;
  // Pending: the list row is enough. Reviewed: history only where the AO step may have acted.
  },{needsHistory:raw=>historyInList&&mayHavePassedStep(raw,['IDO','DDO','IHOD','HOD','AO'])});
  const seen=new Set();
  return records.filter(record=>record&&!seen.has(record.id)&&seen.add(record.id)&&(reviewed?(historyInList?hasAoHistory(record,user):mayHavePassedStep(record.raw??record,['IDO','DDO','IHOD','HOD','AO'])):canAoApprove(record,user)))
    .sort((a,b)=>Number(b.id)-Number(a.id));
}

/** Approve/Return response is the primary proof: GET may immediately become
 * inaccessible after Laravel forwards to the next user. */
export async function completeAoAction({id,user,action,comments='',correctionDeadline}) {
  const record=await getAoSubmission(id);
  if(!canAoApprove(record,user))throw new Error('This submission is not assigned to your Account Officer approval step.');
  if(action==='return' && !canAoReturn(record,user))throw new Error('Return is not permitted by the current Approval Circle step.');
  if(!['approve','return'].includes(action))throw new Error('Unsupported Account Officer action.');
  const expectedRevision=submissionExpectedRevision(record);
  if(expectedRevision===null)throw new Error('The system did not return revision; approval cannot be sent safely.');
  const payload={expectedRevision,comments,...(action==='return'?{correctionDeadline}:{})};
  const result=action==='approve'
    ? await postApproveSubmission(id,payload)
    : await postReturnSubmission(id,payload);
  const after=result.data??{};
  if(positiveId(after.id)!==positiveId(id) || !Number.isSafeInteger(Number(after.revision)) || Number(after.revision)<=expectedRevision)
    throw new Error(`The action could not be confirmed. Refresh the submission.`);
  if(action==='return' && String(after.status).toLowerCase()!=='returned')
    throw new Error('The system did not confirm returned status.');
  if(action==='approve' && !['under_review','approved'].includes(String(after.status).toLowerCase()))
    throw new Error('The system did not confirm advancement of the approval step.');
  return {before:record,after,action};
}
