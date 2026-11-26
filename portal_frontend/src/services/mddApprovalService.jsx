/** MDD only. Backend routes are confirmed: /approve, /return, /publish.
 * TODO(BACKEND): Confirm MDD read access to /institutions,/departments,/datasets,
 * and ministry-scoped GET /submissions + /submissions/{id}. The catalogue helper
 * intentionally does NOT bypass a 403 or invent ministry-wide endpoints.
 */
import {getMdoCatalogue,getMdoSubmission} from './mdoReviewService.jsx';
import {postPublishSubmission,postReturnSubmission} from '../API/submission.jsx';
import {submissionExpectedRevision,positiveId} from '../utils/submissionValues.js';
import {sourceOf,sourceOfDataset} from '../utils/mdoReviewRules.js';
import {approvalActionPayload} from '../utils/submissionApprovalActions.js';

export const getMddCatalogue=async(options={})=>{
  const catalogue=await getMdoCatalogue(options);
  // Laravel list/detail submissions can omit explicit institution and department;
  // use ownership declared on the matching registered Dataset ID only.
  const datasetOwners=new Map(catalogue.datasets.filter(ds=>ds.id!=null).map(ds=>[Number(ds.id),sourceOfDataset(ds)]));
  const submissions=catalogue.submissions.map(submission=>{
    const known=sourceOf(submission),fromDefinition=datasetOwners.get(Number(submission.dataset_id));
    if(!fromDefinition || (known.institutionId &&
      (known.departmentId || !fromDefinition.departmentId)))return submission;
    const institutionId=known.institutionId??fromDefinition.institutionId;
    const departmentId=known.departmentId??fromDefinition.departmentId;
    if(!institutionId&&!departmentId)return submission;
    return {...submission,raw:{...submission.raw,
      institutionId,departmentId}};
  });
  return {...catalogue,submissions,notes:catalogue.notes.map(note=>note.replaceAll('MDO','MDD'))};
};
export const getMddSubmission=getMdoSubmission;

/**
 * Laravel is the authority for role, currentStep and allowedActions.
 * Do NOT gate POST /publish or POST /return from client-side MDD role/step
 * metadata. Read the latest revision and submit the confirmed API payload;
 * Laravel responds with 403/409/422 when the action cannot proceed.
 */
const receiptOf = (id,action,response,comments) => {
  const after=response.data?.submission??response.data??{};
  const returnedId=positiveId(after.id??after.submissionId??after.submission_id);
  if(returnedId&&returnedId!==positiveId(id))throw new Error('The system returned an unexpected submission ID. Refresh before taking another action.');
  const revision=Number(after.revision??after.currentRevision??after.current_revision);
  return {id:positiveId(id),action,revision:Number.isSafeInteger(revision)?revision:null,
    status:String(after.status??'').toLowerCase(),nextStep:after.currentStep??after.current_step??null,comments};
};

async function confirmServerStatus(id,receipt,expected){
  if(receipt.status===expected)return {...receipt,published:expected==='published'};
  try{
    const latest=await getMddSubmission(id);
    if(String(latest.status??'').toLowerCase()===expected)
      return {...receipt,status:expected,published:expected==='published'};
  }catch{/* On a reassigned record GET may be 403; without proof do not claim success. */}
  return {...receipt,partial:true,published:false,
    message:`The system accepted the action, but ${expected} status could not be confirmed. Refresh the submission before attempting another action.`};
}

export async function sendMddDecision({id,action,comments='',correctionDeadline}){
  if(!['return','publish'].includes(action))
    throw new Error('Unsupported director action.');

  // Revision comes from Laravel, not the table row or UI state.
  const before=await getMddSubmission(id);
  const expectedRevision=submissionExpectedRevision(before);
  if(expectedRevision===null)
    throw new Error('The latest submission revision is unavailable. Refresh before taking an action.');

  const input={expectedRevision,comments,...(action==='return'?{correctionDeadline}:{})};
  const payload=approvalActionPayload(action,input);
  // Always attempt the requested endpoint; no frontend role/step guards.
  const response=action==='return'
    ?await postReturnSubmission(id,payload)
    :await postPublishSubmission(id,payload);
  const receipt=receiptOf(id,action,response,comments);
  return confirmServerStatus(id,receipt,action==='return'?'returned':'published');
}
