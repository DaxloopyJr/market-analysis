/**
 * FILE: src/utils/annualTargets.js
 * ANNUAL TARGET CONTRACT (API reference, 27 October 2026)
 *
 * READ:  data.annualTargetContext on
 *        POST /datasets/{id}/submission-context, GET /submissions/{id},
 *        PUT /submissions/{id}/values (response) and list snapshots.
 *        {reportingYearId, yearLabel, targets:[{indicatorId,targetValue}],
 *         missingIndicatorIds, readOnly, historicalSnapshotAvailable}
 * WRITE: PUT /submissions/{id}/values  ->  annualTargets:[{indicatorId,targetValue:"100"}]
 *        - optional; only NUMERIC indicators; only indicators WITHOUT a target yet
 *        - one target per dataset + reporting year + indicator (entered once,
 *          in the first period used that year; locked for later periods)
 *        - never on a RETURNED submission (Laravel: omit annualTargets)
 * CORRECTION: PATCH /submissions/{id}/annual-targets (IA of institution or MOA only)
 *
 * Laravel stays the authority: the UI only hides inputs that would be rejected.
 */
// Local copy (avoids a circular import with submissionValues.js).
const submissionStatus = value => String(value ?? '').trim().toLowerCase().replace(/[\s_-]+/g, '');

const NUMERIC_TYPES = ['integer','int','count','bigint','number','numeric','decimal','float','double','percentage','percent','currency','money'];

/** True when the indicator accepts numeric values (only these can have targets). */
export function isNumericIndicator(indicator) {
  if (!indicator) return false;
  const raw = indicator.raw ?? {};
  const type = String(indicator.dataType ?? indicator.data_type ?? raw.dataType ?? raw.data_type ??
    raw.indicator?.dataType ?? raw.indicator?.data_type ?? indicator.type ?? '').toLowerCase();
  return NUMERIC_TYPES.includes(type);
}

/**
 * Read target rows in every shape Laravel may return them:
 *  - [{indicatorId,targetValue}] / [{indicator_id,target_value}] / [{indicator:{id},value}]
 *  - {"8":"100"} or {"8":{targetValue:"100"}}  (object map keyed by indicator)
 *  - {targets:[...]} wrapper (frozen snapshot)
 */
function collectTargets(rows, byIndicator) {
  if (!rows) return;
  if (typeof rows === 'string') { try { rows = JSON.parse(rows); } catch { return; } }
  if (!Array.isArray(rows) && typeof rows === 'object' && (Array.isArray(rows.targets) || (rows.targets && typeof rows.targets === 'object'))) rows = rows.targets;
  const add = (id, value) => {
    if (id == null || value === null || value === undefined || typeof value === 'object' || String(value).trim() === '') return;
    if (byIndicator[String(id)] === undefined) byIndicator[String(id)] = String(value);
  };
  const valueOf = row => row?.targetValue ?? row?.target_value ?? row?.annualTarget ?? row?.annual_target ?? row?.target ?? row?.value;
  if (Array.isArray(rows)) {
    for (const row of rows) add(row?.indicatorId ?? row?.indicator_id ?? row?.indicator?.id, valueOf(row));
  } else if (typeof rows === 'object') {
    for (const [key, row] of Object.entries(rows)) {
      if (!/^\d+$/.test(key)) continue;
      add(key, row && typeof row === 'object' ? valueOf(row) : row);
    }
  }
}

/** Frozen per-attempt baseline: submittedVersions[].annual_targets_snapshot (latest attempt wins). */
function snapshotTargets(data) {
  const versions = data?.submittedVersions ?? data?.submitted_versions ?? [];
  if (!Array.isArray(versions) || !versions.length) return null;
  const ordered = [...versions].sort((a, b) => Number(b?.attempt ?? b?.id ?? 0) - Number(a?.attempt ?? a?.id ?? 0));
  for (const version of ordered) {
    const snap = version?.annual_targets_snapshot ?? version?.annualTargetsSnapshot ?? version?.annual_targets ?? version?.annualTargets;
    if (snap) return snap;
  }
  return null;
}

/** Normalise annualTargetContext from any Laravel envelope / normalised record. */
export function annualTargetContextOf(source) {
  if (!source || typeof source !== 'object') return null;
  // Already-normalised context (record.annualTargetContext built by normalizeSubmissionRecord):
  // reuse it when it holds targets; otherwise ignore it and re-read the Laravel layers below.
  const normalised = [source.annualTargetContext, source].find(item => item && typeof item === 'object' && item.byIndicator && typeof item.byIndicator === 'object');
  if (normalised && Object.keys(normalised.byIndicator).length) return normalised;
  if (normalised === source) source = {};
  // Accept a normalised record (raw = Laravel data), a full envelope ({data:{...}}) or bare data.
  const layers = [source, source.raw, source.data, source.raw?.data, source.data?.data].filter(x => x && typeof x === 'object');
  const candidates = [
    ...layers.flatMap(layer => [layer.annualTargetContext, layer.annual_target_context]),
    // PATCH /annual-targets wraps the context directly in data.
    ...layers.map(layer => (layer.targets && ('reportingYearId' in layer || 'yearLabel' in layer || 'missingIndicatorIds' in layer)) ? layer : null),
  ];
  // Skip normalised copies (byIndicator) so the raw Laravel context with `targets` is used.
  const context = candidates.find(item => item && typeof item === 'object' && !Array.isArray(item) && !item.byIndicator) || null;
  const byIndicator = {};
  if (context) collectTargets(context.targets ?? context.annualTargets ?? context.annual_targets, byIndicator);
  // Submitted/under-review records: fall back to the frozen submitted snapshot.
  for (const layer of layers) collectTargets(snapshotTargets(layer), byIndicator);
  // Some responses expose plain annualTargets on the submission itself.
  for (const layer of layers) collectTargets(layer.annualTargets ?? layer.annual_targets, byIndicator);
  // Last resort (e.g. MDD history/published views): search nested objects for any
  // "annual…target…" key, e.g. versions[].annualTargetSnapshot or snapshot.annual_targets.
  if (!Object.keys(byIndicator).length) {
    const seen = new Set();
    const walk = (node, depth) => {
      if (!node || typeof node !== 'object' || depth > 5 || seen.has(node)) return;
      seen.add(node);
      for (const [key, value] of Object.entries(node)) {
        if (/annual.?target/i.test(key) && !/context$/i.test(key)) collectTargets(value, byIndicator);
        else if (value && typeof value === 'object') walk(value, depth + 1);
      }
    };
    for (const layer of layers) walk(layer, 0);
  }
  if (!context && !Object.keys(byIndicator).length) return null;
  if (!Object.keys(byIndicator).length && import.meta.env?.DEV) {
    // Developer aid: shows where Laravel placed annual-target data when the UI finds none.
    const keys = layers.flatMap(layer => Object.keys(layer).filter(k => /target|snapshot|version/i.test(k)));
    console.debug('[annualTargets] no targets parsed; target-like keys in response:', [...new Set(keys)], context);
  }
  return {
    reportingYearId: context?.reportingYearId ?? context?.reporting_year_id ?? null,
    yearLabel: context?.yearLabel ?? context?.year_label ?? '',
    byIndicator,
    missing: (context?.missingIndicatorIds ?? context?.missing_indicator_ids ?? []).map(String),
    readOnly: Boolean(context?.readOnly ?? context?.read_only),
    historicalSnapshotAvailable: context?.historicalSnapshotAvailable ?? context?.historical_snapshot_available ?? true,
  };
}

/** Targets may only be created on an unsubmitted DRAFT, never on Returned. */
export function annualTargetsWritable(status) {
  const value = submissionStatus(status);
  return value === '' || value === 'draft';
}

/** Is this indicator's target locked (already set for the year, or not writable)? */
export function targetLocked(context, indicatorId, status) {
  if (!annualTargetsWritable(status)) return true;
  return Boolean(context?.byIndicator?.[String(indicatorId)]);
}

const decimalPattern = /^-?\d{1,18}(\.\d{1,6})?$/;
export function targetInputError(value) {
  if (value === undefined || value === null || String(value).trim() === '') return '';
  const text = String(value).trim();
  if (!decimalPattern.test(text)) return 'Use a number with at most 6 decimal places.';
  if (Number(text) <= 0) return 'Annual target must be greater than zero.';
  return '';
}

/**
 * Build the optional annualTargets array for PUT /submissions/{id}/values.
 * Only NEW targets (indicator has none for the year) are sent; existing ones are
 * omitted because changing them on PUT returns 409.
 */
export function buildAnnualTargetsPayload({targetInputs = {}, context, indicators = [], status}) {
  if (!annualTargetsWritable(status)) return [];
  const numeric = new Set(indicators.filter(isNumericIndicator).map(item => String(item.key ?? item.id)));
  const rows = [];
  for (const [key, value] of Object.entries(targetInputs)) {
    const id = Number(key);
    if (!Number.isSafeInteger(id) || id <= 0 || !numeric.has(String(key))) continue;
    if (context?.byIndicator?.[String(key)]) continue;
    if (value === undefined || value === null || String(value).trim() === '') continue;
    if (targetInputError(value)) continue;
    rows.push({indicatorId: id, targetValue: String(value).trim()});
  }
  return rows;
}

/** After save, confirm every new target came back in annualTargetContext. */
export function savedTargetsMatch(context, sent = []) {
  return sent.every(row => {
    const saved = context?.byIndicator?.[String(row.indicatorId)];
    return saved !== undefined && Number(saved) === Number(row.targetValue);
  });
}

export function formatTarget(value) {
  if (value === undefined || value === null || String(value).trim() === '') return '';
  const number = Number(value);
  if (!Number.isFinite(number)) return String(value);
  return number.toLocaleString('en-US', {maximumFractionDigits: 6});
}

/**
 * Simple performance against the annual target.
 *  < 50%        Under Performance
 *  50% - 80%    Good
 *  > 80%        Excellence
 * Returns null when there is no positive target or no numeric actual value.
 */
/** Laravel performanceDirection of an indicator (any of the shapes the pages pass around). */
export function directionOf(indicator) {
  const i = indicator ?? {};
  const raw = i.performanceDirection ?? i.performance_direction ?? i.direction ?? i.indicator?.performanceDirection ?? i.indicator?.performance_direction
    ?? i.raw?.performanceDirection ?? i.raw?.performance_direction ?? i.raw?.indicator?.performanceDirection ?? i.raw?.indicator?.performance_direction ?? '';
  const v = String(raw).toLowerCase();
  return v === 'lower' || v === 'lower_is_better' ? 'lower_is_better' : v === 'neutral' ? 'neutral' : 'higher_is_better';
}

/**
 * Achievement against the annual target (5 Nov 2026: follows the indicator direction).
 *  higher_is_better: actual ÷ target × 100
 *  lower_is_better : target ÷ actual × 100 (at or below the target = 100% or more; 0 counts as fully achieved)
 *  neutral         : no achievement band
 */
export function performanceOf(actual, target, direction = 'higher_is_better') {
  const goal = Number(target);
  if (actual === undefined || actual === null || String(actual).trim() === '') return null;
  const value = Number(actual);
  if (!Number.isFinite(goal) || goal <= 0 || !Number.isFinite(value) || value < 0) return null;
  if (direction === 'neutral') return null;
  const percent = direction === 'lower_is_better' ? (value === 0 ? 100 : (goal / value) * 100) : (value / goal) * 100;
  const band = percent > 80 ? 'excellence' : percent >= 50 ? 'good' : 'under';
  const label = band === 'excellence' ? 'Excellence' : band === 'good' ? 'Good' : 'Under Performance';
  return {percent, rounded: Math.round(percent * 10) / 10, band, label, direction};
}

/** Text for a missing target: legacy submissions have no frozen target snapshot. */
export function missingTargetText(context) {
  return context && context.historicalSnapshotAvailable === false ? 'Not recorded at submission' : '—';
}
