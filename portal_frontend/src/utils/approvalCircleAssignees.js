/**
 * APPROVAL CIRCLE > APPROVAL LEVELS (IA / MOA)
 *
 * IA cannot call GET /roles: Laravel protects that API with roles.manage (MOA).
 * IA role choices must be derived from authorized GET /users results (and the
 * approval-circle steps already returned by GET /approval-circles). Never invent
 * a role-directory route or a list of institution-specific approver users.
 *
 * IA user choices come ONLY from Laravel's scoped GET /users. The backend must
 * authorize approval-circle assignees, confirm their active role and institution
 * and enforce permissions on POST/PUT even if frontend filtering is bypassed.
 * MOA circle steps are ministry/global and never select assigned_user_id.
 */
const asCode = value => String(value ?? '').trim().toUpperCase();
const validId = value => value !== undefined && value !== null && String(value).trim() !== '';

export function approvalUserRoleCodes(user) {
  const roles = Array.isArray(user?.roles) ? user.roles :
    (user?.role ? [user.role] : []);
  const raw = [
    ...roles.map(item => typeof item === 'string' ? item :
      (item?.code ?? item?.role_code ?? item?.roleCode)),
    user?.role_code,
    user?.roleCode,
  ];
  return [...new Set(raw.map(asCode).filter(Boolean))];
}

/** Laravel already applies IA scope. Reject explicit cross-institution records. */
export function scopeApprovalUsers(records, institutionId) {
  if (!validId(institutionId)) return [];
  const ids = new Set();
  return (Array.isArray(records) ? records : []).filter(record => {
    const id = Number(record?.id);
    if (!Number.isSafeInteger(id) || id < 1 || ids.has(id)) return false;
    const recordInstitution = record?.institution_id ?? record?.institutionId ?? record?.institution?.id;
    if (validId(recordInstitution) && String(recordInstitution) !== String(institutionId)) return false;
    if (record?.is_active === false || String(record?.status ?? '').toLowerCase() === 'inactive') return false;
    ids.add(id);
    return true;
  });
}

/** If a user response has no role metadata, Laravel must perform final role validation. */
export function approvalUsersForRole(users, roleCode) {
  const code = asCode(roleCode);
  if (!code) return users;
  return users.filter(user => {
    const knownRoles = approvalUserRoleCodes(user);
    return knownRoles.length === 0 || knownRoles.includes(code);
  });
}

/** Role choices are derived from scoped Laravel records, never from static fake users. */
export function approvalRoleOptions({users = [], circles = [], directoryRoles = [], scope = 'institution'}) {
  const found = new Map();
  const include = (code, name, level) => {
    const key = asCode(code);
    if (!key) return;
    if (level && level !== scope) return;
    if (!found.has(key)) found.set(key, {id:key, code:key, name: name || key});
  };
  for (const role of (scope === 'ministry' ? directoryRoles : [])) {
    include(role?.code ?? role?.role_code,role?.name ?? role?.nameEn,role?.level);
  }
  if (scope === 'institution') {
    for (const user of users) {
      for (const role of (Array.isArray(user?.roles) ? user.roles : (user?.role ? [user.role] : []))) {
        if (typeof role === 'string') include(role, role);
        else include(role?.code ?? role?.role_code ?? role?.roleCode,role?.name ?? role?.nameEn,role?.level);
      }
      if (user?.role_code || user?.roleCode) include(user?.role_code ?? user?.roleCode,user?.role_name);
    }
  }
  for (const circle of circles) {
    for (const step of (circle?.levels ?? circle?.steps ?? [])) {
      if (step?.level && step.level !== scope) continue;
      include(step?.required_role_code ?? step?.approver_position,step?.required_role_code ?? step?.approver_position);
    }
  }
  return [...found.values()].sort((a,b) => a.name.localeCompare(b.name));
}
