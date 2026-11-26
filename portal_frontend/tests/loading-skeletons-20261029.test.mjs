import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('ModernUI exports skeleton components and MuKpi loading', () => {
  const ui = read('src/components/modern/ModernUI.jsx');
  for (const name of ['MuSkeleton', 'MuSkeletonRows', 'MuSkel']) assert.match(ui, new RegExp(`export (function|const) ${name}\\b`));
  assert.match(ui, /loading/);
  const css = read('src/components/modern/ModernUI.css');
  assert.match(css, /@keyframes mu-shimmer/);
  assert.match(css, /prefers-reduced-motion/);
});

test('dashboards show skeletons instead of empty loading text', () => {
  for (const f of ['src/pages/Dashboard/Dashboard.jsx', 'src/pages/IhodDashboard/IhodDashboard.jsx',
    'src/pages/AoDashboard/AoDashboard.jsx', 'src/pages/MinistryDashboard/MinistryDashboard.jsx']) {
    const src = read(f);
    assert.match(src, /MuSkeletonRows/, f);
    if (!f.includes('Ministry')) assert.match(src, /MuSkeleton kind=/, f);
  }
  assert.match(read('src/pages/Admin/ManagementDashboard.jsx'), /DashLoading\.Provider/);
  // Loading style F (9 Nov 2026): one ring while an empty grid loads, no card-shaped skeletons.
  assert.match(read('src/components/orgCards/OrgCards.jsx'), /<MuWaitRing height=\{180\}\/>/);
});
