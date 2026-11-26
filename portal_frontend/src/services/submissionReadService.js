/**
 * FILE: src/services/submissionReadService.js
 * Shared reads of GET /submissions for every workflow page (IDO, IHOD, AO, MDO, MDD, admin dashboards).
 * Before 30 Oct 2026 each page read every page of the list ONE BY ONE and then GET /submissions/{id}
 * for EVERY row (N+1 requests), again on each page change. Now:
 *  - the list is read once, pages in parallel, and shared for 45 s (services/listCache.js);
 *  - GET /submissions/{id} is called only for rows whose list item lacks the workflow fields
 *    (currentStep / history); Laravel list items normally carry the full submission snapshot;
 *  - any submission write clears the cache (API/axios.jsx), so a decision is never hidden.
 */
import {fetchSubmission, listSubmissionsPage} from '../API/submission.jsx';
import {cached, fetchAllPages, mapLimit} from './listCache.js';

export const allSubmissionRows = () => cached('submissions:all', async () => (await fetchAllPages(listSubmissionsPage)).items);

const has = (row, ...keys) => keys.some(k => row && Object.prototype.hasOwnProperty.call(row, k));
/** True when a list row can be shown and judged without its detail read. */
export const listRowIsComplete = (row) => has(row, 'currentStep', 'current_step') && has(row, 'allowedActions', 'allowed_actions')
  && Array.isArray(row?.history ?? row?.approvalHistory ?? row?.approval_history);
/** Queues and review lists need only the workflow fields, which Laravel list rows always carry (5 Nov 2026). */
export const listRowHasWorkflow = (row) => has(row, 'currentStep', 'current_step') && has(row, 'allowedActions', 'allowed_actions');

/**
 * True when a submission may already carry a decision of a step whose roles are listed
 * (e.g. ['IHOD','HOD'] for HOD history, ['IHOD','HOD','AO'] for AO history). Drafts and rows
 * still waiting at (or before) that step cannot, so their approval history is not read (5 Nov 2026).
 */
export function mayHavePassedStep(row, roles) {
  const status = String(row?.status ?? '').toLowerCase();
  if (status === 'draft') return false;
  const stage = String(row?.workflowStage ?? row?.workflow_stage ?? '').toLowerCase();
  if (stage === 'ministry' || ['approved', 'published', 'returned'].includes(status)) return true;
  const step = row?.currentStep ?? row?.current_step;
  const role = String(step?.required_role_code ?? step?.requiredRoleCode ?? '').toUpperCase();
  return !role || !roles.map(r => r.toUpperCase()).includes(role);
}

/** True when GET /submissions rows carry their approval history (patched backend only; the original backend does not). */
export const listCarriesHistory = (rows) => rows.some((row) => Array.isArray(row?.history ?? row?.approvalHistory ?? row?.approval_history));

/** Detail read, shared for a short time (list pages only; actions always read fresh). */
export const cachedSubmissionDetail = (id) => cached(`submissions:detail:${id}`, () => fetchSubmission(id), 30_000);

/**
 * Rows with what each page needs: complete list rows as they are, incomplete ones replaced by their detail.
 * mapRow(raw, detailOrNull) builds the page's record; rows whose detail is refused (403/404) get detail = null.
 */
export async function submissionsWithWorkflow(mapRow, {concurrency = 6, needsHistory = () => true} = {}) {
  const rows = await allSubmissionRows();
  return mapLimit(rows, concurrency, async (raw) => {
    // History (approval timeline) is read only for rows that need it; the list has no history yet.
    if (listRowIsComplete(raw) || (listRowHasWorkflow(raw) && !needsHistory(raw))) return mapRow(raw, null);
    const id = raw?.id ?? raw?.submissionId ?? raw?.submission_id;
    if (!id) return mapRow(raw, null);
    try { return mapRow(raw, await cachedSubmissionDetail(id)); }
    catch (error) { if ([403, 404].includes(error?.response?.status)) return mapRow(raw, null, error); throw error; }
  });
}
