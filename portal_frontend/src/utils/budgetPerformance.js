/**
 * FILE: src/utils/budgetPerformance.js
 * Budget and implementation notes for one submission (29 Oct 2026 contract).
 * READ:  GET /submissions/{id} (and submission-context):
 *          data.annualBudgetContext {reportingYearId,yearLabel,approvedBudget,legacyApprovedBudget,optional,readOnly}
 *          data.performance {approved_budget,budget_scope,actual_received,actual_expenditure,
 *                            achievements,implementation_challenges,corrective_actions,me_comments}
 *          submittedVersions[].performance_snapshot = frozen copy of what was submitted.
 * WRITE: PUT /submissions/{id}/values {…, performance:{actual_received,actual_expenditure,achievements,
 *          implementation_challenges,corrective_actions[,approved_budget]}}
 *        approved_budget is set ONCE per reporting year; after that Laravel keeps it locked.
 * Balance and the spending status are display-only (never sent).
 */
const asObject = (value) => (value && typeof value === 'object' && !Array.isArray(value) ? value : null);
const pick = (o, ...keys) => { for (const k of keys) if (o && o[k] !== undefined) return o[k]; return undefined; };

/** "1,200,000" / "1 200 000.50" -> 1200000.5 ; blank/invalid -> null */
export function parseMoney(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).replace(/[,\s]/g, '').replace(/^TZS/i, '');
  if (text === '' || !/^-?\d+(\.\d+)?$/.test(text)) return null;
  return Number(text);
}
export const moneyInputText = (value) => {
  const text = String(value ?? '').replace(/[^\d.]/g, '');
  const [whole, ...rest] = text.split('.');
  const grouped = whole.replace(/^0+(?=\d)/, '').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return rest.length ? `${grouped}.${rest.join('').slice(0, 2)}` : grouped;
};
export function formatTzs(value, {compact = false} = {}) {
  const n = typeof value === 'number' ? value : parseMoney(value);
  if (n === null || !Number.isFinite(n)) return '—';
  const sign = n < 0 ? '−' : '';
  const abs = Math.abs(n);
  if (compact && abs >= 1e9) return `${sign}TZS ${(abs / 1e9).toLocaleString('en-US', {maximumFractionDigits: 2})}B`;
  if (compact && abs >= 1e6) return `${sign}TZS ${(abs / 1e6).toLocaleString('en-US', {maximumFractionDigits: 1})}M`;
  return `${sign}TZS ${abs.toLocaleString('en-US', {maximumFractionDigits: 2})}`;
}

export function normalizePerformance(raw) {
  const o = asObject(raw);
  if (!o) return null;
  const text = (v) => (v === null || v === undefined ? '' : String(v));
  return {
    approvedBudget: parseMoney(pick(o, 'approved_budget', 'approvedBudget')),
    budgetScope: pick(o, 'budget_scope', 'budgetScope') ?? 'annual',
    received: parseMoney(pick(o, 'actual_received', 'actualReceived')),
    spent: parseMoney(pick(o, 'actual_expenditure', 'actualExpenditure')),
    achievements: text(pick(o, 'achievements')),
    challenges: text(pick(o, 'implementation_challenges', 'implementationChallenges')),
    correctiveActions: text(pick(o, 'corrective_actions', 'correctiveActions')),
    meComments: text(pick(o, 'me_comments', 'meComments')),
  };
}

function layersOf(source) {
  const root = asObject(source);
  if (!root) return [];
  return [root, root.raw, root.data, root.raw?.data, root.data?.data].filter(asObject);
}
function latestSnapshot(layer) {
  const versions = layer?.submittedVersions ?? layer?.submitted_versions;
  if (!Array.isArray(versions)) return null;
  const ordered = [...versions].sort((a, b) => Number(b?.attempt ?? b?.id ?? 0) - Number(a?.attempt ?? a?.id ?? 0));
  for (const v of ordered) { const s = asObject(v?.performance_snapshot ?? v?.performanceSnapshot); if (s) return s; }
  return null;
}

/** Live performance (draft) or the frozen snapshot when the live block is missing. */
export function performanceOf(source, {preferSnapshot = false} = {}) {
  const layers = layersOf(source);
  for (const layer of layers) { if (layer.__performance) return layer; if (layer.performance?.__performance && !preferSnapshot) return layer.performance; }
  let live = null; let snap = null;
  // Only a budget/notes block counts (other pages may use `performance` for indicator scores).
  const known = (o) => (asObject(o) && ['actual_received', 'actual_expenditure', 'achievements', 'implementation_challenges',
    'corrective_actions', 'approved_budget', 'actualReceived', 'actualExpenditure'].some(k => k in o) ? o : null);
  for (const layer of layers) {
    live = live || known(layer.performance);
    snap = snap || latestSnapshot(layer);
  }
  const chosen = preferSnapshot ? (snap || live) : (live || snap);
  const result = normalizePerformance(chosen);
  return result ? {...result, __performance: true} : null;
}

export function annualBudgetContextOf(source) {
  for (const layer of layersOf(source)) {
    if (layer.__budgetContext) return layer;
    const c = asObject(layer.annualBudgetContext) || asObject(layer.annual_budget_context);
    if (!c) continue;
    const approved = parseMoney(pick(c, 'approvedBudget', 'approved_budget'));
    const legacy = parseMoney(pick(c, 'legacyApprovedBudget', 'legacy_approved_budget'));
    return {
      __budgetContext: true,
      reportingYearId: pick(c, 'reportingYearId', 'reporting_year_id') ?? null,
      yearLabel: pick(c, 'yearLabel', 'year_label') ?? '',
      approvedBudget: approved ?? legacy,
      optional: pick(c, 'optional') !== false,
      readOnly: !!pick(c, 'readOnly', 'read_only'),
      // Once set for the year it can never be changed.
      locked: approved !== null || legacy !== null || !!pick(c, 'readOnly', 'read_only'),
    };
  }
  return null;
}

/** Form state <-> server performance. */
export const emptyPerformanceForm = () => ({approvedBudget: '', received: '', spent: '', achievements: '', challenges: '', correctiveActions: ''});
export function performanceForm(perf) {
  if (!perf) return emptyPerformanceForm();
  const m = (v) => (v === null || v === undefined ? '' : moneyInputText(String(v)));
  return {approvedBudget: m(perf.approvedBudget), received: m(perf.received), spent: m(perf.spent),
    achievements: perf.achievements || '', challenges: perf.challenges || '', correctiveActions: perf.correctiveActions || ''};
}
export const hasPerformanceInput = (form) => !!form && Object.values(form).some(v => String(v ?? '').trim() !== '');

/** Only the approved budget for a year not yet set is sent; once locked it is omitted. */
export function performancePayload(form, context) {
  if (!form) return null;
  const text = (v) => (String(v ?? '').trim() === '' ? null : String(v).trim());
  const payload = {
    actual_received: parseMoney(form.received),
    actual_expenditure: parseMoney(form.spent),
    achievements: text(form.achievements),
    implementation_challenges: text(form.challenges),
    corrective_actions: text(form.correctiveActions),
  };
  const approved = parseMoney(form.approvedBudget);
  if (!context?.locked && approved !== null) payload.approved_budget = approved;
  return payload;
}
export function savedPerformanceMatch(serverPerf, payload) {
  if (!payload) return true;
  if (!serverPerf) return false;
  const pairs = [['actual_received', 'received'], ['actual_expenditure', 'spent'], ['achievements', 'achievements'],
    ['implementation_challenges', 'challenges'], ['corrective_actions', 'correctiveActions'], ['approved_budget', 'approvedBudget']];
  return pairs.every(([k, f]) => {
    if (!(k in payload) || payload[k] === null) return true;
    const got = serverPerf[f];
    return typeof payload[k] === 'number' ? Number(got) === payload[k] : String(got ?? '').trim() === payload[k];
  });
}

export function performanceErrors(form, context) {
  const errors = {};
  for (const f of ['approvedBudget', 'received', 'spent']) {
    const raw = String(form?.[f] ?? '').trim();
    if (raw && (parseMoney(raw) === null || parseMoney(raw) < 0)) errors[f] = 'Enter a valid amount (TZS).';
  }
  if (context && context.optional === false) {
    if (!String(form?.received ?? '').trim()) errors.received = 'Funds received is required.';
    if (!String(form?.spent ?? '').trim()) errors.spent = 'Funds spent is required.';
  }
  if (!String(form?.achievements ?? '').trim()) errors.achievements = 'Describe the achievements for this period.';
  if (!String(form?.challenges ?? '').trim()) errors.challenges = 'Describe the challenges for this period.';
  return errors;
}

/**
 * Spending status: compare money SPENT with money RECEIVED.
 *   above  : spent > received                -> "Above budget"
 *   within : 90–100% of received spent       -> "Within budget"
 *   under  : below 90% of received spent     -> "Under budget"
 *   none   : nothing received, nothing spent -> "No funds received"
 * Also flags spending beyond the approved annual budget.
 */
export const UNDER_SPEND_THRESHOLD = 90;
export function budgetStatus({received, spent, approved = null}) {
  const r = received ?? null; const s = spent ?? null;
  if (r === null && s === null) return null;
  const R = r ?? 0; const S = s ?? 0;
  const overApproved = approved !== null && approved > 0 && S > approved;
  const approvedNote = overApproved ? ` Spending is also ${formatTzs(S - approved, {compact: true})} above the approved annual budget.` : '';
  if (R <= 0 && S <= 0) return {key: 'none', label: 'No funds received', tone: 'muted', percent: null, balance: 0,
    message: 'No funds have been received or spent yet.'};
  if (R <= 0) return {key: 'above', label: 'Above budget', tone: 'danger', percent: null, balance: -S, overApproved,
    message: `${formatTzs(S, {compact: true})} spent without any funds received.${approvedNote}`};
  const percent = Math.round((S / R) * 100);
  const balance = R - S;
  if (S > R) return {key: 'above', label: 'Above budget', tone: 'danger', percent, balance, overApproved,
    message: `Spending is ${formatTzs(S - R, {compact: true})} more than funds received (${percent}% of funds received).${approvedNote}`};
  if (percent >= UNDER_SPEND_THRESHOLD) return {key: 'within', label: 'Within budget', tone: 'success', percent, balance, overApproved,
    message: `${percent}% of funds received has been spent.${approvedNote}`};
  return {key: 'under', label: 'Under budget', tone: 'warning', percent, balance, overApproved,
    message: `Only ${percent}% of funds received has been spent; ${formatTzs(balance, {compact: true})} is unspent.${approvedNote}`};
}

/** Year-to-date totals across this dataset's reports of the same year (current form replaces its own saved row). */
export function yearToDateBudget(records = [], {currentId = null, current = null, yearLabel = '', financialYear = ''} = {}) {
  const sameYear = (rec) => {
    const label = String(rec?.raw?.periodLabel ?? rec?.raw?.period_label ?? '');
    if (yearLabel && label) return label.startsWith(yearLabel);
    return !financialYear || !rec?.financialYear || rec.financialYear === financialYear;
  };
  let received = 0; let spent = 0; let any = false; const periods = [];
  for (const rec of records) {
    if (!rec || (currentId != null && String(rec.id) === String(currentId)) || !sameYear(rec)) continue;
    const p = rec.performance || performanceOf(rec);
    if (!p || (p.received === null && p.spent === null)) continue;
    received += p.received ?? 0; spent += p.spent ?? 0; any = true;
    periods.push(String(rec?.raw?.periodLabel ?? rec?.period_label ?? '').replace(yearLabel, '').trim() || `#${rec.id}`);
  }
  if (current && (current.received !== null || current.spent !== null)) {
    received += current.received ?? 0; spent += current.spent ?? 0; any = true; periods.push('this report');
  }
  return any ? {received, spent, balance: received - spent, periods} : null;
}
