import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const api = read('src/API/submission.jsx');

test('all live Submission endpoints use lowercase plural /submissions, including submit', () => {
  assert.match(api, /api\.post\('\/submissions', \{ reportingCalendarId: id \}\)/);
  assert.match(api, /api\.get\('\/submissions'/);
  assert.match(api, /api\.get\(`\/submissions\/\$\{checkedId\(id\)\}`/);
  assert.match(api, /api\.put\(`\/submissions\/\$\{checkedId\(id\)\}\/values`/);
  assert.doesNotMatch(api, /api\.put\(`\/submissions\/\$\{checkedId\(id\)\}\/value`/, 'Old singular /value API route must not be used');
  assert.match(api, /const path = `\/submissions\/\$\{checkedId\(id\)\}\/\$\{action\}`/);
  assert.match(api, /api\.post\(path,payload\)/);
  assert.match(api, /const path = `\/submissions\/\$\{checkedId\(id\)\}\/submit`/);
  assert.match(api, /api\.post\(path, \{expectedRevision:Number\(expectedRevision\)\}\)/);
  assert.doesNotMatch(api, /api\.post\(`\/submission\/\$\{checkedId\(id\)\}\/submit`/, 'Singular /submission submit route caused Laravel 404');
  assert.doesNotMatch(api, /\/Submissions?\b/, 'API must never capitalize submission route segments');
});

test('lowercase is consistent across active Submission source and current workflow docs', () => {
  for(const file of [
    'src/API/submission.jsx',
    'src/services/idoSubmissionService.jsx',
    'src/utils/submissionValues.js',
    'docs/SUBMISSION_APPROVAL_WORKFLOW_CODE_MAP_20261022.md',
    'README-REV26-SUBMISSION-WORKFLOW-INTEGRATION-20261022.md',
  ]) {
    assert.doesNotMatch(read(file), /\/Submissions?\b/, `${file} contains incorrect API path casing`);
  }
});
