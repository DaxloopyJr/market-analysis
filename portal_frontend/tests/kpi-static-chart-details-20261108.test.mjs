import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chartDetails } from '../src/utils/chartDetails.js';
const file = p => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('number-only KPI cards are not buttons and keep a hover lift', () => {
  const ui = file('src/components/modern/ModernUI.jsx');
  assert.match(ui, /typeof onOpen!=='function'\)return <div className=\{`mu-kpi mu-tone-\$\{tone\} is-static/);
  assert.match(file('src/components/modern/ModernUI.css'), /\.mu-kpi\.is-static:hover\{transform:translateY\(-3px\)/);
  for (const p of ['src/pages/Dashboard/Dashboard.jsx', 'src/pages/AoDashboard/AoDashboard.jsx', 'src/pages/IhodDashboard/IhodDashboard.jsx', 'src/pages/MinistryDashboard/MinistryDashboard.jsx'])
    assert.doesNotMatch(file(p), /kpiInsight|openKpi/, p);
  for (const p of ['src/pages/AuditLogs/AuditLogs.jsx', 'src/pages/AO/AoApprovals.jsx', 'src/pages/HOD/HodReviewed.jsx'])
    assert.doesNotMatch(file(p), /onOpen=\{\(\)=>\{\}\}/, p);
  assert.doesNotMatch(file('src/pages/Admin/ManagementDashboard.jsx'), /onClick=\{\(\)=>openedMetric\(m\)\}/);
});

test('Key Details describe the chart itself', () => {
  const level = chartDetails({ kind: 'line', measure: 'level', unit: '%', data: [{ cpu: 20 }, { cpu: 40 }], series: [{ key: 'cpu', label: 'CPU' }] });
  assert.deepEqual(level.map(r => [r.label, r.value]), [['CPU · latest', '40%'], ['CPU · average', '30%'], ['CPU · peak', '40%'], ['Readings', '2']]);
  const donut = chartDetails({ kind: 'donut', data: [{ name: 'Published', value: 3 }, { name: 'Returned', value: 1 }] });
  assert.deepEqual(donut[0], { label: 'Published', value: '3 · 75%' });
  assert.equal(donut.find(r => r.label === 'Total').value, '4');
  const trend = chartDetails({ kind: 'line', xKey: 'month', data: [{ month: 'Jul', s: 1 }, { month: 'Aug', s: 5 }], series: [{ key: 's', label: 'Submitted' }] });
  assert.equal(trend.find(r => r.label === 'Busiest month').value, 'Aug (5)');
});

test('system charts no longer show Financial Year / Scope', () => {
  const src = file('src/pages/Admin/ManagementDashboard.jsx');
  assert.match(src, /'System Performance','system',\{measure:'level',unit:'%'\}/);
  assert.match(src, /'Storage Usage','system',\{unit:'GB'\}/);
  assert.match(src, /topic==='system'\?\[\{label:'Monitoring window',value:windowLabel\}\]/);
});
