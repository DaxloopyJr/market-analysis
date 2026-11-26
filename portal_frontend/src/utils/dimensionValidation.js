/**
 * Data Entry verification rule (27 Oct 2026):
 *  - An indicator WITHOUT an assigned dimension is not validated here — it passes as entered
 *    (Laravel still applies its own rules on save/submit).
 *  - Validation is only for indicators that HAVE dimensions: required dimensions must be filled,
 *    entries must be numbers for numeric indicators, and additive breakdowns must add up to the total.
 * Pure functions (node --test).
 */
import {categoriesForIndicator, validateHodIndicator} from './hodReviewRules.js';

const empty = value => value === undefined || value === null || String(value).trim() === '';
const idOf = dim => String(dim?.dimensionId ?? dim?.dimension_id ?? dim?.dimension?.id ?? '');
export const dimensionOptionsOf = dim => dim?.dimension?.options || dim?.options || [];
export const optionKeyOf = option => String(option?.id ?? option?.code ?? option?.nameEn ?? option?.name_en);
export const dimensionNameOf = dim => dim?.dimension?.nameEn || dim?.dimension?.name_en || dim?.nameEn || 'Dimension';

/** Dimension attachments explicitly assigned to this indicator (indicatorIds / indicatorId / indicators[]). */
export function dimensionsForIndicator(definitions, indicatorKey) {
  const key = String(indicatorKey);
  return (definitions || []).filter(dim => {
    const ids = [...(dim?.indicatorIds || dim?.indicator_ids || []),
      ...(dim?.indicators || []).map(item => (typeof item === 'object' ? item?.id : item)),
      dim?.indicatorId, dim?.indicator_id];
    return idOf(dim) && ids.some(id => id !== null && id !== undefined && String(id) === key);
  });
}
export const hasDimensions = (definitions, indicatorKey) => dimensionsForIndicator(definitions, indicatorKey).length > 0;

/**
 * Issues for ONE indicator as [fieldKey, message] pairs.
 * fieldError: the value-format message (required / number / range) — only used for dimensioned indicators.
 */
export function dimensionIndicatorIssues({indicator, definitions, values = {}, dimensionValues = {}, fieldError = ''}) {
  const key = String(indicator.key);
  const dims = dimensionsForIndicator(definitions, key);
  if (!dims.length) return [];
  const issues = [];
  if (fieldError) issues.push([key, fieldError]);
  for (const dim of dims) {
    const dimId = idOf(dim);
    const options = dimensionOptionsOf(dim);
    const entries = options.map(option => dimensionValues[`${key}:${dimId}:${optionKeyOf(option)}`]);
    if ((dim.isRequired ?? dim.is_required) && options.length && entries.every(empty)) {
      issues.push([`${key}.dimension.${dimId}`, `${indicator.label}: enter at least one value for ${dimensionNameOf(dim)}.`]);
      continue;
    }
    if (indicator.type === 'number' && entries.some(value => !empty(value) && !Number.isFinite(Number(value)))) {
      issues.push([`${key}.dimension.${dimId}`, `${indicator.label}: ${dimensionNameOf(dim)} values must be numbers.`]);
    }
  }
  // Breakdown totals: each additive category must add up to the indicator total.
  for (const result of validateHodIndicator(indicator, categoriesForIndicator(dims, key), values, dimensionValues)) {
    const field = `${key}.dimension.${result.id}`;
    if (!result.valid && !issues.some(([name]) => name === field)) issues.push([field, `${indicator.label}: ${result.reason}`]);
  }
  return issues;
}
