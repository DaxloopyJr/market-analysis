import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {networkEnd, networkStart, subscribeNetwork} from '../src/utils/networkActivity.js';
const read = p => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('flag progress line counts user requests only, never background checks', () => {
  const seen = [];
  const stop = subscribeNetwork(n => seen.push(n));
  const a = {url: '/reports/filters'}, b = {url: '/notifications/unread-count'}, c = {url: '/x', silent: true};
  networkStart(a); networkStart(b); networkStart(c); networkStart(a);
  networkEnd(b); networkEnd(a); networkEnd(a);
  stop();
  assert.deepEqual(seen, [0, 1, 0]);
  assert.match(read('src/API/axios.jsx'), /networkStart\(config\)/);
  assert.match(read('src/components/Topbar.jsx'), /<NetworkLine \/>/);
});
