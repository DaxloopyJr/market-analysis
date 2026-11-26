import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {directionOf, performanceOf} from '../src/utils/annualTargets.js';
const read = p => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('lower is better: target ÷ actual', () => {
  assert.equal(performanceOf(50, 100).rounded, 50);
  assert.equal(performanceOf(50, 100, 'lower_is_better').rounded, 200);
  assert.equal(performanceOf(200, 100, 'lower_is_better').rounded, 50);
  assert.equal(performanceOf(0, 100, 'lower_is_better').rounded, 100);
  assert.equal(performanceOf(5, 10, 'neutral'), null);
  assert.equal(directionOf({raw: {indicator: {performanceDirection: 'lower_is_better'}}}), 'lower_is_better');
  assert.equal(directionOf({}), 'higher_is_better');
});
test('workflow wording, steps by source, form behind Add Indicator, no Swahili column', () => {
  const mdo = read('src/pages/MDO/MdoWorkspace.jsx');
  assert.match(mdo, /MINISTRY_STEPS=\['DDO','MDO','MDD'\]/);
  assert.match(mdo, /INSTITUTION_STEPS=\['IDO','IHOD','AO','MDO','MDD'\]/);
  for (const f of ['src/pages/MDO/MdoWorkspace.jsx', 'src/pages/MDD/MddWorkspace.jsx', 'src/pages/AO/AoApprovals.jsx', 'src/pages/HOD/HodReview.jsx']) {
    assert.match(read(f), /Return for Correction/, f);
    assert.doesNotMatch(read(f), /Confirm Return|Return to Institution'|Return Submission/, f);
  }
  assert.match(read('src/pages/ModulePage/Datasets.jsx'), /\{formOpen&&<form onSubmit=\{save\}/);
  assert.doesNotMatch(read('src/pages/ModulePage/ReferenceData.jsx'), /Name \(Swahili\)<\/th>/);
  assert.match(read('src/services/idoSubmissionService.jsx'), /savedResponsibleUserID\(dataset\) === String\(me\)/);
  assert.match(read('src/pages/StrategicPlans/StrategicPlans.jsx'), /expired: 'Expired'/);
});
