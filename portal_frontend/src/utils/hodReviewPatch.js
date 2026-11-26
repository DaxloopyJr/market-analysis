/**
 * HOD correction contract – PATCH /submissions/{submissionId}/values.
 * Backend-confirmed shape: { expectedRevision, reason, values:[{indicatorId,value}] }.
 * Only changed indicator rows are sent. Optional remarks/breakdowns are included
 * ONLY if changed; backend team must confirm acceptance of these optional fields.
 * Do not confuse with IDO/DDO's PUT /submissions/{id}/values.
 */
import { positiveId } from './submissionValues.js';

const stringify = v => v === undefined || v === null ? '' : String(v).trim();
// "96" and "96.000000" are the SAME number: Laravel returns decimals with padding.
const same = (a,b) => {
  const x=stringify(a), y=stringify(b);
  if (x === y) return true;
  if (x !== '' && y !== '' && Number.isFinite(Number(x)) && Number.isFinite(Number(y))) return Number(x) === Number(y);
  return false;
};
/** True only when the HOD actually changed a total, remark or breakdown (not just touched a field). */
export function hodHasRealChanges({ original, values={}, remarks={}, dimensionValues={} }) {
  const prior=original||{};
  const pv=prior.values||{}, pr=prior.remarks||{}, pb=prior.dimensionValues||{};
  const anyDiff=(now,before)=>[...new Set([...Object.keys(now),...Object.keys(before)])].some(k=>!same(now[k],before[k]));
  return anyDiff(values,pv)||anyDiff(remarks,pr)||anyDiff(dimensionValues,pb);
}
const own = (obj,k) => Object.prototype.hasOwnProperty.call(obj??{},k);
export function buildHodReviewPatch({ expectedRevision, reason, original, values={}, remarks={}, dimensionValues={} }) {
  if (!Number.isSafeInteger(Number(expectedRevision)) || Number(expectedRevision)<0 || expectedRevision==null || expectedRevision==='') {
    throw new Error('HOD review requires the latest expectedRevision.');
  }
  if (!String(reason??'').trim()) throw new Error('Reason for correcting indicator values is required.');
  const prior=original||{};
  const previousValues=prior.values||{};
  const previousRemarks=prior.remarks||{};
  const previousBreakdowns=prior.dimensionValues||{};
  const keys=new Set([...Object.keys(values),...Object.keys(remarks),...Object.keys(previousValues),...Object.keys(previousRemarks)]);
  for (const key of [...Object.keys(dimensionValues),...Object.keys(previousBreakdowns)]) {
    const indicator=key.split(':')[0]; if(indicator) keys.add(indicator);
  }
  const rows=[];
  for (const key of keys) {
    const indicatorId=positiveId(key);
    if(!indicatorId) continue;
    const changedTotal=!same(values[key],previousValues[key]);
    const changedRemarks=!same(remarks[key],previousRemarks[key]);
    const breakdownKeys=new Set([...Object.keys(dimensionValues),...Object.keys(previousBreakdowns)]
      .filter(path=>path.startsWith(`${key}:`)));
    const changedBreakdowns=[...breakdownKeys].filter(path=>!same(dimensionValues[path],previousBreakdowns[path]));
    if(!changedTotal&&!changedRemarks&&!changedBreakdowns.length)continue;
    const total=values[key];
    if(total===undefined||total===null||String(total).trim()==='') {
      throw new Error(`Indicator ${indicatorId} needs a current value for HOD correction.`);
    }
    const row={indicatorId,value:String(total)};
    if(changedRemarks)row.remarks=String(remarks[key]??'');
    if(changedBreakdowns.length){
      row.breakdowns=[...breakdownKeys].filter(path=>dimensionValues[path]!==undefined&&String(dimensionValues[path]).trim()!=='')
        .map(path=>{const [,dimensionId,optionId]=path.split(':');return {dimensionId:positiveId(dimensionId),optionId:positiveId(optionId),value:String(dimensionValues[path])};})
        .filter(item=>item.dimensionId&&item.optionId);
    }
    rows.push(row);
  }
  if(!rows.length)throw new Error('No changed indicator values to save.');
  return {expectedRevision:Number(expectedRevision),reason:String(reason).trim(),values:rows};
}
/** Assert only fields actually changed. GET after a PATCH may include other values. */
export function hodPatchMatches(record,payload) {
  if(!record?.valuesProvided)return false;
  return payload.values.every(item=>{
    const key=String(item.indicatorId);
    if(!same(record.values?.[key],item.value))return false;
    if(own(item,'remarks')&&!same(record.remarks?.[key],item.remarks))return false;
    if(item.breakdowns && !item.breakdowns.every(row=>same(record.dimensionValues?.[`${key}:${row.dimensionId}:${row.optionId}`],row.value)))return false;
    return true;
  });
}
