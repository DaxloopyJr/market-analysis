/**
 * Review actions displayed in HOD Review History. Server-confirmed only.
 * Laravel POST /review and /return returns the new revision/status/next step;
 * GET /submissions/{id} provides the durable history. Do not manufacture
 * database audit events when a list response omits its history array.
 */
import {roleName,reviewActorName,reviewDate} from './hodApprovalPresentation.js';
const first = (...items) => items.find(item => item !== null && item !== undefined && item !== '');
export const reviewActionLabel = action => action === 'review' ? 'Reviewed & Forwarded' :
  action === 'return' ? 'Returned for Correction' : String(action ?? 'Review Action');
export function confirmedHodActionReceipt({id, action, comments='', confirmation}) {
  const server = confirmation?.confirmed;
  const revision = Number(first(server?.revision, server?.currentRevision));
  const submissionId = Number(id);
  if (!server || !Number.isSafeInteger(revision) || !Number.isSafeInteger(submissionId) ||
      submissionId <= 0 || !Number.isSafeInteger(Number(server?.id)) || Number(server.id)!==submissionId) {
    throw new Error('The system did not confirm the review action for this submission ID and revision.');
  }
  const step=server.currentStep ?? server.current_step ?? confirmation.nextStep ?? {};
  return {
    submissionId,
    action,
    label:reviewActionLabel(action),
    revision,
    status:String(server.status ?? ''),
    comments:String(comments ?? '').trim(),
    nextReviewer: first(step?.step_name, step?.stepName,
      roleName(first(step?.required_role_code, step?.requiredRoleCode)), '') || '',
    correctionDeadline:first(server.correctionDeadline,server.correction_deadline,''),
    // This receipt confirms a successful server response in this navigation;
    // it is not a replacement for the persistent history GET endpoint.
  };
}
export function recordedReviewActions(record) {
  const raw=record?.raw ?? record ?? {};
  const history = first(record?.history,raw?.history,raw?.approvalHistory,
    raw?.approval_history,raw?.reviewActions,raw?.review_actions,[]);
  if (!Array.isArray(history)) return [];
  return history.filter(item => item && typeof item === 'object').map(item => ({
    id:item.id ?? null,
    action:String(first(item.action,item.eventType,item.event_type,item.status,'Review')),
    comments:String(first(item.comments,item.comment,item.reason,item.remarks,'')),
    actor:reviewActorName(first(item.actor,item.user,item.reviewer,item.performedBy,item.performed_by,'')) || String(first(item.name,item.actorName,item.actor_name,'')),
    actorRole:first(item.actor?.roles?.[0]?.name,item.user?.roles?.[0]?.name,item.role?.name,item.roleName,item.role_name,''),
    actorId:first(item.userId,item.user_id,item.actorId,item.actor_id,item.reviewerId,item.reviewer_id,
      item.performedById,item.performed_by_id,null),
    timestamp:first(item.createdAt,item.created_at,item.actionAt,item.action_at,item.performedAt,item.performed_at,null),
  }));
}
