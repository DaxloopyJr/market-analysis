/**
 * Verified Laravel GET /datasets and GET /datasets/{id}/indicators adapters.
 * The dataset endpoint is scoped by the authenticated actor on Laravel.
 * It does NOT promise an officer assignment. Period eligibility/assignment
 * is evaluated independently in the reporting-calendar layer.
 */
export function normalizeSubmissionDataset(row) {
  const frequencies = Array.isArray(row?.frequencies) ? row.frequencies :
    (row?.frequency ? [row.frequency] : []);
  // Submission method is different from dataset collectionMethod (manual/system).
  // Laravel does not yet expose a submission-method contract: both are UI choices
  // only, and neither can be saved without the future submission endpoints.
  const explicitMethods = row?.allowed_methods ?? row?.allowedMethods;
  return {
    ...row,
    id: row?.id,
    name: row?.datasetName ?? row?.dataset_name ?? row?.name ?? '',
    description: row?.description ?? '',
    frequencies,
    allowed_methods: Array.isArray(explicitMethods) ? explicitMethods : ['manual', 'upload'],
    submissionMethodsConfirmed: Array.isArray(explicitMethods),
  };
}

export function normalizeSubmissionIndicator(link) {
  const definition = link?.indicator ?? link ?? {};
  const dataType = String(definition.dataType ?? definition.data_type ?? 'text').toLowerCase();
  const id = definition.id ?? link.indicatorId ?? link.indicator_id;
  return {
    id,
    key: String(id),
    label: definition.nameEn ?? definition.name_en ?? definition.nameSw ?? definition.name_sw ?? `Indicator ${id}`,
    description: definition.descriptionEn ?? definition.description_en ?? '',
    type: ['integer','decimal','number','numeric','count','bigint'].includes(dataType) ? 'number' :
      dataType === 'date' ? 'date' : dataType === 'boolean' ? 'select' : 'text',
    precision: ['integer','count','bigint'].includes(dataType) ? 0 : ['decimal','numeric'].includes(dataType) ? 6 : undefined,
    options: dataType === 'boolean' ? [{value: 'true', label: 'Yes'}, {value: 'false', label: 'No'}] : undefined,
    required: Boolean(link.isRequired ?? link.is_required ?? true),
    order: Number(link.displayOrder ?? link.display_order ?? 0),
    unitId: definition.unitId ?? definition.unit_id ?? null,
    // A unit ID alone is not its label; never make up unit names.
    unit: definition.unit?.nameEn ?? definition.unit?.name_en ?? '',
    raw: link, // per-indicator remarks configuration when present in future Laravel response
  };
}

export function mergeGlobalPeriodWithAssignment(period, assignment, userId) {
  const actualAssignment = assignment && userId && String(assignment.responsibleUserId) === String(userId)
    ? assignment : null;
  const deadlines = [period.deadline, actualAssignment?.deadline].filter(Boolean).sort();
  const effectiveDeadline = deadlines[0] || null;
  return {
    ...period,
    id: String(period.id),
    reportingYear: actualAssignment?.reportingYear || period.reportingYear || null,
    assignmentConfirmed: Boolean(actualAssignment),
    // The global date always remains authoritative for the published period;
    // when officer calendar is present, apply the earlier cutoff defensively.
    assignmentDeadline: effectiveDeadline,
    periodDeadline: period.deadline ?? null,
    datasetDeadline: actualAssignment?.deadline ?? null,
    closes_at: effectiveDeadline,
    isOpen: period.isOpen ?? period.status === 'open',
    responsibleUserId: actualAssignment?.responsibleUserId ?? null,
    reportingCalendarId: actualAssignment?.id ?? null,
  };
}
