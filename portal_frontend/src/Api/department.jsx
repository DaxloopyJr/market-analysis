import {normalizeReadAliases,normalizeReadRows} from "../utils/recordAliases.js";
/**
 * FILE: src/API/department.jsx
 * FLOW: Admin/MinistryDepartments.jsx / Admin/Users.jsx dropdown
 *       -> department.jsx -> axios.jsx -> Laravel /api/v1/departments.
 * VERIFIED SPEC endpoints 14–16: GET/POST /departments and PUT /departments/{id}.
 * ACCESS departments.manage (MOA) enforced by Laravel; no fake options.
 */
import api from "./axios";
import { listResult, operationResult } from "./resourceHelpers";

const ROOT = "/departments";
const route = (id) => `${ROOT}/${encodeURIComponent(id)}`;

export async function listDepartments(params = {}) {
  const result = listResult(await api.get(ROOT, { params }));
  return {...result,items:normalizeReadRows(result.items,'department')};
}
export async function createDepartment(form) {
  return operationResult(await api.post(ROOT, {
    name: form.name,
    code: form.code,
    parent_department_id: form.parent_department_id ?? null,
    description: form.description ?? null,
  }));
}
export async function updateDepartment(id, fields) {
  return operationResult(await api.put(route(id), fields));
}
export async function setDepartmentActive(id, active) {
  return updateDepartment(id, {
    is_active: active,
    status: active ? "active" : "inactive",
  });
}
