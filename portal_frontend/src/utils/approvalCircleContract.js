/**
 * Contract #62-68: authenticated MOA/IA decides scope; omit institution_id,
 * department_id and scope_key from ALL approval-circle writes.
 * This is a pure function to regression-test payloads without HTTP requests.
 */
/** Validation is frontend helper only; Laravel is ultimate authority for scope. */
export function approvalCirclePayload(fields,scope='institution'){
  if(!['institution','ministry'].includes(scope))throw new Error('Invalid approval scope.');
  const steps=(fields.steps||[]).map(step=>{
    const level=scope; // IA cannot publish; ministry action requires ministry-level role.
    if(scope==='institution' && step.action==='publish')throw new Error('Institution approval circles cannot publish.');
    const item={step_name:String(step.step_name||'').trim(),required_role_code:String(step.required_role_code||'').trim(),
      action:step.action,level,can_return:step.can_return!==false};
    if(scope==='institution' && step.assigned_user_id) item.assigned_user_id=Number(step.assigned_user_id);
    return item;
  });
  return {name:String(fields.name||'').trim(),steps};
}
