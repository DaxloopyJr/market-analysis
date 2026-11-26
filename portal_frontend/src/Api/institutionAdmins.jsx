/**
 * FILE PATH: src/API/institutionAdmins.jsx
 * FLOW: pages/Admin/InstitutionalAdmins.jsx -> this module -> API/users.jsx
 *   -> API/axios.jsx -> Laravel /api/v1/users -> PostgreSQL.
 * INSTITUTIONAL ADMIN IS A USER WITH ROLE CODE IA, NOT ANOTHER RESOURCE.
 * DOCUMENTED ENDPOINTS: GET /users?role=IA, POST /users, PUT /users/{id},
 *   POST /users/{id}/unlock and /users/{id}/send-reset-link.
 * Role IDs are obtained via GET /roles by MOA; never hardcode numeric IDs.
 */
import {
  listUsers, createUser, updateUser, setUserActive,
  unlockUser, requestUserPasswordReset,
} from "./users";

export function listInstitutionalAdmins(params = {}) {
  return listUsers({ ...params, role: "IA" });
}

/** Password is deliberately omitted; backend sends activation email. */
export function createInstitutionalAdmin(form, iaRoleId) {
  return createUser({
    name: form.name,
    email: form.email,
    username: form.username,
    phone: form.phone,
    institution_id: Number(form.institution_id),
    department_id: null,
    role_ids: [iaRoleId],
  });
}

export function updateInstitutionalAdmin(id, fields) {
  return updateUser(id, fields);
}
export function setInstitutionalAdminActive(id, enabled) {
  return setUserActive(id, enabled);
}
export function unlockInstitutionalAdmin(id) {
  return unlockUser(id);
}
export function sendInstitutionalAdminResetLink(id) {
  return requestUserPasswordReset(id);
}
