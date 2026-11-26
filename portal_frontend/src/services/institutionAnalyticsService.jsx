/**
 * Institution Analytics data loader (published data only).
 * Laravel returns raw per-dataset analytics; the institution dashboard figures are calculated
 * in src/utils/analyticsSummary.js. Requests are cached for 60 s and run with limited concurrency.
 * TODO(BACKEND, optional): GET /analytics/organisations/{id}/summary?reportingYearId= would replace
 * the per-dataset fan-out below; GET /analytics/organisations needs a year filter for the card page.
 */
import {checkSession, onSessionChange} from './listCache.js';
import {analyticsAPI} from '../API/analytics.jsx';
import {currentFinancialYear, sameFinancialYear} from '../utils/orgCards.js';
import {
  allYearLabels, comparisonSummary, datasetColor, datasetSummary, defaultFrequency, optionYears,
  previousYear, yearByLabel,
} from '../utils/analyticsSummary.js';

// Published analytics change only when MDD publishes: keep reads for 5 minutes (30 Oct 2026).
const TTL = 300_000;
const cache = new Map();
onSessionChange(() => cache.clear());
function cached(key, load) {
  checkSession();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.promise;
  const promise = load().catch(error => { cache.delete(key); throw error; });
  cache.set(key, {at: Date.now(), promise});
  return promise;
}
export function clearAnalyticsCache() { cache.clear(); }

/** Runs async work over items with at most `limit` requests in flight. */
async function mapLimit(items, limit, work) {
  const results = new Array(items.length);
  let next = 0;
  const runners = Array.from({length: Math.min(limit, items.length)}, async () => {
    while (next < items.length) {
      const index = next++;
      try { results[index] = {ok: true, value: await work(items[index], index)}; }
      catch (error) { results[index] = {ok: false, error}; }
    }
  });
  await Promise.all(runners);
  return results;
}

const scopeParams = (type, id) => (type === 'department' ? {departmentId: id} : {institutionId: id});
export const orgDatasets = (type, id) => cached(`ds:${type}:${id}`, () => analyticsAPI.datasets(scopeParams(type, id)));
export const datasetOptions = datasetId => cached(`opt:${datasetId}`, () => analyticsAPI.options(datasetId));
export const datasetDetail = (datasetId, reportingYearId, frequency) =>
  cached(`det:${datasetId}:${reportingYearId}:${frequency}`, () => analyticsAPI.dataset(datasetId, {reportingYearId, frequency}));
export const datasetComparison = (datasetId, reportingYearId, comparisonYearId, frequency) =>
  cached(`cmp:${datasetId}:${reportingYearId}:${comparisonYearId}:${frequency}`,
    () => analyticsAPI.comparison(datasetId, {reportingYearId, comparisonYearId, frequency}));
export const datasetTrends = (datasetId, params) =>
  cached(`trd:${datasetId}:${JSON.stringify(params)}`, () => analyticsAPI.trends(datasetId, params));

/** Selected year: the requested one, else the current financial year, else the newest with data. */
export function chooseYear(labels, requested) {
  if (requested && labels.some(label => sameFinancialYear(label, requested))) return labels.find(label => sameFinancialYear(label, requested));
  const current = currentFinancialYear();
  return labels.find(label => sameFinancialYear(label, current)) ?? labels[0] ?? current;
}

/**
 * Institution / department dashboard.
 * Returns {datasets:[{dataset,key,color,options,year,frequency,detail,summary,comparison,compareYear,history}], years, year}.
 */
/** Achievement per COMPLETE year (targets are per year, so each year's detail is needed; trends carry no target). */
async function yearHistory(dataset, options, selected, frequency, historyYears = 5) {
  const history = {};
  const pastYears = optionYears(options).filter(item => (item.startYear ?? 0) <= (selected.startYear ?? 0)).slice(0, historyYears);
  await Promise.all(pastYears.map(async item => {
    const freq = item.frequencies.map(String).includes(frequency) ? frequency : defaultFrequency(item);
    // A part-year (e.g. 2 of 4 quarters) would look like a fall in the trend.
    try { const year = datasetSummary(await datasetDetail(dataset.id, item.id, freq));
      history[item.label] = year.expectedPeriods && year.publishedPeriods >= year.expectedPeriods ? year.achievement : null; }
    catch { history[item.label] = null; }
  }));
  return history;
}

/** Second phase of the institution page: the sparkline history of every dataset row (in parallel, cached). */
export async function loadInstitutionHistory(rows, historyYears = 5) {
  // Background phase: two datasets at a time, so opening a dataset is not queued behind the sparklines.
  const results = await mapLimit(rows, 2, row => (row.year && row.options ? yearHistory(row.dataset, row.options, row.year, row.frequency, historyYears) : Promise.resolve({})));
  return Object.fromEntries(rows.map((row, i) => [row.key, results[i].ok ? results[i].value : {}]));
}

export async function loadInstitutionOverview({type, id, year: requestedYear, compareYear: requestedCompare, historyYears = 5, withHistory = false}) {
  const datasets = await orgDatasets(type, id);
  const optionResults = await mapLimit(datasets, 6, dataset => datasetOptions(dataset.id));
  const optionsList = optionResults.map(result => (result.ok ? result.value : null));
  const years = allYearLabels(optionsList.filter(Boolean));
  const year = chooseYear(years, requestedYear);

  const rows = await mapLimit(datasets, 6, async (dataset, index) => {
    const options = optionsList[index];
    const base = {dataset, key: `ds${dataset.id}`, color: datasetColor(index), options};
    const selected = options ? yearByLabel(options, year) : null;
    if (!selected) return {...base, year: null, frequency: '', detail: null, summary: null, comparison: null, history: {}, historyReady: true};
    const frequency = defaultFrequency(selected);
    const detail = await datasetDetail(dataset.id, selected.id, frequency);
    const summary = datasetSummary(detail);
    const compare = requestedCompare ? yearByLabel(options, requestedCompare) : previousYear(options, selected);
    let comparison = null;
    if (compare && compare.id !== selected.id && (compare.startYear ?? 0) < (selected.startYear ?? 0)) {
      try { comparison = comparisonSummary(await datasetComparison(dataset.id, selected.id, compare.id, frequency)); }
      catch { comparison = null; }
    }
    // The 5-year history (one detail per past year) is loaded AFTER the page shows: loadInstitutionHistory().
    const history = withHistory ? await yearHistory(dataset, options, selected, frequency, historyYears) : null;
    return {...base, year: selected, frequency, detail, summary, comparison, compareYear: compare, history: history ?? {}, historyReady: !!history};
  });
  return {
    datasets: rows.map((result, index) => (result.ok ? result.value
      : {dataset: datasets[index], key: `ds${datasets[index].id}`, color: datasetColor(index), error: result.error, summary: null, history: {}})),
    years,
    year,
  };
}

/** Card page: published datasets per financial year for one organisation (makes the FY filter real). */
export async function organisationYearCounts(type, id) {
  const datasets = await orgDatasets(type, id);
  const options = await mapLimit(datasets, 3, dataset => datasetOptions(dataset.id));
  const counts = {};
  for (const result of options) {
    if (!result.ok) continue;
    for (const year of optionYears(result.value)) counts[year.label] = (counts[year.label] ?? 0) + 1;
  }
  return counts;
}
export {mapLimit};
