/**
 * FILE: src/API/roles.jsx
 * FLOW: pages/Admin/RolesPermissions.jsx -> API/roles.jsx -> API/axios.jsx -> Laravel.
 * VERIFIED SPEC endpoints 25–28; permission roles.manage required (MOA).
 * The Roles & Permissions UI uses only these VERIFIED API contracts.
 * The GET /roles endpoint is roles.manage (MOA) only, so do not use this
 * dropdown for IA role assignment without a separate approved backend contract.
 */
import api from "./axios";
import { listResult, operationResult } from "./resourceHelpers";

export async function listRoles() {
  return listResult(await api.get("/roles"));
}
export async function listPermissions() {
  return listResult(await api.get("/permissions"));
}
export async function createRole({ code, name, level, permission_ids }) {
  return operationResult(await api.post("/roles", { code, name, level, permission_ids }));
}
export async function updateRole(id, fields) {
  return operationResult(await api.put(`/roles/${encodeURIComponent(id)}`, fields));
}
