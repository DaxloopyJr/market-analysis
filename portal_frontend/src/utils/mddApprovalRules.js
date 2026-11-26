/** Ministry Director (MDD) approval/publish workflow. No hardcoded recipients. */
import {positiveId,submissionStatus} from './submissionValues.js';
import {approvalAccess} from './submissionApprovalActions.js';

const idOf = value=>positiveId(typeof value==='object'&&value!==null?value.id:value);
const rawOf = record=>record?.raw??record??{};
export function isMddDirector(user){
  const roles=[user?.role_code,user?.roleCode,...(user?.roles??[]).map(r=>typeof r==='string'?r:r?.code)];
  return roles.some(role=>String(role??'').toUpperCase()==='MDD') &&
    (user?.permissions??[]).some(permission=>['submissions.approve','submissions.publish'].includes(permission));
}
export function mddActionAllowed(record,user,action){
  if(!record||!isMddDirector(user)||!['approve','publish','return'].includes(action))return false;
  const raw=rawOf(record),step=raw.currentStep??raw.current_step;
  if(!step||String(step.required_role_code??step.requiredRoleCode??'').toUpperCase()!=='MDD')return false;
  const wanted=String(step.action??step.required_action??step.requiredAction??'').toLowerCase();
  const permissionList=user.permissions??[];
  // Return is its own grant when provided by Laravel. Some configured roles
  // instead inherit Return through the approval/publish step permission.
  // Laravel's per-submission allowedActions is more specific than a potentially
  // incomplete permissions array cached in the login context. Never reject a
  // server-granted action only because the frontend permission list is stale.
  const actions=raw.allowedActions??raw.allowed_actions;
  const explicit=Array.isArray(actions)&&actions.some(item=>String(typeof item==='string'?item:item?.action??item?.name??item?.code??'').toLowerCase()===action);
  const granted=explicit || (action==='return'
    ? permissionList.includes('submissions.return')||permissionList.includes(`submissions.${wanted}`)
    : permissionList.includes(`submissions.${action}`));
  if(!['approve','publish'].includes(wanted)||!granted)return false;
  if(!approvalAccess(record,action).allowed)return false;
  const assignee=idOf(step.assignedUserId??step.assigned_user_id??raw.currentAssigneeId??raw.current_assignee_id);
  if(assignee&&assignee!==idOf(user.id))return false;
  // When no named assignee exists, Laravel must explicitly grant the action.
  if(!assignee&&!explicit)return false;
  const submitter=idOf(raw.submittedById??raw.submitted_by_id??raw.createdById??raw.created_by_id??raw.submittedBy?.id);
  if(submitter&&submitter===idOf(user.id))return false;
  const status=submissionStatus(record.status);
  // Laravel may send under_review at the director publish stage. Eligibility still
  // requires currentStep.action=publish and allowedActions above; do not fabricate rights.
  if(action==='publish')return ['approved','readytopublish','underreview'].includes(status) && wanted==='publish';
  return ['submitted','pending','pendingreview','underreview','inreview','approved'].includes(status);
}
/** The Director has ONE Publish button. A pinned Laravel circle may currently
 * be at MDD approve followed by MDD publish; its two API operations must each
 * succeed, in sequence, before the UI can claim the submission was published. */
export function mddPublishMode(record,user){
  if(mddActionAllowed(record,user,'publish'))return 'publish';
  if(mddActionAllowed(record,user,'approve'))return 'approve-then-publish';
  return null;
}
export function mddOwnHistory(record,user){
  if(!isMddDirector(user)||!idOf(user.id))return [];
  return (record?.history??[]).filter(item=>{
    const actor=item.actor??item.user??item.reviewer??item.performedBy??item.performed_by??{};
    const who=idOf(item.actorId??item.actor_id??item.userId??item.user_id??item.reviewerId??item.reviewer_id??item.performedById??item.performed_by_id??actor.id);
    const action=String(item.action??item.eventType??item.event_type??'').toLowerCase();
    return who===idOf(user.id)&&['approve','approved','return','returned','publish','published'].includes(action);
  });
}
/** Display state must reflect Laravel status, never be inferred from action permission. */
export function mddGroup(record,user){
  if(!record)return 'Not Submitted';
  const state=submissionStatus(record.status??record.raw?.status);
  if(state==='published')return 'Published';
  if(state==='returned')return 'Returned';
  if(['underreview','inreview','pendingreview','pending','submitted'].includes(state))return 'Pending Review';
  if(['approved','readytopublish'].includes(state))return 'Pending Review';
  if(state==='draft')return 'Draft';
  if(mddOwnHistory(record,user).length)return 'Reviewed';
  return String(record.status??'').replaceAll('_',' ')||'Unknown';
}
/** Submission is visible in the one MDD work queue because Laravel says it
 * is under_review (or has reached publication), not because action is granted. */
export function mddInQueue(record){
  if(!record)return false;
  const state=submissionStatus(record.status??record.raw?.status);
  if(!['submitted','pending','underreview','inreview','pendingreview','approved','readytopublish'].includes(state))return false;
  // Backend workflow routing is authoritative; do not display another role's
  // under_review queue as the director's pending review.
  const raw=rawOf(record);
  const step=raw.currentStep??raw.current_step;
  const role=String(step?.required_role_code??step?.requiredRoleCode??'').toUpperCase();
  return !role || role==='MDD';
}

