import { getMockSession, isMockAuthEnabled } from "./sessionService";
import { ROLE_LABELS, userCan } from "../config/rolePermissions";

/**
 * DashboardLayout.jsx -> authService.jsx -> (future) Api.jsx -> Laravel.
 * Topbar and Sidebar consume the user; they do not independently call API.
 */
export const previewUser = {
  id: "demo-ido", name: "Demo Officer", role_code: "IDO",
  role: ROLE_LABELS.IDO, institution: { id: "demo-institution", name: "CAMARTEC" },
  department: null, scope: { type: "institution", institution_id: "demo-institution" },
  permissions: ["dashboard.view"],
};

export async function getDashboardUser() {
  if (isMockAuthEnabled()) {
    const session = getMockSession();
    if (!session) throw new Error("No mock session. Please login again.");
    return session.user;
  }

  /*
   * TODO(BACKEND): AUTHENTICATED USER + RBAC + SCOPE
   * Confirm endpoint; GET /api/v1/me is only an EXAMPLE.
   *
   * import api from "./Api";
   * const { data } = await api.get("/api/v1/me");
   * return {
   *   id: data.user.id,
   *   name: data.user.name,
   *   role_code: data.user.role_code,
   *   role: data.user.role_name,
   *   institution: data.user.institution,
   *   department: data.user.department,
   *   scope: data.user.scope,
   *   permissions: data.user.permissions,
   * };
   *
   * Expected response sample (NOT CONFIRMED):
   * { "user": { "id": 14, "name": "Amina",
   *   "role_code": "IA", "role_name": "Institution Admin",
   *   "institution": { "id": 11, "name": "CAMARTEC" },
   *   "department": null, "scope": { "type": "institution", "institution_id": 11 },
   *   "permissions": ["dashboard.view", "users.manage_own"] } }
   *
   * Confirm field names and return 401/403 handling with backend team.
   */
  throw new Error("Current-user API not configured. Run VITE_AUTH_MODE=mock locally.");
}

export function getAllowedSidebarPaths(user) {
  // Kept as compatibility helper for earlier REV11 users.
  // New sidebar gets full nested navigation from menuForUser(user).
  const routes = [
    ["/dashboard", ["dashboard.view"]],
    ["/dashboard/submissions", ["submissions.view_own", "submissions.monitor", "submissions.view_published", "submissions.review", "submissions.approve_institution", "submissions.approve_final"]],
    ["/dashboard/reports", ["reports.all", "reports.institution", "reports.ministry", "reports.own", "reports.approvals"]],
  ];
  return routes.filter(([, p]) => userCan(user, p)).map(([path]) => path);
}
