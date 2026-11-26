/** Ministry Data Officer display/access helpers. Backend alone enforces ministry scope. */
import {positiveId, submissionStatus} from './submissionValues.js';
import {approvalAccess} from './submissionApprovalActions.js';
import {institutionLogoUrl} from './institutionLogo.js';

const first=(...values)=>values.find(value=>value!==null&&value!==undefined&&value!=='');
const idValue = item=>positiveId(typeof item==='object'&&item!==null?item.id:item);
export function hasMdoRole(user){
  const roles=[user?.role_code,user?.roleCode,...(user?.roles??[]).map(r=>typeof r==='string'?r:r?.code)];
  return roles.some(r=>String(r).toUpperCase()==='MDO');
}
export function isMdoReviewer(user){
  // Laravel may omit the permissions collection from its login/current-user payload.
  // A missing collection is not a denial; explicit permissions remain enforced.
  return hasMdoRole(user) && (!Array.isArray(user?.permissions) || user.permissions.includes('submissions.review'));
}
export function sourceOf(record){
  const r=record?.raw??record??{};
  const calendar=r.reportingCalendar??r.reporting_calendar??{};
  const ds=r.dataset??r.datasetDefinition??r.dataset_definition??calendar.dataset??{};
  const institution= r.institution??ds.institution??calendar.institution??{};
  const department=r.department??ds.department??calendar.department??{};
  return {
    institutionId:idValue(first(r.institutionId,r.institution_id,ds.institutionId,ds.institution_id,institution)),
    departmentId:idValue(first(r.departmentId,r.department_id,ds.departmentId,ds.department_id,department)),
    institutionName:first(institution.name,ds.institutionName,r.institutionName,r.institution_name)??'',
    departmentName:first(department.name,ds.departmentName,r.departmentName,r.department_name)??'',
  };
}
export function sourceOfDataset(item){
  const ds=item??{};
  return {
    institutionId:idValue(first(ds.institutionId,ds.institution_id,ds.institution)),
    departmentId:idValue(first(ds.departmentId,ds.department_id,ds.department)),
  };
}
export function datasetName(item){return first(item?.datasetName,item?.dataset_name,item?.dataName,item?.data_name,item?.nameEn,item?.name_en,item?.name,'');}
/** Same picture resolver as the rest of the portal (profile_image_url / profile_image_path). */
export function institutionLogo(record){return institutionLogoUrl(record);}
export function isMinistryInstitution(institution){
  const name=String(institution?.name??'').toLowerCase();
  const type=String(institution?.type??'').toLowerCase();
  return ['ministry','wizara'].includes(type) || /ministry of industry and trade|wizara ya viwanda na biashara/.test(name);
}
export function ministryOf(institutions,user){
  const recognized=institutions.filter(isMinistryInstitution);
  if(recognized.length===1)return recognized[0];
  const ownId=idValue(first(user?.institution?.id,user?.institutionId,user?.institution_id));
  const own=recognized.find(item=>idValue(item.id)===ownId);
  if(own)return own;
  if(recognized.length===0&&ownId&&isMinistryInstitution(user?.institution))return user.institution;
  return null;
}
/** Only Ministry departments; department API is ministry-scoped in the project's documented contract. */
export function ministryDepartments(departments,ministry){
  if(!ministry?.id)return [];
  return departments.filter(dep=>{
    const parent=idValue(first(dep.institutionId,dep.institution_id,dep.institution));
    return parent===null || parent===idValue(ministry.id);
  });
}
/** A pending MDO item is identified by the Laravel workflow, NOT by permissions.
 * A submitted dataset must never become "Not Submitted" because this viewer
 * lacks permission, or because allowedActions has not been included in GET.
 */
export function isMdoPending(record){
  if(!record)return false;
  const raw=record.raw??record;
  const step=raw.currentStep??raw.current_step;
  const role=String(step?.required_role_code??step?.requiredRoleCode??'').trim().toUpperCase();
  return ['submitted','pending','pendingreview','inreview','underreview'].includes(submissionStatus(record.status??raw.status)) && String(raw.workflowStage??raw.workflow_stage??'ministry').toLowerCase()==='ministry' && role==='MDO';
}
/** Associate a real submission with the registered dataset's real source IDs.
 * Laravel may omit institutionId/departmentId in GET /submissions/{id}; the
 * dataset itself still declares its owner. Never override existing owner IDs.
 */
export function withDatasetOwnership(record,dataset){
  if(!record||!dataset)return record;
  const actual=sourceOf(record),defined=sourceOfDataset(dataset);
  if(actual.institutionId && defined.institutionId && actual.institutionId!==defined.institutionId)return record;
  const institutionId=actual.institutionId??defined.institutionId;
  const departmentId=actual.departmentId??defined.departmentId;
  if((!institutionId||actual.institutionId) && (!departmentId||actual.departmentId))return record;
  return {...record,raw:{...(record.raw??record),
    ...(!actual.institutionId&&institutionId?{institutionId}:{}),
    ...(!actual.departmentId&&departmentId?{departmentId}:{})}};
}
export function canMdoReview(record,user){
  if(!isMdoReviewer(user)||!isMdoPending(record))return false;
  const raw=record.raw??record;
  const step=raw.currentStep??raw.current_step;
  if(!approvalAccess(record,'review').allowed)return false;
  const assignee=idValue(first(step.assignedUserId,step.assigned_user_id,raw.currentAssigneeId,raw.current_assignee_id));
  const allowed=raw.allowedActions??raw.allowed_actions;
  const explicit=Array.isArray(allowed)&&allowed.some(v=>String(typeof v==='string'?v:v?.action??v?.name??'').toLowerCase()==='review');
  if(assignee && assignee!==idValue(user.id))return false;
  // A null assigned_user_id is a role-based ministry queue, NOT an unassigned error.
  // If Laravel provides allowedActions, respect that explicit action grant/denial;
  // if omitted, role + permission + currentStep.action are sufficient to show Review.
  // Laravel still authorizes POST and may reject the action.
  if(!assignee && Array.isArray(allowed) && !explicit)return false;
  const submitter=idValue(first(raw.submittedById,raw.submitted_by_id,raw.createdById,raw.created_by_id,raw.submittedBy?.id));
  return !submitter || submitter!==idValue(user.id);
}
export function canMdoReturn(record,user){return canMdoReview(record,user) && approvalAccess(record,'return').allowed;}
export function mdoHistoryEvents(record,user){
  const ids=idValue(user?.id);
  return (record?.history??[]).filter(item=>{
    const actor=item.user??item.actor??item.reviewer??item.performedBy??{};
    const actorId=idValue(first(item.userId,item.user_id,item.actorId,item.actor_id,item.reviewerId,item.reviewer_id,item.performedById,item.performed_by_id,actor.id));
    const action=String(first(item.action,item.eventType,item.event_type,'')).toLowerCase();
    return ids && ids===actorId && ['review','reviewed','return','returned'].includes(action);
  });
}
export function hasMdoHistory(record,user){return mdoHistoryEvents(record,user).length>0;}

/**
 * Office-level workflow position from Laravel status (16 Nov 2026), for lists when the server sends no approval
 * history: who decided is unknown, only that the ministry step was passed.
 */
const wf=record=>{const r=record?.raw??record??{};const step=r.currentStep??r.current_step??{};
  return {status:String(record?.status??r.status??'').toLowerCase(),stage:String(r.workflowStage??r.workflow_stage??'').toLowerCase(),
    role:String(step.required_role_code??step.requiredRoleCode??'').toUpperCase(),
    ministry:r.ministryWorkflowVersionId!=null||r.ministry_approval_circle_id!=null};};
export function ministryReturned(record){const w=wf(record);return w.status==='returned'&&(w.stage==='ministry'||w.ministry);}
/** Past the MDO step: forwarded to MDD, published, or returned at the ministry stage. */
export function passedMdoStep(record){const w=wf(record);
  return w.status==='published'||ministryReturned(record)||(w.stage==='ministry'&&['submitted','under_review','approved'].includes(w.status)&&Boolean(w.role)&&w.role!=='MDO');}
