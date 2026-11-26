/**
 * FILE: src/utils/networkActivity.js
 * Counts API requests in flight (9 Nov 2026) for the flag-coloured progress line under the topbar.
 * Background checks (unread-notification count) and requests marked {silent: true} are not counted,
 * so the line only moves when the user is actually waiting for something.
 */
const listeners = new Set();
let pending = 0;
const SILENT = [/notifications\/unread-count/];

const isSilent = config => Boolean(config?.silent) || SILENT.some(rule => rule.test(String(config?.url ?? '')));
const emit = () => listeners.forEach(listener => listener(pending));

export function networkStart(config) {
  if (!config || isSilent(config) || config.__vwCounted) return;
  config.__vwCounted = true;
  pending += 1;
  emit();
}

export function networkEnd(config) {
  if (!config?.__vwCounted) return;
  config.__vwCounted = false;
  pending = Math.max(0, pending - 1);
  emit();
}

export function subscribeNetwork(listener) {
  listeners.add(listener);
  listener(pending);
  return () => listeners.delete(listener);
}
