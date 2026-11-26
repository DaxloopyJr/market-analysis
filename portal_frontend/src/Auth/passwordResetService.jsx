import api from "./Api";
import { describeAuthError } from "./authErrorMessages";

/**
 * PAGE: pages/Login/ForgotPassword.jsx -> this service -> POST /api/v1/forgot-password
 * Request: {email: string}
 * Proposed backend response: {status:"success",message:string} (HTTP 200)
 * 422 invalid input; 429 rate limit; 404 means backend endpoint NOT deployed.
 * Security: backend always returns the same success response for known/unknown emails.
 *
 * PAGE: pages/Login/ResetPassword.jsx -> POST /api/v1/reset-password
 * Request: {email,token,password,password_confirmation}
 * Proposed backend response: {status:"success",message:string} (HTTP 200)
 * 422 invalid/expired token or validation, 429 rate limit; 404 not deployed.
 * These are NEW endpoints: they did NOT exist in the provided backend snapshot.
 * See separate Laravel patch to enable the service and configure SMTP.
 */
export async function requestPasswordReset(email, language = "EN") {
  try {
    const response = await api.post("/forgot-password", { email: email.trim() });
    if (response.data?.status !== "success") throw new Error("Unexpected password recovery response");
    return { ok: true };
  } catch (error) {
    return { ok: false, ...describeAuthError(error, language, "forgot") };
  }
}

export async function submitPasswordReset({ email, token, password, passwordConfirmation }, language = "EN") {
  try {
    const response = await api.post("/reset-password", {
      email: email.trim(),
      token,
      password,
      password_confirmation: passwordConfirmation,
    });
    if (response.data?.status !== "success") throw new Error("Unexpected password reset response");
    return { ok: true };
  } catch (error) {
    return { ok: false, ...describeAuthError(error, language, "reset") };
  }
}
