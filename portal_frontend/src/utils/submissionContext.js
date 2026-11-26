/**
 * Exact Laravel contract supplied 22 October 2026:
 * POST /datasets/{datasetId}/submission-context
 *   {startYear, frequency, periodNumber}
 * POST /submissions
 *   {reportingCalendarId}
 * These CREATE a context and a submission template. Neither writes indicator
 * values, dimension values, remarks, uploaded files, or transitions to submitted.
 */
import { normalizeFrequency } from './submissionFrequency.js';

const positiveInteger = value => {
  if (value === undefined || value === null || String(value).trim() === '') return null;
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
};

/** Financial-year string 2026/2027 maps to backend startYear:2026. */
export function startYearFromFinancialYear(financialYear) {
  const text = String(financialYear ?? '').trim();
  const match = /^(\d{4})(?:\/(\d{4}))?$/.exec(text);
  if (!match) throw new Error('Select a valid financial year before creating a draft template.');
  const start = Number(match[1]);
  if (match[2] && Number(match[2]) !== start + 1) {
    throw new Error('Selected financial year has an invalid ending year.');
  }
  return start;
}

/** Read calendar's periodNumber, never assume calendar month equals fiscal month. */
export function periodNumberFromPeriod(period, frequency) {
  const normalized = normalizeFrequency(frequency);
  const direct = positiveInteger(period?.periodNumber ?? period?.period_number);
  if (direct != null) {
    const max = normalized === 'monthly' ? 12 : normalized === 'quarterly' ? 4 : normalized === 'annual' ? 1 : 0;
    if (!max || direct > max) throw new Error('The reporting period number is not valid for its frequency.');
    return direct;
  }
  const label = String(period?.label ?? '');
  const detected = normalized === 'quarterly'
    ? /(?:^|\W)Q\s*([1-4])(?:\W|$)/i.exec(label)?.[1]
    : normalized === 'monthly'
      ? /(?:^|\W)(?:M|Month)\s*(1[0-2]|[1-9])(?:\W|$)/i.exec(label)?.[1]
      : normalized === 'annual' ? '1' : null;
  if (detected) return Number(detected);
  throw new Error('The reporting period is incomplete. Choose another period or contact the administrator.');
}

export function submissionContextPayload({financialYear, frequency, period}) {
  const normalized = normalizeFrequency(frequency);
  if (!['monthly','quarterly','annual'].includes(normalized)) {
    throw new Error('Unsupported submission frequency.');
  }
  return {
    startYear: startYearFromFinancialYear(financialYear),
    frequency: normalized,
    periodNumber: periodNumberFromPeriod(period, normalized),
  };
}

/** Works with Laravel plain JSON, {data:{...}}, and known camel/snake casing. */
function resultPayload(payload) {
  if (!payload || typeof payload !== 'object') return {};
  return payload.data && !Array.isArray(payload.data) && typeof payload.data === 'object'
    ? payload.data : payload;
}
export function reportingCalendarIdFromResponse(payload, expectedDatasetId = null) {
  const data = resultPayload(payload);
  // Only the dataset ID selected in Step 1 is used in the URL; do not mistake
  // that dataset's ID for a calendar ID. When the response advertises datasetId,
  // a mismatch is a contract error rather than permission to create a template.
  const actualDatasetId = positiveInteger(data.datasetId ?? data.dataset_id ??
    data.dataset?.id ?? data.reportingCalendar?.datasetId ?? data.reporting_calendar?.dataset_id);
  if (actualDatasetId && expectedDatasetId && actualDatasetId !== positiveInteger(expectedDatasetId)) {
    throw new Error('The system returned a reporting context for a different dataset ID. Submission creation stopped.');
  }
  // Laravel response schema for context has not been supplied yet: bare data.id
  // remains a COMPATIBILITY fallback and must be verified with backend.
  return positiveInteger(data.reportingCalendarId ?? data.reporting_calendar_id ??
    data.reportingCalendar?.id ?? data.reporting_calendar?.id ?? data.id);
}
export function submissionTemplateIdFromResponse(payload) {
  const data = resultPayload(payload);
  return positiveInteger(data.submissionId ?? data.submission_id ?? data.submission?.id ?? data.id);
}
