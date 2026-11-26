import { validateLogin } from "./validation";
import { clearMockSession, createMockSession, isMockAuthEnabled } from "./sessionService";
import api from "./Api";
/**
 * PAGE: pages/Login/Login.jsx
 * SERVICE: Auth/loginService.jsx
 * HTTP CLIENT: Auth/Api.jsx
 *
 * submitLogin() returns { ok: true, data } or { ok: false, errors/message }.
 * Currently local MOCK mode only, so no credentials are sent to a server.
 */
export async function submitLogin(credentials, language = "EN") {
  const errors = validateLogin(credentials, language);

  if (Object.keys(errors).length > 0) {
    return {
      ok: false,
      errors,
    };
  }

  try {
    //const data = await loginUser(credentials);
 const response = await api.post("/login", credentials);
  const data = response.data;
console.log(data);
    return {
      ok: true,
      data,
    };
  } catch (error) {
    return {
      ok: false,
      message: error.message || "Login failed. Please try again.",
    };
  }
}

/*export async function loginUser(credentials) {
  if (!isMockAuthEnabled()) {
    throw new Error(
      "Laravel authentication is not configured yet. Enable mock mode for local testing."
    );
  }

  // Simulated network delay ONLY to preview the loading overlay.
  // Remove this when integrating the real backend.
  await new Promise((resolve) => setTimeout(resolve, 1200));

  // Never persist, log, or send the password in mock mode.
  void credentials;
  const session = createMockSession();

  return {
    mode: "mock",
    user: session.user,
  };
}
*/

 /* TODO(BACKEND): real login API integration, currently NOT called.
 *
 * Known from earlier testing: POST /api/v1/login (method and route).
 * Request/response fields and token-vs-cookie strategy are NOT confirmed.
 *
 * Example code (put inside loginUser AFTER confirming backend contract):
 *
 * 
 *
  const payload = {
    email: credentials.email.trim(),
    password: credentials.password,
  };
 */
  // IF using Sanctum SPA cookie auth, first request CSRF cookie:
  // await api.get("/sanctum/csrf-cookie");
 
 
 
  // return data;
  //console.log(data);
 /* Possible example token response (NOT CONFIRMED):
 * {
 *   "access_token": "<issued-by-backend>",
 *   "token_type": "Bearer",
 *   "user": {
 *     "id": 1,
 *     "name": "Officer",
 *     "role": "Data Officer",
 *     "institution": { "id": 5, "name": "CAMARTEC" },
 *     "permissions": ["dashboard.view"]
 *   }
 * }
 *
 * If the API supports usernames instead of only emails, confirm whether
 * to send {username: credentials.email} or a general identifier field.
 * Configure Axios credentials/CORS based on the actual authentication type.
 * Never console.log credentials, passwords, or access tokens.
 */

export async function getCurrentUser() {
  // TODO(BACKEND): confirm endpoint. Example ONLY (not implemented):
  // import api from "./Api";
  // const response = await api.get("/api/v1/me");
  // return response.data.user;
  throw new Error("Current-user API has not been configured.");
}

export async function logoutUser() {
  if (isMockAuthEnabled()) {
    clearMockSession();
    return;
  }

  // TODO(BACKEND): example ONLY; confirm path and method:
  // import api from "./Api";
  // await api.post("/api/v1/logout");
  // Clear authenticated user state after a successful response.
  throw new Error("Logout API has not been configured.");
}
