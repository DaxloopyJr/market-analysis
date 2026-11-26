/**
 * FILE: src/hooks/useRemembered.js
 * Loading style F (approved 9 Nov 2026): a page that was seen before opens with the data it last showed,
 * slightly faded with an "Updating" mark, while fresh data loads; only the very first visit waits empty.
 * Like useState, but the last value of each page is kept in memory for the signed-in session. A new sign-in
 * (different token) starts empty, and nothing is written to browser storage.
 */
import {useCallback, useState} from 'react';
import {getAccessToken} from '../utils/tokenService';

const memory = new Map();
let owner = null;

function bucket() {
  const token = getAccessToken() || '';
  if (token !== owner) { memory.clear(); owner = token; }
  return memory;
}

export default function useRemembered(key, initial) {
  const start = () => {
    const store = bucket();
    return store.has(key) ? store.get(key) : (typeof initial === 'function' ? initial() : initial);
  };
  const [state, setState] = useState(() => ({key, value: start()}));
  // Another page key (e.g. a different organisation on the same screen) starts from its own memory.
  const current = state.key === key ? state.value : start();
  const set = useCallback(next => setState(previous => {
    const base = previous.key === key ? previous.value : (bucket().has(key) ? bucket().get(key) : (typeof initial === 'function' ? initial() : initial));
    const resolved = typeof next === 'function' ? next(base) : next;
    bucket().set(key, resolved);
    return {key, value: resolved};
  }), [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return [current, set];
}

/** True while fresh data loads over data the page already shows. */
export const isRefreshing = (loading, hasData) => Boolean(loading && hasData);
