/**
 * Institution / dataset analytics — FRONTEND calculations on top of the published-only
 * Laravel analytics endpoints (API reference 27 Oct 2026, entries 126–131).
 * Laravel returns per-indicator data; these pure functions build dataset and institution figures.
 * Rules: null is never zero; units are never mixed; bands = <50 Under, 50–80 Good, >80 Excellence.
 */
import {absorptionBand, sameFinancialYear} from './orgCards.js';

export const num = value => {
  if (value === undefined || value === null || String(value).trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};
const mean = values => {
  const list = values.filter(value => value !== null && value !== undefined && Number.isFinite(value));
  return list.length ? list.reduce((sum, value) => sum + value, 0) / list.length : null;
};
export const round1 = value => (value === null || value === undefined ? null : Math.round(value * 10) / 10);
export const bandOf = percent => absorptionBand(percent);

/** Every dataset gets a stable colour for its header, line and sparkline. */
export const DATASET_COLORS = [
  ['#0b5bd3', '#0a2a5c'], ['#0f7a2f', '#0a5c3a'], ['#00a3dd', '#0b5bd3'], ['#5b4bd6', '#2f2a8a'],
  ['#c2410c', '#8a2a0a'], ['#0e7490', '#164e63'], ['#9d174d', '#6b0f35'], ['#4d7c0f', '#365314'],
];
export const datasetColor = index => DATASET_COLORS[Math.abs(index) % DATASET_COLORS.length];

export const datasetTitle = row => row?.datasetName ?? row?.dataset_name ?? row?.name ?? (row?.id ? `Dataset ${row.id}` : 'Dataset');
export const frequencyLabel = value => {
  const key = String(value ?? '').toLowerCase();
  return {annual: 'Annual', semiannual: 'Semi-annual', quarterly: 'Quarterly', monthly: 'Monthly', weekly: 'Weekly', daily: 'Daily'}[key] || (key ? key[0].toUpperCase() + key.slice(1) : '');
};
const FREQUENCY_ORDER = ['quarterly', 'monthly', 'semiannual', 'annual', 'weekly', 'daily'];

/** Years from GET /analytics/datasets/{id}/options, newest first. */
export function optionYears(options) {
  const years = Array.isArray(options?.years) ? options.years : [];
  return years.filter(year => year && year.id != null)
    .map(year => ({id: year.id, label: String(year.label ?? ''), yearType: year.yearType ?? year.year_type ?? 'financial',
      startYear: Number(String(year.label ?? '').slice(0, 4)) || null, frequencies: Array.isArray(year.frequencies) ? year.frequencies : []}))
    .sort((a, b) => (b.startYear ?? 0) - (a.startYear ?? 0));
}
export const yearByLabel = (options, label) => optionYears(options).find(year => sameFinancialYear(year.label, label)) ?? null;
/** Default frequency for a year: the most common reporting frequency the dataset actually has. */
export function defaultFrequency(year) {
  const list = (year?.frequencies ?? []).map(value => String(value).toLowerCase());
  return FREQUENCY_ORDER.find(value => list.includes(value)) ?? list[0] ?? '';
}
/** Earlier year of the same year type (the comparison endpoint requires it). */
export function previousYear(options, year) {
  if (!year) return null;
  return optionYears(options).find(item => item.yearType === year.yearType && (item.startYear ?? 0) < (year.startYear ?? 0)) ?? null;
}
export function allYearLabels(optionsList) {
  const labels = new Map();
  for (const options of optionsList) for (const year of optionYears(options)) if (year.label) labels.set(year.label, year.startYear ?? 0);
  return [...labels.entries()].sort((a, b) => b[1] - a[1]).map(([label]) => label);
}

export const indicatorsOf = detail => (Array.isArray(detail?.indicators) ? detail.indicators : []);
export const indicatorName = indicator => indicator?.name ?? indicator?.indicatorName ?? `Indicator ${indicator?.indicatorId ?? ''}`;
export const indicatorKey = indicator => String(indicator?.seriesKey ?? indicator?.indicatorId ?? indicatorName(indicator));
export const isNumericSeries = indicator =>
  ['integer', 'decimal', 'number', 'numeric', 'count', 'bigint', 'percentage'].includes(String(indicator?.dataType ?? '').toLowerCase());
export const indicatorAchievement = indicator => num(indicator?.summary?.achievementPercent ?? indicator?.summary?.achievement_percent);
export const indicatorTarget = indicator => num(indicator?.summary?.annualTarget ?? indicator?.summary?.annual_target);
export const indicatorActual = indicator => num(indicator?.summary?.actual);
export const pointsOf = indicator => (Array.isArray(indicator?.points) ? indicator.points : []);
export const pointValue = point => (point?.status && point.status !== 'present' ? null : num(point?.value));

/** Last two published scalar values of a series: {previous, latest}. */
export function lastTwoValues(indicator) {
  const values = pointsOf(indicator).map(pointValue).filter(value => value !== null);
  return {latest: values.length ? values[values.length - 1] : null, previous: values.length > 1 ? values[values.length - 2] : null};
}

/** One dataset for one year (GET /analytics/datasets/{id}?reportingYearId&frequency). */
export function datasetSummary(detail) {
  const indicators = indicatorsOf(detail);
  const bands = {excellence: 0, good: 0, under: 0, noTarget: 0};
  const achievements = [];
  for (const indicator of indicators) {
    const percent = indicatorAchievement(indicator);
    if (percent === null) { bands.noTarget += 1; continue; }
    achievements.push(percent);
    const {band} = bandOf(percent);
    bands[band === 'excellence' ? 'excellence' : band === 'good' ? 'good' : 'under'] += 1;
  }
  const achievement = round1(mean(achievements));
  return {
    indicatorCount: indicators.length,
    publishedPeriods: num(detail?.publishedPeriods) ?? 0,
    expectedPeriods: num(detail?.expectedPeriods) ?? 0,
    achievement,
    band: bandOf(achievement),
    bands,
    withTargets: achievements.length,
  };
}

/** Year-on-year change (GET …/comparison): mean changePercent of comparable indicators. */
export function comparisonSummary(comparison) {
  const rows = (Array.isArray(comparison?.indicators) ? comparison.indicators : [])
    .map(item => ({key: String(item?.seriesKey ?? item?.indicatorId), change: num(item?.summary?.changePercent)}))
    .filter(row => row.change !== null);
  return {
    change: round1(mean(rows.map(row => row.change))),
    up: rows.filter(row => row.change > 0).length,
    down: rows.filter(row => row.change < 0).length,
    byIndicator: Object.fromEntries(rows.map(row => [row.key, row.change])),
    matched: rows.length,
  };
}

/** Whole institution from its dataset rows: [{summary, comparison}]. */
export function institutionSummary(rows) {
  const withData = rows.filter(row => row.summary && row.summary.indicatorCount > 0);
  const bands = {excellence: 0, good: 0, under: 0, noTarget: 0};
  for (const row of withData) for (const key of Object.keys(bands)) bands[key] += row.summary.bands[key];
  const published = withData.reduce((sum, row) => sum + row.summary.publishedPeriods, 0);
  const expected = withData.reduce((sum, row) => sum + row.summary.expectedPeriods, 0);
  const comparisons = rows.map(row => row.comparison).filter(item => item && item.change !== null);
  // Overall achievement: mean over ALL indicators with targets (not a mean of means).
  const totalWithTargets = withData.reduce((sum, row) => sum + row.summary.withTargets, 0);
  const weighted = withData.reduce((sum, row) => sum + (row.summary.achievement ?? 0) * row.summary.withTargets, 0);
  const achievement = totalWithTargets ? round1(weighted / totalWithTargets) : null;
  return {
    datasets: rows.length,
    datasetsWithData: withData.length,
    indicators: withData.reduce((sum, row) => sum + row.summary.indicatorCount, 0),
    published, expected,
    progress: expected ? round1((published / expected) * 100) : null,
    achievement, band: bandOf(achievement), bands,
    change: round1(mean(comparisons.map(item => item.change))),
    up: comparisons.reduce((sum, item) => sum + item.up, 0),
    down: comparisons.reduce((sum, item) => sum + item.down, 0),
  };
}

/** Line data for the 5-year chart: [{year, [datasetKey]: achievement}] from per-year summaries. */
export function yearlyAchievementRows(datasets, years) {
  return years.map(label => {
    const row = {year: label};
    for (const dataset of datasets) {
      const value = dataset.history?.[label];
      row[dataset.key] = value === undefined ? null : value;
    }
    return row;
  });
}

/** Breakdown chart for a point (published per-dimension categories). Pie only for 2–8 complete categories. */
export function breakdownChartOf(indicator) {
  const points = pointsOf(indicator).filter(point => Array.isArray(point?.breakdownCharts) && point.breakdownCharts.length);
  const point = points[points.length - 1];
  if (!point) return null;
  const chart = point.breakdownCharts[0];
  const categories = (chart?.categories ?? []).map(item => ({name: item.label ?? `Option ${item.optionId}`, value: num(item.value)}))
    .filter(item => item.value !== null);
  if (!categories.length) return null;
  const allowed = Array.isArray(chart?.availableCharts) ? chart.availableCharts : [];
  const kind = allowed.includes('donut') || allowed.includes('pie') ? 'donut' : 'bar';
  return {title: chart?.name ?? 'Breakdown', period: point.label ?? '', categories, kind};
}
