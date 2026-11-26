/**
 * VIWANDA APPROVAL CIRCLE — Laravel contract #62–68 (22 Oct 2026).
 * UI -> this API -> axios Bearer auth -> Laravel enforces authenticated scope.
 * MOA => shared ministry/global workflows, IA => own institution workflows.
 * Never send institution_id, department_id or scope_key on create/update.
 * CREATE = DRAFT ONLY; ACTIVATE = separate POST. Existing submitted records
 * retain their pinned approval-circle version when a new version activates.
 */
import api from './axios';
import {listResult,operationResult} from './resourceHelpers';
import { approvalCirclePayload } from '../utils/approvalCircleContract';
export { approvalCirclePayload } from '../utils/approvalCircleContract';
export const APPROVAL_CIRCLE_CONTRACT_VERIFIED = true;
const idPart=id=>{const v=Number(id);if(!Number.isSafeInteger(v)||v<=0)throw new Error('Valid approval circle ID required.');return encodeURIComponent(String(v));};
export async function listApprovalCircles(){return listResult(await api.get('/approval-circles'));}
export async function getApprovalCircle(id){return operationResult(await api.get(`/approval-circles/${idPart(id)}`));}
export async function createApprovalCircle(fields,scope='institution'){
  // Laravel infers institution from IA token; MOA token creates global circle.
  return operationResult(await api.post('/approval-circles',approvalCirclePayload(fields,scope)));
}
export async function replaceApprovalCircle(id,fields,scope='institution'){
  // PUT only when DRAFT; replaces all steps (their step IDs change).
  return operationResult(await api.put(`/approval-circles/${idPart(id)}`,approvalCirclePayload(fields,scope)));
}
export async function updateApprovalCircleStep(id,fields){
  // Step update also recreates step rows: refetch the entire circle after saving.
  const payload={};
  for(const key of ['step_name','required_role_code','action','level','can_return']){
    if(fields[key]!==undefined)payload[key]=fields[key];
  }
  if(fields.assigned_user_id!==undefined && fields.level!=='ministry')payload.assigned_user_id=fields.assigned_user_id?Number(fields.assigned_user_id):null;
  return operationResult(await api.put(`/approval-circle-steps/${idPart(id)}`,payload));
}
export async function activateApprovalCircle(id){return operationResult(await api.post(`/approval-circles/${idPart(id)}/activate`,{}));}
export async function cloneApprovalCircle(id){return operationResult(await api.post(`/approval-circles/${idPart(id)}/clone`,{}));}
