/**
 * FILE: src/utils/yearToDate.js
 * YEAR-TO-DATE ACTUAL vs ANNUAL TARGET (aggregation rules), 27 Oct 2026.
 *
 * The annual target belongs to dataset + reporting year + indicator. The value
 * compared with it depends on the indicator's aggregationRule (API reference):
 *   sum      -> all periods of the year so far (Q1+Q2..., M1+M2...)
 *   latest   -> the current (most recent) period value
 *   average  -> mean of the periods reported so far
 *   min/max  -> lowest / highest of the periods reported so far
 *   none     -> no cross-period total: the current period only
 * Earlier periods come from GET /submissions?datasetId=... (same reporting year
 * and frequency, earlier period, not Draft). Laravel analytics stays the
 * authority for PUBLISHED totals; this is the live review/entry view.
 */
import {normalizeSubmissionRecord, submissionStatus} from './submissionValues.js';

export const AGGREGATION_RULES = ['sum','average','min','max','latest','none'];
const EXPECTED_PERIODS = {annual:1, semiannual:2, quarterly:4, monthly:12};
const FY_MONTHS = ['jul','aug','sep','oct','nov','dec','jan','feb','mar','apr','may','jun'];
const CAL_MONTHS = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];

export function aggregationRuleOf(indicator) {
  if (!indicator) return '';
  const raw = indicator.raw ?? {};
  const value = indicator.aggregationRule ?? indicator.aggregation_rule ?? raw.aggregationRule ?? raw.aggregation_rule ??
    raw.indicator?.aggregationRule ?? raw.indicator?.aggregation_rule ?? '';
  const rule = String(value).trim().toLowerCase();
  return AGGREGATION_RULES.includes(rule) ? rule : '';
}

const shortLabel = label => {
  const text = String(label ?? '');
  return text.match(/\b(Q[1-4]|H[12]|M\d{1,2})\b/i)?.[0]?.toUpperCase() ||
    text.match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\b/i)?.[0]?.slice(0,3) || text || 'Period';
};
export function frequencyFromLabel(label) {
  const text = String(label ?? '');
  if (/\bQ[1-4]\b/i.test(text)) return 'quarterly';
  if (/\bH[12]\b|semi/i.test(text)) return 'semiannual';
  if (/\bM\d{1,2}\b|\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i.test(text)) return 'monthly';
  return '';
}
export function periodOrderFromLabel(label) {
  const text = String(label ?? '');
  const q = text.match(/\bQ([1-4])\b/i) ?? text.match(/\bH([12])\b/i) ?? text.match(/\bM(\d{1,2})\b/i);
  if (q) return Number(q[1]);
  const month = text.match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i)?.[1]?.toLowerCase();
  if (month) return (/\d{4}\/\d{2,4}/.test(text) ? FY_MONTHS : CAL_MONTHS).indexOf(month) + 1;
  return null;
}
const yearKey = value => String(value ?? '').match(/\d{4}/)?.[0] ?? '';
const num = value => { const n = Number(value); return Number.isFinite(n) && n > 0 ? n : null; };

/** Facts used to match submissions of the same dataset, year and frequency. */
export function periodFacts(input) {
  const record = input?.raw && input?.values ? input : normalizeSubmissionRecord(input);
  const raw = record.raw ?? {};
  const period = raw.reportingPeriod ?? raw.reporting_period ?? {};
  const calendar = raw.reportingCalendar ?? raw.reporting_calendar ?? {};
  const label = raw.periodLabel ?? raw.period_label ?? period.label ?? record.period ?? '';
  const context = record.annualTargetContext ?? {};
  return {
    id: record.id ?? null,
    status: submissionStatus(record.status),
    datasetId: record.dataset_id ?? null,
    yearId: context.reportingYearId ?? raw.reportingYearId ?? raw.reporting_year_id ?? period.parentId ?? period.parent_id ?? null,
    yearLabel: context.yearLabel || String(label).match(/\d{4}\/\d{2,4}/)?.[0] || record.financialYear || '',
    frequency: String(raw.frequency ?? period.periodType ?? period.period_type ?? calendar.frequency ?? record.frequency ?? '').toLowerCase() || frequencyFromLabel(label),
    order: num(raw.periodNumber ?? raw.period_number ?? period.periodNumber ?? period.period_number ?? period.quarter) ?? periodOrderFromLabel(label),
    label: shortLabel(label),
    values: record.values ?? {},
  };
}

export function sameReportingYear(a, b) {
  if (a.yearId != null && b.yearId != null) return String(a.yearId) === String(b.yearId);
  return Boolean(yearKey(a.yearLabel)) && yearKey(a.yearLabel) === yearKey(b.yearLabel);
}

/**
 * Earlier periods of the SAME dataset + year + frequency, keyed by indicator:
 * {byIndicator:{8:[{label:'Q1',order:1,value:'40'}]}, periods:['Q1']}
 */
export function priorPeriodValues(current, rows = []) {
  const byIndicator = {}, periods = new Map();
  if (!current || current.order == null) return {byIndicator, periods: []};
  for (const row of rows) {
    const facts = periodFacts(row);
    if (facts.id != null && String(facts.id) === String(current.id)) continue;
    if (facts.status === 'draft') continue;               // not yet submitted
    if (current.datasetId != null && String(facts.datasetId) !== String(current.datasetId)) continue;
    if (!sameReportingYear(facts, current)) continue;
    if (current.frequency && facts.frequency && facts.frequency !== current.frequency) continue;
    if (facts.order == null || facts.order >= current.order) continue;
    periods.set(facts.order, facts.label);
    for (const [indicatorId, value] of Object.entries(facts.values)) {
      if (value === null || value === undefined || String(value).trim() === '') continue;
      (byIndicator[indicatorId] ??= []).push({label: facts.label, order: facts.order, value: String(value)});
    }
  }
  for (const list of Object.values(byIndicator)) list.sort((a, b) => a.order - b.order);
  return {byIndicator, periods: [...periods.entries()].sort((a, b) => a[0] - b[0]).map(([, label]) => label)};
}

const RULE_LABEL = {sum:'Sum', average:'Average', min:'Lowest', max:'Highest', latest:'Latest', none:'This period'};
const fmt = n => Number.isInteger(n) ? String(n) : String(Math.round(n * 1e6) / 1e6);

/**
 * Aggregate the current value with earlier periods according to the rule.
 * Returns {actual, basis, rule, periods, partial} (actual=null when nothing numeric).
 */
export function aggregateYearToDate({rule, current, currentLabel = 'This period', prior = [], frequency = ''}) {
  const effective = AGGREGATION_RULES.includes(rule) ? rule : 'none';
  const entries = [...prior.map(p => ({label: p.label, value: Number(p.value)})),
    ...(current === undefined || current === null || String(current).trim() === '' ? [] : [{label: shortLabel(currentLabel), value: Number(current)}])]
    .filter(entry => Number.isFinite(entry.value));
  const currentNumber = Number(current);
  if (effective === 'none' || effective === 'latest' || !prior.length) {
    if (!Number.isFinite(currentNumber) || String(current ?? '').trim() === '') return {actual: null, basis: '', rule: effective, periods: 0, partial: false};
    const basis = effective === 'none' ? `${shortLabel(currentLabel)} only${rule ? '' : ' · no aggregation rule'}`
      : effective === 'latest' ? `Latest (${shortLabel(currentLabel)})` : `${RULE_LABEL[effective]} · ${shortLabel(currentLabel)}`;
    return {actual: fmt(currentNumber), basis, rule: effective, periods: 1, partial: false};
  }
  if (!entries.length) return {actual: null, basis: '', rule: effective, periods: 0, partial: false};
  const values = entries.map(e => e.value);
  const total = values.reduce((a, b) => a + b, 0);
  const actual = effective === 'sum' ? total : effective === 'average' ? total / values.length
    : effective === 'min' ? Math.min(...values) : Math.max(...values);
  const span = entries.length > 1 ? `${entries[0].label}–${entries[entries.length - 1].label}` : entries[0].label;
  const expected = EXPECTED_PERIODS[frequency] ?? null;
  const partial = Boolean(expected && entries.length < expected && effective !== 'sum');
  const basis = `${RULE_LABEL[effective]} ${span} (${entries.length}${expected ? ` of ${expected}` : ''} periods)${partial ? ' · partial' : ''}`;
  return {actual: fmt(actual), basis, rule: effective, periods: entries.length, partial};
}

/** Per-indicator helper used by every page: {ytd, basis, text} (ytd=null -> use current value). */
export function ytdForIndicator({indicator, current, ytdState, facts}) {
  const key = String(indicator?.key ?? indicator?.id ?? '');
  const prior = ytdState?.byIndicator?.[key] ?? [];
  const result = aggregateYearToDate({rule: aggregationRuleOf(indicator), current, currentLabel: facts?.label, prior, frequency: facts?.frequency});
  return {ytd: result.actual, basis: result.basis, text: result.actual != null ? `To date: ${result.actual} · ${result.basis}` : ''};
}
export const shortPeriodName = shortLabel;
