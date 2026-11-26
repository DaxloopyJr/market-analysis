/**
 * FILE: src/utils/globalReportingPeriods.js
 * PURPOSE: Validated global reporting-period API data, shared by MOA configuration
 * and the dataset / New Submission consumers.
 * CONTRACT (updated by backend team, Oct 2026): No institutionId / institution_id
 * on reporting period GET, POST or PATCH. It is prohibited, not nullable.
 * DATE CONTRACT: Strict date-only YYYY-MM-DD, never timestamps or locale strings.
 * AUTHORIZATION: Backend is responsible for MOA write-only and all-institution reads.
 */
export function dateOnly(value, fieldName = 'Date') {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${fieldName} must use YYYY-MM-DD (year-month-day).`);
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error(`${fieldName} is not a valid calendar date.`);
  }
  return value;
}

export function deadlineOffset(value) {
  if (value === '' || value == null || !/^\d+$/.test(String(value).trim())) {
    throw new Error('Deadline days must be a whole number from 0 to 365.');
  }
  const days = Number(value);
  if (!Number.isInteger(days) || days < 0 || days > 365) {
    throw new Error('Deadline days must be a whole number from 0 to 365.');
  }
  return days;
}

export function globalPeriodListParams(params = {}) {
  // Strip legacy institution filters at the service boundary, even when callers
  // still have cached institution-level parameters from earlier frontend versions.
  const {institutionId: _institutionId, institution_id: _institution_id, ...safe} = params;
  return safe;
}

export function annualPeriodPayload({yearType = 'financial', startDate, endDate, deadlineDays}) {
  const start = dateOnly(startDate, 'Start date');
  const end = dateOnly(endDate, 'End date');
  if (end <= start) throw new Error('End date must be after start date.');
  return {
    periodType: 'annual',
    yearType,
    startDate: start,
    endDate: end,
    deadlineDays: deadlineOffset(deadlineDays),
  };
}

export function childPeriodPayload({parentId, periodType, periodNumber, quarter, deadlineDays}) {
  if (!Number.isInteger(Number(parentId)) || Number(parentId) < 1) throw new Error('Select an existing financial year.');
  if (!['monthly', 'quarterly'].includes(periodType)) throw new Error('Unsupported reporting frequency.');
  const number = Number(periodType === 'quarterly' ? quarter : periodNumber);
  const upper = periodType === 'quarterly' ? 4 : 12;
  if (!Number.isInteger(number) || number < 1 || number > upper) throw new Error('Invalid reporting period number.');
  return {
    parentId: Number(parentId),
    periodType,
    ...(periodType === 'quarterly' ? {quarter: number} : {periodNumber: number}),
    deadlineDays: deadlineOffset(deadlineDays),
  };
}

export function globalPeriodUpdatePayload(fields) {
  const safe = {};
  if (fields.deadline !== undefined) safe.deadline = dateOnly(fields.deadline, 'Deadline');
  if (fields.status !== undefined) {
    if (!['open', 'closed'].includes(fields.status)) throw new Error('Invalid period status.');
    safe.status = fields.status;
  }
  if (!Object.keys(safe).length) throw new Error('There is nothing to update.');
  return safe;
}
