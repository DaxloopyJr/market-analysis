/**
 * FILE: src/services/yearToDateService.jsx
 * Loads earlier periods of the same dataset/year/frequency for year-to-date
 * performance: GET /submissions?datasetId={id}&perPage=100 (scope enforced by Laravel).
 * Read-only; a denied/failed read falls back silently to "this period only".
 */
import {checkSession, fetchAllPages, onSessionChange} from './listCache.js';
import {useEffect, useMemo, useState} from 'react';
import {listSubmissionsPage} from '../API/submission.jsx';
import {priorPeriodValues} from '../utils/yearToDate.js';

const cache = new Map();
onSessionChange(() => cache.clear()); // datasetId -> {at, promise}
const TTL = 60_000;

export function loadDatasetSubmissions(datasetId) {
  const key = String(datasetId);
  checkSession();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.promise;
  // Page 1 first, then the remaining pages in parallel (5 Nov 2026).
  const promise = fetchAllPages(params => listSubmissionsPage({...params, datasetId: Number(datasetId)}), {perPage: 100, maxPages: 20})
    .then(result => result.items);
  cache.set(key, {at: Date.now(), promise});
  promise.catch(() => cache.delete(key));
  return promise;
}

/** Clear after a write so the next view re-reads Laravel. */
export const clearYearToDateCache = datasetId => (datasetId == null ? cache.clear() : cache.delete(String(datasetId)));

/**
 * current: periodFacts-like {id,datasetId,yearId,yearLabel,frequency,order,label}
 * returns {byIndicator, periods, loading}
 */
export function useYearToDate(current) {
  const key = current && current.datasetId != null && current.order != null
    ? [current.id, current.datasetId, current.yearId, current.yearLabel, current.frequency, current.order].join('|') : '';
  const [state, setState] = useState({key: '', byIndicator: {}, periods: [], loading: false});
  useEffect(() => {
    if (!key) return undefined;
    let alive = true;
    loadDatasetSubmissions(current.datasetId)
      .then(rows => { if (alive) setState({key, ...priorPeriodValues(current, rows), loading: false}); })
      .catch(() => { if (alive) setState({key, byIndicator: {}, periods: [], loading: false}); });
    return () => { alive = false; };
    // `key` captures every field of `current` that matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return useMemo(() => state.key === key ? state : {byIndicator: {}, periods: [], loading: Boolean(key)}, [state, key]);
}
