/**
 * MDO REVIEW FLOW — Laravel-confirmed API routes only:
 * GET /institutions, GET /departments, GET /datasets, GET /submissions,
 * GET /submissions/{id}; POST /submissions/{id}/review or /return.
 * Ministry is an institution; its Departments & Units are child sources, NOT
 * standalone institutions. Never invent logo, submission, indicator or previous-period data.
 *
 * TODO(BACKEND): Confirm that MDO has ministry-wide read permissions on the four
 * list endpoints. Existing /institutions and /departments contracts currently list
 * administrative MOA permissions. If MDO receives 403, backend must grant a
 * read-only ministry scoped permission or expose an explicitly agreed source
 * catalogue endpoint, e.g. GET /ministry-review/sources returning
 * {data:{institutions:[{id,name,code,logoUrl}],departments:[{id,institutionId,name}],
 * datasets:[{id,institutionId,departmentId,datasetName}]}}.
 * DO NOT activate the example endpoint until backend confirms it.
 * TODO(BACKEND): Add persisted institution.logoUrl to institution GET and admin
 * upload/update contract. The current institution POST/PUT contract has NO logo field.
 */
import {listInstitutions} from '../API/institution.jsx';
import {listDepartments} from '../API/department.jsx';
import {datasetsAPI} from '../API/dataset.jsx';
import {fetchSubmission,postReviewSubmission,postReturnSubmission} from '../API/submission.jsx';
import {cached,fetchAllPages} from './listCache.js';
import {allSubmissionRows,listCarriesHistory,submissionsWithWorkflow} from './submissionReadService.js';
import {normalizeSubmissionRecord,positiveId,submissionExpectedRevision} from '../utils/submissionValues.js';
import {apiError} from '../API/resourceHelpers.js';
import {snapshotReviewDefinitions} from './hodReviewService.jsx';
import {reviewValueIssues} from '../utils/hodReviewRules.js';
import {canMdoReview,canMdoReturn,hasMdoHistory,sourceOf,withDatasetOwnership} from '../utils/mdoReviewRules.js';

/** Reference lists change rarely: read once (pages in parallel) and share for 5 minutes. */
const referenceList=(key,fetch)=>cached(key,async()=>(await fetchAllPages(fetch)).items,300_000);
export async function getMdoSubmission(id){
  const result=await fetchSubmission(id);
  const record=normalizeSubmissionRecord(result.envelope??result.data);
  if(record.id!==positiveId(id))throw new Error('The system returned an unexpected Submission ID.');
  return record;
}
/** Keep workflow fields actually returned by Laravel list when the detail route
 * omits them. Detail remains authoritative wherever it supplies a field.
 * Without this merge an under_review MDO item can vanish from the dashboard
 * because currentStep.required_role_code was only included in GET /submissions.
 */
function combineListAndDetail(listRow, detailRecord){
  const list=listRow?.submission??listRow??{};
  const detail=detailRecord?.raw??{};
  const merged={...list,...detail};
  const aliases=[
    ['currentStep','current_step'],
    ['allowedActions','allowed_actions'],
    ['reportingCalendar','reporting_calendar'],
    ['reportingPeriod','reporting_period'],
    ['submittedAt','submitted_at'],
    ['approvalHistory','approval_history'],
    ['history','reviewActions','review_actions'],
  ];
  for(const keys of aliases){
    if(keys.some(key=>detail[key]!==undefined&&detail[key]!==null))continue;
    const available=keys.find(key=>list[key]!==undefined&&list[key]!==null);
    if(available)merged[available]=list[available];
  }
  if(!merged.history && Array.isArray(list.history))merged.history=list.history;
  const combined=normalizeSubmissionRecord(merged);
  return {
    ...detailRecord,
    ...combined,
    // Preserve a server-provided detail revision and values (including corrections).
    revision:detailRecord.revision??combined.revision,
    values:detailRecord.values,
    dimensionValues:detailRecord.dimensionValues,
    remarks:detailRecord.remarks,
    history:detailRecord.history?.length?detailRecord.history:combined.history,
    raw:merged,
  };
}
/** List rows carry the submission snapshot; GET /submissions/{id} only for rows that lack workflow fields. */
/** Rows that can carry a ministry decision (MDO review / MDD publish or return). */
const reachedMinistry=raw=>{
  const stage=String(raw?.workflowStage??raw?.workflow_stage??'').toLowerCase();
  const status=String(raw?.status??'').toLowerCase();
  return stage==='ministry'||raw?.ministryWorkflowVersionId!=null||raw?.ministry_approval_circle_id!=null||status==='published';
};
async function detailedSubmissions(withHistory){
  // 16 Nov 2026: history is used only when the list rows already carry it (patched backend). The original backend
  // list has none, and reading GET /submissions/{id} for every row (550+) kept Reviewed/Returned/Published loading.
  const historyInList=withHistory&&listCarriesHistory(await allSubmissionRows());
  return submissionsWithWorkflow((raw,detail,error)=>{
    if(detail){
      const record=normalizeSubmissionRecord(detail.envelope??detail.data);
      return combineListAndDetail(raw,record);
    }
    // Prefer genuine list records for read-only display when Laravel denies detail access.
    if(error)return {...normalizeSubmissionRecord(raw),detailUnavailable:true};
    return combineListAndDetail(raw,normalizeSubmissionRecord(raw));
  // History reads run 3 at a time so the reviewer's own clicks are not queued behind them.
  },{needsHistory:raw=>historyInList&&reachedMinistry(raw),concurrency:3});
}
/**
 * Shared by every MDO/MDD page for 45 s; cleared by any submission write (API/axios.jsx).
 * withHistory=false (queue, source overview, review): list rows only, no GET /submissions/{id}.
 * withHistory=true (dashboard decisions, Reviewed/Returned/Published lists): approval history is read
 * only for submissions that reached the ministry stage.
 */
export function getMdoCatalogue({withHistory=false}={}){
  return cached(withHistory?'submissions:ministry-catalogue:history':'submissions:ministry-catalogue',()=>loadMdoCatalogue(withHistory));
}
async function loadMdoCatalogue(withHistory){
  const fetches=await Promise.allSettled([
    referenceList('institutions:all',listInstitutions),
    referenceList('departments:all',listDepartments),
    referenceList('datasets:all',params=>datasetsAPI.list(params)),
    detailedSubmissions(withHistory),
  ]);
  const notes=[];
  const names=['Institutions','Departments','Dataset catalogue','Submissions'];
  const data=fetches.map((item,index)=>{
    if(item.status==='fulfilled')return item.value;
    notes.push(`${names[index]}: ${apiError(item.reason)}${item.reason?.response?.status===403?' (no permission)':''}`);
    return [];
  });
  // Submission data is the main source of reviewer truth. Surface failure,
  // never silently present an empty queue as "nothing to review".
  if(fetches[3].status==='rejected')throw new Error(`Cannot load MDO submissions. ${notes.join(' | ')}`);
  const [institutions,departments,datasets,loadedSubmissions]=data;
  // GET submission detail does not always include the source IDs. Join on the
  // real dataset ID from the registry, keeping the original backend status,
  // currentStep and allowedActions untouched.
  const ownersByDataset=new Map(datasets.filter(ds=>positiveId(ds.id)).map(ds=>[positiveId(ds.id),ds]));
  const submissions=loadedSubmissions.map(record=>
    withDatasetOwnership(record,ownersByDataset.get(positiveId(record.dataset_id))));
  // If MDO's administrative catalogue GETs return 403, never invent entries.
  // Only recover source names/IDs that are actually present on submissions.
  const knownInstitutions=new Map(institutions.map(row=>[Number(row.id),row]));
  const knownDepartments=new Map(departments.map(row=>[Number(row.id),row]));
  for(const item of submissions){
    const source=sourceOf(item);
    if(source.institutionId&&source.institutionName&&!knownInstitutions.has(source.institutionId)){
      knownInstitutions.set(source.institutionId,{
        id:source.institutionId,name:source.institutionName,
        code:source.institutionName,sourceDerived:true,
      });
    }
    if(source.departmentId&&source.departmentName&&!knownDepartments.has(source.departmentId)){
      knownDepartments.set(source.departmentId,{
        id:source.departmentId,name:source.departmentName,
        institutionId:source.institutionId,sourceDerived:true,
      });
    }
  }
  // historyAvailable=false: decisions are shown at office level from status (the server does not say who decided).
  const historyAvailable=listCarriesHistory(await allSubmissionRows());
  return {institutions:[...knownInstitutions.values()],departments:[...knownDepartments.values()],datasets,submissions,notes,historyAvailable};
}
export async function sendMdoDecision({id,user,action,comments='',correctionDeadline}){
  if(!['review','return'].includes(action))throw new Error('MDO can only Review & Forward or Return.');
  const before=await getMdoSubmission(id);
  if(!canMdoReview(before,user))throw new Error('This submission is not assigned to you at the current review step.');
  if(action==='review'){
    const snapshot=snapshotReviewDefinitions(before);
    const issues=reviewValueIssues(snapshot.indicators,snapshot.dimensions,before.values,before.dimensionValues);
    if(issues.length)throw new Error('Cannot forward: '+issues.map(issue=>`${issue.indicator}: ${issue.reason}`).join(' | '));
  }
  if(action==='return'&&!canMdoReturn(before,user))throw new Error('Return is disabled for this Approval Circle step.');
  const expectedRevision=submissionExpectedRevision(before);
  if(expectedRevision===null)throw new Error('The system did not return the latest revision. Nothing was sent.');
  const input={expectedRevision,comments,...(action==='return'?{correctionDeadline}:{})};
  const result=action==='review'?await postReviewSubmission(id,input):await postReturnSubmission(id,input);
  const after=result.data??{};
  const receivedId=positiveId(after.id??after.submissionId??after.submission_id);
  const revision=Number(after.revision??after.currentRevision??after.current_revision);
  const status=String(after.status??'').toLowerCase();
  let confirmed=receivedId===positiveId(id)&&Number.isSafeInteger(revision)&&revision>expectedRevision&&
    (action==='return'?status==='returned':['submitted','under_review','underreview','approved'].includes(status));
  if(!confirmed){
    // Response may omit revision. Follow-up GET can be forbidden immediately
    // after a successful transfer; NEVER claim success unless confirmed.
    const detail=await getMdoSubmission(id);
    const changed=(detail.revision!==null&&detail.revision>expectedRevision) ||
      (action==='return'&&String(detail.status).toLowerCase()==='returned');
    confirmed=changed;
  }
  if(!confirmed)throw new Error('The system did not confirm that the submission advanced. No success has been assumed.');
  return {id,action,revision:Number.isSafeInteger(revision)?revision:null,
    nextStep:after.currentStep??after.current_step??null,comment:comments,
    institution:sourceOf(before).institutionName,dataset:before.dataset};
}
export function reviewedByMdo(catalogue,user){return catalogue.submissions.filter(row=>hasMdoHistory(row,user));}
