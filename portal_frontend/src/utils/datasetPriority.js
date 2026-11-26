/** Dataset priority (API reference #100). Values come from Laravel; MDO changes them with a reason. */
export const DATASET_PRIORITIES = ['high', 'medium', 'low'];
export const PRIORITY_REASON_MAX = 2000;

export function datasetPriorityOf(dataset) {
  const raw = dataset?.priority ?? dataset?.priority_level ?? dataset?.priorityLevel ?? dataset?.raw?.priority ?? dataset?.data?.priority ?? null;
  const value = String(typeof raw === 'object' && raw ? (raw.code ?? raw.value ?? raw.name ?? '') : (raw ?? '')).trim().toLowerCase();
  return DATASET_PRIORITIES.includes(value) ? value : '';
}
export const priorityLabel = value => value ? value.charAt(0).toUpperCase() + value.slice(1) : 'Not set';

/** Client checks mirroring Laravel: low/medium/high, reason required (max 2000), must differ from the current value.
 * The button is never disabled for MDO: if Laravel has no initial priority yet it answers 422 and that message is shown. */
export function priorityChangeError({current, next, reason}) {
  if (!DATASET_PRIORITIES.includes(next)) return 'Choose High, Medium or Low.';
  if (current && next === current) return 'Choose a different priority.';
  const text = String(reason ?? '').trim();
  if (!text) return 'Reason is required.';
  if (text.length > PRIORITY_REASON_MAX) return `Reason must be ${PRIORITY_REASON_MAX} characters or fewer.`;
  return '';
}
