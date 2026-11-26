/**
 * FILE: src/utils/privacyGate.js
 * FR-058: whether the signed-in user still has to accept the Privacy Notice (10 Nov 2026).
 * Laravel says so in /me (privacy_notice.needs_acceptance); the original backend has no notice endpoints, so the
 * acceptance is then remembered in this browser.
 */
export const localKey = (user, version) => `viwanda.privacy.accepted:${user?.id ?? 'anon'}:${version}`;
const readLocal = key => { try { return localStorage.getItem(key) === '1'; } catch { return false; } };

/** True while this user still has to accept the current Privacy Notice. */
export function privacyNoticeNeeded(user) {
  if (!user) return false;
  const server = user.privacy_notice;
  return server ? Boolean(server.needs_acceptance) : !readLocal(localKey(user, 1));
}
