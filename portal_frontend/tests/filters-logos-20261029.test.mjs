import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeSubmissionRecord } from '../src/utils/submissionValues.js';
import { submissionFacts } from '../src/utils/serverFields.js';
import { institutionLogoUrl, rememberInstitutionLogos } from '../src/utils/institutionLogo.js';
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('financial year is read from periodLabel when Laravel sends no financialYear', () => {
  const snap = {data: {id: 14, status: 'submitted', datasetId: 34, reportingPeriodId: 3, periodLabel: '2026/2027 Q2'}};
  assert.equal(normalizeSubmissionRecord(snap).financialYear, '2026/2027');
  assert.equal(submissionFacts({raw: snap.data}).financialYear, '2026/2027');
});

test('logo directory fills short institution objects ({id,name,code}) from full records', () => {
  rememberInstitutionLogos([{id: 77, name: 'Fair Competition Tribunal', code: 'FCT', profile_image_path: 'institutions/77/fct.png'}]);
  assert.equal(institutionLogoUrl({id: 77, name: 'FCT'}), '/storage/institutions/77/fct.png');
  assert.equal(institutionLogoUrl({code: 'fct'}), '/storage/institutions/77/fct.png');
  assert.equal(institutionLogoUrl({name: 'Fair Competition Tribunal'}), '/storage/institutions/77/fct.png');
  assert.equal(institutionLogoUrl({id: 999, name: 'Unknown'}), '');
  assert.match(read('src/layouts/DashboardLayout.jsx'), /primeInstitutionLogos\(user\)/);
  assert.match(read('src/components/orgCards/OrgCards.jsx'), /brokenSrc===src/);
});

test('dashboard filters apply as soon as a value is chosen (no Apply button)', () => {
  for (const f of ['src/pages/Dashboard/Dashboard.jsx', 'src/pages/IhodDashboard/IhodDashboard.jsx', 'src/pages/AoDashboard/AoDashboard.jsx', 'src/pages/MinistryDashboard/MinistryDashboard.jsx']) {
    assert.doesNotMatch(read(f), /> Apply<\/button>/, f);
  }
  assert.match(read('src/pages/HOD/HodReviewed.jsx'), /setApplied\(old=>\(\{\.\.\.old,year:v,period:'all'\}\)\)/);
});

test('dataset analytics uses the compact dataset switcher', () => {
  assert.match(read('src/pages/Analytics/DatasetAnalytics.jsx'), /<DatasetSwitcher datasets=\{siblings\}/);
  // 8 Nov 2026: the same drop-down list for every organisation (no tabs for small catalogues).
  assert.doesNotMatch(read('src/pages/Analytics/DatasetSwitcher.jsx'), /list\.length <= 5/);
  assert.match(read('src/pages/Analytics/DatasetSwitcher.jsx'), /Dataset \{index \+ 1\} of \{list\.length\}/);
});
