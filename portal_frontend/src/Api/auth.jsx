/** FILE: src/API/auth.jsx
 * FLOW: React page/module -> this module -> API/axios.jsx -> Laravel API (only where implemented).
 * TODO(BACKEND): Unverified endpoints remain documentation only.
 */
import { getCurrentUser } from "./login";
import { getVerifiedUser, rememberVerifiedUser } from "../utils/verifiedUserStore";

let pendingVerification = null;

/**
 * Login already verified /api/v1/me; reuse that exact account on navigation.
 * On page refresh there is no memory cache, so verify the Sanctum token once.
 * Never invent a fallback user or trigger a second profile request in Layout.
 */
export function getDashboardUser() {
  const cached = getVerifiedUser();
  if (cached) return Promise.resolve(cached);

  if (!pendingVerification) {
    pendingVerification = getCurrentUser()
      .then((user) => {
        rememberVerifiedUser(user);
        return user;
      })
      .finally(() => { pendingVerification = null; });
  }
  return pendingVerification;
}
