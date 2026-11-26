/**
 * AO (Account Officer) institution-level Approval Circle authorization.
 * Frontend only improves UX; Laravel owns row visibility, no-self-review,
 * institution scope and current assignment. Never approve on role alone.
 */
import {positiveId, submissionStatus} from './submissionValues.js';

export function isAccountOfficer(user) {
  const roles=[user?.role_code,user?.roleCode,user?.role,...(user?.roles??[]).map(role=>typeof role==='string'?role:role?.code)]
    .filter(Boolean).map(code=>String(code).toUpperCase());
  return (user?.permissions??[]).some(p=>['submissions.approve','submissions.review','submissions.approval'].includes(typeof p==='string'?p:p?.code));
}
export function actionNames(record) {
  const raw=record?.raw??record??{};
  const actions=raw.allowedActions??raw.allowed_actions;
  if(!Array.isArray(actions))return null;
  return actions.map(item=>String(typeof item==='string'?item:(item?.action??item?.code??item?.name??'')).toLowerCase());
}
export function approvalStep(record) {
  const raw=record?.raw??record??{};
  return raw.currentStep??raw.current_step??raw.currentApprovalStep??raw.current_approval_step??null;
}
function sourceUserId(record) {
  const raw=record?.raw??record??{};
  return positiveId(raw.submittedById??raw.submitted_by_id??raw.createdById??raw.created_by_id??raw.submitterId??raw.submitter_id??raw.submittedBy?.id??raw.submitted_by?.id??raw.createdBy?.id);
}
function institutionId(value) {
  return positiveId(value?.institution?.id??value?.institutionId??value?.institution_id??value?.raw?.institution?.id??value?.raw?.institutionId??value?.raw?.institution_id);
}
export function canAoApprove(record,user) {
  if(!isAccountOfficer(user) || !record)return false;
  const step=approvalStep(record);
  if(!step || typeof step!=='object')return false;
  if(String(step.action??'').toLowerCase()!=='approve')return false;
  const currentRole=String(step.required_role_code??step.requiredRoleCode??'').toUpperCase();
  const myRoles=[user?.role_code,user?.roleCode,user?.role,...(user?.roles??[]).map(r=>typeof r==='string'?r:r?.code)].filter(Boolean).map(r=>String(typeof r==='string'?r:r?.code??'').toUpperCase());
  if(!currentRole || !myRoles.includes(currentRole))return false;
  if(!['submitted','pending','pendingreview','underreview','inreview'].includes(submissionStatus(record.status)))return false;
  const assignee=positiveId(step.assignedUserId??step.assigned_user_id??record.raw?.currentAssigneeId??record.raw?.current_assignee_id);
  if(assignee && assignee!==positiveId(user.id))return false;
  const actions=actionNames(record);
  // If backend provides allowedActions, it is the authoritative scope of action.
  if(actions && !actions.includes('approve'))return false;
  // Without explicit assignee, only an explicit backend allowedActions grant can pass.
  if(!assignee && !actions?.includes('approve'))return false;
  const ownerInstitution=institutionId(record);
  const myInstitution=institutionId(user);
  if(ownerInstitution && myInstitution && ownerInstitution!==myInstitution)return false;
  if(sourceUserId(record) && sourceUserId(record)===positiveId(user.id))return false;
  return true;
}
export function canAoReturn(record,user) {
  if(!canAoApprove(record,user))return false;
  if(approvalStep(record)?.can_return===false || approvalStep(record)?.canReturn===false)return false;
  const actions=actionNames(record);
  return !actions || actions.includes('return');
}
export function hasAoHistory(record,user) {
  if(!isAccountOfficer(user) || !positiveId(user?.id))return false;
  const raw=record?.raw??record??{};
  const events=record.history??raw.history??raw.approvalHistory??raw.approval_history??raw.reviewActions??raw.review_actions??[];
  return Array.isArray(events)&&events.some(item=>{
    const actor=item.user??item.actor??item.reviewer??item.performedBy??item.performed_by??{};
    const actorId=positiveId(item.userId??item.user_id??item.actorId??item.actor_id??item.approverId??item.approver_id??item.performedById??item.performed_by_id??actor.id);
    return actorId===positiveId(user.id) && ['approve','approved','return','returned'].includes(String(item.action??item.eventType??item.event_type??'').toLowerCase());
  });
}
