import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = rel => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');

test('PUT submission values is lowercase plural /submissions/{id}/values', () => {
  const api=source('src/API/submission.jsx');
  assert.match(api, /api\.put\(`\/submissions\/\$\{checkedId\(id\)\}\/values`, payload\)/);
  assert.doesNotMatch(api, /api\.put\(`\/submissions\/\$\{checkedId\(id\)\}\/value`/);
});

test('service delegates submission save to central API helper and does not build a competing PUT URL', () => {
  const service=source('src/services/idoSubmissionService.jsx');
  assert.match(service,/await putSubmissionValues\(id,payload\)/);
  assert.doesNotMatch(service,/api\.put\(`\/submissions/);
});
