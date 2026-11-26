import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
// Source uses Vite extensionless imports. Import a generated data: URL of this
// pure menu module for Node-only contract tests without rewriting app code.
const source = readFileSync(new URL('../src/config/sidebarMenu.js', import.meta.url), 'utf8');
const { getVisibleMenu, findMenuByPath } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
const canAccessPath=(me,path)=>Boolean(me?.permissions?.includes('dashboard.view')&&findMenuByPath(path,me));

const api = readFileSync(new URL('../src/API/submission.jsx', import.meta.url),'utf8');
const approvalPath = '/dashboard/administration/approval-circle';
const user = (permissions, menu = [{key:'dashboard',label:'Dashboard'}]) => ({
  id: 15,
  roles: [{code:'IA'}],
  permissions: ['dashboard.view', ...permissions],
  menu,
});
const visibleApproval = me => getVisibleMenu(me).flatMap(item=>item.children??[])
  .filter(item=>item.id==='approval-circle');

test('POST submit uses plural lowercase route and never former singular Laravel-404 route',()=>{
  assert.match(api, /api\.post\(path, \{expectedRevision:Number\(expectedRevision\)\}\)/);
  assert.match(api, /const path = \`\/submissions\/\$\{checkedId\(id\)\}\/submit\`/);
  assert.doesNotMatch(api, /api\.post\(\`\/submission\/\$\{checkedId\(id\)\}\/submit/);
});

test('IA Approval Circle appears even when /me omits administration root',()=>{
  const me=user(['approval_circle.manage.institution']);
  assert.equal(visibleApproval(me).length,1);
  assert.equal(visibleApproval(me)[0].path,approvalPath);
  assert.ok(canAccessPath(me,approvalPath));
  const group=getVisibleMenu(me).find(m=>m.id==='administration');
  assert.equal(group.children.length,1);
});

test('IA Approval Circle appears once when root exists but backend omitted child',()=>{
  const me=user(['approval_circle.manage.institution'],[
    {key:'dashboard',label:'Dashboard'},
    {key:'administration',label:'Administration',children:[{key:'users',label:'Users'}]},
  ]);
  assert.equal(visibleApproval(me).length,1);
  assert.ok(canAccessPath(me,approvalPath));
});

test('IA Approval Circle remains single where Laravel includes the child already',()=>{
  const me=user(['approval_circle.manage.institution'],[
    {key:'administration',label:'Administration',children:[{key:'approval-circle',label:'Approval Circle'}]},
  ]);
  assert.equal(visibleApproval(me).length,1);
});

test('MOA remains global and non-IA without grants gets no Approval Circle entry',()=>{
  const moa={...user(['approval_circle.manage.ministry']), roles:[{code:'MOA'}]};
  assert.equal(visibleApproval(moa).length,1);
  const denied={...user([]), roles:[{code:'DDO'}]};
  assert.equal(visibleApproval(denied).length,0);
  assert.equal(canAccessPath(denied,approvalPath),false);
});

test('IA role sees Approval Circle even when /me omits permission and menu',()=>{
 const ia={...user([]),roles:[{code:'IA'}]};
 assert.equal(visibleApproval(ia).length,1);
 assert.equal(visibleApproval(ia)[0].path,approvalPath);
});

test('inactive IA role does not create approval access without permission',()=>{
 const inactive={...user([]), roles:[{code:'IA',pivot:{status:'inactive'}}],role_code:'DDO'};
 assert.equal(visibleApproval(inactive).length,0);
});
