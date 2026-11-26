import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const file = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const pages = [
  'src/pages/Dashboard/Dashboard.jsx',
  'src/pages/IhodDashboard/IhodDashboard.jsx',
  'src/pages/AoDashboard/AoDashboard.jsx',
  'src/pages/MinistryDashboard/MinistryDashboard.jsx',
  'src/pages/Admin/AdminDashboard.jsx',
  'src/pages/HOD/HodInbox.jsx',
];

test('all implemented dashboard analytics entrypoints use click-to-open details', () => {
  for (const path of pages) {
    const source = file(path);
    assert.match(source, /vi-insight-trigger/, `${path}: clickable hover surface`);
    assert.doesNotMatch(source, /View details/i, `${path}: no View details labels`);
  }
});

test('role dashboards render a detail modal alongside the existing screens', () => {
  for (const path of pages.filter((entry) => !entry.includes('AdminDashboard'))) {
    assert.match(file(path), /<InsightModal\s+insight=\{insight\}/, `${path}: detail modal rendered`);
  }
});

test('shared chart visual uses existing data and renders Key Details', () => {
  const jsx = file('src/components/insights/InsightModal.jsx');
  assert.match(jsx, /<h3>Key Details<\/h3>/);
  assert.match(jsx, /createPortal\(/);
  assert.match(jsx, /aria-modal="true"/);
  assert.match(jsx, /if \(event\.key === 'Escape'\)/);
  assert.match(jsx, /const data = Array\.isArray\(insight\?\.data\)/); // visual draws the caller's data
  assert.match(jsx, /chartDetails\(insight\)/);                         // Key Details come from the chart itself
});

test('hover lift is scoped to analytics and respects reduced motion', () => {
  const css = file('src/components/insights/InsightModal.css');
  assert.match(css, /\.vi-insight-trigger:hover\{transform:translateY\(-4px\)/);
  assert.match(css, /prefers-reduced-motion:reduce/);
  assert.doesNotMatch(css, /\.sidebar|\.topbar|\.footer/);
});
