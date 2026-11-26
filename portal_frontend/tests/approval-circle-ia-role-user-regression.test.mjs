import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  approvalUserRoleCodes,
  approvalRoleOptions,
  approvalUsersForRole,
  scopeApprovalUsers,
} from '../src/utils/approvalCircleAssignees.js';
import {approvalCirclePayload} from '../src/utils/approvalCircleContract.js';

const ui=readFileSync(new URL('../src/pages/Admin/ApprovalCircle.jsx', import.meta.url),'utf8');
const sample=[
  {id:15,name:'Staff Supervisor',email:'hod@example.test', institution_id:9,
   roles:[{code:'HOD',name:'Head of Department',level:'institution'}]},
  {id:16,name:'Approver',email:'ao@example.test', institution_id:9,
   roles:[{code:'AO',name:'Approving Officer',level:'institution'}]},
  {id:17,name:'External',institution_id:99,roles:[{code:'HOD'}]},
  {id:18,name:'Inactive',institution_id:9,status:'inactive',roles:[{code:'AO'}]},
  {id:19,name:'No role metadata',institution_id:9},
];

test('IA list is strictly filtered to own institution and active users',()=>{
  const scoped=scopeApprovalUsers(sample,9);
  assert.deepEqual(scoped.map(r=>r.id),[15,16,19]);
  assert.deepEqual(scopeApprovalUsers(sample,null),[]);
});
test('IA role picker derives role codes from real scoped user data and existing workflow steps',()=>{
  const scoped=scopeApprovalUsers(sample,9);
  const roles=approvalRoleOptions({scope:'institution',users:scoped,circles:[{levels:[{required_role_code:'QA',level:'institution'}]}],
    directoryRoles:[{code:'MOA',level:'ministry'}]});
  assert.deepEqual(roles.map(r=>r.code),['AO','HOD','QA']);
  assert.deepEqual(approvalUserRoleCodes(scoped[0]),['HOD']);
  assert.deepEqual(approvalUsersForRole(scoped,'AO').map(r=>r.id),[16,19]);
});
test('MOA lists only ministry role choices; IA never uses global roles directory',()=>{
 const opts=approvalRoleOptions({scope:'ministry',users:sample,directoryRoles:[{code:'MDO',level:'ministry'},{code:'AO',level:'institution'}],circles:[]});
 assert.deepEqual(opts.map(r=>r.code),['MDO']);
});
test('approval UI uses IA scoped GET /users for assignees and removes the unsaved role selector',()=>{
  assert.match(ui,/loadAllOptions\(page=>listUsers\(\{page\}\)\)/);
  assert.match(ui,/users\.manage\.institution/);
  assert.match(ui,/scopeApprovalUsers\(items,institutionId\)/);
  assert.match(ui,/approvalRoleOptions\(\{users,circles:rows,directoryRoles:roles,scope\}\)/);
  assert.match(ui,/approvalUsersForRole\(users,level\.required_role_code\)/);
  assert.doesNotMatch(ui,/function ScopeMultiSelect/);
  assert.doesNotMatch(ui,/<ScopeMultiSelect/);
  assert.doesNotMatch(ui,/<label[^>]*>Applicable User Roles/);
});
test('IA workflow includes permitted user in approval step, never posts forbidden scope fields',()=>{
 const p=approvalCirclePayload({name:'CBE Approval',steps:[{step_name:'Review',required_role_code:'HOD',action:'review',assigned_user_id:'15'}]},'institution');
 assert.equal(p.steps[0].assigned_user_id,15);
 assert.equal(p.steps[0].level,'institution');
 assert.equal(p.institution_id,undefined);
 assert.throws(()=>approvalCirclePayload({name:'x',steps:[{step_name:'publish',action:'publish',required_role_code:'HOD'}]},'institution'));
 const m=approvalCirclePayload({name:'Ministry',steps:[{step_name:'Review',required_role_code:'MDO',action:'review',assigned_user_id:15}]},'ministry');
 assert.equal(m.steps[0].assigned_user_id,undefined);
});
