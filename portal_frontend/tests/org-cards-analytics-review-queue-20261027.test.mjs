import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {absorptionBand,formatTzs,orgInitials,orgPicture,orgHeading,financialYearOptions,sameFinancialYear,orgPerformance,orgMatches,queueYears} from '../src/utils/orgCards.js';

test('absorption bands follow <50 / 50–80 / >80', () => {
  assert.equal(absorptionBand(43).band,'under');
  assert.equal(absorptionBand(50).band,'good');
  assert.equal(absorptionBand(80).band,'good');
  assert.equal(absorptionBand(80.1).band,'excellence');
  assert.equal(absorptionBand(null).label,'No data');
  assert.equal(absorptionBand('120').width,100);
});
test('TZS short format', () => {
  assert.equal(formatTzs(3362876018),'TZS 3.36B');
  assert.equal(formatTzs('605000000'),'TZS 605.0M');
  assert.equal(formatTzs(null),'');
});
test('initials and API picture (profile_image_url)', () => {
  assert.equal(orgInitials({code:'CBE'}),'CBE');
  assert.equal(orgInitials({code:'MIT-HQ'}),'MIT');
  assert.equal(orgInitials({name:'Industrial Development'}),'ID');
  assert.equal(orgPicture({profile_image_url:'https://x.tz/storage/i.png'}),'https://x.tz/storage/i.png');
  assert.equal(orgPicture({profile_image_url:'javascript:alert(1)'}),'');
});
test('heading: code title, full name when no location', () => {
  assert.deepEqual(orgHeading({code:'CBE',name:'College of Business Education'}),{title:'CBE',subtitle:'College of Business Education'});
  assert.deepEqual(orgHeading({name:'ICT Unit'},{department:true,parentLabel:'MIT'}),{title:'ICT Unit',subtitle:'MIT'});
});
test('financial years and matching', () => {
  assert.deepEqual(financialYearOptions(new Date(2026,9,27),2),['2026/2027','2025/2026']);
  assert.deepEqual(financialYearOptions(new Date(2026,2,1),1),['2025/2026']);
  assert.ok(sameFinancialYear('2026/27','2026/2027'));
  assert.ok(sameFinancialYear('2026-2027','2026/2027'));
  assert.ok(!sameFinancialYear('2025/2026','2026/2027'));
  assert.deepEqual(queueYears([{financialYear:'2025/2026'},{financialYear:'2026/2027'},{}]),['2026/2027','2025/2026']);
});
test('performance never invents values', () => {
  const none=orgPerformance({id:2,name:'CBE',publishedDatasetCount:1});
  assert.equal(none.absorption,null); assert.equal(none.budget,null); assert.equal(none.approved,null); assert.equal(none.published,1);
  const derived=orgPerformance({budget:'1000',spent:'870'});
  assert.equal(Math.round(derived.absorption),87);
  assert.equal(orgPerformance({budgetAbsorption:'62.5',approvedCount:3,submittedCount:1}).approved,3);
  assert.ok(orgMatches({name:'College of Business Education',code:'CBE'},'cbe'));
});
test('pages use the shared approved cards', () => {
  const mdo=fs.readFileSync('src/pages/MDO/MdoWorkspace.jsx','utf8');
  const mdd=fs.readFileSync('src/pages/MDD/MddWorkspace.jsx','utf8');
  const ana=fs.readFileSync('src/pages/Analytics/InstitutionAnalytics.jsx','utf8');
  for(const src of [mdo,mdd])assert.match(src,/<ReviewOrgCard /);
  assert.match(ana,/<PerformanceOrgCard /);
  assert.match(fs.readFileSync('src/App.jsx','utf8'),/moduleId === "analytics" \? \(\s*<InstitutionAnalytics \/>/);
  assert.match(fs.readFileSync('src/components/orgCards/OrgCards.css','utf8'),/\.oc-card:hover[^{]*\{transform:translateY\(-5px\)/);
});
