import { ROLE_LABELS } from "../config/rolePermissions";
/** Normalize Laravel user without inventing role assignments or permissions. */
export function adaptBackendUser(raw) {
  if (!raw?.id || !Array.isArray(raw.roles) || !Array.isArray(raw.permissions)) {
    throw new Error("Laravel user response is missing identity, roles or permissions.");
  }
  const now = new Date().toISOString().slice(0, 10);
  const roles = raw.roles.filter((r) => r && typeof r.code === "string");
  const active = roles.filter((r) => !r.pivot || (
    (!r.pivot.status || r.pivot.status === "active") &&
    (!r.pivot.effective_from || r.pivot.effective_from <= now) &&
    (!r.pivot.effective_to || r.pivot.effective_to >= now)
  ));
  // Backend does not return primary_role; display the first active assignment.
  // Authorization always checks the permission array returned by Laravel.
  const primary = active[0] || roles[0];
  return {
    ...raw,
    roles,
    role_code: primary?.code || null,
    role: primary?.name || ROLE_LABELS[primary?.code] || "Portal User",
    permissions: [...new Set(raw.permissions.filter((x) => typeof x === "string"))],
    menu: Array.isArray(raw.menu) ? raw.menu : [],
    institution: raw.institution || null,
    department: raw.department || null,
    scope: raw.scope ?? null, // Laravel decides scope; MIT user may have ministry scope.
  };
}
