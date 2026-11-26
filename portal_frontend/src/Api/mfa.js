/**
 * FILE: src/API/mfa.js
 * FLOW: Login.jsx (MfaVerify) / Admin Users.jsx -> this module -> API/axios.jsx -> Laravel.
 *
 * CONFIRMED LARAVEL CONTRACT (29 Oct 2026):
 *  POST /mfa/login/verify  {challenge_id, code, device?}
 *    -> 200 {status:"success",data:{token,token_type:"Bearer",expires_at,user}}
 *    422 invalid/expired code or attempt limit (5 failed attempts); 403 inactive user / invalid challenge.
 *  POST /mfa/login/resend  {challenge_id}
 *    -> 200 {status:"success",message,data:{mfa_required:true,challenge_id,method,masked_destination,expires_at,dev_code?}}
 *    422, 403 or 502 delivery failure. Challenges are single-use and expire after 10 minutes.
 *
 * PENDING (Backend Team will supply): admin endpoint to enable/disable MFA for a user.
 *  The frontend is ready; only ADMIN_USER_MFA_ROUTE / payload below may need adjusting.
 *  NOTE: PUT /profile/mfa (self-service, current_password) is intentionally NOT used:
 *  MFA is managed by administrators only.
 */
import api from "./axios";
import { operationResult } from "./resourceHelpers";

export const MFA_DEVICE = "viwanda-web";

/** Normalises the MFA challenge returned by POST /login or /mfa/login/resend. */
export function mfaChallengeFrom(data) {
  if (!data || data.mfa_required !== true || !data.challenge_id) return null;
  return {
    challengeId: String(data.challenge_id),
    method: data.method === "sms" ? "sms" : "email",
    maskedDestination: typeof data.masked_destination === "string" ? data.masked_destination : "",
    expiresAt: data.expires_at || new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    // Non-production Laravel may return dev_code for testing; never invented here.
    devCode: data.dev_code ? String(data.dev_code) : "",
  };
}

export async function verifyMfaLogin(challengeId, code) {
  const response = await api.post("/mfa/login/verify", { challenge_id: challengeId, code, device: MFA_DEVICE });
  if (response.data?.status !== "success") {
    const failure = new Error("MFA verification was rejected.");
    failure.response = response;
    throw failure;
  }
  return { payload: response.data?.data, message: typeof response.data?.message === "string" ? response.data.message : "" };
}

export async function resendMfaLogin(challengeId) {
  const response = await api.post("/mfa/login/resend", { challenge_id: challengeId });
  const challenge = mfaChallengeFrom(response.data?.data);
  if (response.data?.status !== "success" || !challenge) {
    const failure = new Error("The system did not return a new MFA challenge.");
    failure.response = response;
    throw failure;
  }
  return { challenge, message: typeof response.data?.message === "string" ? response.data.message : "A new verification code has been sent." };
}

/* ---------- Admin-managed MFA (29 Oct 2026, endpoints 26–29) ----------
 *  PUT  /users/{id}  {mfa_enabled:boolean, mfa_method:"email"|"sms"|null}   (with any other editable fields)
 *  POST /users       optional {mfa_enabled, mfa_method} when creating a user
 *  GET  /users, GET /users/{id} return mfa_enabled + mfa_method.
 * Laravel: MFA fields are MOA-only today (403 for others); IA support for its own institution is
 * requested by the product owner, so the UI also offers it to IA and shows Laravel's 403 if refused.
 * SMS requires a phone on the TARGET user. Saving invalidates the user's outstanding MFA challenges;
 * the new method applies at the user's next sign-in. Never send these fields for other administrators.
 */
export const ADMIN_MFA_ROLES = ["IA", "MOA"];

/** JSON booleans; method null when disabled. */
export function adminMfaFields({ enabled, method }) {
  return { mfa_enabled: Boolean(enabled), mfa_method: enabled ? (method === "sms" ? "sms" : "email") : null };
}

export async function setUserMfa(id, { enabled, method }) {
  return operationResult(await api.put(`/users/${encodeURIComponent(id)}`, adminMfaFields({ enabled, method })));
}

/** Read MFA state from a Laravel user record; null when Laravel did not send it. */
export function userMfaState(record) {
  const raw = record?.mfa_enabled ?? record?.mfaEnabled;
  if (raw === undefined || raw === null) return null;
  const enabled = raw === true || raw === 1 || raw === "1" || raw === "true";
  const method = record?.mfa_method ?? record?.mfaMethod ?? null;
  return { enabled, method: enabled ? (method === "sms" ? "sms" : "email") : null };
}
