import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('MDO/MDD dashboard reads the detail of at most 20 recent submissions when the list has no history', () => {
  const dash = read('src/pages/MinistryDashboard/MinistryDashboard.jsx');
  assert.match(dash, /const RECENT_HISTORY=20;/);
  assert.match(dash, /fetch\(\{withHistory:true,historyLimit:RECENT_HISTORY\}\)/);
  assert.doesNotMatch(dash, /fetch\(\{withHistory:true\}\)/);
  const read_ = read('src/services/submissionReadService.js');
  assert.match(read_, /historyLimit = Infinity/);
  assert.match(read_, /if \(limited && listRowHasWorkflow\(raw\) && !wanted\.has\(raw\)\) return mapRow\(raw, null\);/);
  const mdo = read('src/services/mdoReviewService.jsx');
  assert.match(mdo, /historyComplete/);
});
