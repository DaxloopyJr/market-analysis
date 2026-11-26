/**
 * FILE: src/services/idoSubmissionService.jsx
 * FLOW: Existing DataEntry, Submissions and IDO Dashboard pages -> this adapter
 * -> src/API/axios.jsx -> Laravel authorization -> PostgreSQL.
 * Existing export names remain stable; mock/sessionStorage data removed.
 * TODO(BACKEND): Verify routes, response schemas and institution scoping.
 */
import {savedResponsibleUserID} from '../utils/datasetAssignees';
import api from "../API/axios";
import { listResult } from "../API/resourceHelpers";
import { cached, fetchAllPages } from "./listCache.js";
import { allSubmissionRows } from "./submissionReadService.js";
import { periodType } from "../utils/reportingPeriodRules";
import { postSubmissionContext, postSubmissionTemplate, fetchSubmission, putSubmissionValues, postSubmitSubmission } from '../API/submission';
import { buildSubmissionValuesPayload, normalizeSubmissionRecord, submissionExpectedRevision, hasEnteredSubmissionValues, draftEditable, isSubmittedState, savedValuesMatch } from '../utils/submissionValues';
import { buildAnnualTargetsPayload, savedTargetsMatch, annualTargetContextOf } from '../utils/annualTargets';
import { annualObjectiveContextOf, objectiveSelectionPayload } from '../utils/annualObjective.js';
import { annualBudgetContextOf, hasPerformanceInput, performancePayload, savedPerformanceMatch } from '../utils/budgetPerformance.js';
import { submissionContextPayload, reportingCalendarIdFromResponse, submissionTemplateIdFromResponse } from '../utils/submissionContext';
import { checkedDatasetId, workflowFailure } from '../utils/submissionWorkflowTrace';
import { normalizeSubmissionDataset, normalizeSubmissionIndicator, mergeGlobalPeriodWithAssignment } from "../utils/submissionReadModels";

const DATASETS = "/datasets";

/** Fetch EVERY page, since Laravel's documented pagination defaults to 20. */
async function listAll(path, params = {}) {
  // Page 1, then the remaining pages in parallel; shared for 2 minutes per path + filter.
  const key = `${path.replace(/^\//, '').split('/')[0]}:ido:${path}:${JSON.stringify(params)}`;
  return cached(key, async () => (await fetchAllPages(p => api.get(path, {params: p}).then(listResult), {extra: params, maxPages: 100})).items, 120_000);
}

/**
 * Source: VERIFIED GET /datasets?status=active.  There is NO /datasets/assigned
 * endpoint in the supplied contract. This returns role-visible ACTIVE datasets,
 * NOT an invented proof of a responsible-officer assignment.
 */
/**
 * Datasets the signed-in data officer may report on (5 Nov 2026): only those whose responsible
 * officer (responsibleUserId) is this user. If GET /datasets carries no responsibleUserId at all, the scoped list is kept.
 */
export async function getAssignedDatasets(user = null) {
  const rows = await listAll(DATASETS, {status: 'active'});
  const all = rows.map(normalizeSubmissionDataset).filter(dataset => dataset.id != null);
  const me = user?.id ?? user?.user_id ?? null;
  if (me == null) return all;
  // When the list carries responsible officers, a dataset without one (or with another officer) is not offered.
  const carries = all.some(dataset => savedResponsibleUserID(dataset) !== null);
  return carries ? all.filter(dataset => savedResponsibleUserID(dataset) === String(me)) : all;
}

/** VERIFIED GET /datasets/{id}/indicators: fetch real input definitions. */
export async function getDatasetIndicators(datasetId) {
  if (datasetId == null) return [];
  const rows = await listAll(`${DATASETS}/${encodeURIComponent(String(datasetId))}/indicators`);
  return rows.map(normalizeSubmissionIndicator);
}

/** VERIFIED GET /datasets/{id}/dimensions for per-indicator, multi-category breakdowns. */
export async function getDatasetDimensions(datasetId) {
  if (datasetId == null) return [];
  return listAll(`${DATASETS}/${encodeURIComponent(String(datasetId))}/dimensions`);
}

/**
 * Verified GET /reporting-periods (GLOBAL) and
 * GET /datasets/{id}/reporting-calendar (individual assignment).
 * Global periods are visible whether or not officer-calendar assignment exists.
 * Assignment metadata is informational, not a selection or permission gate.
 * Save/Submit will require the confirmed submission API and dataset assignment rules.
 * A 404 from the calendar cannot erase globally configured periods.
 */
export async function getSubmissionPeriods(user, dataset) {
  if (!dataset?.id) return [];
  const allPeriods = await listAll('/reporting-periods');
  const datasetId = encodeURIComponent(String(dataset.id));
  let calendar = [];
  let assignmentLoadError = '';
  try {
    calendar = await listAll(`/datasets/${datasetId}/reporting-calendar`);
  } catch (error) {
    // Nonexistent dataset calendar is not proof of assignment. Keep global
    // choices visible in preview, while never granting persistence rights.
    if (error?.response?.status === 401) throw error;
    assignmentLoadError = error?.response?.status === 404
      ? 'Dataset reporting-calendar record was not found; officer assignment is not confirmed.'
      : 'Officer calendar could not be checked; submission assignment is not confirmed.';
  }
  const id = user?.id ?? user?.user_id;
  const assignmentByPeriod = new Map(calendar.map(item => [String(item.reportingPeriodId), item]));
  const frequencies = (dataset.frequencies ?? []).map(value => String(value).toLowerCase());
  return allPeriods.filter(item => !frequencies.length || frequencies.includes(periodType(item)))
    .map(item => ({
      ...mergeGlobalPeriodWithAssignment(item, assignmentByPeriod.get(String(item.id)), id),
      assignmentLoadError,
    })); // Keep Closed, Open and Upcoming visible; block ineligible selections in DataEntry.
}

/**
 * Laravel-confirmed sequence: context -> submission instance (id,status)
 * -> GET by id / GET list -> PUT values -> POST submit.
 * PUT /submissions/{id}/values requires expectedRevision sourced from GET,
 * plus values:[{indicatorId,value,remarks,breakdowns:[{dimensionId,optionId,value}]}].
 * The serializer and read-back gate
 * prevent false "saved" success when Laravel
 * ignores the supplied structure. BACKEND must enforce owner/stage/scope locks.
 */
export const submissionTemplateReady = true;
export const submissionWritesReady = true;
export const submissionHistoryReady = true;

/**
 * STEP A: Dataset picker -> saved /datasets ID (NOT indicator ID, template-version ID or period ID).
 * Dataset ID goes in URL; startYear/frequency/periodNumber go in JSON body.
 * Example: POST /datasets/6/submission-context
 *          {startYear:2026,frequency:'quarterly',periodNumber:2}
 * Laravel creates/retrieves the period-specific reporting calendar for THIS dataset.
 */
export async function createSubmissionContext(datasetId, {financialYear, frequency, period}) {
  const id = checkedDatasetId(datasetId);
  const path = `/datasets/${id}/submission-context`;
  let request;
  try {request = submissionContextPayload({financialYear, frequency, period});}
  catch(error) {throw error;}
  try {
    const result = await postSubmissionContext(id, request);
    return {...result, reportingCalendarId: reportingCalendarIdFromResponse(result.data,id),
      annualTargetContext: annualTargetContextOf(result.data),
      annualObjectiveContext: annualObjectiveContextOf(result.data),
      annualBudgetContext: annualBudgetContextOf(result.data),
      datasetId:id, request};
  } catch(error) {throw error?.response ? workflowFailure('SUBMISSION CONTEXT',path,error) : error;}
}

/** STEP B: calendar ID (not dataset ID) goes in POST /submissions; Laravel returns id/status. */
export async function createSubmissionTemplate(reportingCalendarId) {
  const path = '/submissions';
  try {
    const result = await postSubmissionTemplate(reportingCalendarId);
    const record = normalizeSubmissionRecord(result.data);
    return {...result, id: submissionTemplateIdFromResponse(result.data), status:record.status};
  } catch(error) {throw error?.response ? workflowFailure('CREATE SUBMISSION',path,error) : error;}
}

/**
 * GET /datasets/{datasetId}/reporting-calendar fallback only when the POST
 * context response lacks an explicit calendar identifier.
 * Never guess using the global reporting-period ID or unrelated calendar rows.
 */
export async function resolveReportingCalendarId(datasetId, periodId) {
  const id=checkedDatasetId(datasetId);
  if (!Number.isSafeInteger(Number(periodId)) || Number(periodId) <= 0) return null;
  let rows;
  try { rows=await listAll(`${DATASETS}/${id}/reporting-calendar`); }
  catch(error) {throw error?.response ? workflowFailure('RESOLVE REPORTING CALENDAR',`${DATASETS}/${id}/reporting-calendar`,error) : error;}
  const matches=rows.filter(row=>String(row.reportingPeriodId ?? row.reporting_period_id ?? row.reportingPeriod?.id) === String(periodId));
  return matches.length===1 ? Number(matches[0].id)||null : null;
}

export async function getIdoOverview() {
  const rows = await getMySubmissions();
  return {total:rows.length, draft:rows.filter(item => draftEditable(item.status)).length};
}
export async function getMySubmissions() {
  // Shared list (pages in parallel, 45 s cache, cleared by any submission write).
  return (await allSubmissionRows()).map(normalizeSubmissionRecord).filter(row=>row.id != null);
}
export async function getSubmissionById(_user,id) {
  const result = await fetchSubmission(id);
  // Pass the complete Laravel envelope; keep a revision returned outside data.
  return normalizeSubmissionRecord(result.envelope ?? result.data);
}
export async function getSubmissionFeedback(user,id) {
  return (await getSubmissionById(user,id)).feedback;
}
export async function getPreviousPeriodValues() {
  // This must NEVER accidentally load the latest submitted period into NEW form.
  // Previous values only appear when backend specifies the comparison period.
  return {values:{},previous_period:''};
}

export async function saveDraft({id,values,remarks,dimensionValues,method='manual',targetInputs={},indicators=[],objectiveChoice='',performanceInput=null}) {
  if (method !== 'manual') throw new Error('Template upload is not available yet. Nothing was uploaded.');
  const before = await getSubmissionById(null,id);
  if (!draftEditable(before.status)) throw new Error('This submission is locked for review. Only Draft/Returned may be edited.');
  // ANNUAL TARGETS: only NEW targets on a Draft (Returned => omitted, per Laravel).
  // The context comes from THIS submission's GET, so the year is the submission's year.
  const annualTargets = buildAnnualTargetsPayload({targetInputs, context:before.annualTargetContext, indicators, status:before.status});
  // A blank form can be saved as a DRAFT SUBMISSION INSTANCE by POST /submissions.
  // It already has its own ID and status. Do not PUT dummy indicator values
  // before Data Entry; `values[]` rows must match Laravel's indicator schema.
  // ANNUAL OBJECTIVE: computed against THIS submission's saved selection (never a stale client copy).
  // Returned/submitted records reject objective fields (409), so objectiveSelectionPayload omits them.
  const objective = /return/i.test(String(before.status)) ? null : objectiveSelectionPayload(before.annualObjectiveContext, objectiveChoice);
  const enteredValues = hasEnteredSubmissionValues({values,remarks,dimensionValues});
  // Budget + notes: sent when entered now or already saved (so a cleared field is cleared on the server too).
  const savedPerf = before.performance;
  const hadPerf = !!savedPerf && [savedPerf.received,savedPerf.spent,savedPerf.achievements,savedPerf.challenges,savedPerf.correctiveActions].some(v => v !== null && v !== '');
  const performance = (hasPerformanceInput(performanceInput) || hadPerf) ? performancePayload(performanceInput, before.annualBudgetContext) : null;
  if (performance && !enteredValues && hasEnteredSubmissionValues(before)) {
    throw new Error('This draft has saved values that are not loaded in the form. Reload the draft before saving the budget section.');
  }
  if (objective && !enteredValues && hasEnteredSubmissionValues(before)) {
    // values[] is a full replacement: never wipe saved values just to change the objective.
    throw new Error('This draft has saved values that are not loaded in the form. Reload the draft before changing the strategic objective.');
  }
  if (!enteredValues && !annualTargets.length && !objective && !performance) {
    if (hasEnteredSubmissionValues(before)) {
      // User may be attempting to clear existing server values; silently
      // skipping PUT would falsely claim this destructive edit was saved.
      throw new Error('This draft already has saved values; nothing was overwritten.');
    }
    return {...before, draftOnly:true};
  }
  // Optimistic lock: revision belongs to this EXISTING submission instance.
  // Never send a guessed 0/1; a stale revision must be handled by reloading,
  // not by silently overwriting someone else's changes.
  const expectedRevision = submissionExpectedRevision(before);
  if (expectedRevision === null) {
    throw new Error(`The draft could not be saved because it changed. Reload it and try again.`);
  }
  const payload=buildSubmissionValuesPayload({expectedRevision,values,remarks,dimensionValues,annualTargets,objective,performance});
  await putSubmissionValues(id,payload);
  const after=await getSubmissionById(null,id);
  if (!draftEditable(after.status)) throw new Error('The system changed the submission status during draft saving. Reload its status.');
  if (enteredValues && !savedValuesMatch(after,values,remarks,dimensionValues)) {
    throw new Error('Your values were sent but could not be confirmed. Reload the draft and check them.');
  }
  if (annualTargets.length && !savedTargetsMatch(after.annualTargetContext,annualTargets)) {
    throw new Error('Values were saved, but the system did not confirm the annual target(s). Reload the draft before entering targets again.');
  }
  if (objective && after.annualObjectiveContext?.selected?.objectiveVersionId !== objective.objectiveVersionId) {
    throw new Error('Values were saved, but the system did not confirm the selected strategic objective. Reload the draft and choose the objective again.');
  }
  if (performance && !savedPerformanceMatch(after.performance, performance)) {
    throw new Error('Values were saved, but the system did not confirm the budget and implementation notes. Reload the draft and check them before submitting.');
  }
  return {...after,sentTargets:annualTargets,sentObjective:objective,sentPerformance:performance};
}
export async function submitDraft(id) {
  const before=await getSubmissionById(null,id);
  if (!draftEditable(before.status)) throw new Error('Only an editable Draft/Returned submission can be submitted.');
  // Submit has its OWN revision validation. Fetch it AFTER the last draft PUT;
  // a successful values PUT may increment revision in Laravel.
  const expectedRevision = submissionExpectedRevision(before);
  if (expectedRevision === null) {
    throw new Error('The draft could not be saved because it changed. Reload it and try again.');
  }
  await postSubmitSubmission(id,{expectedRevision});
  const after=await getSubmissionById(null,id);
  if (!isSubmittedState(after.status)) {
    throw new Error('The submission was sent, but its status has not updated yet. Refresh to check it.');
  }
  return after;
}

/** One submission with display metadata filled from the authorised catalogue (shared with the admin monitor, 10 Nov 2026). */
export async function loadSubmissionDetail(user,detailId){
  const record=await getSubmissionById(user,detailId);
  // Preserve the immutable instance; enrich only missing display metadata.
  let enriched={...record,raw:{...(record.raw||{})}};
  const datasetId=record.dataset_id;
  if(datasetId){
    let dataset=null;
    try{const list=await getAssignedDatasets();dataset=list.find(item=>String(item.id)===String(datasetId))||null;}catch(_error){/* scoped API may restrict catalogue */}
    if(dataset){
      enriched.dataset=enriched.dataset||dataset.name||dataset.datasetName||dataset.label||'';
      enriched.institution_name=enriched.institution_name||dataset.institutionName||dataset.institution_name||dataset.sourceName||dataset.source?.name||'';
      enriched.department_name=enriched.department_name||dataset.departmentName||dataset.department_name||'';
      enriched.raw.dataset={...(typeof enriched.raw.dataset==='object'?enriched.raw.dataset:{}),...dataset};
    }
    const snapshot=enriched.template?.template_content||enriched.template?.templateContent||enriched.template||{};
    // Prefer original immutable snapshot for labels; fill gaps with the
    // authorized dataset catalogue only, never replace recorded values.
    try{
      const indicators=await getDatasetIndicators(datasetId);
      const dimensions=await getDatasetDimensions(datasetId).catch(()=>[]);
      const saved=Array.isArray(snapshot.indicators)?snapshot.indicators:[];
      const byId=new Map(indicators.map(item=>[String(item.id),item]));
      const merged=saved.map(item=>{
        const id=item.indicatorId??item.indicator_id??item.indicator?.id??item.id;
        const catalogue=byId.get(String(id));
        if(!catalogue)return item;
        byId.delete(String(id));
        return {...catalogue,...item,indicator:{...catalogue.raw?.indicator,...item.indicator}};
      });
      merged.push(...byId.values());
      if(merged.length || dimensions.length){
        enriched.template={...snapshot,indicators:merged,dimensions:(Array.isArray(snapshot.dimensions)&&snapshot.dimensions.length)?snapshot.dimensions:dimensions};
      }
    }catch(_error){/* Preserve snapshot when catalogue is unavailable. */}
  }
  return enriched;
}
