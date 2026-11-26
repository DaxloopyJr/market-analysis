/** Display helpers for audit events (no API calls). */
const first = (...values) => values.find(v => v !== undefined && v !== null && String(v).trim() !== '');

/** "hod_review_values_corrected" -> "Hod review values corrected" */
export function humanize(code) {
  const text = String(code ?? '').replace(/[._-]+/g, ' ').replace(/\s+/g, ' ').trim()
    .replace(/\b(hod|ihod|ao|mdo|mdd|ido|ddo|moa|ia|iau|mau|id|ip)\b/gi, word => word.toUpperCase());
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : '';
}

/** Badge tone from the verb in the event type. */
export function eventTone(eventType) {
  const t = String(eventType ?? '').toLowerCase();
  if (/delete|remove|revoke|deactivat|disable|reject/.test(t)) return 'red';
  if (/return|correct/.test(t)) return 'amber';
  if (/publish/.test(t)) return 'violet';
  if (/approve|create|add|activat|enable|assign/.test(t)) return 'green';
  if (/update|edit|change|upload|save|review|forward|priority/.test(t)) return 'blue';
  return 'grey';
}

export const isSystemEvent = event => String(event?.actorType ?? '').toLowerCase() === 'system' || (!event?.actor && !event?.userId);

/** Actor snapshot saved at event time (never looked up from the current account). */
export function actorOf(event) {
  const actor = event?.actor ?? null;
  if (isSystemEvent(event)) return {name: 'System', initials: 'SYS', role: 'automatic', roles: [], delegations: [], system: true};
  const name = first(actor?.name, event?.userName, event?.userId ? `User #${event.userId}` : '') ?? 'Unknown user';
  const roles = (actor?.roles ?? []).map(role => (typeof role === 'string' ? {code: role, name: role} : role));
  const initials = String(name).split(/\s+/).filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase() || 'U';
  const acting = first(actor?.actingRole, roles[0]?.code);
  return {name, initials, role: acting ? `acting as ${acting}` : '', acting, roles, delegations: actor?.delegations ?? [],
    institutionId: actor?.institutionId ?? null, departmentId: actor?.departmentId ?? null, system: false};
}

const shown = value => {
  if (value === undefined || value === null || value === '') return '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
};

/** Before/after rows from oldValues / newValues (one level; nested objects shown as JSON). */
export function changeRows(event) {
  const before = event?.oldValues && typeof event.oldValues === 'object' ? event.oldValues : {};
  const after = event?.newValues && typeof event.newValues === 'object' ? event.newValues : {};
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])];
  return keys.map(key => ({field: humanize(key), before: shown(before[key]), after: shown(after[key]),
    changed: JSON.stringify(before[key] ?? null) !== JSON.stringify(after[key] ?? null)}));
}

/** Last N days as YYYY-MM-DD in Africa/Dar_es_Salaam. */
export function darDateOffset(days = 0) {
  const date = new Date(Date.now() + days * 864e5);
  return date.toLocaleDateString('en-CA', {timeZone: 'Africa/Dar_es_Salaam'});
}
