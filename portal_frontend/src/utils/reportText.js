/**
 * FILE: src/utils/reportText.js
 * Wording and number formats for the report documents (Kiswahili default, English option) — 8 Nov 2026.
 * Pure functions: no API, no React. Numbers come only from Laravel /reports/* payloads.
 */
export const num = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
export const r1 = (v) => (num(v) === null ? null : Math.round(num(v) * 10) / 10);
const locale = (lang) => (lang === 'en' ? 'en-GB' : 'en-GB'); // same digit grouping (1,234.5) in both languages

export function fmtNumber(v, lang = 'sw', digits = 1) {
  const n = num(v);
  if (n === null) return '—';
  return n.toLocaleString(locale(lang), {maximumFractionDigits: digits});
}
export const fmtInt = (v, lang) => (num(v) === null ? '—' : Math.round(num(v)).toLocaleString(locale(lang)));
export const fmtPct = (v) => (num(v) === null ? '—' : `${r1(v)}%`);

/** TZS 93,900,697,000 -> "TZS bilioni 93.9" (sw) / "TZS 93.9 billion" (en). */
export function fmtMoney(v, lang = 'sw', {full = false} = {}) {
  const n = num(v);
  if (n === null) return '—';
  if (full) return `TZS ${Math.round(n).toLocaleString('en-GB')}`;
  const steps = [[1e12, 'trilioni', 'trillion'], [1e9, 'bilioni', 'billion'], [1e6, 'milioni', 'million']];
  for (const [size, sw, en] of steps) {
    if (Math.abs(n) >= size) {
      const value = (n / size).toLocaleString('en-GB', {maximumFractionDigits: 1});
      return lang === 'en' ? `TZS ${value} ${en}` : `TZS ${sw} ${value}`;
    }
  }
  return `TZS ${Math.round(n).toLocaleString('en-GB')}`;
}
export function fmtHours(v, lang = 'sw') {
  const n = num(v);
  if (n === null) return '—';
  if (n >= 48) return lang === 'en' ? `${r1(n / 24)} days` : `siku ${r1(n / 24)}`;
  return lang === 'en' ? `${r1(n)} h` : `saa ${r1(n)}`;
}
export function fmtDate(v, lang = 'sw') {
  if (!v) return '—';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleDateString(lang === 'en' ? 'en-GB' : 'sw-TZ', {day: '2-digit', month: 'short', year: 'numeric'});
}
export const longDate = (lang = 'sw', d = new Date()) => d.toLocaleDateString(lang === 'en' ? 'en-GB' : 'sw-TZ', {day: 'numeric', month: 'long', year: 'numeric'});

/** Laravel rating words (ReportController::rating) in both languages + a colour band. */
export const RATING = {
  'Exceeded': {sw: 'Imevuka lengo', en: 'Exceeded', tone: 'green'},
  'High': {sw: 'Juu', en: 'High', tone: 'green'},
  'Moderate': {sw: 'Wastani', en: 'Moderate', tone: 'amber'},
  'Low': {sw: 'Chini', en: 'Low', tone: 'red'},
  'Very Low': {sw: 'Chini sana', en: 'Very low', tone: 'red'},
  'Not assessed': {sw: 'Haijapimwa', en: 'Not assessed', tone: 'grey'},
};
export const RATING_ORDER = ['Exceeded', 'High', 'Moderate', 'Low', 'Very Low', 'Not assessed'];
export const ratingText = (rating, lang = 'sw') => RATING[rating]?.[lang] ?? (rating || '—');
/** Same bands as Laravel: >100 exceeded, >=71 high, >=40 moderate, >=26 low, else very low. */
export function ratingOf(pct) {
  const n = num(pct);
  if (n === null) return 'Not assessed';
  if (n > 100) return 'Exceeded';
  if (n >= 71) return 'High';
  if (n >= 40) return 'Moderate';
  if (n >= 26) return 'Low';
  return 'Very Low';
}
export const toneOf = (pct) => RATING[ratingOf(pct)].tone;
export const TONE_COLOR = {green: '#1a8f4c', amber: '#d99a06', red: '#c8323e', grey: '#8a96a8', blue: '#0b5bd3', navy: '#0a2a5c'};

export const STATUS = {
  published: {sw: 'Imechapishwa', en: 'Published'}, approved: {sw: 'Imeidhinishwa', en: 'Approved'},
  submitted: {sw: 'Imewasilishwa', en: 'Submitted'}, under_review: {sw: 'Inakaguliwa', en: 'Under review'},
  reviewed: {sw: 'Imepitiwa', en: 'Reviewed'}, returned: {sw: 'Imerudishwa', en: 'Returned'},
  draft: {sw: 'Rasimu', en: 'Draft'}, not_started: {sw: 'Haijaanza', en: 'Not started'},
};
export const statusText = (status, lang = 'sw') => STATUS[String(status ?? '').toLowerCase()]?.[lang] ?? (status ? String(status).replace(/_/g, ' ') : '—');

export const EXCEPTION = {
  'Underperformance': {sw: 'Chini ya lengo', en: 'Underperformance'},
  'Zero delivery': {sw: 'Haijatekelezwa kabisa', en: 'Zero delivery'},
  'Missing target': {sw: 'Haina lengo', en: 'Missing target'},
  'Missing actual': {sw: 'Haina takwimu halisi', en: 'Missing actual'},
  'Overachievement': {sw: 'Imevuka lengo kupita kiasi', en: 'Overachievement'},
};
export const exceptionText = (type, lang = 'sw') => EXCEPTION[type]?.[lang] ?? (type || '—');
export const QUALITY = {Pass: {sw: 'Imekamilika', en: 'Pass'}, Incomplete: {sw: 'Haijakamilika', en: 'Incomplete'},
  'Repeated corrections': {sw: 'Marekebisho ya mara kwa mara', en: 'Repeated corrections'}};

/** "2026/2027" ends on 30 June 2027: before then the year's figures are provisional. */
export function yearIsOpen(label, now = new Date()) {
  const m = String(label ?? '').match(/(\d{4})\s*[/-]\s*(\d{2,4})/);
  if (!m) return false;
  const end = Number(m[2].length === 2 ? m[1].slice(0, 2) + m[2] : m[2]);
  return now < new Date(end, 5, 30, 23, 59, 59);
}
/** The financial year before `label` among the years Laravel lists ("2026/2027" -> "2025/2026"). */
export function previousYear(label, years = []) {
  const m = String(label ?? '').match(/(\d{4})/);
  if (!m) return '';
  const start = Number(m[1]) - 1;
  return years.find(y => String(y).startsWith(String(start))) ?? '';
}

export const FREQUENCY = {annual: {sw: 'Mwaka', en: 'Annual'}, semiannual: {sw: 'Nusu mwaka', en: 'Semi-annual'}, quarterly: {sw: 'Robo mwaka', en: 'Quarterly'},
  monthly: {sw: 'Mwezi', en: 'Monthly'}, weekly: {sw: 'Wiki', en: 'Weekly'}, daily: {sw: 'Siku', en: 'Daily'}};
export const frequencyOptions = (list = [], lang = 'sw') => list.map(v => ({value: v, label: FREQUENCY[v]?.[lang] ?? v}));

/** Group rows and summarise them (charts of the operational reports). */
export function groupRows(rows, keyOf, reduce) {
  const map = new Map();
  for (const row of rows) {
    const key = keyOf(row) || '—';
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  }
  return [...map.entries()].map(([label, items]) => ({label, ...reduce(items)}));
}
export const avg = (values) => { const v = values.map(num).filter(x => x !== null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
export const sum = (values) => values.map(num).filter(x => x !== null).reduce((a, b) => a + b, 0);
export const plural = (n, one, many, lang = 'sw') => (lang === 'en' ? `${fmtInt(n, lang)} ${n === 1 ? one : many}` : `${one} ${fmtInt(n, lang)}`);

/** CSV for Excel (UTF-8 BOM, comma separated, quoted). */
export function toCsv(columns, rows, lang = 'sw') {
  const cell = (v) => { const s = v === null || v === undefined ? '' : String(v); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const head = columns.map(c => cell(c.label[lang] ?? c.label.sw));
  const body = rows.map(row => columns.map(c => cell(c.csv ? c.csv(row, lang) : c.get ? c.get(row, lang) : row[c.key])));
  return `\ufeff${[head, ...body].map(line => line.join(',')).join('\r\n')}`;
}
export function downloadText(text, filename, type = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], {type}));
  const link = Object.assign(document.createElement('a'), {href: url, download: filename});
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const qualityText = (flag, lang = 'sw') => QUALITY[flag]?.[lang] ?? (flag || '—');

/** Fixed wording of the report documents. */
export const WORDS = {
  sw: {republic: 'JAMHURI YA MUUNGANO WA TANZANIA', ministry: 'WIZARA YA VIWANDA NA BIASHARA', fy: 'Mwaka wa Fedha', period: 'Kipindi',
    allPeriods: 'Mwaka mzima hadi sasa', ref: 'Kumbukumbu Na.', date: 'Tarehe', provisional: 'TAARIFA YA AWALI',
    provisionalNote: 'Mwaka wa fedha bado unaendelea; takwimu zinaweza kubadilika baada ya taarifa zote kuchapishwa.',
    summary: 'Muhtasari', analysis: 'Uchambuzi', chart: 'Kielelezo', table: 'Jedwali', source: 'Chanzo cha takwimu',
    sourceText: 'VIWANDA PORTAL — takwimu zilizowasilishwa, kukaguliwa na kuchapishwa na Taasisi na Idara husika.',
    preparedBy: 'Imeandaliwa na', generated: 'Imetolewa', filters: 'Vichujio', scope: 'Wigo', noData: 'Hakuna takwimu kwa uchaguzi huu.',
    rows: 'rekodi', total: 'Jumla', page: 'Ukurasa', showAll: 'Onyesha zote', allScope: 'Wizara nzima (Taasisi na Idara zote)'},
  en: {republic: 'THE UNITED REPUBLIC OF TANZANIA', ministry: 'MINISTRY OF INDUSTRY AND TRADE', fy: 'Financial Year', period: 'Period',
    allPeriods: 'Year to date', ref: 'Ref. No.', date: 'Date', provisional: 'PROVISIONAL',
    provisionalNote: 'The financial year is still running; figures may change once all returns are published.',
    summary: 'Summary', analysis: 'Analysis', chart: 'Figure', table: 'Table', source: 'Data source',
    sourceText: 'VIWANDA PORTAL — figures submitted, reviewed and published by the responsible institutions and departments.',
    preparedBy: 'Prepared by', generated: 'Generated', filters: 'Filters', scope: 'Scope', noData: 'No figures for this selection.',
    rows: 'records', total: 'Total', page: 'Page', showAll: 'Show all', allScope: 'Whole Ministry (all institutions and departments)'},
};



export const EMBLEM = '/reference/national-emblem.png';

/** Cell / tile text for a value of a given format. */
export function formatValue(value, fmt, lang) {
  switch (fmt) {
    case 'int': return fmtInt(value, lang);
    case 'num': return fmtNumber(value, lang, 2);
    case 'pct': return fmtPct(value);
    case 'money': return fmtMoney(value, lang);
    case 'millions': return num(value) === null ? '—' : (num(value) / 1e6).toLocaleString('en-GB', {maximumFractionDigits: 1});
    case 'moneyFull': return num(value) === null ? '—' : Math.round(num(value)).toLocaleString('en-GB');
    case 'hours': return fmtHours(value, lang);
    case 'date': return fmtDate(value, lang);
    case 'status': return statusText(value, lang);
    case 'rating': return ratingText(value, lang);
    case 'exception': return exceptionText(value, lang);
    case 'quality': return qualityText(value, lang);
    default: return value === null || value === undefined || value === '' ? '—' : (Array.isArray(value) ? value.join(', ') : String(value));
  }
}

export function refNumber(code, year) {
  const d = new Date();
  return `WVB/VP/${code}/${String(year || '').replace(/\D+/g, '').slice(0, 8) || 'X'}/${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Each institution has its own strategic plan, so Laravel returns one objective row per plan version
 * (e.g. "A" of BRELA and "A" of TBS). Ministry-wide views combine rows with the same code: counts are added and
 * delivery is the indicator-weighted mean of the rows (equal to Laravel's average when KPI weights are 1).
 */
export function combineObjectives(rows = []) {
  const groups = new Map();
  for (const row of rows) {
    const code = String(row.strategicObjective ?? '—').trim();
    if (!groups.has(code)) groups.set(code, []);
    groups.get(code).push(row);
  }
  if ([...groups.values()].every(items => items.length === 1)) return rows;
  return [...groups.entries()].map(([code, items]) => {
    const total = (key) => items.reduce((a, r) => a + (num(r[key]) ?? 0), 0);
    const weighted = items.filter(r => num(r.deliveryPercent) !== null && num(r.indicators));
    const weight = weighted.reduce((a, r) => a + num(r.indicators), 0);
    const delivery = weight ? Math.round(weighted.reduce((a, r) => a + num(r.deliveryPercent) * num(r.indicators), 0) / weight * 100) / 100 : null;
    // Same letter can mean different objectives in different plans: keep a name only when every plan agrees.
    const names = new Set(items.map(r => String(r.objectiveDescription ?? '').trim().toLowerCase().slice(0, 24)));
    const description = names.size === 1 ? String(items[0].objectiveDescription ?? '').trim() : '';
    return {strategicObjective: code, objectiveDescription: description, indicators: total('indicators'), submissions: total('submissions'),
      institutions: items.length, fullyAchieved: total('fullyAchieved'), underperforming: total('underperforming'), deliveryPercent: delivery,
      budgetUtilisationPercent: null, compositeScore: null, rating: ratingOf(delivery), plans: items.length};
  }).sort((a, b) => a.strategicObjective.localeCompare(b.strategicObjective));
}

/** "C – Name" or, when plans differ, "C (mipango 9)". */
export const objectiveLabel = (o, lang = 'sw') => `${o.strategicObjective ?? o.label ?? '—'}${o.objectiveDescription ? ` – ${o.objectiveDescription}` : o.plans > 1 ? (lang === 'en' ? ` (${o.plans} plans)` : ` (mipango ${o.plans})`) : ''}`;

/** "Name (ROLE) · 09 Nov 2026 10:42 · Ref RPT-…" — FR-035 traceability line of a report. */
export function traceLine(trace, lang) {
  if (!trace?.generatedBy) return '';
  const roles = (trace.generatedBy.roles ?? []).join(', ');
  const at = trace.generatedAt ? `${fmtDate(trace.generatedAt, lang)} ${new Date(trace.generatedAt).toLocaleTimeString('en-GB', {hour: '2-digit', minute: '2-digit'})}` : '';
  return [`${trace.generatedBy.name}${roles ? ` (${roles}${trace.generatedBy.institutionCode ? ` · ${trace.generatedBy.institutionCode}` : ''})` : ''}`, at,
    trace.reference ? `${lang === 'en' ? 'Ref' : 'Kumb.'} ${trace.reference}` : ''].filter(Boolean).join(' · ');
}
