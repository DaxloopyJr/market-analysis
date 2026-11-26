// Kiswahili for the remaining pages (phase 2, 9 Nov 2026): whole labels only, composite counters, no data changes.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {translateLabel} from '../src/i18n/autoTranslate.js';
import {PAGE_SW} from '../src/i18n/pages.sw.js';

test('known labels become Kiswahili and keep their spaces', () => {
  assert.equal(translateLabel(' Save Changes ', PAGE_SW), ' Hifadhi Mabadiliko ');
  assert.equal(translateLabel('Dashboard', PAGE_SW), 'Dashibodi');
  assert.equal(translateLabel('Role Name *', PAGE_SW), 'Jina la Jukumu *');
});

test('counters and paging read naturally', () => {
  assert.equal(translateLabel('Showing 1 to 10 of 25 entries', PAGE_SW), 'Inaonyesha 1–10 kati ya 25 rekodi');
  assert.equal(translateLabel('Showing 5 of 12 users', PAGE_SW), 'Inaonyesha 5 kati ya 12 watumiaji');
  assert.equal(translateLabel('Showing 3 of 3 · page 1 of 1', PAGE_SW), 'Inaonyesha 3 kati ya 3 · ukurasa 1 kati ya 1');
  assert.equal(translateLabel('12 submissions', PAGE_SW), '12 uwasilishaji');
});

test('unknown text such as backend data stays as it is', () => {
  assert.equal(translateLabel('CBE Strategic Plan 2026–2031', PAGE_SW), 'CBE Strategic Plan 2026–2031');
  assert.equal(translateLabel('Number of SMEs registered', PAGE_SW), 'Number of SMEs registered');
});

test('the dashboard layout drives the translator and reports stay excluded', () => {
  const layout = readFileSync(new URL('../src/layouts/DashboardLayout.jsx', import.meta.url), 'utf8');
  assert.match(layout, /setPageLanguage\(lang\)/);
  const tool = readFileSync(new URL('../src/i18n/autoTranslate.js', import.meta.url), 'utf8');
  assert.match(tool, /\.rv-doc,\.vw-privacy,\[data-no-translate\]/);
});
