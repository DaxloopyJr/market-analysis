import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {periodState} from '../src/utils/reportingPeriodRules.js';
const read = p => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('loading style F: dashboards remember their last data and mark the page while it refreshes', () => {
  for (const f of ['pages/Dashboard/Dashboard.jsx', 'pages/IhodDashboard/IhodDashboard.jsx', 'pages/AoDashboard/AoDashboard.jsx',
    'pages/MinistryDashboard/MinistryDashboard.jsx', 'pages/Admin/ManagementDashboard.jsx',
    'pages/Analytics/InstitutionAnalytics.jsx', 'pages/Analytics/InstitutionDashboard.jsx']) {
    const src = read(`src/${f}`);
    assert.match(src, /useRemembered\(/, f);
    assert.match(src, /mu-refreshing/, f);
  }
  const ui = read('src/components/modern/ModernUI.jsx');
  assert.match(ui, /export function MuWaitRing/);
  assert.doesNotMatch(ui, /mu-skel-bars|mu-skel-donut/);
  assert.match(read('src/components/modern/ModernUI.css'), /html\[lang="sw"\]\{--mu-updating:"Inasasishwa"\}/);
  assert.match(read('src/hooks/useRemembered.js'), /getAccessToken\(\)/);
});

test('a period that has not started reads Upcoming even while its status is closed', () => {
  const p = {startDate: '2027-01-01', deadline: '2027-04-15', status: 'closed'};
  assert.equal(periodState(p, '2026-11-09'), 'upcoming');
  assert.equal(periodState({...p, startDate: '2026-07-01', deadline: '2026-10-15'}, '2026-11-09'), 'closed');
});
