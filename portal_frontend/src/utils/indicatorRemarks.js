/** Remarks are per indicator. Laravel indicator remarks configuration is NOT yet in the verified API contract.
 * Backend fields are authoritative when available. Locally staged changes are preview-only in this tab.
 * TODO(BACKEND): PATCH /indicators/{id} must explicitly accept remarksMode: hidden|optional|required
 * and GET /datasets/{id}/indicators must return this field for ALL users.
 * Future submission payload: remarks: {[indicatorId]: string}. Server must validate required remarks.
 */
const STORAGE = 'viwanda.preview.indicatorRemarks.v1';
export const REMARK_MODES = ['hidden','optional','required'];
const valid = v => REMARK_MODES.includes(String(v||'').toLowerCase());
function backendMode(link) {
  const row = link?.indicator || link || {};
  const value = row.remarksMode ?? row.remarks_mode ?? link?.remarksMode ?? link?.remarks_mode;
  if (valid(value)) return String(value).toLowerCase();
  const enabled = row.remarksEnabled ?? row.remarks_enabled ?? link?.remarksEnabled ?? link?.remarks_enabled;
  const required = row.remarksRequired ?? row.remarks_required ?? link?.remarksRequired ?? link?.remarks_required;
  if (enabled === false || enabled === 0) return 'hidden';
  if (required === true || required === 1) return 'required';
  if (enabled === true || enabled === 1) return 'optional';
  return null;
}
export function configuredRemarkMode(link, datasetId, indicatorId) {
  const confirmed = backendMode(link);
  if (confirmed) return confirmed;
  try {
    const modes=JSON.parse(sessionStorage.getItem(STORAGE)||'{}');
    const preview=modes[String(datasetId)]?.[String(indicatorId)];
    if (valid(preview)) return preview;
  } catch { /* session storage is optional */ }
  return 'optional';
}
export function stageRemarkMode(datasetId, indicatorId, mode) {
  if (!datasetId || !indicatorId || !valid(mode)) return;
  try {
    const modes=JSON.parse(sessionStorage.getItem(STORAGE)||'{}');
    modes[String(datasetId)]={...modes[String(datasetId)],[String(indicatorId)]:mode};
    sessionStorage.setItem(STORAGE,JSON.stringify(modes));
  } catch { /* preview does not require storage access */ }
}
