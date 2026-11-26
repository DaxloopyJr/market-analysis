/**
 * FILE: src/utils/periodSubmissions.js
 * One report per dataset + reporting period (Laravel: "No duplicate submission per calendar";
 * POST /submissions returns the EXISTING record with 200). New Submission step 1 reads the officer's
 * submissions for the dataset (GET /submissions?datasetId=…) and marks every period card:
 *   locked   -> submitted / under review / approved / published: cannot be written again
 *   draft    -> open the SAME draft for editing (never create another)
 *   returned -> open the same submission for correction
 * Only Draft and Returned submissions are editable.
 */
import {draftEditable, isSubmittedState, submissionStatus} from './submissionValues.js';

export function existingSubmissionState(record) {
  if (!record) return null;
  const status = submissionStatus(record.status);
  if (/return|revision/.test(status)) return 'returned';
  if (draftEditable(record.status)) return 'draft';
  if (isSubmittedState(record.status) || status) return 'locked';
  return null;
}

/** periodId -> latest submission for that period (highest id wins). */
export function submissionsByPeriod(records = []) {
  const map = {};
  for (const record of records) {
    const periodId = record?.period_id ?? record?.raw?.reportingPeriodId ?? record?.raw?.reporting_period_id;
    if (periodId == null || record?.id == null) continue;
    const key = String(periodId);
    if (!map[key] || Number(record.id) > Number(map[key].id)) map[key] = record;
  }
  return map;
}

export const prettyStatus = (value) => {
  const text = String(value ?? '').replace(/[_-]+/g, ' ').trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : 'Submitted';
};

export const periodCardLabel = (state) => state === 'locked' ? 'Submitted' : state === 'draft' ? 'Draft saved' : state === 'returned' ? 'Returned' : '';

export function lockedReportMessage(record, periodLabel, datasetName) {
  const ref = record?.raw?.reference || `SUB-${record?.id}`;
  return `The ${periodLabel || 'selected period'} report for ${datasetName || 'this dataset'} has already been submitted (${ref}, ${prettyStatus(record?.status).toLowerCase()}). `
    + 'It cannot be written or submitted again. You can edit it only if a reviewer returns it for correction.';
}
