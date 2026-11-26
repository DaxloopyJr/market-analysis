import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {hodHasRealChanges, buildHodReviewPatch} from '../src/utils/hodReviewPatch.js';

const original = {values:{8:'96.000000',9:'340'}, remarks:{8:'Tested'}, dimensionValues:{'9:2:3':'190'}};

test('touching a field without changing it is NOT a change (Forward must not PATCH)', () => {
  assert.equal(hodHasRealChanges({original, values:{8:'96',9:'340'}, remarks:{8:'Tested '}, dimensionValues:{'9:2:3':'190.0'}}), false);
});
test('a real total, remark or breakdown change is detected', () => {
  assert.equal(hodHasRealChanges({original, values:{8:'97',9:'340'}, remarks:{8:'Tested'}, dimensionValues:{'9:2:3':'190'}}), true);
  assert.equal(hodHasRealChanges({original, values:{8:'96',9:'340'}, remarks:{8:'Re-tested'}, dimensionValues:{'9:2:3':'190'}}), true);
  assert.equal(hodHasRealChanges({original, values:{8:'96',9:'340'}, remarks:{8:'Tested'}, dimensionValues:{'9:2:3':'191'}}), true);
});
test('PATCH payload still sends only the changed row', () => {
  const p = buildHodReviewPatch({expectedRevision:3, reason:'fix', original, values:{8:'96',9:'341'}, remarks:{8:'Tested'}, dimensionValues:{'9:2:3':'190'}});
  assert.deepEqual(p.values.map(v=>v.indicatorId), [9]);
});
test('HodReview Forward only saves when there are real changes', () => {
  const src = readFileSync(new URL('../src/pages/HOD/HodReview.jsx', import.meta.url), 'utf8');
  assert.match(src, /if\(changed\)\{setStep\('Saving values before review…'\)/);
  assert.match(src, /hodHasRealChanges\(/);
});
