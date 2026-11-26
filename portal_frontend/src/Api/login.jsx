/** FILE: src/API/login.jsx
 * FLOW: React page/module -> this module -> API/axios.jsx -> Laravel API (only where implemented).
 * TODO(BACKEND): Unverified endpoints remain documentation only.
 */
import { validateLogin } from "../utils/authValidation";
import api from "./axios";
import { clearAuthSession, getAccessToken, setAuthSession } from "../utils/tokenService";
import { adaptBackendUser } from "../utils/userAdapter";
import { describeAuthError } from "../utils/authErrorMessages";
import { clearVerifiedUser, rememberVerifiedUser } from "../utils/verifiedUserStore";
import { mfaChallengeFrom, resendMfaLogin, verifyMfaLogin } from "./mfa";

/**
 * ACTUAL LARAVEL CONTRACT (IP configured in .env):
 * POST /api/v1/login {login,password,device?}
 *   -> {status:"success",data:{token,token_type,expires_at,user}}            (MFA off)
 *   -> {status:"success",data:{mfa_required:true,challenge_id,method,
 *        masked_destination,expires_at}}                                      (MFA on: no token yet)
 *   MFA on -> POST /mfa/login/verify issues the token (see API/mfa.js).
 * GET /api/v1/me with Authorization: Bearer <token>
 *   -> {status:"success",data:{id,roles,permissions,menu,...}}
 * POST /api/v1/logout with Authorization: Bearer <token>
 * 422 invalid credentials, 403 disabled, 401 invalid token.
 * Login may return lockout error after 3 failed credentials per Backend Team.
 * Lockout itself is enforced by Laravel; client displays backend message/status.
 * The supplied endpoint list did not specify the exact locked-login status.
 * No loading overlay until BOTH /login and /me and dashboard.view succeed.
 */
export async function submitLogin(credentials, language = "EN") {
  const errors = validateLogin(credentials, language);
  if (Object.keys(errors).length > 0) {
    return { ok: false, kind: "validation", errors };
  }

  try {
    const { user, message, mfa } = await loginUser(credentials);
    // MFA enabled for this account: no token yet; Login.jsx shows the OTP step.
    if (mfa) return { ok: true, mfa, message };
    return await authorizeDashboard(user, message, language);
  } catch (error) {
    clearVerifiedUser();
    return { ok: false, kind: "api", ...describeAuthError(error, language, "login") };
  }
}

/** Second step when MFA is enabled: verify OTP -> token -> /me -> dashboard.view check. */
export async function submitMfaCode(challengeId, code, language = "EN") {
  try {
    const { payload, message } = await verifyMfaLogin(challengeId, code);
    const user = await startSession(payload);
    return await authorizeDashboard(user, message, language);
  } catch (error) {
    clearVerifiedUser();
    return { ok: false, kind: "api", ...describeAuthError(error, language, "login") };
  }
}

export async function resendMfaCode(challengeId, language = "EN") {
  try {
    const { challenge, message } = await resendMfaLogin(challengeId);
    return { ok: true, challenge, message };
  } catch (error) {
    return { ok: false, kind: "api", ...describeAuthError(error, language, "login") };
  }
}

async function authorizeDashboard(user, message, language) {
  if (!user.permissions?.includes("dashboard.view")) {
    try { await logoutUser(); } catch { /* logout always clears locally */ }
    return {
      ok: false,
      kind: "permission",
      title: language === "SW" ? "Huna ruhusa" : "No dashboard access",
      message: language === "SW" ? "Wasiliana na msimamizi wa mfumo." : "Contact your system administrator.",
    };
  }
  // Cache only the authenticated, Laravel-authorized profile.
  // ProtectedRoute and DashboardLayout will reuse it without loading again.
  rememberVerifiedUser(user);
  return { ok: true, data: { user }, message };
}

export async function loginUser(credentials) {
  clearVerifiedUser();
  clearAuthSession();

  const response = await api.post("/login", {
    login: credentials.email.trim(),
    password: credentials.password,
    device: "viwanda-web",
  });
  const payload = response.data?.data;
  if (response.data?.status !== "success") {
    // HTTP 2xx may still contain a backend rejection; preserve its message.
    const failure = new Error("Login was rejected.");
    failure.response = response;
    throw failure;
  }
  const message = typeof response.data?.message === "string" ? response.data.message : "";
  const mfa = mfaChallengeFrom(payload);
  if (mfa) return { mfa, message };
  const user = await startSession(payload);
  return { user, message };
}

/** Store the Bearer token from /login or /mfa/login/verify, then load the verified /me profile. */
async function startSession(payload) {
  if (payload?.token_type !== "Bearer" || !payload?.token || !payload?.user) {
    throw new Error("The server sent an unexpected response.");
  }
  setAuthSession(payload);
  try {
    return await getCurrentUser();
  } catch (error) {
    clearAuthSession();
    throw error;
  }
}

export async function getCurrentUser() {
  if (!getAccessToken()) {
    throw new Error("Session expired. Please sign in again.");
  }
  const response = await api.get("/me");
  if (response.data?.status !== "success" || !response.data?.data) {
    throw new Error("The server sent an unexpected response.");
  }
  return adaptBackendUser(response.data.data);
}

export async function logoutUser() {
  try {
    if (!getAccessToken()) throw new Error("Session already expired.");
    // ACTUAL LARAVEL: POST /api/v1/logout -> {status:"success", message:"Logged out."}
    // Do not report successful server logout when the API has not confirmed it.
    const response = await api.post("/logout");
    if (response.data?.status !== "success") {
      const error = new Error("Server did not confirm logout.");
      error.response = response;
      throw error;
    }
    return { message: typeof response.data?.message === "string" ? response.data.message : "" };
  } finally {
    // A failed network/API request must still end access in this browser tab.
    clearVerifiedUser();
    clearAuthSession();
  }
}
