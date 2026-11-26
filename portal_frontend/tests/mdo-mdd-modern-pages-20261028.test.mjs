import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {cleanPeriod} from '../src/utils/sourceIdentity.js';

const mdo=fs.readFileSync('src/pages/MDO/MdoWorkspace.jsx','utf8');
const mdd=fs.readFileSync('src/pages/MDD/MddWorkspace.jsx','utf8');
const dash=fs.readFileSync('src/pages/MinistryDashboard/MinistryDashboard.jsx','utf8');

test('tables keep actions inside the ⋮ menu only (no inline Review/View buttons)', () => {
  for(const src of [mdo,mdd,dash]){
    assert.doesNotMatch(src,/className=\{row\.pending\?'mdo-primary-sm':'mdo-secondary-sm'\}/);
    assert.doesNotMatch(src,/className="mdo-primary-sm" onClick/);
    assert.doesNotMatch(src,/className="md-review"/);
    assert.match(src,/RowActionsMenu/);
  }
});
test('same API services and decision calls as before', () => {
  assert.match(mdo,/sendMdoDecision\(\{id:record\.id,user,action,comments,correctionDeadline/);
  assert.match(mdd,/sendMddDecision\(\{id:record\.id,user,action,comments,correctionDeadline/);
  // 16 Nov 2026: the MDO/MDD dashboard reads GET /dashboard (one request) instead of the submission catalogue.
  assert.match(dash,/fetchDashboard\(\{fy:year\}\)/);
  assert.match(mdo,/datasetsAPI\.updatePriority\(row\.id/);
});
test('modern shared components are used on every MDO/MDD page', () => {
  for(const src of [mdo,mdd,dash]) assert.match(src,/components\/modern\/ModernUI\.jsx/);
  assert.match(mdo,/export function ReviewSummary/); assert.match(mdd,/<ReviewSummary record=\{record\}\/>/);
});
test('period labels are not repeated', () => {
  assert.equal(cleanPeriod('2026/2027 2026/2027 Q1'),'2026/2027 Q1');
  assert.equal(cleanPeriod('Q1 2026/2027'),'Q1 2026/2027');
  assert.equal(cleanPeriod(null),'');
});
