// Executive dashboard on a server without GET /reports/executive-overview: labelled sample data (10 Nov 2026).
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {EXECUTIVE_SAMPLE} from '../src/config/executiveSample.js';

test('sample data is marked, has no trace and keeps the executive-overview shape', () => {
  assert.equal(EXECUTIVE_SAMPLE.sample, true);
  assert.equal(EXECUTIVE_SAMPLE.trace, undefined);
  assert.equal(EXECUTIVE_SAMPLE.financialYear, '2025/2026');
  for (const key of ['headline', 'summary', 'budget', 'institutions', 'sectors', 'exceptions']) assert.ok(key in EXECUTIVE_SAMPLE, key);
});

test('only a missing endpoint (404) falls back, and the page then shows the banner and no report links', () => {
  const page = readFileSync(new URL('../src/pages/ExecutiveDashboard/ExecutiveDashboard.jsx', import.meta.url), 'utf8');
  assert.match(page, /if \(status === 404\) \{\s*setState\(\{key, data: EXECUTIVE_SAMPLE/);
  assert.match(page, /\{sample && <div className="xd-sample-band"/);
  assert.match(page, /\{!sample && <Link className="xd-pdf"/);
});
