import {normalizeReadAliases,normalizeReadRows} from "../utils/recordAliases.js";
/**
 * FILE: src/API/users.jsx
 * FLOW: Admin/Users.jsx -> API/users.jsx -> API/axios.jsx -> Laravel -> PostgreSQL.
 * VERIFIED SPEC endpoints 17–24: GET/POST /users; PUT /users/{id};
 * POST /users/{id}/unlock; POST /users/{id}/send-reset-link.
 * GET /users?role=IA lists Institutional Admins (not a separate resource).
 * IMPORTANT: GET /users/{id}, /activities and /roles mutation endpoint
 * are NOT included in the supplied contract; never call them.
 * All server responses and validation errors are surfaced by resourceHelpers.js.
 */
import api from "./axios";
import { listResult, operationResult } from "./resourceHelpers";

const ROOT = "/users";
const userRoute = (id) => `${ROOT}/${encodeURIComponent(id)}`;

export async function listUsers(params = {}) {
  const result = listResult(await api.get(ROOT, { params }));
  return {...result,items:normalizeReadRows(result.items,'user')};
}

/** On create, omit password to trigger the server's activation email workflow. */
export async function createUser(form) {
  const payload = {
    name: form.name.trim(),
    email: form.email.trim(),
    username: form.username.trim(),
    phone: form.phone?.trim() || null,
    institution_id: form.institution_id || null,
    department_id: form.department_id || null,
    role_ids: form.role_ids ?? [],
    // Optional MFA (MOA/IA only; caller omits it for other administrators). JSON booleans.
    ...(typeof form.mfa_enabled === "boolean" ? {mfa_enabled: form.mfa_enabled, mfa_method: form.mfa_method ?? null} : {}),
  };
  return operationResult(await api.post(ROOT, payload));
}

/** PUT supports profile + role_ids + active state (backend validates permissions). */
export async function updateUser(id, fields) {
  return operationResult(await api.put(userRoute(id), fields));
}

export async function setUserActive(id, active) {
  return updateUser(id, { is_active: active, status: active ? "active" : "inactive" });
}

export async function assignUserRoles(id, roleIds) {
  return updateUser(id, { role_ids: roleIds });
}

export async function unlockUser(id) {
  return operationResult(await api.post(`${userRoute(id)}/unlock`));
}

export async function requestUserPasswordReset(id) {
  return operationResult(await api.post(`${userRoute(id)}/send-reset-link`));
}

/** Role reference values are protected by roles.manage; MOA only. */
export async function availableRoles() {
  return listResult(await api.get("/roles"));
}
