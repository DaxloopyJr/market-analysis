/**
 * FILE: src/API/meReports.js
 * Laravel M&E report endpoints (API document 29 Oct 2026, entries 1–19). Base URL /api/v1.
 *   GET /reports/filters                 -> {data:{accessScope,institutions,departments,datasets,sectors,periods,financialYears,strategicObjectives}}
 *   GET /reports/{slug}?financialYear&institutionId&departmentId&datasetId&sectorId&reportingPeriodId&status&strategicObjective&groupBy
 *        -> {data:{type,title,category,generatedAt,filters,rows,summary[,sections]}}
 * Access: MOA or reports.view.{slug}; Laravel applies the institution/department data scope.
 */
import api from './axios';

export const ME_REPORT_SLUGS = ['indicator-performance', 'quarterly-trend', 'strategic-objective', 'organisation-performance',
  'sector-performance', 'target-exceptions', 'budget-delivery', 'annual-me',
  // Submission & workflow reports (API entries 5–11), linked 8 Nov 2026.
  'data-submission', 'submission-compliance', 'outstanding-overdue', 'approval-turnaround', 'returned-corrections',
  'published-register', 'data-quality'];

const bodyData = (response) => {
  const body = response?.data;
  if (!body || typeof body !== 'object') throw new Error('The server sent an unexpected response.');
  return body.data ?? body;
};
/** Drop blank filters so Laravel never receives empty strings. */
export function reportParams(params = {}) {
  return Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && String(v).trim() !== ''));
}

export const meReportsAPI = {
  catalog: async () => bodyData(await api.get('/reports/catalog')),
  filters: async () => bodyData(await api.get('/reports/filters')),
  report: async (slug, params = {}) => {
    if (!ME_REPORT_SLUGS.includes(slug)) throw new Error(`Unknown report: ${slug}`);
    return bodyData(await api.get(`/reports/${slug}`, {params: reportParams(params)}));
  },
  /** Executive (ME) dashboard, backend patch v4: GET /reports/executive-overview?financialYear&reportingPeriodId */
  executiveOverview: async (params = {}) => bodyData(await api.get('/reports/executive-overview', {params: reportParams(params)})),
};

export default meReportsAPI;
