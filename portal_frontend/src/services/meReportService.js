/**
 * FILE: src/services/meReportService.js
 * Loads the M&E report payloads for ONE institution or department and turns them into the
 * Institution Analytics / PDF bundle (src/utils/meReport.js). Each report is requested on its own
 * (Promise.allSettled): a missing permission for one report hides only that part of the page.
 * Cached for 60 s per filter combination.
 */
import {checkSession, onSessionChange} from './listCache.js';
import {meReportsAPI} from '../API/meReports.js';
import {buildMeBundle} from '../utils/meReport.js';
import {sameFinancialYear} from '../utils/orgCards.js';

const TTL = 60_000;
const cache = new Map();
// Once Laravel refuses the M&E reports for this session (403), the page uses the analytics overview at once.
let reportsForbidden = false;
onSessionChange(() => { cache.clear(); reportsForbidden = false; });
const cached = (key, load) => {
  checkSession();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.promise;
  const promise = load().catch(error => { cache.delete(key); throw error; });
  cache.set(key, {at: Date.now(), promise});
  return promise;
};
export const clearMeReportCache = () => { cache.clear(); reportsForbidden = false; };
export const meReportsForbidden = () => { checkSession(); return reportsForbidden; };

const asList = (v) => (Array.isArray(v) ? v : Array.isArray(v?.data) ? v.data : []);
const optionOf = (item) => {
  if (item === null || item === undefined) return null;
  if (typeof item !== 'object') return {value: String(item), label: String(item)};
  const value = item.id ?? item.value ?? item.financialYear ?? item.label ?? item.name;
  return {value: String(value), label: String(item.label ?? item.name ?? item.nameEn ?? item.data_value_name_en ?? item.yearLabel ?? item.financialYear ?? value), raw: item};
};

/** GET /reports/filters as Laravel sends it, read once per minute and shared (also by the logo directory). */
export const reportFiltersRaw = () => cached('filters:raw', () => meReportsAPI.filters());

/** GET /reports/filters, normalised into select options. */
export function loadMeFilters() {
  return cached('filters', async () => {
    let f;
    try { f = await reportFiltersRaw(); }
    catch (error) { if ([401, 403].includes(statusOf(error))) reportsForbidden = true; throw error; }
    return {
      accessScope: f?.accessScope ?? '',
      // financialYear is sent as its label ("2026/2027"), strategicObjective as its code (API doc entries 5–19).
      financialYears: asList(f?.financialYears).map(y => (y && typeof y === 'object'
        ? optionOf({...y, id: y.label ?? y.yearLabel ?? y.financialYear ?? y.name ?? y.id}) : optionOf(y))).filter(Boolean),
      periods: asList(f?.periods).map(optionOf).filter(Boolean),
      departments: asList(f?.departments).map(optionOf).filter(Boolean),
      objectives: asList(f?.strategicObjectives).map(o => (o && typeof o === 'object'
        ? optionOf({...o, id: o.code ?? o.strategicObjective ?? o.label ?? o.id, label: [o.code, o.description ?? o.name ?? o.label].filter(Boolean).join(' – ')}) : optionOf(o))).filter(Boolean),
      institutions: asList(f?.institutions).map(optionOf).filter(Boolean),
      datasets: asList(f?.datasets).map(optionOf).filter(Boolean),
      sectors: asList(f?.sectors).map(optionOf).filter(Boolean),
      // ReportingPeriod::TYPES — choosing one avoids Laravel's 422 when a dataset has two frequencies in a year.
      frequencies: asList(f?.frequencies).map(v => String(v)).filter(Boolean),
      // Years that already have published results (backend patch v12); empty on older servers.
      publishedYears: asList(f?.publishedFinancialYears).map(v => String(v)).filter(Boolean),
    };
  });
}

/** Laravel's own spelling of a financial year ("2025/26" vs "2025/2026"). */
export function reportYearValue(filters, label) {
  if (!label) return '';
  const hit = filters?.financialYears?.find(o => sameFinancialYear(o.value, label) || sameFinancialYear(o.label, label));
  return hit ? hit.value : label;
}
/** Periods of one financial year (when Laravel tells which year a period belongs to). */
export function periodsForYear(filters, label) {
  const all = filters?.periods ?? [];
  const tagged = all.filter(p => {
    const y = p.raw?.financialYear ?? p.raw?.yearLabel ?? p.raw?.financial_year ?? p.label;
    return sameFinancialYear(y, label) || String(p.label).includes(String(label).slice(0, 4));
  });
  return tagged.length ? tagged : all;
}

const statusOf = (error) => error?.response?.status ?? error?.cause?.response?.status ?? null;

/**
 * @param {{type:'institution'|'department', id:string|number, financialYear?:string, reportingPeriodId?:string, departmentId?:string}} q
 */
export function loadMeBundle({type, id, financialYear = '', reportingPeriodId = '', departmentId = ''}) {
  const scope = type === 'department' ? {departmentId: id} : {institutionId: id, departmentId};
  const base = {...scope, financialYear, reportingPeriodId};
  const key = JSON.stringify(base);
  checkSession();
  if (reportsForbidden) return Promise.resolve({bundle: buildMeBundle({}), errors: {}, forbidden: true, generatedAt: null});
  return cached(key, async () => {
    const requests = {
      objectives: ['strategic-objective', base],
      indicators: ['indicator-performance', base],
      trend: ['quarterly-trend', {...base, reportingPeriodId: ''}],
      exceptions: ['target-exceptions', base],
      budget: ['budget-delivery', base],
      departments: type === 'institution' ? ['organisation-performance', {...base, groupBy: 'department'}] : null,
    };
    const names = Object.keys(requests).filter(k => requests[k]);
    const settled = await Promise.allSettled(names.map(k => meReportsAPI.report(requests[k][0], requests[k][1])));
    const payloads = {}; const errors = {};
    settled.forEach((r, i) => {
      if (r.status === 'fulfilled') payloads[names[i]] = r.value;
      else errors[names[i]] = {status: statusOf(r.reason), message: r.reason?.response?.data?.message || r.reason?.message || 'Request failed'};
    });
    const failed = Object.keys(errors).length;
    const forbidden = failed === names.length && Object.values(errors).every(e => e.status === 403 || e.status === 401);
    if (forbidden) reportsForbidden = true;
    if (failed === names.length && !forbidden) {
      const first = settled.find(r => r.status === 'rejected')?.reason;
      throw first ?? new Error('M&E reports could not be loaded.');
    }
    return {bundle: buildMeBundle(payloads), errors, forbidden, generatedAt: payloads.objectives?.generatedAt ?? payloads.indicators?.generatedAt ?? null};
  });
}
