/**
 * Notification deep links. Never mistake auditEventId for a submission ID.
 * The current Laravel contract does not guarantee a related resource on every
 * notification: unresolved messages open Notifications details, not a fake URL.
 * TODO(BACKEND): include submissionId (or subjectType='submission', subjectId)
 * in GET /notifications and GET /notifications/{id} for guaranteed navigation.
 */
const validId = value => {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (!/^\d+$/.test(String(value))) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
};
const record = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const first = (...values) => values.find(value => value !== undefined && value !== null && value !== '');

export function notificationSubmissionId(notification) {
  const item = record(notification);
  const payload = record(item.data);
  const meta = record(item.metadata);
  const context = record(item.context);
  const related = record(item.related);
  const explicit = first(item.submissionId, item.submission_id,
    payload.submissionId, payload.submission_id,
    meta.submissionId, meta.submission_id,
    context.submissionId, context.submission_id);
  if (validId(explicit)) return validId(explicit);
  const type = String(first(item.subjectType, item.subject_type,
    item.entityType, item.entity_type, payload.subjectType, payload.subject_type,
    related.type, '')).toLowerCase();
  if (type === 'submission') {
    const byEntity = validId(first(item.subjectId, item.subject_id,
      item.entityId, item.entity_id, payload.subjectId, payload.subject_id,
      related.id));
    if (byEntity) return byEntity;
  }
  // Only an explicit submission reference is safe to recover from legacy text.
  const text = String(item.message ?? '');
  const match = text.match(/\bSUB[-\s#:]*(\d+)\b/i) ||
    text.match(/\bsubmission\s*(?:id|number|#|no\.?|reference|ref)?\s*[:#-]?\s*(\d+)\b/i);
  return match ? validId(match[1]) : null;
}

export function notificationTarget(notification, user) {
  const id = notificationSubmissionId(notification);
  if (!id) return null;
  const roleCodes = [user?.role_code, user?.roleCode,
    ...(Array.isArray(user?.roles) ? user.roles.map(role => typeof role === 'string' ? role : role?.code) : [])]
    .map(code => String(code ?? '').toUpperCase());
  const has = code => roleCodes.includes(code);
  if (has('MDD')) return {pathname:`/dashboard/mdd/review/${id}`};
  if (has('MDO')) return {pathname:`/dashboard/mdo/review/${id}`};
  if (has('AO')) return {pathname:'/dashboard/ao/pending', state:{focusSubmissionId:id}};
  if (has('HOD') || has('IHOD')) return {pathname:`/dashboard/hod/review/${id}`};
  if (has('IDO') || has('DDO')) {
    const message = String(notification?.message ?? '').toLowerCase();
    const route = /return|correction|marekebisho|rejected/.test(message) ? 'returned' : 'my';
    return {pathname:`/dashboard/submissions/${route}`, search:`?detail=${id}`};
  }
  // Unconfirmed role/resource relationships have no safe destination yet.
  return null;
}
