import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('Submission Periods uses modern header, KPIs, state tabs and keeps MOA rules', () => {
  const src = read('src/pages/SubmissionPeriods/SubmissionPeriods.jsx');
  for (const marker of ['MuHeader', 'MuKpi', 'MuTabs', 'Past due', 'Upcoming', 'roleCodes', 'RowActionsMenu', 'Global reporting calendar managed by the Ministry Overall Admin']) {
    assert.ok(src.includes(marker), marker);
  }
  assert.match(src, /viwanda-periods-due/);
  assert.match(src, /admin-modern\.css/);
});

test('Reference Data is modern but keeps Laravel paging, status and row menu', () => {
  const src = read('src/pages/ModulePage/ReferenceData.jsx');
  for (const marker of ['adm-modern', 'MuHeader', 'MuKpi', 'MuTabs', 'AdmStatus', 'adm-code', 'RowActionsMenu', '<TableLoader active={loading}', 'Reference Types', 'Reference Values', 'open a type to count']) {
    assert.ok(src.includes(marker), marker);
  }
  assert.doesNotMatch(src, /<th scope="col">Actions<\/th>/);
  assert.match(src, /listReferenceTypes\(\{ page: serverPage, perPage, status: typeStatus \}\)/);
});

test('Portal Settings keeps API limits and marks saved vs reference-only sections', () => {
  const src = read('src/pages/Admin/PortalSettings.jsx');
  for (const marker of ['adm-modern', 'MuHeader', 'System Preferences', 'Saved to the system', 'vim-ps-status-cards', 'Description, Footer and Portal Status will be available soon']) {
    assert.ok(src.includes(marker), marker);
  }
  assert.match(src, /\['portal_name','portal_tagline','contact_email','contact_phone','announcement'\]/);
});

test('Admin pages stay chart-free', () => {
  for (const file of ['src/pages/SubmissionPeriods/SubmissionPeriods.jsx', 'src/pages/ModulePage/ReferenceData.jsx', 'src/pages/Admin/PortalSettings.jsx']) {
    assert.doesNotMatch(read(file), /from ['"]recharts['"]/, file);
  }
});
