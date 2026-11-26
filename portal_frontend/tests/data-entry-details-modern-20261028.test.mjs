import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read = path => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');

test('Data Entry uses the modern header, KPI strip and keeps the submit contract', () => {
  const code = read('pages/DataEntry/DataEntry.jsx');
  assert.match(code, /de-modern/);
  assert.match(code, /<MuHeader logo=\{org\.logo\}/);
  assert.match(code, /title="Values entered"/);
  assert.match(code, /title="Required left"/);
  assert.match(code, /Breakdowns to check/);
  // The Review checklist reuses the same wizard actions (Back / Save Draft / Submit for Review).
  assert.match(code, /const wizardActions = \(/);
  assert.match(code, /\{step < 3 && wizardActions\}/);
  assert.match(code, /Submit for Review/);
  assert.match(code, /onClick=\{submitForReview\}/);
  assert.match(code, /below 50% — consider adding a remark/);
  // No page-wide validation banner; errors stay in dialogs.
  assert.doesNotMatch(code, /need attention before final submission/);
  assert.match(code, /showUserFacingError/);
  assert.match(code, /showNextIndicator/);
});

test('Submission details open as a full page with stepper, tabs and side info', () => {
  const details = read('pages/Submissions/OfficerSubmissionDetails.jsx');
  assert.match(details, /<ReviewSummary record=\{record\}\/>/);
  assert.match(details, /title="Submission Info"/);
  assert.match(details, /title="Performance"/);
  assert.match(details, /aria-label="Close details"/);
  assert.match(details, /PerformanceBar/);
  const list = read('pages/Submissions/Submissions.jsx');
  assert.match(list, /if \(detailId && \(detail \|\| loading\)\)/);
  assert.match(list, /<OfficerSubmissionDetails org=\{org\}/);
});
