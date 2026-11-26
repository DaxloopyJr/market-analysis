import { mockPermissionsForRole, ROLE_LABELS } from "../config/rolePermissions";

/**
 * Development ONLY: mock session for role UI preview.
 * Login.jsx -> loginService.jsx -> sessionService.jsx
 * DashboardLayout.jsx -> authService.jsx -> sessionService.jsx
 * Never use this data for server-side authorization and never store passwords.
 */
const MOCK_SESSION_KEY = "viwanda_mock_session_v1";

export function isMockAuthEnabled() {
  return import.meta.env.DEV && import.meta.env.VITE_AUTH_MODE === "mock";
}

function buildPreviewUser(roleCode = "IDO") {
  const validCode = ROLE_LABELS[roleCode] ? roleCode : "IDO";
  const institutionRoles = ["IA", "IDO", "IM", "AO", "HoD"];
  const departmentRoles = ["DDO", "MDO", "DD"];

  // EXAMPLES ONLY; Laravel must derive scope from authenticated account.
  const institution = institutionRoles.includes(validCode)
    ? { id: "demo-institution", name: "CAMARTEC" }
    : null;
  const department = departmentRoles.includes(validCode)
    ? { id: "demo-department", name: "Department of Industry Development" }
    : null;

  return {
    id: `demo-${validCode.toLowerCase()}`,
    name: "Demo Officer",
    role_code: validCode,
    role: ROLE_LABELS[validCode],
    institution,
    department,
    permissions: mockPermissionsForRole(validCode),
    scope: institution
      ? { type: "institution", institution_id: institution.id }
      : department
        ? { type: "department", department_id: department.id }
        : { type: "ministry" },
  };
}

export function createMockSession(roleCode = "IDO") {
  if (!isMockAuthEnabled()) {
    throw new Error("Mock login is disabled. Set VITE_AUTH_MODE=mock for local testing.");
  }
  const session = {
    mode: "mock", user: buildPreviewUser(roleCode), createdAt: new Date().toISOString(),
  };
  sessionStorage.setItem(MOCK_SESSION_KEY, JSON.stringify(session));
  return session;
}

export function getMockSession() {
  if (!isMockAuthEnabled()) return null;
  try {
    const raw = sessionStorage.getItem(MOCK_SESSION_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw);
    if (session?.mode !== "mock" || !session?.user?.id) return null;
    // Migrate REV12 demo sessions (no role_code/permissions yet).
    if (!session.user.role_code || !Array.isArray(session.user.permissions) || session.user.permissions.length === 0) {
      session.user = buildPreviewUser("IDO");
      sessionStorage.setItem(MOCK_SESSION_KEY, JSON.stringify(session));
    }
    return session;
  } catch {
    return null;
  }
}

export function setMockPreviewRole(roleCode) {
  if (!isMockAuthEnabled()) throw new Error("Role simulation is disabled.");
  if (!ROLE_LABELS[roleCode]) throw new Error("Unknown preview role.");
  const session = getMockSession();
  if (!session) throw new Error("Please sign in to preview roles.");
  session.user = buildPreviewUser(roleCode);
  session.createdAt = new Date().toISOString();
  sessionStorage.setItem(MOCK_SESSION_KEY, JSON.stringify(session));
  return session.user;
}

export function clearMockSession() {
  try {
    sessionStorage.removeItem(MOCK_SESSION_KEY);
    // DEV ONLY: isolate previous officer's locally saved sample submissions.
    for (let i = sessionStorage.length - 1; i >= 0; i -= 1) {
      const key = sessionStorage.key(i);
      if (key?.startsWith("viwanda.rev14.ido.submissions.")) {
        sessionStorage.removeItem(key);
      }
    }
  } catch { /* no-op */ }
}

/**
 * TODO(BACKEND) Session management — Laravel strategy NOT CONFIRMED.
 * Page: pages/Login/Login.jsx -> Auth/loginService.jsx -> Auth/Api.jsx
 * Example: POST /api/v1/login with { email, password } (path from prior test).
 * Example response (NOT CONFIRMED):
 * { "access_token": "BACKEND_ISSUED", "user": { "id": 1, "role_code": "IA", "permissions": [] } }
 * Do not store password or tokens in demo sessionStorage.
 * Choose EITHER HttpOnly Sanctum cookie flow OR bearer token flow with
 * the backend/security team; implement refresh/expiration/401/logout there.
 */
