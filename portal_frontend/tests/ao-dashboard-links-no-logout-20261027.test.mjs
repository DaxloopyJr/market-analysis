import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const dash = readFileSync(new URL('../src/pages/AoDashboard/AoDashboard.jsx', import.meta.url), 'utf8');

test('AO dashboard never links to the missing /dashboard/ao/inbox route', () => {
  assert.doesNotMatch(dash, /to="\/dashboard\/ao\/inbox"/);
  // 28 Oct 2026: Review opens the full AO review page (approved modern UI) from the ⋮ menu.
  assert.match(dash, /navigate\(`\/dashboard\/ao\/review\/\$\{id\(r\)\}`\)/);
  assert.match(app, /path="ao\/review\/:id" element=\{<AoAccess><AoApprovals review \/><\/AoAccess>\}/);
});
test('ao/inbox redirects to Pending Approval and unknown dashboard paths stay in the dashboard', () => {
  assert.match(app, /path="ao\/inbox" element=\{<Navigate to="\/dashboard\/ao\/pending" replace \/>\}/);
  assert.match(app, /<Route path="\*" element=\{<Navigate to="\/dashboard" replace \/>\} \/>/);
});
