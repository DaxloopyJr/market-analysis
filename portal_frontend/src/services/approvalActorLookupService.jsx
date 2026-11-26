/** Approval actor names (Submitted By, Remarks, Approval History).
 * Embedded names from the submission come first. GET /users is called ONLY for
 * administrators; IHOD/AO/MDO/MDD/IDO/DDO get 403 "Huna ruhusa..." from it, so it
 * is never called for them and a denied lookup never shows a dialog.
 * Rules live in utils/approvalActorLookup.js (unit-tested).
 */
import {listUsers} from '../API/users.jsx';
import {getVerifiedUser} from '../utils/verifiedUserStore.js';
import {canListUsers, embeddedProfilesOf, safeActorLookup} from '../utils/approvalActorLookup.js';

export {canListUsers, embeddedProfilesOf};

export function lookupApprovalActorProfiles(actorIds, fetchPage = listUsers) {
  // Injected fetchPage (tests/tools) is always allowed; the real directory is admin-only.
  const allowed = fetchPage !== listUsers || canListUsers(getVerifiedUser());
  return safeActorLookup(actorIds, fetchPage, {allowed});
}
