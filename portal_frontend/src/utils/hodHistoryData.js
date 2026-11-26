import {normalizeSubmissionRecord} from './submissionValues.js';
import {hodHistoryRows} from './hodReviewRules.js';

/**
 * GET /submissions is a summary list and often omits the approval history.
 * For Review History, read authorized GET /submissions/{id} records (in small
 * batches) and include only those with a real action by the current HOD.
 * If Laravel denies past submissions, do not pretend a history entry exists;
 * a just-completed action is separately presented from its POST receipt.
 */
export async function loadVerifiedHodHistory(rows,user,readDetail) {
  const verified=new Map();
  const missing=[];
  for(const row of rows) {
    if(hodHistoryRows([row],user).length) verified.set(String(row.id),row);
    else if(row.id) missing.push(row);
  }
  // Respect backend pagination; cap concurrent detail reads to avoid flooding.
  for(let offset=0;offset<missing.length;offset+=6){
    const results=await Promise.allSettled(missing.slice(offset,offset+6).map(row=>readDetail(row.id)));
    for(const result of results){
      if(result.status!=='fulfilled') continue; // 403/404 = not authorized
      const record=normalizeSubmissionRecord(result.value.envelope ?? result.value.data ?? result.value);
      if(record.id && hodHistoryRows([record],user).length)verified.set(String(record.id),record);
    }
  }
  return [...verified.values()];
}

