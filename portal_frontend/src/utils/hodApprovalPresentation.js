/**
 * HOD review presentation: three-point approval timeline sourced from Laravel.
 * 1) Submitted  2) Current review  3) Next configured Approval Circle step.
 * Never invent a person or hardcode AO as the next approver: use the saved
 * submission's pinned workflow/steps or explicit nextStep on GET /submissions/{id}.
 */
const first = (...values) => values.find(value => value !== null && value !== undefined && value !== '');
const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};

export function roleName(role) {
  const value = String(role ?? '').trim();
  return ({ AO:'Account Officer', HOD:'Head of Department', IHOD:'Head of Department',
    MDO:'Ministry Data Officer', MDD:'Ministry Department Director',
    IDO:'Institution Data Officer', DDO:'Department Data Officer' })[value.toUpperCase()] || value || '';
}
export function reviewActorName(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  return first(value.name, value.fullName, value.full_name, value.displayName, value.username, '') || '';
}
export function reviewWorkflow(record) {
  const raw = object(record?.raw || record);
  const wrapped = object(raw.submission);
  const source = Object.keys(wrapped).length ? wrapped : raw;
  const circle = object(first(source.approvalCircle, source.approval_circle,
    source.approvalWorkflow, source.approval_workflow,
    source.workflow, source.workflowVersion, source.workflow_version,
    source.template?.approvalCircle, {}));
  const steps = first(circle.steps, source.approvalSteps, source.approval_steps,
    source.workflowSteps, source.workflow_steps, source.template?.approvalSteps, []);
  const ordered = (Array.isArray(steps) ? steps : []).slice().sort((a,b)=>
    Number(first(a.sequence,a.displayOrder,a.order,0))-Number(first(b.sequence,b.displayOrder,b.order,0)));
  const current = object(first(source.currentStep,source.current_step,source.currentApprovalStep,
    source.current_approval_step,raw.currentStep,raw.current_step,{}));
  const explicit = object(first(source.nextStep,source.next_step,source.nextApprovalStep,
    source.next_approval_step,{}));
  let next = explicit;
  if (!Object.keys(next).length && ordered.length) {
    const position = ordered.findIndex(step => String(first(step.id,step.sequence)) ===
      String(first(current.id,current.sequence)));
    if (position >= 0) next = object(ordered[position+1]);
    else if (current.sequence !== undefined) next = object(ordered.find(step =>
      Number(first(step.sequence,step.displayOrder)) > Number(current.sequence)));
  }
  const describe = step => ({
    label:first(step.step_name,step.stepName,step.name,step.title,roleName(first(step.required_role_code,step.requiredRoleCode,step.role_code,step.roleCode)), ''),
    role:roleName(first(step.required_role_code,step.requiredRoleCode,step.role_code,step.roleCode)),
    actor:reviewActorName(first(step.assignedUser,step.assigned_user,step.assignee,step.user)),
    sequence:first(step.sequence,step.displayOrder,step.order,null),
  });
  const currentItem=describe(current);
  const nextItem=describe(next);
  const history = Array.isArray(record?.history)?record.history:[];
  const submissionEvent=history.find(entry=>/submit/i.test(String(first(entry.action,entry.status,entry.step_name,'')))) || {};
  return {
    submitted: {
      actor:reviewActorName(first(source.submittedBy,source.submitted_by,source.creator,source.createdBy,source.created_by)) || '',
      at:first(submissionEvent.createdAt,submissionEvent.created_at,source.submittedAt,source.submitted_at,'')
    },
    current: currentItem,
    next: nextItem,
    hasNext:Boolean(nextItem.label || nextItem.role || nextItem.actor),
    history,
  };
}
export function reviewDate(value) {
  if(!value)return '—';
  const date=new Date(value);
  return Number.isNaN(date.getTime())?String(value):date.toLocaleString('en-GB',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});
}
