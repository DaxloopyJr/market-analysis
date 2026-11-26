/**
 * FILE: src/services/listCache.js
 * Shared, short-lived read cache for Laravel list endpoints (30 Oct 2026 performance pass).
 *  - ONE request per key at a time: pages and dashboards opened together share the same promise.
 *  - Results are kept for a short time (default 45 s) so moving queue -> source -> review is instant.
 *  - Paged lists: page 1 first, then the remaining pages in parallel (bounded), never one by one.
 *  - Any write to a submission (save, submit, review, approve, return, publish) clears the submission keys.
 * Laravel stays the authority: every action still reads the latest record before it is sent.
 */
import {getAccessToken} from '../utils/tokenService';

const store = new Map();
// Cached reads belong to ONE signed-in session: a new token (logout -> another user) clears every cache.
let owner = null;
const resets = new Set();
export function onSessionChange(clear) { resets.add(clear); }
export function checkSession() {
  let token;
  try { token = getAccessToken() || ''; } catch { token = ''; }
  if (token === owner) return;
  owner = token; store.clear(); resets.forEach(clear => { try { clear(); } catch { /* ignore */ } });
}

export function cached(key, load, ttl = 45_000) {
  checkSession();
  const hit = store.get(key);
  if (hit && Date.now() - hit.at < ttl) return hit.promise;
  const promise = Promise.resolve().then(load).catch(error => { if (store.get(key)?.promise === promise) store.delete(key); throw error; });
  store.set(key, {at: Date.now(), promise});
  return promise;
}
export function invalidate(prefix = '') {
  for (const key of [...store.keys()]) if (!prefix || key.startsWith(prefix)) store.delete(key);
}
export const cacheKeys = () => [...store.keys()];

/** Runs work over items with at most `limit` calls in flight; keeps order. */
export async function mapLimit(items, limit, work) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({length: Math.min(limit, items.length)}, async () => {
    while (next < items.length) { const i = next++; out[i] = await work(items[i], i); }
  }));
  return out;
}

/**
 * Reads every page of a list. `request(params)` must resolve to {items, total?, lastPage?, perPage?, paginated?}.
 * pageParams lets callers keep their existing spelling (perPage vs per_page).
 */
export async function fetchAllPages(request, {perPage = 100, maxPages = 30, concurrency = 4, pageParams = (page, size) => ({page, perPage: size}), extra = {}} = {}) {
  const first = await request({...extra, ...pageParams(1, perPage)});
  const items = [...(first.items ?? [])];
  const size = first.perPage > 0 ? first.perPage : perPage;
  const total = Number.isFinite(first.total) ? first.total : null;
  const last = Math.min(maxPages, Math.max(first.lastPage || 1, total ? Math.ceil(total / size) : 1));
  if (first.paginated === false || last <= 1) return {items, total: total ?? items.length, complete: true};
  const rest = await mapLimit(Array.from({length: last - 1}, (_, i) => i + 2), concurrency,
    page => request({...extra, ...pageParams(page, perPage)}).then(r => r.items ?? []));
  rest.forEach(list => items.push(...list));
  return {items, total: total ?? items.length, complete: total === null || items.length >= total};
}
