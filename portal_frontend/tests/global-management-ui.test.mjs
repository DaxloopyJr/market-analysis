/** Static, dependency-free REV26 integration tests. Browser/Laravel still need QA. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..');
const read = p => fs.readFileSync(path.join(root,p),'utf8');

test('authenticated profile route and Topbar entry are present', () => {
  assert.match(read('src/App.jsx'), /path="profile" element=\{<MyProfile \/>\}/);
  assert.match(read('src/components/Topbar.jsx'), /to="\/dashboard\/profile"/);
});
test('appearance is stored by verified user in browser only', () => {
  const source=read('src/contexts/AppearanceContext.jsx');
  assert.match(source,/viwanda\.appearance\.v1\./);
  assert.match(source,/localStorage\.setItem/);
  assert.match(source,/localStorage\.removeItem/);
  assert.doesNotMatch(source,/axios|fetch\(/);
});
test('Profile supports Light, Dark, Auto and personal Reset',()=>{
  const source=read('src/pages/Profile/AppearancePreferences.jsx');
  for(const str of ['Light','Dark','Auto (device)','Reset Theme']) assert.ok(source.includes(str));
  assert.match(read('src/pages/Admin/PortalSettings.jsx'),/System Preferences/);
});
test('all target management row action cells use popup (horizontal)',()=>{
  for(const file of ['Admin/Users.jsx','Admin/Institutions.jsx','Admin/MinistryDepartments.jsx','Admin/InstitutionalAdmins.jsx','Admin/Delegations.jsx','Admin/RolesPermissions.jsx','ModulePage/Datasets.jsx','ModulePage/ReferenceData.jsx']) {
    const txt=read(`src/pages/${file}`);assert.match(txt,/<RowActionsMenu/);assert.match(txt,/<TableLoader active=\{loading\}/);
  }
  assert.match(read('src/styles/management.css'),/\.vw-actions-popup\{[^}]*flex-direction:row/);
  assert.match(read('src/components/common/RowActionsMenu.jsx'),/createPortal/);
});
test('page loader is inside main content and uses original Login animation',()=>{
  const layout=read('src/layouts/DashboardLayout.jsx');
  assert.match(layout,/dashboard-content/);assert.match(layout,/<WorkspacePageContent user=\{user\}/);
  assert.match(read('src/components/common/LoadingState.jsx'),/viwanda-login-spinner/);
  assert.match(read('src/components/common/LoadingState.jsx'),/national-emblem\.png/);
});
test('shared CSS covers management content, forms, tables and modal wrappers',()=>{
  const css=read('src/styles/management.css');
  for(const key of ['vw-management-card','vw-management-table','vw-management-form','vw-management-modal','vw-page-loading','vw-table-loading'])assert.ok(css.includes(key));
});
test('no broken relative import paths in source',()=>{
  const base=path.join(root,'src');let count=0;
  function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const target=path.join(dir,e.name);if(e.isDirectory())walk(target);else if(/\.(js|jsx)$/.test(e.name)){
    const text=fs.readFileSync(target,'utf8');
    const pattern=/(?:from\s*|import\s*\(\s*|import\s*)["'](\.{1,2}\/[^"']+)["']/g;
    for(const match of text.matchAll(pattern)){count++;const resolved=path.resolve(path.dirname(target),match[1]);const options=[resolved,...['.jsx','.js','.mjs','.css','.json','.png','.jpg','.svg'].map(x=>resolved+x),path.join(resolved,'index.jsx')];assert.ok(options.some(x=>fs.existsSync(x)),`${target}: ${match[1]}`);}
  }}}
  walk(base);assert.ok(count>100,`Expected many relative imports, got ${count}`);
});
