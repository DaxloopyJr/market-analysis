import {submissionFacts} from './serverFields.js';
import {annualTargetContextOf} from './annualTargets.js';
import {annualObjectiveContextOf} from './annualObjective.js';
import {normalizeYear} from './reportingTime.js';
import {annualBudgetContextOf, performanceOf} from './budgetPerformance.js';
/**
 * CONFIRMED Laravel contract (23 October 2026):
 * PUT /submissions/{id}/values
 * {
 *   expectedRevision: 4, // read from GET /submissions/{id}; never hardcode
 *   values: [{
 *     indicatorId: 8,
 *     value: "123",               // indicator's current/total value
 *     remarks: "Idadi ya staff mwisho wa kipindi",
 *     breakdowns: [
 *       {dimensionId: 2, optionId: 3, value: "70"},
 *       {dimensionId: 4, optionId: 8, value: "73"},
 *     ],
 *   }],
 * }
 *
 * UI mapping: dimensionValues["8:2:3"] = "70" becomes a breakdown
 * belonging to indicator 8. Each indicator gets ONE values[] object, not a
 * separate values[] object for each option/category. Never send the previous
 * `dimensionValues` request format; it was superseded by `breakdowns`.
 */
const own = (object, key) => Object.prototype.hasOwnProperty.call(object ?? {}, key);
export const positiveId = value => {
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
};
export const submissionStatus = value => String(value ?? '').trim().toLowerCase().replace(/[\s_-]+/g, '');
export const draftEditable = value => ['draft', 'returned', 'returnedforcorrection', 'revisionrequested'].includes(submissionStatus(value));
export const isSubmittedState = value => ['submitted','pending','pendingreview','inreview','underreview','approved','published','completed'].includes(submissionStatus(value));

function unwrapRecord(raw) {
  if (!raw || typeof raw !== 'object') return {};
  const inner = raw.data && !Array.isArray(raw.data) && typeof raw.data === 'object' ? raw.data : raw;
  return inner.submission && typeof inner.submission === 'object' ? inner.submission : inner;
}
/**
 * Laravel optimistic concurrency: PUT /submissions/{id}/values requires
 * expectedRevision. This MUST come from the submission instance returned by
 * GET /submissions/{id}; it is NOT the dataset template version, submission ID,
 * or a guessed default (even for brand-new submissions).
 *
 * TODO(BACKEND): Confirm the actual response field. The extractor handles
 * common camel/snake spellings without inventing a revision if none exists.
 * A missing revision stops the PUT and explains the contract gap.
 */
export function submissionExpectedRevision(responseOrRecord) {
  if (!responseOrRecord || typeof responseOrRecord !== 'object') return null;
  const fields = [
    'revision', 'currentRevision', 'current_revision',
    'valueRevision', 'value_revision', 'valuesRevision', 'values_revision',
    'expectedRevision', 'expected_revision',
  ];
  const candidates = [
    responseOrRecord,
    responseOrRecord.raw,
    responseOrRecord.data,
    responseOrRecord.submission,
    responseOrRecord.data?.submission,
    responseOrRecord.meta,
    responseOrRecord.data?.meta,
    responseOrRecord.raw?.submission,
  ];
  for (const source of candidates) {
    if (!source || typeof source !== 'object') continue;
    for (const field of fields) {
      const value = source[field];
      if (value === null || value === undefined || value === '') continue;
      const parsed = Number(value);
      if (Number.isSafeInteger(parsed) && parsed >= 0) return parsed;
    }
  }
  return null;
}
function resolvedId(value) { return positiveId(typeof value === 'object' ? value?.id : value); }
function rowsFrom(raw) {
  // Laravel may return values as array-of-arrays grouped by indicator;
  // accept that response as well as the old flat array for draft read-back.
  if (Array.isArray(raw)) return raw.flatMap(row => Array.isArray(row) ? rowsFrom(row) : [row]);
  if (raw && typeof raw === 'object') return Object.entries(raw).map(([indicatorId, data]) =>
    typeof data === 'object' && data !== null ? {indicatorId, ...data} : {indicatorId, value: data});
  return [];
}
/** Fields are kept strictly separate from the dataset master definition. */
export function normalizeSubmissionRecord(raw) {
  const data = unwrapRecord(raw);
  const calendar = data.reportingCalendar ?? data.reporting_calendar ?? {};
  const dataset = data.dataset ?? calendar.dataset ?? {};
  const period = data.reportingPeriod ?? data.reporting_period ?? calendar.reportingPeriod ?? calendar.reporting_period ?? {};
  const status = String(data.status ?? '');
  const values = {};
  const remarks = {};
  const dimensionValues = {};
  const originalValues = data.values ?? data.indicatorValues ?? data.indicator_values ?? data.submissionValues;
  for (const item of rowsFrom(originalValues)) {
    const id = resolvedId(item.indicatorId ?? item.indicator_id ?? item.indicator?.id ?? item.id);
    if (!id) continue;
    const key = String(id);
    const hasValue = own(item,'value') || own(item,'currentValue') || own(item,'current_value');
    const rowValue = item.value ?? item.currentValue ?? item.current_value ?? '';
    // New Laravel response: the indicator's value is the total, while each
    // breakdown holds its OWN entered count plus dimension/option identifiers.
    const breakdownRows = rowsFrom(item.breakdowns ?? item.break_downs);
    const selectorRows = breakdownRows.length ? [] : rowsFrom(item.dimensionValues ?? item.dimension_values);
    const legacyRows = breakdownRows.length || selectorRows.length ? [] : rowsFrom(item.dimensions);
    if (breakdownRows.length) {
      for (const breakdown of breakdownRows) {
        const dimId = resolvedId(breakdown.dimensionId ?? breakdown.dimension_id);
        const optionId = resolvedId(breakdown.optionId ?? breakdown.option_id);
        if (dimId && optionId && own(breakdown, 'value')) {
          dimensionValues[`${key}:${dimId}:${optionId}`] = breakdown.value;
        }
      }
    } else if (selectorRows.length) {
      // Read older saved submissions that used an option selector on each
      // separate indicator row. Do not misinterpret selector option IDs as
      // breakdown metrics or overwrite the overall indicator total.
      for (const dim of selectorRows) {
        const dimId = resolvedId(dim.dimensionId ?? dim.dimension_id ?? dim.dimension?.id);
        const optionId = resolvedId(dim.value ?? dim.optionId ?? dim.option_id);
        if (dimId && optionId && hasValue) {
          dimensionValues[`${key}:${dimId}:${optionId}`] = rowValue;
        }
      }
    } else if (legacyRows.length) {
      for (const dim of legacyRows) {
        const dimId = resolvedId(dim.dimensionId ?? dim.dimension_id ?? dim.dimension?.id);
        const optionId = resolvedId(dim.optionId ?? dim.option_id ?? dim.option?.id);
        if (dimId && optionId) {
          dimensionValues[`${key}:${dimId}:${optionId}`] = dim.value ?? dim.currentValue ?? '';
        }
      }
    }
    // New contract: total/indicator value and breakdowns are in the SAME row.
    // Old separate selector-rows have no total and must not replace it.
    if (!selectorRows.length && hasValue) values[key] = rowValue;
    if (own(item,'remarks') || own(item,'remark')) {
      remarks[key] = item.remarks ?? item.remark ?? '';
    }
  }
  const id = resolvedId(data.id ?? data.submissionId ?? data.submission_id);
  const datasetId = resolvedId(data.datasetId ?? data.dataset_id ?? dataset.id ?? calendar.datasetId ?? calendar.dataset_id);
  const periodId = resolvedId(data.reportingPeriodId ?? data.reporting_period_id ?? data.periodId ?? data.period_id ?? period.id ?? calendar.reportingPeriodId ?? calendar.reporting_period_id);
  const periodNumber = data.periodNumber ?? data.period_number ?? calendar.periodNumber ?? calendar.period_number ?? period.periodNumber ?? period.period_number;
  const rawFrequency = data.frequency ?? calendar.frequency ?? period.frequency ?? '';
  const resolvedPeriodLabel = period.label ?? period.periodLabel ?? period.period_label ?? data.periodLabel ?? data.period_label ??
    (String(rawFrequency).toLowerCase() === 'quarterly' && Number.isInteger(Number(periodNumber)) && Number(periodNumber) >= 1 && Number(periodNumber) <= 4 ? `Q${periodNumber}` : '');
  const year = data.startYear ?? data.start_year ?? calendar.startYear ?? period.startYear;
  // Laravel list/detail snapshots carry the year inside periodLabel ("2026/2027 Q2"), not as financialYear.
  const financialYear = data.financialYear ?? data.financial_year ?? (normalizeYear(data.periodLabel ?? data.period_label ?? resolvedPeriodLabel) || (year ? `${year}/${Number(year)+1}` : ''));
  const linkedFields = submissionFacts({raw:data,dataset_id:datasetId,financialYear});
  return {
    id, status, revision:submissionExpectedRevision(raw), dataset_id:datasetId, period_id:periodId,
    dataset: dataset.datasetName ?? dataset.dataset_name ?? dataset.name ?? data.datasetName ?? data.dataset_name ?? linkedFields.dataset ?? '',
    period: resolvedPeriodLabel,
    financialYear,
    frequency:rawFrequency,
    method: data.submissionMethod ?? data.submission_method ?? data.method ?? linkedFields.method ?? '',
    updated_at: data.updatedAt ?? data.updated_at ?? '',
    submitted_at: data.submittedAt ?? data.submitted_at ?? data.submittedOn ?? data.submitted_on ?? linkedFields.submittedAt ?? '',
    submitted_by: linkedFields.submittedBy ?? '',
    institution_name: linkedFields.institution ?? '',
    department_name: linkedFields.department ?? '',
    feedback: data.feedback ?? data.returnReason ?? data.return_reason ?? '',
    remarks, values, dimensionValues,
    // For read-after-write verification, an omitted values collection is NOT proof of saving.
    valuesProvided: own(data,'values') || own(data,'indicatorValues') || own(data,'indicator_values') || own(data,'submissionValues'),
    template:data.template ?? data.snapshot ?? null,
    targets:data.targets ?? [],
    // Current annual-target UI uses annualTargetContext, never legacy `targets`.
    annualTargetContext:annualTargetContextOf(data),
    // Annual strategic objective (frozen snapshot once submitted).
    annualObjectiveContext:annualObjectiveContextOf(data),
    // Budget + implementation notes (approved budget locked once set for the year).
    annualBudgetContext:annualBudgetContextOf(data),
    performance:performanceOf(data),
    history:data.history ?? data.approvalHistory ?? data.approval_history ?? data.reviewActions ?? data.review_actions ?? [],
    raw:data,
  };
}
/** True when there is at least one nonblank indicator, remark or dimension value.
 * Zero is valid; an entirely blank new submission needs only its template ID,
 * not a PUT containing guesses about the values schema.
 */
export function hasEnteredSubmissionValues({values = {}, remarks = {}, dimensionValues = {}} = {}) {
  return [values, remarks, dimensionValues].some(record =>
    Object.values(record ?? {}).some(value =>
      value !== null && value !== undefined && String(value).trim() !== ''
    )
  );
}
/**
 * Serialize the UI into the *confirmed* Laravel breakdowns schema.
 * One indicator = one values[] record with its own total/remarks/breakdowns.
 * Each UI key `${indicatorId}:${dimensionId}:${optionId}` stores the count
 * entered for that option (not the option ID or indicator total).
 *
 * The `value` property must be present even for remarks-only/dimension-only
 * drafts; we send null when the user has not entered a current/total value.
 * Laravel may enforce additional non-null rules for an indicator at submit.
 */
export function buildSubmissionValuesPayload({expectedRevision, values={}, remarks={}, dimensionValues={}, annualTargets=[], objective=null, performance=null}) {
  const revision = Number(expectedRevision);
  if (expectedRevision === undefined || expectedRevision === null || expectedRevision === '' ||
      !Number.isSafeInteger(revision) || revision < 0) {
    throw new Error('The draft changed; reload it and try again.');
  }
  const indicatorKeys = new Set([
    ...Object.keys(values), ...Object.keys(remarks),
    ...Object.keys(dimensionValues).map(key => key.split(':')[0]),
  ]);
  const entries = [];
  for (const key of indicatorKeys) {
    const indicatorId = positiveId(key);
    if (!indicatorId) continue;
    const metric = values[key];
    const hasMetric = metric !== undefined && metric !== null && String(metric).trim() !== '';
    const remark = remarks[key];
    const hasRemark = remark !== undefined && remark !== null && String(remark).trim() !== '';
    const breakdowns = [];
    for (const [path, dimensionMetric] of Object.entries(dimensionValues)) {
      const [owner, rawDimensionId, rawOptionId, ...extra] = path.split(':');
      if (owner !== String(key)) continue;
      if (dimensionMetric === undefined || dimensionMetric === null || String(dimensionMetric).trim() === '') continue;
      const dimensionId = positiveId(rawDimensionId);
      const optionId = positiveId(rawOptionId);
      if (extra.length || !dimensionId || !optionId) {
        throw new Error(`Indicator ${indicatorId}: a breakdown value could not be saved. Reload the form and try again.`);
      }
      breakdowns.push({dimensionId, optionId, value:String(dimensionMetric)});
    }
    if (!hasMetric && !hasRemark && !breakdowns.length) continue;
    const entry = {indicatorId, value: hasMetric ? String(metric) : null};
    if (hasRemark) entry.remarks = String(remark);
    if (breakdowns.length) entry.breakdowns = breakdowns;
    entries.push(entry);
  }
  const payload = {expectedRevision: revision, values:entries};
  // Optional annual targets (NEW targets only). Omitted entirely when empty.
  if (Array.isArray(annualTargets) && annualTargets.length) payload.annualTargets = annualTargets;
  // Annual objective: both fields together (expected = saved version or null). Omitted = keep selection.
  if (objective && objective.objectiveVersionId) {
    payload.objectiveVersionId = objective.objectiveVersionId;
    payload.expectedObjectiveVersionId = objective.expectedObjectiveVersionId ?? null;
  }
  // Budget + implementation notes (omitted when nothing was entered or saved).
  if (performance) payload.performance = performance;
  return payload;
}
export function savedValuesMatch(server, clientValues, clientRemarks, clientDimensions) {
  if (!server.valuesProvided) return false;
  // Confirm every nonempty client-side field actually comes back with same value.
  const matches = (expected, actual) => Object.entries(expected).every(([key,value]) =>
    value === '' || value === undefined || value === null || String(actual[key] ?? '') === String(value));
  return matches(clientValues,server.values) && matches(clientRemarks,server.remarks) && matches(clientDimensions,server.dimensionValues);
}
