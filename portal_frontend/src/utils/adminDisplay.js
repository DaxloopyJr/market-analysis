/** Display helpers for the modern administration pages (no API calls). */
const AVATAR_TONES = ['#0b5bd3', '#5b4bd6', '#0f7a2f', '#c2410c', '#b42318', '#0e7490', '#a86a00'];

export function initialsOf(name) {
  return String(name ?? '').trim().split(/\s+/).filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?';
}

/** Stable colour per person so the same user always gets the same avatar colour. */
export function avatarTone(seed) {
  const text = String(seed ?? '');
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  return AVATAR_TONES[hash % AVATAR_TONES.length];
}

/** Normalised status key + badge tone + label. */
export function adminStatus(record) {
  const raw = String(record?.status ?? (record?.is_active === true || record?.isActive === true ? 'active'
    : record?.is_active === false || record?.isActive === false ? 'inactive' : '')).toLowerCase().replace(/[\s-]+/g, '_');
  if (/^active$/.test(raw)) return {key: 'active', tone: 'green', label: 'Active'};
  if (/pending|invited|activation/.test(raw)) return {key: 'pending', tone: 'amber', label: 'Pending'};
  if (/draft/.test(raw)) return {key: 'draft', tone: 'amber', label: 'Draft'};
  if (/retired|archived|superseded/.test(raw)) return {key: 'retired', tone: 'grey', label: 'Retired'};
  if (/lock/.test(raw)) return {key: 'locked', tone: 'red', label: 'Locked'};
  if (/inactive|disabled|suspend|deactivat/.test(raw)) return {key: 'inactive', tone: 'red', label: 'Inactive'};
  return {key: raw || 'unknown', tone: 'grey', label: raw ? raw.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase()) : '—'};
}

/** First numeric value from a Laravel summary object for any of the given keys. */
export function summaryCount(summary, keys) {
  if (!summary || typeof summary !== 'object') return null;
  for (const key of keys) {
    const value = Number(summary[key]);
    if (summary[key] !== undefined && summary[key] !== null && Number.isFinite(value)) return value;
  }
  return null;
}

/** Count rows by a key function -> [{name,value}] sorted desc. */
export function countBy(rows, keyOf) {
  const map = new Map();
  for (const row of rows) {
    const key = keyOf(row);
    if (key) map.set(key, (map.get(key) ?? 0) + 1);
  }
  return [...map].sort((a, b) => b[1] - a[1]).map(([name, value]) => ({name, value}));
}

/** "12 users" / "1 user" / "…" */
export const countText = (value, word, loading = false) => loading || value === null || value === undefined
  ? '…' : `${value} ${word}${Number(value) === 1 ? '' : 's'}`;

export function shortDateTime(value) {
  const time = Date.parse(value ?? '');
  if (!Number.isFinite(time)) return null;
  const date = new Date(time), tz = 'Africa/Dar_es_Salaam';
  return {date: date.toLocaleDateString('en-GB', {day: '2-digit', month: 'short', year: 'numeric', timeZone: tz}),
    time: date.toLocaleTimeString('en-GB', {hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz})};
}
