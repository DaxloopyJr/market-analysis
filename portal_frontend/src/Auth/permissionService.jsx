import { findMenuByPath, getVisibleMenu } from "../config/sidebarMenu";
import { userCan } from "../config/rolePermissions";

/**
 * UI-only permission checks.
 * Sidebar.jsx -> permissionService.jsx -> authenticated user's permissions.
 * RouteAccess.jsx -> permissionService.jsx -> authenticated user's permissions.
 * Backend must independently enforce role, action and institution/department scope.
 */
export function menuForUser(user) {
  return getVisibleMenu(user);
}

export function canAccessPath(user, pathname) {
  const item = findMenuByPath(pathname);
  return item ? userCan(user, item.permissions) : false;
}

/**
 * TODO(BACKEND) API-CONTRACT — NOT IMPLEMENTED:
 * Page: DashboardLayout.jsx -> authService.jsx -> Api.jsx
 * Example: GET /api/v1/me   (route UNCONFIRMED)
 * Expected sample response:
 * {
 *   "user": {
 *     "id": 14, "name": "Institution Admin", "role_code": "IA",
 *     "institution": { "id": 11, "name": "CAMARTEC" },
 *     "department": null,
 *     "permissions": ["dashboard.view", "users.manage_own", "audit_logs.view_own"],
 *     "scope": { "type": "institution", "institution_id": 11 }
 *   }
 * }
 *
 * Example request once backend contract is confirmed:
 *   import api from "./Api";
 *   const { data } = await api.get("/api/v1/me");
 *   return data.user;
 *
 * IMPORTANT: Laravel policies/middleware must enforce the same rule with
 * institution_id FROM authenticated identity (never trust client-supplied ID).
 * 403: forbidden; 401: session expired. UI menu hiding alone does not secure data.
 */
