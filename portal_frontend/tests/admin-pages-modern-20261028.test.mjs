import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {adminStatus, avatarTone, initialsOf, summaryCount} from '../src/utils/adminDisplay.js';
const read = path => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
const PAGES = ['Users', 'InstitutionalAdmins', 'Institutions', 'MinistryDepartments', 'RolesPermissions', 'ApprovalCircle', 'Delegations'];

test('all 7 admin pages use the modern header, KPI cards, tabs and the ⋮ menu (no charts)', () => {
  for (const name of PAGES) {
    const code = read(`pages/Admin/${name}.jsx`);
    assert.match(code, /<MuHeader /, name);
    assert.match(code, /<MuKpi /, name);
    assert.match(code, /<MuTabs /, name);
    assert.match(code, /RowActionsMenu/, name);
    assert.match(code, /admin-modern\.css/, name);
    assert.doesNotMatch(code, /from ["']recharts["']/, name);
  }
});

test('live search: no Search button for server search (debounced) and Reset only when filtered', () => {
  for (const name of ['Users', 'InstitutionalAdmins', 'Institutions']) {
    const code = read(`pages/Admin/${name}.jsx`);
    assert.match(code, /useDebouncedValue\(/, name);
    assert.match(code, /adm-hidden-submit/, name);
  }
});

test('display helpers', () => {
  assert.equal(initialsOf('Neema Mushi'), 'NM');
  assert.equal(avatarTone('x'), avatarTone('x'));
  assert.equal(adminStatus({is_active: true}).key, 'active');
  assert.equal(adminStatus({status: 'pending_activation'}).key, 'pending');
  assert.equal(adminStatus({status: 'retired'}).tone, 'grey');
  assert.equal(summaryCount({active_users: 7}, ['active', 'active_users']), 7);
  assert.equal(summaryCount(null, ['active']), null);
});

test('Approval Circle side steps panel (approved mockup) and Data Consumers page removed', () => {
  const circle = read('pages/Admin/ApprovalCircle.jsx');
  assert.match(circle, /className="adm-card vim-ac-v2-side"/);
  assert.match(circle, /const preview=selected \?\? rows\.find/);
  const app = read('App.jsx'), menu = read('config/sidebarMenu.js'), routes = read('config/moduleRoutes.js');
  assert.doesNotMatch(app, /DataConsumers/);
  assert.doesNotMatch(menu, /data-consumers/);
  assert.doesNotMatch(routes, /data-consumers/);
  // Dataset form keeps its Consumers field.
  assert.match(read('pages/ModulePage/Datasets.jsx'), /title="Consumers"/);
});
