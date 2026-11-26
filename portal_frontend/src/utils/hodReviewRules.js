/**
 * HOD REVIEW WORKFLOW / SAFETY RULES
 * Backend is authoritative for assignment, stage and data mutation rights.
 * Keep this module free of React so route/inbox/validation share one policy.
 */
import { positiveId, submissionStatus } from './submissionValues.js';

// Backend /me permissions and currentStep assignment define reviewer access.
const approvalStatuses = new Set(['submitted', 'pending', 'pendingreview', 'inreview', 'underreview']);
const pick = (...items) => items.find(value => value !== undefined && value !== null && value !== '');

export function isHodReviewer(user) {
  return Boolean(user?.permissions?.includes('submissions.review'));
}
export function reviewerRoleCodes(user) {
  return [user?.role_code, user?.role?.code, ...(user?.roles || []).map(r=>typeof r==='string'?r:r?.code)]
    .filter(Boolean).map(v=>String(v).toUpperCase());
}

function submissionSource(record) {
  const raw = record?.raw || record || {};
  return raw.submission || raw;
}
export function reviewerAssignment(record, user) {
  if (!record || !isHodReviewer(user)) return {assigned:false, reason:'Review permission is required.'};
  const item = submissionSource(record);
  const step = item.currentStep ?? item.current_step ?? item.currentApprovalStep ?? item.current_approval_step ?? {};
  const id = positiveId(pick(step.assignedUserId, step.assigned_user_id, item.currentAssigneeId,
    item.current_assignee_id, item.assignedUserId, item.assigned_user_id,
    item.currentApproverId, item.current_approver_id));
  const me = positiveId(user?.id);
  if (id) return {assigned:Boolean(me && id === me), reason:id===me?'':'Assigned to another reviewer.'};
  // A role-assigned step can be actionable without assigned_user_id. Laravel
  // must enforce institution scope and reviewer permission on read and POST.
  const role = String(pick(step.required_role_code, step.requiredRoleCode, '')).toUpperCase();
  const matched = Boolean(role && reviewerRoleCodes(user).includes(role));
  return {assigned:matched, reason:matched?'':'The current approval step is not assigned to your role.'};
}
export function canHodAct(record, user) {
  const assignment = reviewerAssignment(record,user);
  return assignment.assigned && approvalStatuses.has(submissionStatus(record?.status));
}
/**
 * Returned submissions normally belong to the responsible IDO/DDO (API #76).
 * A HOD can reopen one for corrections ONLY when Laravel explicitly assigns
 * it to this HOD AND advertises a value-edit permission. Never infer access
 * from status='returned' or the fact that the HOD reviewed it previously.
 */
export function canHodReopenReturned(record,user) {
  if (!['returned','returnedforcorrection'].includes(submissionStatus(record?.status))) return false;
  if (!reviewerAssignment(record,user).assigned) return false;
  const raw=record?.raw??record??{};
  const actions=raw.allowedActions??raw.allowed_actions??[];
  return Array.isArray(actions)&&actions.some(action=>
    ['save','edit','editvalues','updatevalues','patchvalues'].includes(submissionStatus(action)));
}
export function hodInboxRows(records,user) {
  return (records || []).filter(item => canHodAct(item,user));
}
export function hodHistoryRows(records,user) {
  const me = positiveId(user?.id);
  if (!isHodReviewer(user) || !me) return [];
  return (records || []).filter(item => {
    const source = submissionSource(item);
    const history = source.history ?? source.approvalHistory ?? source.approval_history ??
      source.reviewActions ?? source.review_actions ?? item?.history ?? [];
    return Array.isArray(history) && history.some(h => {
      const actor=h.user ?? h.actor ?? h.reviewer ?? h.performedBy ?? h.performed_by;
      const actorId=h.userId ?? h.user_id ?? h.actorId ?? h.actor_id ??
        h.approverId ?? h.reviewerId ?? h.reviewer_id ?? h.performedById ?? h.performed_by_id ?? actor?.id;
      return positiveId(actorId) === me;
    });
  });
}

/**
 * Live client validation for exhaustive count indicators. When Laravel omits a
 * numeric dataType in a snapshot, the user-facing name still allows an
 * unambiguous "Number of Staff" / "Idadi ya ..." count to be validated.
 * Percentages, averages and explicitly non-additive indicators are excluded.
 */
export function additiveIndicator(indicator) {
  const raw = indicator?.raw?.indicator || indicator?.raw || indicator || {};
  // Explicit breakdown rule from Laravel wins.
  const breakdownRule = String(raw.breakdownValidation ?? raw.breakdown_validation ?? '').toLowerCase();
  if (['sumtototal','sum_to_total','additive','sum'].includes(breakdownRule)) return true;
  if (['none','nonadditive','non_additive','average','percentage'].includes(breakdownRule)) return false;
  // aggregationRule describes adding PERIODS over the year (default "none"), not breakdowns;
  // only "average" tells us the values themselves are averages.
  const yearRule = String(raw.aggregationRule ?? raw.aggregation_rule ?? '').toLowerCase();
  if (yearRule === 'average') return false;
  const label = String(indicator?.label ?? raw.nameEn ?? raw.name_en ?? '').toLowerCase().trim();
  const type = String(raw.dataType ?? raw.data_type ?? raw.indicator?.dataType ?? '').toLowerCase();
  if (/\b(average|mean|percentage|percent|ratio|rate|index|wastani|asilimia|kiwango)\b|%/.test(label) ||
      ['percentage','percent','ratio','average'].includes(type)) return false;
  // 27 Oct 2026: every other NUMERIC indicator with a dimension must have breakdowns that add up to its total
  // (e.g. Farmers trained = Male + Female).
  if (/\b(staff|employees|headcount|number of|count of|total|workers|members|idadi ya|watumishi|wafanyakazi)\b/.test(label)) return true;
  return indicator?.type === 'number' || ['integer','count','bigint','decimal','numeric','number'].includes(type);
}
const entered = value => value !== null && value !== undefined && String(value).trim() !== '';
export function validateHodIndicator(indicator, categories, values = {}, dimensionValues = {}) {
  const key = String(indicator?.id ?? indicator?.key);
  const overall = values[key];
  const results = [];
  const enforce = additiveIndicator(indicator);
  for (const category of categories || []) {
    const options = category.options || [];
    const rows = options.map(option => ({
      id:option.id, value:dimensionValues[`${key}:${category.id}:${option.id}`], name:option.label,
    }));
    const enteredRows=rows.filter(row=>entered(row.value));
    const inputIsNumeric=rows.every(row=>!entered(row.value) || Number.isFinite(Number(row.value)));
    const partialTotal = inputIsNumeric ? enteredRows.reduce((sum,row)=>sum+Number(row.value),0) : null;
    if (!enforce) {
      results.push({id:category.id,name:category.name,valid:true,enforced:false,total:partialTotal,reason:''});
      continue;
    }
    // Missing option definitions must NOT silently make an additive count pass.
    if(category.optionsKnown===false || !options.length) {
      results.push({id:category.id,name:category.name,valid:false,enforced:true,total:partialTotal,
        reason:`${category.name}: The system has not supplied the complete dimension options, so the total cannot be verified.`});
      continue;
    }
    const complete = rows.every(row=>entered(row.value) && Number.isSafeInteger(Number(row.value)) && Number(row.value)>=0);
    const indicatorNumber=Number(overall);
    const valid=entered(overall) && Number.isSafeInteger(indicatorNumber) && indicatorNumber>=0 && complete && partialTotal===indicatorNumber;
    results.push({id:category.id,name:category.name,valid,enforced:true,total:partialTotal,
      reason:valid?'':!entered(overall)?'Enter the indicator total first.':!Number.isSafeInteger(indicatorNumber)||indicatorNumber<0?
        'Indicator total must be a non-negative whole number.':!complete?
        `Enter all ${category.name} options as non-negative whole numbers.`:
        `${category.name}: ${partialTotal} / ${indicatorNumber}. ${partialTotal<indicatorNumber?'Missing':'Exceeds by'} ${Math.abs(indicatorNumber-partialTotal)}.`,
    });
  }
  return results;
}
/**
 * Normalize Laravel dataset dimension attachments/snapshot definitions.
 * The GET snapshot may hold `indicatorId` (singular) or indicatorIds[]; if an
 * association is missing but saved breakdowns contain dimension IDs, expose
 * their values without claiming the list of options is complete.
 */
export function categoriesForIndicator(attachments, indicatorId, dimensionValues = {}) {
  const key=String(indicatorId);
  const savedByDimension=new Map();
  for(const path of Object.keys(dimensionValues||{})){
    const [owner, dimensionId, optionId, ...extra]=path.split(':');
    if(owner!==key || extra.length || !positiveId(dimensionId) || !positiveId(optionId))continue;
    const dimKey=String(positiveId(dimensionId));
    if(!savedByDimension.has(dimKey))savedByDimension.set(dimKey,new Set());
    savedByDimension.get(dimKey).add(positiveId(optionId));
  }
  const categories=[];
  for(const row of attachments||[]){
    const dimension=row.dimension||row.dimensionDefinition||row.dimension_definition||row;
    const id=positiveId(row.dimensionId??row.dimension_id??dimension.id);
    if(!id)continue;
    const assignmentIds=[...(row.indicatorIds||row.indicator_ids||[]),
      ...(row.indicators||[]).map(item=>typeof item==='object'?item.id:item),
      row.indicatorId,row.indicator_id].filter(x=>x!==null&&x!==undefined);
    const matches=assignmentIds.some(x=>String(x)===key)||savedByDimension.has(String(id));
    if(!matches)continue;
    const provided=dimension.options||row.options||dimension.dimensionOptions||[];
    const loadedOptions=Array.isArray(provided)?provided.map(option=>({
      id:positiveId(option.id??option.optionId??option.option_id),
      label:option.nameEn??option.name_en??option.nameSw??option.name_sw??option.code??`Option ${option.id}`,
    })).filter(o=>o.id):[];
    const saved=savedByDimension.get(String(id))||new Set();
    const known=new Set(loadedOptions.map(opt=>opt.id));
    const unknown=[...saved].filter(optionId=>!known.has(optionId));
    categories.push({id,name:dimension.nameEn??dimension.name_en??dimension.nameSw??dimension.name_sw??`Dimension ${id}`,
      options:[...loadedOptions,...unknown.map(optionId=>({id:optionId,label:`Option ${optionId} (unverified)`}))],
      optionsKnown:loadedOptions.length>0&&unknown.length===0});
    savedByDimension.delete(String(id));
  }
  // Saved breakdowns must never disappear from the HOD review page.
  for(const [dimKey,optionIds] of savedByDimension){
    categories.push({id:Number(dimKey),name:`Dimension ${dimKey}`,
      options:[...optionIds].map(optionId=>({id:optionId,label:`Option ${optionId} (unverified)`})),optionsKnown:false});
  }
  return categories;
}

/** Shared UI/service guard: an invalid category blocks HOD value PATCH and
 * Review/Forward, before any Laravel write request leaves the browser. */
/** True when Laravel assigned at least one dimension to this indicator. */
export function indicatorHasAssignedDimension(attachments,indicatorId){
  const key=String(indicatorId);
  return (attachments||[]).some(row=>[...(row?.indicatorIds||row?.indicator_ids||[]),
    ...(row?.indicators||[]).map(item=>typeof item==='object'?item?.id:item),row?.indicatorId,row?.indicator_id]
    .some(id=>id!==null&&id!==undefined&&String(id)===key));
}
/** Verify an indicator only when it has an assigned dimension — or, when Laravel returned NO
 * dimension definitions at all, when saved breakdowns prove one exists (options unknown). */
export function indicatorNeedsVerification(attachments,indicatorId,dimensionValues={}){
  if(indicatorHasAssignedDimension(attachments,indicatorId))return true;
  return !(attachments||[]).length&&Object.keys(dimensionValues||{}).some(path=>path.split(':')[0]===String(indicatorId));
}
/** 27 Oct 2026: indicators without an assigned dimension pass as entered; only dimensioned indicators are verified. */
export function reviewValueIssues(indicators,attachments,values,dimensionValues){
  return (indicators||[]).filter(indicator=>indicatorNeedsVerification(attachments,indicator.id??indicator.key,dimensionValues))
    .flatMap(indicator=>validateHodIndicator(indicator,
    categoriesForIndicator(attachments,indicator.id??indicator.key,dimensionValues),values,dimensionValues)
    .filter(item=>!item.valid).map(item=>({indicator:indicator.label||`Indicator ${indicator.id}`,...item})));
}
