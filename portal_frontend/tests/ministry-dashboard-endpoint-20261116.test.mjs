import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('MDO/MDD dashboard is one GET /dashboard request, not the whole submission catalogue', () => {
  const dash = read('src/pages/MinistryDashboard/MinistryDashboard.jsx');
  assert.match(dash, /fetchDashboard\(\{fy:year\}\)/);
  assert.doesNotMatch(dash, /getMdoCatalogue|getMddCatalogue|withHistory/);
  for (const field of ['cards.pending_approvals', 'cards.returned', 'cards.published', 'cards.institutions', 'pending_approvals', 'recent_activity'])
    assert.ok(dash.includes(field), field);
  assert.doesNotMatch(dash, /num\(cards\.approved\)\+published/);
  assert.match(dash, /published\+Math\.max\(0,num\(cards\.awaiting_ministry\)-pendingTotal\)/);
  const api = read('src/API/dashboard.jsx');
  assert.match(api, /export async function getAdminDashboard/);
  assert.match(api, /api\.get\("\/dashboard", \{ params: query \}\)/);
});
