import {normalizeReadAliases,normalizeReadRows} from "../utils/recordAliases.js";
/**
 * FILE: src/API/delegations.jsx
 * FLOW: Admin/Delegations.jsx -> this service -> axios.jsx -> Laravel /api/v1.
 * VERIFIED CONTRACT 34–36: roles.manage (MOA).
 * GET  /delegations -> {data:{data:[{id,delegator,delegate,role,department,
 *                                    effective_from,effective_to,status}]}}
 * POST /delegations -> {delegate_user_id,role_id,department_id?,effective_from,effective_to?}
 * POST /delegations/{id}/revoke -> {status:'success',message:'Delegation revoked.'}
 * No PUT/DELETE/attachment or arbitrary permission grant APIs are documented.
 * Delegator identity MUST be derived by backend from authenticated token.
 * TODO(BACKEND) — if EDIT is approved later, agree an explicit endpoint and
 * validation before enabling Edit modal. PROPOSED ONLY, NOT AN ACTIVE API:
 *   const res = await api.put(`/delegations/${id}`, {
 *     delegate_user_id: 12, role_id: 9, department_id: null,
 *     effective_from: '2026-10-18', effective_to: '2026-11-18'
 *   });
 *   // expected: {status:'success',message:'Delegation updated.',data:{id,...}}
 *   // Laravel must enforce roles.manage, delegator scope, audit and overlaps.
 * TODO(BACKEND) — no attachment or reason fields are documented; agree file
 * upload endpoint and multipart payload BEFORE activating optional file UI.

 */
import api from './axios';
import {listResult,operationResult} from './resourceHelpers';
export async function listDelegations(){const result=await listResult(await api.get('/delegations'));return {...result,items:normalizeReadRows(result.items,'delegation')};}
export async function createDelegation(form){
  const payload={delegate_user_id:Number(form.delegate_user_id),role_id:Number(form.role_id),
    effective_from:form.effective_from};
  if(form.department_id) payload.department_id=Number(form.department_id);
  if(form.effective_to) payload.effective_to=form.effective_to;
  return operationResult(await api.post('/delegations',payload));
}
export async function revokeDelegation(id){
  return operationResult(await api.post(`/delegations/${encodeURIComponent(id)}/revoke`));
}
