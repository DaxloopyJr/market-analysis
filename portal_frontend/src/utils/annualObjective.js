/**
 * FILE: src/utils/annualObjective.js
 * Annual strategic objective for one dataset + reporting year (29 Oct 2026 contract).
 * READ:  data.annualObjectiveContext on POST /datasets/{id}/submission-context and on every
 *        SubmissionSnapshot (GET /submissions/{id}, review/approval/publish views).
 *        {reportingYearId,yearLabel,selectedObjective,availableObjectives,requiresEntry,
 *         selectionValid,readOnly,planConfigured,historicalSnapshotAvailable}
 *        Submitted records keep the frozen selection; submittedVersions[].objective_snapshot is a fallback.
 * WRITE: PUT /submissions/{id}/values {objectiveVersionId, expectedObjectiveVersionId, values…}
 *        (expected = currently saved version or null for the first selection). Omit both to keep it.
 *        Draft may change it until the first submission of the year; then it is locked.
 */
const asObject = (value) => (value && typeof value === 'object' && !Array.isArray(value) ? value : null);

export function normalizeObjectiveVersion(raw) {
  const o = asObject(raw);
  if (!o) return null;
  const id = o.objectiveVersionId ?? o.objective_version_id ?? o.versionId ?? o.id ?? null;
  const code = o.code ?? o.objectiveCode ?? o.objective_code ?? '';
  const description = o.description ?? o.objectiveDescription ?? o.objective_description ?? '';
  if (id == null && !code && !description) return null;
  return {
    objectiveVersionId: id == null ? null : Number(id),
    objectiveId: o.objectiveId ?? o.objective_id ?? null,
    versionNumber: o.versionNumber ?? o.version_number ?? null,
    code: String(code || ''),
    description: String(description || ''),
    effectiveFrom: o.effectiveFrom ?? o.effective_from ?? null,
    strategicPlanId: o.strategicPlanId ?? o.strategic_plan_id ?? null,
    strategicPlanName: o.strategicPlanName ?? o.strategic_plan_name ?? o.planName ?? '',
    yearLabel: o.yearLabel ?? o.year_label ?? '',
    reason: o.reason ?? null,
  };
}

function frozenSnapshot(layer) {
  const versions = layer?.submittedVersions ?? layer?.submitted_versions;
  if (!Array.isArray(versions)) return null;
  const ordered = [...versions].sort((a, b) => Number(b?.attempt ?? b?.id ?? 0) - Number(a?.attempt ?? a?.id ?? 0));
  for (const version of ordered) {
    const snap = version?.objective_snapshot ?? version?.objectiveSnapshot;
    if (asObject(snap)) return snap;
  }
  return null;
}

/** Accepts a Laravel envelope, bare data, or a normalised submission record ({raw}). */
export function annualObjectiveContextOf(source) {
  const root = asObject(source);
  if (!root) return null;
  if (root.__objectiveContext) return root;
  const layers = [root, root.raw, root.data, root.raw?.data, root.data?.data].filter(asObject);
  let context = null;
  for (const layer of layers) {
    context = asObject(layer.annualObjectiveContext) || asObject(layer.annual_objective_context);
    // A normalised record already carries the parsed context: reuse it as-is.
    if (context?.__objectiveContext) return context;
    if (context) break;
  }
  let snapshot = null;
  for (const layer of layers) { snapshot = frozenSnapshot(layer); if (snapshot) break; }
  if (!context && !snapshot) return null;
  const selected = normalizeObjectiveVersion(context?.selectedObjective ?? context?.selected_objective) || normalizeObjectiveVersion(snapshot);
  const available = (Array.isArray(context?.availableObjectives ?? context?.available_objectives) ? (context.availableObjectives ?? context.available_objectives) : [])
    .map(normalizeObjectiveVersion).filter((item) => item && item.objectiveVersionId != null);
  return {
    __objectiveContext: true,
    reportingYearId: context?.reportingYearId ?? context?.reporting_year_id ?? null,
    yearLabel: context?.yearLabel ?? context?.year_label ?? selected?.yearLabel ?? '',
    selected,
    available,
    requiresEntry: Boolean(context?.requiresEntry ?? context?.requires_entry),
    selectionValid: Boolean(context?.selectionValid ?? context?.selection_valid ?? selected),
    readOnly: Boolean(context?.readOnly ?? context?.read_only ?? (!context && selected)),
    planConfigured: context ? Boolean(context.planConfigured ?? context.plan_configured) : Boolean(selected),
    historicalSnapshotAvailable: context?.historicalSnapshotAvailable ?? context?.historical_snapshot_available ?? Boolean(selected),
  };
}

/** UI state of the objective picker for New Submission step 1. */
export function objectivePickerState(context, recordStatus = '') {
  if (!context) return 'unknown';
  const returned = /return/i.test(String(recordStatus));
  if (context.readOnly || returned || (!context.available.length && context.selected)) return 'locked';
  if (!context.planConfigured) return 'no-plan';
  if (!context.available.length) return 'no-options';
  return 'select';
}

/** PUT fields: only when the officer picked a different, editable objective. */
export function objectiveSelectionPayload(context, choice) {
  if (!context || choice === '' || choice == null) return null;
  if (objectivePickerState(context) !== 'select') return null;
  const chosen = Number(choice);
  if (!Number.isSafeInteger(chosen) || chosen <= 0) return null;
  if (!context.available.some((item) => item.objectiveVersionId === chosen)) return null;
  const current = context.selected?.objectiveVersionId ?? null;
  if (current === chosen) return null;
  return {objectiveVersionId: chosen, expectedObjectiveVersionId: current};
}

export const objectiveLabel = (objective) => objective ? `${objective.code ? `${objective.code} · ` : ''}${objective.description}` : '';
