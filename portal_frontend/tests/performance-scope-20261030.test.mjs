import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {bundleFromAnalytics} from '../src/utils/meReport.js';
import {userOrgScope} from '../src/utils/orgScope.js';
const read = p => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('analytics bundle: same overview for roles without reports.view.*, nothing invented', () => {
  const b = bundleFromAnalytics([{dataset: {id: 4, datasetName: 'Training'}, detail: {indicators: [
    {indicatorId: 1, name: 'Trainees', dataType: 'integer', summary: {annualTarget: '100', actual: '60', achievementPercent: '60'},
      points: [{label: 'Q1', value: '30', status: 'present'}, {label: 'Q2', value: '30', status: 'present'}, {label: 'Q3', value: null, status: 'not_published'}]},
    {indicatorId: 2, name: 'No target', summary: {}}]}}]);
  assert.equal(b.source, 'analytics'); assert.equal(b.groupBy, 'dataset');
  assert.equal(b.counts.total, 2); assert.equal(b.counts.noTarget, 1); assert.equal(b.score.score, 60);
  assert.deepEqual(b.pace.map(p => [p.period, p.actual, p.planned]), [['Q1', 30, 25], ['Q2', 60, 50]]);
  assert.equal(b.budget, null); assert.equal(bundleFromAnalytics([]).hasData, false);
});
test('organisation word follows the user scope', () => {
  assert.equal(userOrgScope({roles: [{code: 'DDO'}], department_id: 3}), 'department');
  assert.equal(userOrgScope({roles: [{code: 'IDO'}], institution_id: 7}), 'institution');
  assert.equal(userOrgScope({roles: [{code: 'IHOD'}], institution_id: 7, department_id: 2}), 'institution');
  assert.equal(userOrgScope({roles: [{code: 'MDO'}], department_id: 3}), 'all');
  assert.equal(userOrgScope({roles: [{code: 'MOA'}]}), 'all');
});
test('Back button reads "Back"; review pages open from one submission; caches are per session', () => {
  assert.match(read('src/pages/Analytics/InstitutionDashboard.jsx'), /backLabel="Back"/);
  assert.match(read('src/pages/Analytics/DatasetAnalytics.jsx'), /backLabel="Back"/);
  assert.match(read('src/pages/MDO/MdoWorkspace.jsx'), /mode==='review'&&<Review catalogue=\{catalogue\?\?/);
  assert.match(read('src/pages/MDD/MddWorkspace.jsx'), /mode==='review'&&<SubmissionReview catalogue=\{catalogue\?\?/);
  assert.match(read('src/services/listCache.js'), /checkSession/);
  assert.doesNotMatch(read('src/services/mdoReviewService.jsx'), /for\s*\(let page/);
});
