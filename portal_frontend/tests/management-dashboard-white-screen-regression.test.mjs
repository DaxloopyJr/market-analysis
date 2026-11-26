import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const dashboard=readFileSync(new URL('../src/pages/Admin/ManagementDashboard.jsx',import.meta.url),'utf8');
const route=readFileSync(new URL('../src/pages/ModulePage/RoleDashboardPreview.jsx',import.meta.url),'utf8');
const boundary=readFileSync(new URL('../src/components/Workspace/DashboardContentBoundary.jsx',import.meta.url),'utf8');

test('dashboard refresh icon is an imported symbol (white page regression)',()=>{
  assert.match(dashboard,/\bRefreshCcw\b/);
  assert.match(dashboard,/import\s*\{[^}]*\bRefreshCcw\b[^}]*\}\s*from\s*['"]lucide-react['"]/s);
  assert.doesNotMatch(dashboard,/\bRefreshCw\b/);
  assert.match(dashboard,/<RefreshCcw\b/);
});
test('MOA and IA have a main-content-only error boundary',()=>{
  assert.match(route,/DashboardContentBoundary/);
  assert.match(route,/<DashboardContentBoundary><ManagementDashboard role="MOA"/);
  assert.match(route,/<DashboardContentBoundary><ManagementDashboard role="IA"/);
  assert.match(boundary,/getDerivedStateFromError/);
  assert.match(boundary,/return this\.props\.children/);
  assert.doesNotMatch(boundary,/import .*DashboardLayout|position:\s*fixed/);
});
test('dashboard loading remains inline and no global layout components were modified',()=>{
  // 9 Nov 2026: one loading style — inline skeletons inside the cards and panels (no separate loading banner).
  assert.match(dashboard,/MuSkeleton/);
  assert.doesNotMatch(dashboard,/className="vmi-loading"/);
  assert.doesNotMatch(dashboard,/position:\s*fixed/);
});
