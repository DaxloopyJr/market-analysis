/**
 * FILE: src/API/analytics.jsx — published dataset analytics (API reference 27 Oct 2026, entries 126–131).
 * Only published submissions contribute. Root paginator {current_page,data,per_page,total,last_page}.
 *   GET /analytics/organisations?type=institution|department&search&page&perPage
 *   GET /analytics/datasets?institutionId|departmentId&reportingPurpose&page&perPage
 *   GET /analytics/datasets/{id}/options
 *   GET /analytics/datasets/{id}?reportingYearId&frequency
 *   GET /analytics/datasets/{id}/trends?startYear&endYear&yearType&frequency
 *   GET /analytics/datasets/{id}/comparison?reportingYearId&comparisonYearId&frequency
 * Decimal outputs are strings: keep them as strings until display.
 * TODO(BACKEND): organisation cards need financialYear + budget/spent/absorption and
 * approved/submitted counts. Until confirmed the page sends `financialYear` and reads
 * those fields only when Laravel returns them (see utils/orgCards.js orgPerformance).
 */
import {fetchAllPages} from '../services/listCache.js';
import api from './axios';

const id = value => encodeURIComponent(String(value));
const bodyOf = response => {
  const body = response?.data;
  if (!body || typeof body !== 'object') throw new Error('The server sent an unexpected response.');
  return body;
};
const rowsOf = body => Array.isArray(body) ? body : Array.isArray(body?.data) ? body.data : Array.isArray(body?.data?.data) ? body.data.data : [];
const pagerOf = body => (Array.isArray(body?.data) ? body : body?.data && !Array.isArray(body.data) ? body.data : body) ?? {};

/** Reads every page (perPage 100, the documented maximum). */
async function allPages(path, params = {}) {
  // Page 1 first, then the rest in parallel (5 Nov 2026 performance pass).
  const request = async query => {
    const body = bodyOf(await api.get(path, {params: query}));
    const pager = pagerOf(body);
    const last = Number(pager.last_page ?? pager.lastPage ?? 1);
    return {items: rowsOf(body), lastPage: Number.isFinite(last) ? last : 1, paginated: Number.isFinite(last) && last > 1};
  };
  return (await fetchAllPages(request, {perPage: 100, maxPages: 50, extra: params})).items;
}
const dataOf = response => {
  const body = bodyOf(response);
  return body.data ?? body;
};

export const analyticsAPI = {
  /** type: 'institution' | 'department'. */
  organisations: (type, params = {}) => allPages('/analytics/organisations', {...params, type}),
  datasets: (params = {}) => allPages('/analytics/datasets', params),
  options: async datasetId => dataOf(await api.get(`/analytics/datasets/${id(datasetId)}/options`)),
  dataset: async (datasetId, params = {}) => dataOf(await api.get(`/analytics/datasets/${id(datasetId)}`, {params})),
  trends: async (datasetId, params = {}) => dataOf(await api.get(`/analytics/datasets/${id(datasetId)}/trends`, {params})),
  comparison: async (datasetId, params = {}) => dataOf(await api.get(`/analytics/datasets/${id(datasetId)}/comparison`, {params})),
};

export default analyticsAPI;
