import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read = path => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');

test('Notifications: modern header, KPI cards, tabs, kind icons and Mark as Read kept', () => {
  const page = read('pages/Notifications/Notifications.jsx');
  assert.match(page, /<MuHeader initials="🔔" title="Notifications"/);
  assert.match(page, /title="Unread"/);
  assert.match(page, /<MuTabs label="Notification filters"/);
  assert.match(page, /notificationKind\(row\)/);
  assert.match(page, /Mark as Read/);
  assert.match(page, /markNotificationRead\(selected\.id\)/);
  const kinds = read('utils/notificationDisplay.js');
  assert.match(kinds, /return\|reject\|correction/);
  assert.match(kinds, /publish\|\\bapproved\\b/);
});

test('MOA / IA dashboard: welcome header, tinted MuKpi cards, dot panels and quick-link cards', () => {
  const page = read('pages/Admin/ManagementDashboard.jsx');
  assert.match(page, /Welcome, \$\{user\.name\}/);
  assert.match(page, /<MuKpi tone=\{MU_TONE\[tone\]\|\|'blue'\}/);
  assert.match(page, /className="vmi-dot"/);
  assert.match(page, /vmi-quick-link/);
  assert.match(page, /<InsightModal insight=\{insight\}/);
});

test('Success alerts use SweetAlert toasts (no toastr, no modal for password update)', () => {
  const profile = read('pages/Profile/AppearancePreferences.jsx');
  assert.match(profile, /showPortalToast\(\{type:"success", title:"Password updated"/);
  assert.doesNotMatch(profile, /from "sweetalert2"/);
});
