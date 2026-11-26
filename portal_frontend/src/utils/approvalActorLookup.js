/** Pure, testable rules for approval-actor name lookup (see services/approvalActorLookupService.jsx).
 * 1. Embedded actor snapshots in the submission (every role).
 * 2. GET /users only for administrators (users.manage.ministry / users.manage.institution).
 * 3. 403/404 from the lookup are silent; only 401 propagates. */
import {findApprovalActorsPaged, embeddedApprovalActorProfiles} from './approvalActorPresentation.js';

export function canListUsers(user) {
  const permissions = Array.isArray(user?.permissions) ? user.permissions : [];
  return permissions.includes('users.manage.ministry') || permissions.includes('users.manage.institution');
}

export function embeddedProfilesOf(records) {
  return (Array.isArray(records) ? records : [records]).filter(Boolean)
    .reduce((all, record) => ({...embeddedApprovalActorProfiles(record), ...all}), {});
}

export async function safeActorLookup(actorIds, fetchPage, {allowed = true} = {}) {
  const ids = [...new Set((actorIds ?? []).map(String).filter(id => /^\d+$/.test(id)))];
  if (!ids.length || !allowed || typeof fetchPage !== 'function') return {};
  try {
    return await findApprovalActorsPaged(ids, fetchPage);
  } catch (error) {
    if (error?.response?.status === 401) throw error;
    return {};
  }
}
