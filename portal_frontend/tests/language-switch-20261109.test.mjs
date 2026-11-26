import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {translate} from '../src/i18n/dictionary.js';
import {getVisibleMenu} from '../src/config/sidebarMenu.js';
const read = p => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('portal language: English by default, Kiswahili from the dictionary, unknown words unchanged', () => {
  assert.match(read('src/i18n/LanguageContext.jsx'), /=== 'sw' \? 'sw' : 'en'/);
  assert.equal(translate('Reports', 'en'), 'Reports');
  assert.equal(translate('Reports', 'sw'), 'Ripoti');
  assert.equal(translate('National Indicators', 'sw'), 'Namba Kuu za Kitaifa');
  assert.equal(translate('BRELA', 'sw'), 'BRELA');
  const menu = getVisibleMenu({roles: [{code: 'MDO'}], permissions: ['dashboard.view', 'national_indicators.propose'], menu: [{key: 'dashboard', label: 'Dashboard'}]});
  // Team build: National Indicators need backend patch v6+, so the menu never offers them.
  assert.ok(!menu.flatMap(i => i.children ?? []).some(c => c.label === 'National Indicators'));
});

test('switch sits before the bell; menu and breadcrumb follow the portal language', () => {
  const top = read('src/components/Topbar.jsx');
  assert.ok(top.indexOf('portal-lang-ring') < top.indexOf('<NotificationBell'));
  assert.match(read('src/components/Sidebar.jsx'), /\{t\(child\.label\)\}/);
  assert.match(read('src/components/common/GlobalBreadcrumb.jsx'), /\{t\(part\.text\)\}/);
});
