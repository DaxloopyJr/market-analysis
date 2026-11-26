/**
 * Table-only HOD Reviewed page read model. The action dates and history are
 * taken exclusively from Laravel GET /submissions/{id}; never synthesize a
 * review event from the current submission status.
 */
import {recordedReviewActions} from './hodReviewActionDisplay.js';

export function ownHodReviewEvents(record,user) {
  const me=Number(user?.id);
  if(!Number.isSafeInteger(me)||me<1)return [];
  return recordedReviewActions(record)
    .filter(event=>Number(event.actorId)===me)
    .sort((a,b)=>(Date.parse(a.timestamp||'')||0)-(Date.parse(b.timestamp||'')||0));
}
export function latestHodReviewAction(record,user) {
  const events=ownHodReviewEvents(record,user);
  return events.length?events[events.length-1]:null;
}
export function reviewedSubmissionStatus(record,user) {
  const action=String(latestHodReviewAction(record,user)?.action??'').toLowerCase();
  if(/return/.test(action))return 'Returned';
  if(/approv/.test(action))return 'Approved';
  if(/review|forward/.test(action))return 'Reviewed';
  // If Laravel returns an authorized historic record without a recognized
  // action, show its actual status rather than a fabricated one.
  return String(record?.status??'Unknown');
}
export function reviewedSubmissionAt(record,user) {
  return latestHodReviewAction(record,user)?.timestamp??null;
}
