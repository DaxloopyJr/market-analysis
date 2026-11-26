import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const root=new URL('../',import.meta.url);
const read=path=>readFileSync(new URL(path,root),'utf8');
const resolver=read('src/pages/ModulePage/RoleDashboardPreview.jsx');
const page=read('src/pages/Admin/ManagementDashboard.jsx');
const css=read('src/pages/Admin/ManagementDashboard.css');
const data=read('src/services/adminOverviewService.js');
const modal=read('src/components/insights/InsightModal.jsx');

test('MOA route resolves only explicit ministry-admin roles',()=>{
  assert.match(resolver,/isSystemIctAdmin\(user\)/);
  assert.match(resolver,/ManagementDashboard role="MOA"/);
});
test('IA is a separate institution-scoped role, never Internal Auditor',()=>{
  assert.match(resolver,/INSTITUTIONADMINISTRATOR/);
  assert.match(resolver,/ManagementDashboard role="IA" user=\{user\}/);
  assert.doesNotMatch(page,/Internal Auditor/i);
});
test('Management dashboards preserve global layout components',()=>{
  assert.doesNotMatch(page,/<Sidebar|<Topbar|<Footer/);
  assert.match(css,/\.vmi-dashboard/);
  assert.doesNotMatch(css,/(^|\n)\s*body\s*\{/);
});
test('Shared approved analytics modal supports expanded line charts',()=>{
  assert.match(page,/<InsightModal insight=\{insight\}/);
  assert.match(modal,/insight\.kind === 'line'/);
  assert.match(modal,/Key Details/);
});
test('Hover lift is scoped and motion-reduced for accessibility',()=>{
  assert.match(css,/translateY\(-5px\)/);
  assert.match(css,/prefers-reduced-motion:reduce/);
});
test('MOA retains original system-monitoring sections',()=>{
  for (const name of ['System Performance','Storage Usage','Server Status','System Activity Overview','User Access Overview','Recent System Logs','Recently Created Users','Quick Administration']) assert.ok(page.includes(name),name);
});
test('MOA has Departments, Direct Portal, API and reporting analytics',()=>{
  for (const name of ['Ministry Departments','Institutional Admins','Using Direct Portal','Using API Integration','Submissions by Institution','Submission Compliance (Departments)']) assert.ok(page.includes(name),name);
});
test('IA has the original institutional administration components',()=>{
  for (const name of ['Institution Users','Active Officers','Pending Actions','Approval Steps','Institution Users by Role','Administrative Attention','Recent User Management','Institution Management']) assert.ok(page.includes(name),name);
});
test('Data service uses confirmed resources; monitoring is optional',()=>{
  for (const name of ['listUsers','listInstitutionalAdmins','listInstitutions','listDepartments','datasetsAPI.list','allSubmissionRows','listApprovalCircles']) assert.ok(data.includes(name),name);
  assert.match(data,/Promise\.allSettled/);
  assert.match(data,/ministery|monitoring/i);
});
test('Incomplete paginated collection is never asserted as complete',()=>{
  // 30 Oct 2026: paging moved to services/listCache.js fetchAllPages (parallel pages, same completeness rule).
  assert.match(data,/fetchAllPages/);
  assert.match(readFileSync(new URL('../src/services/listCache.js', import.meta.url),'utf8'),/complete: total === null \|\| items\.length >= total/);
  assert.match(page,/statsReady/);
  assert.match(page,/pagination is complete/);
});
test('IA requires logged-in institution identity',()=>{
  assert.match(page,/!ministry&&!ownId/);
  assert.match(page,/institutionScoped\(result,ownId\)/);
});
test('No visible View details prompts',()=>{
  assert.doesNotMatch(page,/View details/);
});
