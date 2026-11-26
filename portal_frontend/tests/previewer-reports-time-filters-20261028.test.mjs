import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {reportingTime,reportingTimeOptions,matchesReportingTime,normalizeYear} from '../src/utils/reportingTime.js';
import {REPORTS,reportAudience} from '../src/config/reportCatalogue.js';
import {getVisibleMenu,findMenuByPath} from '../src/config/sidebarMenu.js';
const read=p=>readFileSync(new URL(`../${p}`,import.meta.url),'utf8');

test('reporting time: label year wins, reportingYear/periodType fallbacks, periods de-duplicated',()=>{
  assert.equal(normalizeYear('2025/26'),'2025/2026');
  assert.deepEqual(reportingTime({period:'2025/2026 Q4',financialYear:'2026/2027',frequency:'quarterly'}),{year:'2025/2026',frequency:'quarterly',short:'Q4',period:'2025/2026 Q4'});
  assert.equal(reportingTime({period:'Q1',raw:{reportingCalendar:{reportingYear:'2026/2027',periodType:'quarterly'}}}).period,'2026/2027 Q1');
  const rows=[{period:'2026/2027 Q1',period_id:41},{period:'2026/2027 Q1',period_id:42},{period:'2025/2026 Q4'}];
  assert.deepEqual(reportingTimeOptions(rows,{year:'all',frequency:'all'}).periods,['2026/2027 Q1','2025/2026 Q4']);
  assert.equal(rows.filter(r=>matchesReportingTime(r,{year:'2025/2026',frequency:'all',period:'all'})).length,1);
});
test('all dashboards and lists read time the same way',()=>{
  for(const p of ['src/pages/Dashboard/Dashboard.jsx','src/pages/IhodDashboard/IhodDashboard.jsx','src/pages/AoDashboard/AoDashboard.jsx',
    'src/pages/Submissions/Submissions.jsx','src/pages/HOD/HodInbox.jsx','src/pages/HOD/HodReviewed.jsx','src/pages/AO/AoApprovals.jsx'])
    assert.match(read(p),/reportingTime/,p);
});
test('labelled selects are one clean box on every page that has them',()=>{
  const css=read('src/styles/viwanda-polish.css');
  assert.match(css,/:is\(\.mu-select,\.ia-select,\.oc-year,\.vmi-filters label\) select\{\s*-webkit-appearance:none!important/);
});
test('Previewer: analytics + reports menu from analytics.view.published, landing = analytics',()=>{
  const user={id:1,permissions:['dashboard.view','analytics.view.published'],roles:[{code:'PREVIEWER'}],menu:[{key:'dashboard',label:'Dashboard'}]};
  const ids=getVisibleMenu(user).map(m=>m.id);
  assert.ok(ids.includes('analytics')&&ids.includes('reports'));
  assert.ok(findMenuByPath('/dashboard/reports/indicator-performance',user));
  assert.match(read('src/pages/ModulePage/RoleDashboardPreview.jsx'),/grants\.has\("analytics\.view\.published"\)\) return <Navigate to="\/dashboard\/analytics" replace \/>/);
  // Team build: report pages are not shipped; their links return to the list.
  assert.match(read('src/App.jsx'),/path="reports\/:reportId" element=\{<Navigate to="\/dashboard\/reports" replace \/>\}/);
});
test('Report catalogue: 15 Laravel reports + executive pack; Previewer sees M&E + register, not operational',()=>{
  // 8 Nov 2026: 15 report endpoints, annual-me shown as the executive annual report, plus the executive brief.
  assert.equal(REPORTS.length,16);
  assert.equal(new Set(REPORTS.map(r=>r.api)).size,15);
  const previewer={permissions:['analytics.view.published'],roles:[{code:'PREVIEWER'}]};
  const mdo={permissions:['submissions.review'],roles:[{code:'MDO'}]};
  const seen=REPORTS.filter(r=>reportAudience(r,previewer)).map(r=>String(r.no)).sort();
  assert.deepEqual(seen,['10','11','12','13','14','6','8','9','E1','E2']);
  assert.equal(REPORTS.filter(r=>reportAudience(r,mdo)).length,16);
  // Laravel's own list (GET /reports/catalog) wins when it has loaded.
  assert.equal(REPORTS.filter(r=>reportAudience(r,mdo,new Set(['data-submission']))).length,1);
});
