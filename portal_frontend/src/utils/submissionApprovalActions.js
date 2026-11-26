/**
 * VIWANDA APPROVAL ACTION CONTRACT — confirmed by backend, 23 Oct 2026.
 *
 * Submission already owns a pinned Approval Circle version. Never manually
 * choose the next recipient; Laravel moves currentStep when /review or
 * /approve succeeds. The returned currentStep is the NEXT step.
 *
 * HOD -> POST /submissions/{id}/review (not /forward).
 * AO -> POST /submissions/{id}/approve.
 * Ministry reviewer -> /review or /approve according to currentStep.action.
 * Publication reviewer -> POST /submissions/{id}/publish.
 * Current reviewer -> POST /submissions/{id}/return if can_return=true.
 *
 * Frontend checks here improve UX. Laravel enforces scope, no self-review,
 * pinned workflow, recipient availability and revision atomically.
 */
export const APPROVAL_ACTIONS = Object.freeze(['review','approve','return','publish']);
const own = (obj,key) => Object.prototype.hasOwnProperty.call(obj ?? {},key);
const pick = (...items) => items.find(x=>x!==null&&x!==undefined&&x!=='');
export function darDate(value = new Date()) {
  const fields = new Intl.DateTimeFormat('en-GB',{
    timeZone:'Africa/Dar_es_Salaam',year:'numeric',month:'2-digit',day:'2-digit',
  }).formatToParts(value);
  const valueOf = type => fields.find(part=>part.type===type)?.value;
  return `${valueOf('year')}-${valueOf('month')}-${valueOf('day')}`;
}
export function approvalAccess(record, action) {
  const raw = record?.raw ?? record ?? {};
  const step = raw.currentStep ?? raw.current_step ?? raw.currentApprovalStep ?? raw.current_approval_step ?? null;
  if (!step || typeof step!=='object') return {allowed:false, reason:'The system did not return a current approval step.'};
  if (!APPROVAL_ACTIONS.includes(action)) return {allowed:false, reason:'Unknown approval action.'};
  const allowed = pick(raw.allowedActions,raw.allowed_actions);
  if(Array.isArray(allowed)) {
    const names=allowed.map(item=>String(typeof item==='string'?item:(item?.action??item?.name??item?.code??'')).toLowerCase());
    if(!names.includes(action)) return {allowed:false, reason:`You are not allowed to ${action} this submission.`};
  }
  if(action==='return') {
    if(pick(step.can_return,step.canReturn)===false) return {allowed:false, reason:'This step does not allow Return.'};
    return {allowed:true,reason:''};
  }
  const expected=String(pick(step.action,step.requiredAction,step.required_action)??'').toLowerCase();
  if(expected!==action) return {allowed:false, reason:`Approval Circle current action is ${expected||'unknown'}, not ${action}.`};
  if(action==='publish' && String(raw.workflowStage??raw.workflow_stage??'').toLowerCase()==='institution')
    return {allowed:false,reason:'Institution workflows cannot Publish.'};
  return {allowed:true,reason:''};
}
export function approvalActionPayload(action,{expectedRevision,comments='',correctionDeadline}={},{today=darDate()}={}) {
  if(!APPROVAL_ACTIONS.includes(action)) throw new Error(`Unsupported approval action: ${action}`);
  const revision=Number(expectedRevision);
  if(expectedRevision===null||expectedRevision===undefined||String(expectedRevision).trim()===''||!Number.isSafeInteger(revision)||revision<0)
    throw new Error('Valid expectedRevision is required.');
  if(typeof comments!=='string'||comments.length>10000) throw new Error('Approval comments must be text of at most 10000 characters.');
  const normalized=comments.trim();
  if(action==='return') {
    if(!normalized) throw new Error('Return requires comments explaining the correction.');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(correctionDeadline??'') ||
       !Number.isFinite(Date.parse(`${correctionDeadline}T00:00:00Z`)) ||
       new Date(`${correctionDeadline}T00:00:00Z`).toISOString().slice(0,10)!==correctionDeadline)
      throw new Error('Return requires a valid correctionDeadline (YYYY-MM-DD).');
    if(correctionDeadline<today) throw new Error('Correction deadline must be today or later (Africa/Dar_es_Salaam).');
    return {expectedRevision:revision,comments:normalized,correctionDeadline};
  }
  if(own({correctionDeadline},'correctionDeadline')&&correctionDeadline!==undefined&&correctionDeadline!==null&&correctionDeadline!=='')
    throw new Error(`correctionDeadline must not be sent for ${action}.`);
  return {expectedRevision:revision,...(normalized?{comments:normalized}:{})};
}
