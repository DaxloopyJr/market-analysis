/**
 * The Laravel /api/v1/me verified profile is cached ONLY in JavaScript memory.
 * The Sanctum token is still managed by tokenService.jsx.
 * No mock users, roles or permissions are created here.
 */
import { hasAuthSession } from "./tokenService";

let verifiedUser = null;

export function rememberVerifiedUser(user) {
  if (!hasAuthSession() || !user?.permissions?.includes("dashboard.view")) {
    throw new Error("Only a verified user with dashboard access can be cached.");
  }
  verifiedUser = user;
}

export function getVerifiedUser() {
  return hasAuthSession() ? verifiedUser : null;
}

export function clearVerifiedUser() {
  verifiedUser = null;
}
