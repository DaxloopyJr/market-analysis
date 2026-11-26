import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ministryReturned, passedMdoStep} from '../src/utils/mdoReviewRules.js';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('history lists never read GET /submissions/{id} per row when the list has no history (original backend)', () => {
  assert.match(read('src/services/mdoReviewService.jsx'), /needsHistory:raw=>historyInList&&reachedMinistry\(raw\)/);
  assert.match(read('src/services/aoApprovalService.jsx'), /needsHistory:raw=>historyInList&&mayHavePassedStep/);
  assert.match(read('src/services/hodReviewService.jsx'), /if\(!listCarriesHistory\(raw\)\)return rows\.filter/);
  assert.match(read('src/pages/MDD/MddWorkspace.jsx'), /withHistory:\['reviewed','returned'\]\.includes\(mode\)/);
});

test('office-level workflow position comes from Laravel status', () => {
  const at = (status, stage, role) => ({status, raw: {workflow_stage: stage, current_step: role ? {required_role_code: role} : null}});
  assert.equal(passedMdoStep(at('published', 'ministry')), true);
  assert.equal(passedMdoStep(at('under_review', 'ministry', 'MDD')), true);
  assert.equal(passedMdoStep(at('under_review', 'ministry', 'MDO')), false);
  assert.equal(passedMdoStep(at('approved', 'institution', 'AO')), false);
  assert.equal(ministryReturned(at('returned', 'ministry')), true);
  assert.equal(ministryReturned(at('returned', 'institution')), false);
});
