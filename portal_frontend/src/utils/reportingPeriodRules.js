/**
 * FILE: src/utils/reportingPeriodRules.js
 * USED BY: SubmissionPeriods Admin management -> DataEntry period eligibility.
 * Dates are date-only YYYY-MM-DD in the reporting institution calendar.
 * Deadline is inclusive. Do NOT treat endDate as submission cutoff.
 * Laravel remains authoritative for submission lock and permissions.
 */
export const todayISO = (now = new Date()) => [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-');
const isoDate = value => (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) ? value.slice(0, 10) : null;
export function periodType(period) { return String(period?.periodType ?? period?.period_type ?? '').toLowerCase(); }
export function dueDate(period) { return isoDate(period?.assignmentDeadline ?? period?.deadline ?? period?.closes_at); }
export function periodState(period, today = todayISO()) {
  if (!period) return 'unavailable';
  const start = isoDate(period.startDate ?? period.start_date ?? period.opens_at);
  // A period that has not started yet is "Upcoming" even while its status is still closed; only periods
  // that have already started or passed read "Closed" (agreed 9 Nov 2026).
  if (start && today < start) return 'upcoming';
  if (period.status === 'closed' || period.isOpen === false || period.is_open === false || period.parentIsOpen === false) return 'closed';
  const due = dueDate(period);
  if (!start || !due) return 'unavailable'; // fail closed if backend returned incomplete dates
  if (today < start) return 'upcoming';
  if (today > due) return 'past_due';
  return 'available';
}
export const isEntryEligible = (period, today = todayISO()) => periodState(period, today) === 'available';
export function reportingYear(period) {
  const direct = period?.reportingYear ?? period?.reporting_year;
  if (direct) return String(direct);
  const label = String(period?.label || '');
  const match = label.match(/\b\d{4}\/\d{4}\b/);
  return match?.[0] || '';
}
export function calculateDeadlineDays(endDate, deadline) {
  const start = isoDate(endDate), due = isoDate(deadline);
  if (!start || !due) return null;
  return Math.round((Date.parse(`${due}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000);
}
export function dateFromDays(endDate, days) {
  const date = isoDate(endDate);
  if (!date || !Number.isInteger(Number(days)) || Number(days) < 0 || Number(days) > 365) return '';
  const result = new Date(`${date}T00:00:00Z`);
  result.setUTCDate(result.getUTCDate() + Number(days));
  return result.toISOString().slice(0,10);
}
