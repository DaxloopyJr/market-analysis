// Sanctum session in this browser tab. No mock token or localStorage.
// sessionStorage is exposed to same-origin JS; production should evaluate
// HttpOnly cookies/BFF to lower XSS token-exposure risk.
const KEY = "viwanda.auth.token.v1";
let memory = null;
export function clearAuthSession() { memory = null; try { sessionStorage.removeItem(KEY); } catch {} }
export function setAuthSession({ token, expires_at }) {
  const expires = Date.parse(expires_at);
  if (typeof token !== "string" || !token || !Number.isFinite(expires) || expires <= Date.now()) {
    throw new Error("Invalid login token or expiry.");
  }
  memory = { token, expires_at };
  try { sessionStorage.setItem(KEY, JSON.stringify(memory)); } catch {}
}
export function getAccessToken() {
  if (!memory) { try { memory = JSON.parse(sessionStorage.getItem(KEY) || "null"); } catch { memory = null; } }
  const expires = Date.parse(memory?.expires_at);
  if (!memory?.token || !Number.isFinite(expires) || expires <= Date.now()) {
    if (memory) clearAuthSession();
    return null;
  }
  return memory.token;
}
export const hasAuthSession = () => Boolean(getAccessToken());
