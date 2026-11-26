/**
 * FILE: src/utils/meReport.js
 * Pure M&E calculations for Institution Analytics and the PDF report (no React, unit-tested).
 * Input: Laravel /reports/{slug} payloads {rows, summary, sections}. Laravel is the authority for
 * achievement %, rating, composite score and budget figures; this file only reads, groups and
 * labels them the way the institutions' M&E Excel tools do:
 *   KPI score   = cumulative actual ÷ annual target (achievementPercent from Laravel)
 *   Objective   = Laravel deliveryPercent / compositeScore per strategic objective
 *   Institution = Laravel summary compositeScore (fallback: weighted average of objectives, capped at 100%)
 * Field names are read defensively (camelCase first, snake_case fallback).
 */

/* ---------- small helpers ---------- */
const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : null);
const first = (o, keys) => { if (!o) return undefined; for (const k of keys) { if (o[k] !== undefined && o[k] !== null && o[k] !== '') return o[k]; } return undefined; };
export const toNum = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[,%\s]/g, ''));
  return Number.isFinite(n) ? n : null;
};
const text = (v) => (v === null || v === undefined ? '' : typeof v === 'object' ? String(v.name ?? v.label ?? v.nameEn ?? v.title ?? '') : String(v));
export const round1 = (v) => (v === null || v === undefined ? null : Math.round(v * 10) / 10);
export const cap100 = (v) => (v === null || v === undefined ? null : Math.max(0, Math.min(100, v)));
const mean = (list) => { const xs = list.filter(x => x !== null && x !== undefined); return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null; };
export const rowsOf = (payload) => (Array.isArray(payload) ? payload : Array.isArray(payload?.rows) ? payload.rows : Array.isArray(payload?.data?.rows) ? payload.data.rows : []);
export const summaryOf = (payload) => obj(payload?.summary) ?? obj(payload?.data?.summary) ?? {};

/* ---------- objective code / label ---------- */
/** "F - Good Governance…" / {code,description} / "F" -> {code:'F', name:'Good Governance…'} */
export function objectiveOf(value, nameHint = '') {
  if (value && typeof value === 'object') {
    const code = text(first(value, ['code', 'objectiveCode', 'strategicObjective'])).trim();
    return {code: code || '—', name: text(first(value, ['description', 'name', 'nameEn', 'objectiveName'])) || nameHint};
  }
  const raw = text(value).trim();
  if (!raw) return {code: '—', name: nameHint || 'Not linked to an objective'};
  const m = raw.match(/^([A-Z]{1,3}|\d{1,2})\s*[-–:.)]\s*(.+)$/);
  if (m) return {code: m[1], name: m[2].trim() || nameHint};
  if (/^[A-Z]{1,3}$/.test(raw)) return {code: raw, name: nameHint};
  return {code: raw.slice(0, 3).toUpperCase(), name: raw};
}

/* ---------- period ordering ---------- */
/** "2025/2026 Q3" -> {order:3, of:4, short:'Q3'}; H1/H2 -> of 2; annual -> of 1 */
export function periodOrder(label) {
  const t = text(label);
  let m = t.match(/\bQ(?:uarter)?\s*([1-4])\b/i) || t.match(/\brobo\s*(?:ya\s*)?([1-4])\b/i);
  if (m) return {order: Number(m[1]), of: 4, short: `Q${m[1]}`};
  m = t.match(/\bH\s*([12])\b/i) || t.match(/\bhalf\s*([12])\b/i);
  if (m) return {order: Number(m[1]), of: 2, short: `H${m[1]}`};
  m = t.match(/\bM(?:onth)?\s*(\d{1,2})\b/i);
  if (m) return {order: Number(m[1]), of: 12, short: `M${m[1]}`};
  if (/annual|year|mwaka/i.test(t)) return {order: 1, of: 1, short: 'Annual'};
  return {order: null, of: null, short: t};
}

/* ---------- row normalisers ---------- */
export function normalizeKpiRow(raw) {
  const r = obj(raw) ?? {};
  const objectiveRaw = first(r, ['strategicObjective', 'strategic_objective', 'objective', 'objectiveCode']);
  const objective = objectiveOf(objectiveRaw, text(first(r, ['strategicObjectiveName', 'objectiveName', 'objectiveDescription'])));
  const periodLabel = text(first(r, ['periodLabel', 'period_label', 'reportingPeriodLabel', 'period', 'reportingPeriod']));
  const target = toNum(first(r, ['target', 'targetValue', 'annualTarget', 'target_value']));
  const actual = toNum(first(r, ['actual', 'actualValue', 'actual_value', 'value']));
  const cumActual = toNum(first(r, ['cumulativeActual', 'cumulative_actual']));
  const achievement = toNum(first(r, ['cumulativeAchievementPercent', 'achievementPercent', 'achievement_percent', 'achievement']));
  return {
    indicatorId: first(r, ['indicatorId', 'indicator_id', 'id']) ?? null,
    code: text(first(r, ['indicatorCode', 'indicator_code', 'code'])),
    name: text(first(r, ['indicatorName', 'indicator_name', 'nameEn', 'name_en', 'name', 'indicator'])) || 'Indicator',
    nameSw: text(first(r, ['indicatorNameSw', 'nameSw', 'name_sw'])),
    unit: text(first(r, ['unit', 'unitName'])),
    objective,
    resultLevel: text(first(r, ['resultLevel', 'result_level'])),
    institution: text(first(r, ['institutionName', 'institution_name', 'institution'])),
    institutionId: first(r, ['institutionId', 'institution_id']) ?? null,
    department: text(first(r, ['departmentName', 'department_name', 'department'])),
    dataset: text(first(r, ['datasetName', 'dataset_name', 'dataset'])),
    submissionId: first(r, ['submissionId', 'submission_id']) ?? null,
    period: periodLabel,
    periodId: first(r, ['reportingPeriodId', 'reporting_period_id', 'periodId']) ?? null,
    periodInfo: periodOrder(periodLabel),
    baseline: toNum(first(r, ['baseline', 'baselineValue', 'baseline_value'])),
    target,
    actual,
    cumulativeActual: cumActual,
    cumulativeTarget: toNum(first(r, ['cumulativeTarget', 'cumulative_target'])),
    achievement,
    variance: toNum(first(r, ['variance', 'varianceValue', 'targetVariance'])),
    variancePercent: toNum(first(r, ['variancePercent', 'variance_percent', 'achievementVariancePercent'])),
    rating: text(first(r, ['rating', 'performanceRating'])),
    direction: text(first(r, ['direction', 'performanceDirection', 'performance_direction'])) || 'higher',
    weight: toNum(first(r, ['weight', 'performanceWeight', 'performance_weight'])),
    budget: toNum(first(r, ['approvedBudget', 'approved_budget', 'budget'])),
    received: toNum(first(r, ['actualReceived', 'actual_received', 'received'])),
    expenditure: toNum(first(r, ['actualExpenditure', 'actual_expenditure', 'expenditure'])),
    achievements: text(first(r, ['achievements'])),
    challenges: text(first(r, ['implementationChallenges', 'implementation_challenges', 'challenges'])),
    actions: text(first(r, ['correctiveActions', 'corrective_actions'])),
    meComments: text(first(r, ['meComments', 'me_comments'])),
    remarks: text(first(r, ['remarks', 'comments'])),
    exceptionType: text(first(r, ['exceptionType', 'exception_type'])),
  };
}

export function normalizeGroupRow(raw, labelKeys) {
  const r = obj(raw) ?? {};
  const label = text(first(r, [...labelKeys, 'label', 'group', 'name'])) || '—';
  const budget = toNum(first(r, ['approvedBudget', 'approved_budget', 'budget', 'totalBudget']));
  const spent = toNum(first(r, ['actualExpenditure', 'actual_expenditure', 'expenditure', 'totalExpenditure']));
  const util = toNum(first(r, ['budgetUtilisationPercent', 'budgetUtilizationPercent', 'utilisationPercent', 'utilizationPercent', 'budgetUtilisation']));
  return {
    label,
    objective: objectiveOf(label, text(first(r, ['strategicObjectiveName', 'objectiveName', 'description']))),
    indicators: toNum(first(r, ['indicators', 'indicatorCount', 'kpis'])) ?? 0,
    submissions: toNum(first(r, ['submissions', 'submissionCount'])) ?? 0,
    institutions: toNum(first(r, ['institutions', 'institutionCount'])) ?? 0,
    delivery: toNum(first(r, ['deliveryPercent', 'delivery_percent', 'achievementPercent'])),
    composite: toNum(first(r, ['compositeScore', 'composite_score', 'score'])),
    fullyAchieved: toNum(first(r, ['fullyAchieved', 'fully_achieved'])),
    underperforming: toNum(first(r, ['underperforming', 'underPerforming'])),
    weight: toNum(first(r, ['weight', 'strategicWeight', 'objectiveWeight'])),
    budget, spent,
    utilisation: util ?? (budget ? round1((spent ?? 0) / budget * 100) : null),
    gap: toNum(first(r, ['deliveryGap', 'deliveryExpenditureGap', 'delivery_gap'])),
    rating: text(first(r, ['rating', 'performanceRating'])),
  };
}

/* ---------- bands ---------- */
/** Score bands (institution and objectives): green ≥80, amber 60–79, red <60. A Laravel rating wins when present. */
export function ratingTone(rating, score = null) {
  const t = text(rating).toLowerCase();
  if (/green|excellent|good|on.?track|achiev|very good|satisf/.test(t) && !/not|below|under/.test(t)) return 'green';
  if (/amber|yellow|moderate|fair|average|partial|attention/.test(t)) return 'amber';
  if (/red|poor|below|under|critical|weak|not/.test(t)) return 'red';
  if (score === null || score === undefined) return 'none';
  return score >= 80 ? 'green' : score >= 60 ? 'amber' : 'red';
}
export const TONE_LABEL = {
  en: {green: 'Good', amber: 'Moderate', red: 'Below target', none: 'No data'},
  sw: {green: 'Nzuri', amber: 'Wastani', red: 'Chini ya lengo', none: 'Hakuna data'},
};
/** KPI bands (cumulative achievement vs annual target). */
export function kpiBand(achievement) {
  if (achievement === null || achievement === undefined) return 'noTarget';
  if (achievement >= 100) return 'achieved';
  if (achievement >= 80) return 'onTrack';
  if (achievement >= 40) return 'partial';
  if (achievement > 0) return 'below';
  return 'notStarted';
}
export const KPI_BAND_ORDER = ['achieved', 'onTrack', 'partial', 'below', 'notStarted', 'noTarget'];
export const KPI_BAND_LABEL = {
  en: {achieved: 'Achieved (≥100%)', onTrack: 'On track (80–99%)', partial: 'Partial (40–79%)', below: 'Below (<40%)', notStarted: 'Not started (0%)', noTarget: 'No target'},
  sw: {achieved: 'Imefikiwa (≥100%)', onTrack: 'Inaendelea vizuri (80–99%)', partial: 'Kwa sehemu (40–79%)', below: 'Chini (<40%)', notStarted: 'Haijaanza (0%)', noTarget: 'Hakuna lengo'},
};

/* ---------- KPIs: one row per indicator (latest / cumulative) ---------- */
export function kpiList(indicatorRows = [], trendRows = []) {
  const byKey = new Map();
  const keyOf = (k) => `${k.institutionId ?? k.institution}|${k.indicatorId ?? k.code ?? k.name}`;
  const put = (k, fromTrend) => {
    const key = keyOf(k);
    const old = byKey.get(key);
    const newer = !old || (k.periodInfo.order ?? 0) > (old.periodInfo.order ?? 0) || (fromTrend && !old.fromTrend && (k.periodInfo.order ?? 0) >= (old.periodInfo.order ?? 0));
    const quarters = {...(old?.quarters ?? {})};
    if (k.periodInfo.short && k.actual !== null) quarters[k.periodInfo.short] = k.actual;
    const merged = newer ? {...old, ...Object.fromEntries(Object.entries(k).filter(([, v]) => v !== null && v !== '')), fromTrend} : {...k, ...old};
    // Narrative and money come from whichever row carries them.
    for (const f of ['achievements', 'challenges', 'actions', 'meComments', 'remarks', 'budget', 'expenditure', 'received']) {
      if ((merged[f] === null || merged[f] === '') && k[f] !== null && k[f] !== '') merged[f] = k[f];
    }
    merged.quarters = quarters;
    byKey.set(key, merged);
  };
  indicatorRows.map(normalizeKpiRow).forEach(k => put(k, false));
  trendRows.map(normalizeKpiRow).forEach(k => put(k, true));
  return [...byKey.values()].map(k => ({...k, band: kpiBand(k.achievement)}))
    .sort((a, b) => a.objective.code.localeCompare(b.objective.code) || a.name.localeCompare(b.name));
}

export function kpiBandCounts(kpis) {
  const counts = Object.fromEntries(KPI_BAND_ORDER.map(b => [b, 0]));
  kpis.forEach(k => { counts[k.band] += 1; });
  return {...counts, total: kpis.length, withTarget: kpis.length - counts.noTarget,
    onTrackAll: counts.achieved + counts.onTrack, belowAll: counts.below + counts.notStarted};
}

/* ---------- objectives ---------- */
export function objectiveRows(objectivePayload, kpis = []) {
  const groups = rowsOf(objectivePayload).map(r => normalizeGroupRow(r, ['strategicObjective', 'strategic_objective', 'objective']));
  const fromKpis = new Map();
  kpis.forEach(k => {
    const g = fromKpis.get(k.objective.code) ?? {code: k.objective.code, name: k.objective.name, scores: [], kpis: 0, budget: 0, spent: 0, money: false};
    g.kpis += 1; if (k.achievement !== null) g.scores.push(k.achievement);
    if (k.budget !== null || k.expenditure !== null) { g.money = true; g.budget += k.budget ?? 0; g.spent += k.expenditure ?? 0; }
    if (!g.name && k.objective.name) g.name = k.objective.name;
    fromKpis.set(k.objective.code, g);
  });
  let rows;
  if (groups.length) {
    rows = groups.map(g => {
      const local = fromKpis.get(g.objective.code);
      const score = g.composite ?? g.delivery ?? (local ? cap100(mean(local.scores)) : null);
      return {code: g.objective.code, name: g.objective.name || local?.name || '', indicators: g.indicators || local?.kpis || 0,
        // Uncapped = plain average of KPI achievement (shows over-achievement); Laravel's figure when KPIs are not listed.
        score, raw: local?.scores.length ? mean(local.scores) : g.delivery, weight: g.weight, rating: g.rating, tone: ratingTone(g.rating, score),
        fullyAchieved: g.fullyAchieved ?? (local ? local.scores.filter(x => x >= 100).length : 0),
        underperforming: g.underperforming ?? (local ? local.scores.filter(x => x < 80).length : 0),
        budget: g.budget ?? (local?.money ? local.budget : null), spent: g.spent ?? (local?.money ? local.spent : null),
        utilisation: g.utilisation ?? (local?.money && local.budget ? round1(local.spent / local.budget * 100) : null), gap: g.gap};
    });
  } else {
    rows = [...fromKpis.values()].map(g => {
      const score = cap100(mean(g.scores));
      return {code: g.code, name: g.name, indicators: g.kpis, score: round1(score), raw: round1(mean(g.scores)), weight: null, rating: '',
        tone: ratingTone('', score), fullyAchieved: g.scores.filter(s => s >= 100).length, underperforming: g.scores.filter(s => s < 80).length,
        budget: g.money ? g.budget : null, spent: g.money ? g.spent : null, utilisation: g.money && g.budget ? round1(g.spent / g.budget * 100) : null, gap: null};
    });
  }
  return rows.map(r => ({...r, score: r.score === null ? null : round1(r.score), raw: r.raw === null || r.raw === undefined ? null : round1(r.raw)}))
    .sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || a.code.localeCompare(b.code));
}

/** Institution score: Laravel summary first, then the weighted (or plain) average of capped objective scores. */
export function institutionScore(summary = {}, objectives = []) {
  const s = toNum(first(summary, ['compositeScore', 'composite_score', 'overallScore', 'deliveryPercent', 'delivery_percent']));
  if (s !== null) return {score: round1(s), source: 'laravel', rating: text(first(summary, ['rating', 'overallRating']))};
  const scored = objectives.filter(o => o.score !== null);
  if (!scored.length) return {score: null, source: 'none', rating: ''};
  const weighted = scored.every(o => o.weight !== null && o.weight > 0);
  const total = weighted ? scored.reduce((a, o) => a + o.weight, 0) : scored.length;
  const score = scored.reduce((a, o) => a + cap100(o.score) * (weighted ? o.weight : 1), 0) / total;
  return {score: round1(score), source: weighted ? 'weighted' : 'average', rating: ''};
}

/* ---------- quarterly pace ---------- */
/**
 * Cumulative institution score per period, computed like the Excel "Centre-wide score progression":
 * objective = average KPI achievement capped at 100%, institution = objectives weighted by strategic weight
 * (plain average when weights are missing). Planned pace = even share of the year (25/50/75/100% for quarters).
 */
export function quarterlyPace(kpisOrTrendRows = [], objectives = []) {
  const rows = kpisOrTrendRows.map(r => (r.periodInfo ? r : normalizeKpiRow(r)));
  const weights = Object.fromEntries(objectives.filter(o => o.weight > 0).map(o => [o.code, o.weight]));
  const byPeriod = new Map();
  rows.forEach(r => {
    if (r.periodInfo.order === null || r.achievement === null) return;
    const key = r.periodInfo.short;
    const p = byPeriod.get(key) ?? {period: key, order: r.periodInfo.order, of: r.periodInfo.of, byObjective: {}, kpis: 0};
    (p.byObjective[r.objective.code] ??= []).push(r.achievement);
    p.kpis += 1;
    byPeriod.set(key, p);
  });
  return [...byPeriod.values()].sort((a, b) => a.order - b.order).map(p => {
    const objs = Object.entries(p.byObjective).map(([code, xs]) => ({code, score: cap100(mean(xs))}));
    const weighted = objs.length && objs.every(o => weights[o.code]);
    const total = weighted ? objs.reduce((a, o) => a + weights[o.code], 0) : objs.length;
    const actual = total ? objs.reduce((a, o) => a + o.score * (weighted ? weights[o.code] : 1), 0) / total : null;
    const planned = p.of ? p.order / p.of * 100 : null;
    return {period: p.period, actual: round1(actual), planned: round1(planned), gap: planned === null || actual === null ? null : round1(actual - planned), kpis: p.kpis};
  });
}

/* ---------- exceptions ---------- */
export function exceptionList(exceptionPayload, kpis = [], limit = 10) {
  const rows = rowsOf(exceptionPayload).map(normalizeKpiRow);
  const list = rows.length ? rows : kpis.filter(k => k.achievement !== null && k.achievement < 80);
  return [...list].sort((a, b) => (a.achievement ?? -1) - (b.achievement ?? -1)).slice(0, limit);
}
export function varianceBuckets(kpis) {
  const withT = kpis.filter(k => k.achievement !== null);
  return {over: withT.filter(k => k.achievement > 100).length, on: withT.filter(k => k.achievement >= 80 && k.achievement <= 100).length,
    below: withT.filter(k => k.achievement < 80).length};
}

/* ---------- budget ---------- */
export function budgetTotals(budgetPayload, objectives = []) {
  const s = summaryOf(budgetPayload);
  let budget = toNum(first(s, ['approvedBudget', 'totalApprovedBudget', 'approved_budget', 'budget']));
  let spent = toNum(first(s, ['actualExpenditure', 'totalActualExpenditure', 'actual_expenditure', 'expenditure']));
  if (budget === null && spent === null) {
    const rows = rowsOf(budgetPayload).map(r => normalizeGroupRow(r, ['datasetName', 'institutionName']));
    const withMoney = rows.filter(r => r.budget !== null || r.spent !== null);
    const src = withMoney.length ? withMoney : objectives.filter(o => o.budget !== null || o.spent !== null);
    if (src.length) { budget = src.reduce((a, r) => a + (r.budget ?? 0), 0); spent = src.reduce((a, r) => a + (r.spent ?? 0), 0); }
  }
  if (budget === null && spent === null) return null;
  const util = toNum(first(s, ['budgetUtilisationPercent', 'budgetUtilizationPercent', 'utilisationPercent'])) ?? (budget ? round1((spent ?? 0) / budget * 100) : null);
  return {budget, spent, unspent: budget === null ? null : budget - (spent ?? 0), utilisation: util,
    delivery: toNum(first(s, ['deliveryPercent', 'delivery_percent'])), gap: toNum(first(s, ['deliveryExpenditureGap', 'deliveryGap']))};
}

/* ---------- departments ---------- */
export function departmentRows(orgPayload, kpis = []) {
  const groups = rowsOf(orgPayload).map(r => normalizeGroupRow(r, ['departmentName', 'department_name', 'institutionName']));
  const byDept = new Map();
  kpis.forEach(k => {
    const d = k.department || '—';
    const g = byDept.get(d) ?? {label: d, kpis: [], byObjective: {}};
    g.kpis.push(k);
    (g.byObjective[k.objective.code] ??= []).push(k.achievement);
    byDept.set(d, g);
  });
  const labels = groups.length ? groups.map(g => g.label) : [...byDept.keys()].filter(l => l !== '—');
  return labels.map(label => {
    const g = groups.find(x => x.label === label);
    const local = byDept.get(label);
    const counts = local ? kpiBandCounts(local.kpis) : null;
    const scores = local ? Object.fromEntries(Object.entries(local.byObjective).map(([c, xs]) => [c, round1(mean(xs.map(cap100)))])) : {};
    const score = g?.composite ?? g?.delivery ?? (local ? round1(mean(local.kpis.map(k => cap100(k.achievement)))) : null);
    return {label, indicators: g?.indicators || local?.kpis.length || 0, score, tone: ratingTone(g?.rating, score), rating: g?.rating ?? '',
      fullyAchieved: g?.fullyAchieved ?? counts?.achieved ?? 0, underperforming: g?.underperforming ?? (local ? local.kpis.filter(k => k.achievement !== null && k.achievement < 80).length : 0),
      utilisation: g?.utilisation ?? null, counts, byObjective: scores};
  }).sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
}

/* ---------- narratives from submitted reports ---------- */
export function narrativeList(kpis = [], annualPayload = null) {
  const out = []; const seen = new Set();
  const add = (kind, value, source, k = null) => {
    const t = String(value ?? '').trim();
    if (!t || seen.has(kind + t)) return;
    seen.add(kind + t);
    out.push({kind, text: t, source, objective: k && k.objective.code !== '—' ? k.objective.code : '', dataset: k?.dataset ?? '', period: k?.period ?? ''});
  };
  const sec = annualPayload?.sections?.narratives ?? annualPayload?.data?.sections?.narratives;
  (Array.isArray(sec) ? sec : []).forEach(n => {
    const k = normalizeKpiRow(n);
    const src = [k.dataset, k.period].filter(Boolean).join(' · ');
    add('achievement', k.achievements, src, k); add('challenge', k.challenges, src, k); add('action', k.actions, src, k);
  });
  kpis.forEach(k => {
    const src = [k.objective.code !== '—' ? `Objective ${k.objective.code}` : '', k.dataset, k.period].filter(Boolean).join(' · ');
    add('achievement', k.achievements, src, k); add('challenge', k.challenges, src, k); add('action', k.actions, src, k);
  });
  return out;
}

/* ---------- the whole bundle ---------- */
export function buildMeBundle(payloads = {}) {
  const kpis = kpiList(rowsOf(payloads.indicators), rowsOf(payloads.trend));
  const objectives = objectiveRows(payloads.objectives, kpis);
  const summary = {...summaryOf(payloads.objectives), ...summaryOf(payloads.indicators)};
  const score = institutionScore(summaryOf(payloads.objectives), objectives);
  const counts = kpiBandCounts(kpis);
  const trendSource = rowsOf(payloads.trend).length ? rowsOf(payloads.trend) : rowsOf(payloads.indicators);
  return {
    kpis, objectives, counts, score, summary,
    tone: ratingTone(score.rating, score.score),
    pace: quarterlyPace(trendSource, objectives),
    exceptions: exceptionList(payloads.exceptions, kpis),
    exceptionsTotal: rowsOf(payloads.exceptions).length || kpis.filter(k => k.achievement !== null && k.achievement < 80).length,
    variance: varianceBuckets(kpis),
    budget: budgetTotals(payloads.budget, objectives),
    departments: departmentRows(payloads.departments, kpis),
    narratives: narrativeList(kpis, payloads.annual),
    hasData: kpis.length > 0 || objectives.length > 0,
  };
}

/* ---------- money / percent formatting ---------- */
export function fmtMoney(v, {compact = true} = {}) {
  if (v === null || v === undefined) return '—';
  const a = Math.abs(v); const s = v < 0 ? '−' : '';
  if (compact && a >= 1e9) return `${s}${(a / 1e9).toLocaleString('en-US', {maximumFractionDigits: 2})}B`;
  if (compact && a >= 1e6) return `${s}${(a / 1e6).toLocaleString('en-US', {maximumFractionDigits: 1})}M`;
  return `${s}${a.toLocaleString('en-US', {maximumFractionDigits: 0})}`;
}
export const fmtPct = (v) => (v === null || v === undefined ? '—' : `${round1(v)}%`);

/* ---------- generated text (EN / SW) ---------- */
const listJoin = (items, lang) => (items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} ${lang === 'sw' ? 'na' : 'and'} ${items[items.length - 1]}`);

export function summarySentences(bundle, {name = 'The institution', lang = 'en', year = '', periodLabel = ''} = {}) {
  const {score, counts, objectives, budget, pace} = bundle;
  const sw = lang === 'sw';
  const tone = TONE_LABEL[sw ? 'sw' : 'en'][bundle.tone];
  // Dataset groups (analytics fallback) are named, objectives keep their code.
  const tag = (o) => (bundle.groupBy === 'dataset' ? o.name : o.code);
  const good = objectives.filter(o => o.tone === 'green').map(tag);
  const weak = objectives.filter(o => o.tone === 'red').map(o => `${tag(o)} (${fmtPct(o.score)})`);
  const last = pace[pace.length - 1];
  const out = [];
  if (score.score !== null) out.push(sw
    ? `${name} imepata alama ya jumla ya ${fmtPct(score.score)} (${tone}) kwa viashiria ${counts.total}${year ? ` katika mwaka ${year}` : ''}${periodLabel ? ` (${periodLabel})` : ''}.`
    : `${name} scored ${fmtPct(score.score)} (${tone}) on ${counts.total} KPIs${year ? ` in ${year}` : ''}${periodLabel ? ` (${periodLabel})` : ''}.`);
  if (counts.withTarget) out.push(sw
    ? `Viashiria ${counts.onTrackAll} vimefikia 80% au zaidi, ${counts.partial} viko kati ya 40% na 79%, na ${counts.belowAll} viko chini ya 40%.`
    : `${counts.onTrackAll} KPIs reached 80% or more, ${counts.partial} are between 40% and 79%, and ${counts.belowAll} are below 40%.`);
  if (good.length || weak.length) out.push(sw
    ? [good.length ? `${bundle.groupBy === 'dataset' ? 'Datasets' : 'Malengo'} ${listJoin(good, 'sw')} yanaendelea vizuri` : '', weak.length ? `${bundle.groupBy === 'dataset' ? 'datasets' : 'malengo'} ${listJoin(weak, 'sw')} yanahitaji hatua za haraka` : ''].filter(Boolean).join('; ') + '.'
    : [good.length ? `${bundle.groupBy === 'dataset' ? 'Datasets' : 'Objectives'} ${listJoin(good, 'en')} are on track` : '', weak.length ? `${listJoin(weak, 'en')} need urgent attention` : ''].filter(Boolean).join('; ') + '.');
  if (last?.gap !== null && last?.gap !== undefined && last.gap < 0) out.push(sw
    ? `Utekelezaji uko nyuma ya kasi iliyopangwa kwa asilimia ${Math.abs(last.gap)} hadi ${last.period}.`
    : `Delivery is ${Math.abs(last.gap)} percentage points behind the planned pace at ${last.period}.`);
  if (budget?.utilisation !== null && budget?.utilisation !== undefined) out.push(sw
    ? `Matumizi ya bajeti ni ${fmtPct(budget.utilisation)} (TZS ${fmtMoney(budget.spent)} kati ya TZS ${fmtMoney(budget.budget)}).`
    : `Budget utilisation is ${fmtPct(budget.utilisation)} (TZS ${fmtMoney(budget.spent)} of TZS ${fmtMoney(budget.budget)}).`);
  return out;
}

/** Draft conclusion + recommendations (the M&E officer can edit them before printing). */
export function draftConclusion(bundle, {name = 'The institution', lang = 'en'} = {}) {
  const sw = lang === 'sw';
  const {score, objectives, budget} = bundle;
  const exceptionCount = bundle.exceptionsTotal ?? bundle.exceptions.length;
  const tone = TONE_LABEL[sw ? 'sw' : 'en'][bundle.tone];
  const weak = objectives.filter(o => o.tone !== 'green' && o.score !== null).map(o => o.code);
  const conclusion = score.score === null
    ? (sw ? `Hakuna data ya kutosha iliyochapishwa kupima utendaji wa ${name} kwa kipindi hiki.` : `There is not enough published data to assess ${name}'s performance for this period.`)
    : (sw ? `Kwa ujumla ${name} imepata ${fmtPct(score.score)} (${tone}). ${weak.length ? `Malengo ${listJoin(weak, 'sw')} yanahitaji msisitizo zaidi ili kufikia malengo ya mwaka.` : 'Malengo yote ya kimkakati yanaendelea vizuri.'}`
      : `Overall, ${name} achieved ${fmtPct(score.score)} (${tone}). ${weak.length ? `Objectives ${listJoin(weak, 'en')} need more focus to reach the annual targets.` : 'All strategic objectives are on track.'}`);
  const recs = [];
  if (exceptionCount) recs.push(sw
    ? `Kuchukua hatua za haraka kwa viashiria ${exceptionCount} vilivyo chini ya lengo, kuanzia vile ambavyo havijaanza.`
    : `Take corrective action on the ${exceptionCount} KPIs below target, starting with those not yet started.`);
  if (budget?.utilisation !== null && budget?.utilisation !== undefined && budget.utilisation < 80) recs.push(sw
    ? 'Kufuatilia upatikanaji na matumizi ya fedha kila mwezi ili kuongeza kasi ya utekelezaji.'
    : 'Follow up fund releases and spending monthly to speed up implementation.');
  if (budget?.utilisation > 100) recs.push(sw ? 'Kudhibiti matumizi yaliyozidi bajeti iliyoidhinishwa.' : 'Control spending that exceeds the approved budget.');
  recs.push(sw ? 'Kuimarisha ubora wa takwimu na uwasilishaji wa taarifa kwa wakati kupitia VIWANDA PORTAL.'
    : 'Strengthen data quality and timely reporting through VIWANDA PORTAL.');
  return {conclusion, recommendations: recs.map(r => `• ${r}`).join('\n')};
}

/* ---------- CSV (opens in Excel) ---------- */
export function kpiCsv(kpis) {
  const head = ['Objective', 'KPI', 'Unit', 'Department', 'Dataset', 'Baseline', 'Annual target', 'Q1', 'Q2', 'Q3', 'Q4', 'Cumulative actual',
    'Achievement %', 'Status', 'Budget (TZS)', 'Expenditure (TZS)', 'Achievements', 'Challenges', 'Corrective actions'];
  const esc = (v) => { const s = v === null || v === undefined ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const lines = kpis.map(k => [k.objective.code, k.name, k.unit, k.department, k.dataset, k.baseline, k.target,
    k.quarters?.Q1, k.quarters?.Q2, k.quarters?.Q3, k.quarters?.Q4, k.cumulativeActual ?? k.actual, k.achievement === null ? '' : round1(k.achievement),
    KPI_BAND_LABEL.en[k.band], k.budget, k.expenditure, k.achievements, k.challenges, k.actions].map(esc).join(','));
  return '﻿' + [head.join(','), ...lines].join('\r\n');
}

/* ---------- same overview from the published analytics (30 Oct 2026) ---------- */
/**
 * Roles without the reports.view.* permission (IDO, IHOD, AO, MDO, DDO, MDD …) get 403 from /reports/*.
 * Their overview is built from what /analytics/datasets/{id} already returned for the page:
 * KPI score = Laravel summary.achievementPercent; group = the indicator's strategic objective when the
 * analytics payload carries one, otherwise its dataset (D1, D2 …). Pace = cumulative published values ÷ annual target.
 * Nothing is invented: indicators without a target stay "No target", budget stays "not reported".
 * @param rows [{dataset, detail}] as loaded by loadInstitutionOverview
 */
export function bundleFromAnalytics(rows = []) {
  const indicatorRows = []; const paceRows = []; const groupBy = {value: 'objective'};
  const withData = rows.filter(r => r?.detail && Array.isArray(r.detail.indicators) && r.detail.indicators.length);
  const anyObjective = withData.some(r => r.detail.indicators.some(i => first(i, ['strategicObjective', 'strategic_objective', 'objectiveCode'])));
  if (!anyObjective) groupBy.value = 'dataset';
  withData.forEach((r, di) => {
    const ds = r.dataset ?? {};
    const dsName = text(first(ds, ['datasetName', 'dataset_name', 'name'])) || `Dataset ${ds.id ?? di + 1}`;
    const group = {code: `D${di + 1}`, name: dsName};
    r.detail.indicators.forEach((ind, ii) => {
      const s = obj(ind?.summary) ?? {};
      const objective = anyObjective ? (first(ind, ['strategicObjective', 'strategic_objective', 'objectiveCode']) ?? '') : group;
      const id = `${ds.id ?? di}-${ind?.indicatorId ?? ind?.seriesKey ?? ii}`;
      const target = toNum(first(s, ['annualTarget', 'annual_target']));
      const base = {indicatorId: id, indicatorName: first(ind, ['name', 'indicatorName']) ?? `Indicator ${ii + 1}`, unit: first(ind, ['unit', 'unitName']) ?? '',
        strategicObjective: objective, datasetName: dsName};
      indicatorRows.push({...base, target, actual: toNum(s.actual), achievementPercent: toNum(first(s, ['achievementPercent', 'achievement_percent']))});
      if (target === null || target === 0) return;
      const pct = String(ind?.dataType ?? '').toLowerCase() === 'percentage';
      let sum = 0; let seen = false;
      (Array.isArray(ind?.points) ? ind.points : []).forEach(p => {
        const v = p?.status && p.status !== 'present' ? null : toNum(p?.value);
        if (v === null) return;
        sum = pct ? v : sum + v; seen = true;
        if (seen) paceRows.push({...base, periodLabel: text(p.label), achievementPercent: round1(sum / target * 100)});
      });
    });
  });
  const kpis = kpiList(indicatorRows, []);
  const objectives = objectiveRows(null, kpis);
  const score = institutionScore({}, objectives);
  return {
    kpis, objectives, counts: kpiBandCounts(kpis), score, summary: {},
    tone: ratingTone('', score.score),
    pace: quarterlyPace(paceRows, objectives),
    exceptions: exceptionList(null, kpis),
    exceptionsTotal: kpis.filter(k => k.achievement !== null && k.achievement < 80).length,
    variance: varianceBuckets(kpis), budget: null, departments: [], narratives: [],
    hasData: kpis.length > 0, source: 'analytics', groupBy: groupBy.value,
  };
}
