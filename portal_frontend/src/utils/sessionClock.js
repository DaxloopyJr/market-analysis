/**
 * FILE: src/utils/sessionClock.js
 * FR-051 (9 Nov 2026): when the portal last talked to Laravel, and why the last session ended.
 * Laravel refuses a token unused for SESSION_IDLE_MINUTES; IdleSessionGuard keeps an active user's token alive
 * and signs an inactive user out first.
 */
let lastApiUse = Date.now();
export const markApiUse = () => { lastApiUse = Date.now(); };
export const lastApiUseAt = () => lastApiUse;

const REASON_KEY = 'viwanda.signout.reason';
export function rememberSignOutReason(reason) { try { sessionStorage.setItem(REASON_KEY, reason); } catch { /* private mode */ } }
/** Read once: the sign-in page shows why the user was signed out, then forgets it. */
export function takeSignOutReason() {
  try { const reason = sessionStorage.getItem(REASON_KEY); sessionStorage.removeItem(REASON_KEY); return reason; } catch { return null; }
}
