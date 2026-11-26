/**
 * GET /datasets/{datasetId}/assignees lists eligible users; it does not save assignment.
 * Persisting the selected user uses dataset create/update's `responsibleUserId`.
 */
export function normalizeAssignees(payload) {
  const input = payload?.data ?? payload;
  const rows = Array.isArray(input) ? input :
    Array.isArray(input?.data) ? input.data :
    Array.isArray(input?.items) ? input.items :
    input?.user ? [input.user] :
    input && typeof input === 'object' && input.id != null ? [input] : [];
  return rows.filter(row => row && row.id != null && (row.name || row.email || row.username))
    .map(row => ({id:row.id, name:row.name ?? row.email ?? row.username,
      email:row.email ?? '',username:row.username ?? null}));
}

/** Saved assignment must come from GET /datasets/{id}, NOT from GET /assignees. */
export function savedResponsibleUserID(dataset) {
  if (!dataset || typeof dataset !== 'object') return null;
  // Laravel's field is `responsibleUserId` (case-sensitive); tolerate older GET aliases only.
  const value = dataset.responsibleUserId ?? dataset.responsibleUserID ??
    dataset.responsible_user_id ?? dataset.responsibleUser?.id ?? null;
  const id = value && typeof value === 'object'
    ? value.id ?? value.userId ?? value.user_id ?? null : value;
  return id == null || id === '' ? null : String(id);
}

/** Dataset POST / PATCH: backend expects this exact case-sensitive field. */
export function responsibleUserWriteFields(selectedOfficer) {
  if (selectedOfficer == null || selectedOfficer === '') return {};
  const parsed = Number(selectedOfficer);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error('Select a valid responsible IDO/DDO user.');
  }
  return {responsibleUserId:parsed};
}
