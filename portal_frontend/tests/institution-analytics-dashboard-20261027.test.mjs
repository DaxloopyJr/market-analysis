import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {datasetSummary,comparisonSummary,institutionSummary,optionYears,yearByLabel,previousYear,defaultFrequency,breakdownChartOf,lastTwoValues,allYearLabels} from '../src/utils/analyticsSummary.js';

const ind=(ach,extra={})=>({indicatorId:1,dataType:'integer',summary:{achievementPercent:ach===null?null:String(ach)},points:[],...extra});
test('dataset summary: average achievement + bands, null never zero', () => {
  const s=datasetSummary({publishedPeriods:2,expectedPeriods:4,indicators:[ind(50),ind(48),ind(91.7),ind(null)]});
  assert.equal(s.indicatorCount,4); assert.equal(s.withTargets,3);
  assert.equal(s.achievement,63.2); assert.deepEqual(s.bands,{excellence:1,good:1,under:1,noTarget:1});
  assert.equal(datasetSummary({indicators:[ind(null)]}).achievement,null);
});
test('institution summary weights by indicators with targets', () => {
  const rows=[{summary:datasetSummary({publishedPeriods:2,expectedPeriods:4,indicators:[ind(40),ind(60)]}),comparison:comparisonSummary({indicators:[{indicatorId:1,summary:{changePercent:'10'}},{indicatorId:2,summary:{changePercent:'-4'}}]})},
    {summary:datasetSummary({publishedPeriods:1,expectedPeriods:2,indicators:[ind(90)]}),comparison:null}];
  const s=institutionSummary(rows);
  assert.equal(s.achievement,63.3); assert.equal(s.published,3); assert.equal(s.expected,6); assert.equal(s.progress,50);
  assert.equal(s.change,3); assert.equal(s.up,1); assert.equal(s.down,1);
});
test('options: years, frequency, previous year', () => {
  const o={years:[{id:6,label:'2025/2026',yearType:'financial',frequencies:['quarterly']},{id:1,label:'2026/2027',yearType:'financial',frequencies:['annual','quarterly']}]};
  assert.deepEqual(optionYears(o).map(y=>y.label),['2026/2027','2025/2026']);
  const y=yearByLabel(o,'2026/27'); assert.equal(y.id,1);
  assert.equal(defaultFrequency(y),'quarterly');
  assert.equal(previousYear(o,y).id,6);
  assert.deepEqual(allYearLabels([o,{years:[{id:3,label:'2022/2023'}]}]),['2026/2027','2025/2026','2022/2023']);
});
test('breakdown: pie only when the API allows it; last two published values', () => {
  const i={points:[{label:'Q1',value:'14',status:'present'},{label:'Q2',value:'16',status:'present',breakdownCharts:[{name:'by Campus',availableCharts:['bar','donut'],categories:[{label:'Dar',value:'10'},{label:'Dodoma',value:'6'}]}]},{label:'Q3',value:null,status:'not_published'}]};
  const b=breakdownChartOf(i); assert.equal(b.kind,'donut'); assert.equal(b.categories.length,2); assert.equal(b.period,'Q2');
  assert.deepEqual(lastTwoValues(i),{latest:16,previous:14});
  i.points[1].breakdownCharts[0].availableCharts=['bar','table']; assert.equal(breakdownChartOf(i).kind,'bar');
});
test('cards open the dashboard (no popup) and routes exist', () => {
  const page=fs.readFileSync('src/pages/Analytics/InstitutionAnalytics.jsx','utf8');
  assert.match(page,/navigate\(`\/dashboard\/analytics\/\$\{type\}\/\$\{org\.id\}/);
  assert.doesNotMatch(page,/OrgPopup/);
  assert.match(page,/organisationYearCounts/);
  const app=fs.readFileSync('src/App.jsx','utf8');
  assert.match(app,/path="analytics\/:type\/:id"/); assert.match(app,/path="analytics\/:type\/:id\/dataset\/:datasetId"/);
});
