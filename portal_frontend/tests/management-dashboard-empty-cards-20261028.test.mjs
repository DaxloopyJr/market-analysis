import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {makeSourceResolver, currentRoleOf} from '../src/utils/adminSourceResolver.js';
const read = path => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');

test('submission source resolves through dataset -> institution / department lists', () => {
  const r = makeSourceResolver({
    datasets: [{id: 1, institutionId: 4, departmentId: null}, {id: 2, institutionId: 1, departmentId: 7}],
    institutions: [{id: 4, name: 'CAMARTEC'}, {id: 1, name: 'MIT'}],
    departments: [{id: 7, name: 'Industry Development'}],
  });
  assert.equal(r.institutionOf({datasetId: 1}), 'CAMARTEC');
  assert.equal(r.departmentOf({datasetId: 2}), 'Industry Development');
  assert.equal(r.sourceOf({datasetId: 2}), 'Industry Development');
  assert.equal(r.sourceOf({dataset_id: 1}), 'CAMARTEC');
  assert.equal(r.sourceOf({datasetId: 99}), 'Not reported');
  assert.equal(r.institutionOf({institution: {name: 'TBS'}}), 'TBS');
});

test('Awaiting Ministry Review reads snake_case and camelCase current step', () => {
  assert.equal(currentRoleOf({currentStep: {requiredRoleCode: 'MDO'}}), 'MDO');
  assert.equal(currentRoleOf({currentStep: {required_role_code: 'mdo'}}), 'MDO');
  assert.equal(currentRoleOf({current_step: {requiredRoleCode: 'AO'}}), 'AO');
  assert.match(readFileSync(new URL('../src/services/adminOverviewService.js', import.meta.url), 'utf8'), /reviewing\(row\) && currentRoleOf\(row\)==='MDO'/);
});

test('monitoring panels say the API is not connected instead of looking broken', () => {
  const page = read('pages/Admin/ManagementDashboard.jsx');
  // 8 Nov 2026: the message follows the monitoring status (unreachable / turned off / not collected yet).
  assert.match(page, /const notConnected=!monitoringOk\?'Monitoring service could not be reached'/);
  assert.match(page, /monitorStatus==='not_collected'\?'No readings yet/);
  assert.match(page, /empty=\{monitorEmpty\}/);
  assert.match(page, /get:sourceName/);
});
