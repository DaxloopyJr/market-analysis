import test from 'node:test';
import assert from 'node:assert/strict';
import {getVisibleMenu} from '../src/config/sidebarMenu.js';
import {analyticsTitle} from '../src/utils/orgScope.js';

const menu = (code, extra = {}) => ({id: 1, roles: [{code}], permissions: ['dashboard.view', 'analytics.view.ministry', 'reports.view.ministry', 'submissions.review', 'submissions.publish', 'submissions.approve'],
  menu: [{key: 'dashboard', label: 'Dashboard'}, {key: 'submissions', label: 'Submissions', children: []}, {key: 'dataset-management', label: 'Dataset Management', children: []},
    {key: 'analytics', label: 'Institution Analytics'}, {key: 'reports', label: 'Reports'}], ...extra});

test('analytics name: neutral for ministry-wide users, Institution / Department for the others', () => {
  assert.equal(analyticsTitle({roles: [{code: 'MDO'}]}), 'Analytics');
  assert.equal(analyticsTitle({roles: [{code: 'DDO'}], department_id: 3}), 'Department Analytics');
  assert.equal(analyticsTitle({roles: [{code: 'IDO'}], institution_id: 5}), 'Institution Analytics');
  for (const code of ['MDO', 'MDD']) {
    const labels = getVisibleMenu(menu(code)).map(i => i.label);
    assert.ok(labels.includes('Analytics'), code);
    assert.ok(!labels.some(l => /Institution Analytics/.test(l)), code);
  }
});

test('one menu order for MDO / MDD: work first, then Analytics and Reports, Notifications last', () => {
  for (const code of ['MDO', 'MDD']) {
    const ids = getVisibleMenu(menu(code)).map(i => i.id);
    assert.ok(ids.indexOf('dataset-management') < ids.indexOf('analytics'), `${code}: ${ids}`);
    assert.ok(ids.indexOf('analytics') < ids.indexOf('reports') && ids.indexOf('reports') < ids.indexOf('notifications'), `${code}: ${ids}`);
  }
});
