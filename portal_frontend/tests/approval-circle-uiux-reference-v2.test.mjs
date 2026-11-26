/** UI/UX regression for the 23-Oct approval table + timeline reference.
 * These tests assert source semantics only, not live Laravel/server rendering.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const jsx=readFileSync(new URL('../src/pages/Admin/ApprovalCircle.jsx',import.meta.url),'utf8');
const css=readFileSync(new URL('../src/pages/Admin/approvalCircle.css',import.meta.url),'utf8');
const api=readFileSync(new URL('../src/API/approvalCircle.jsx',import.meta.url),'utf8');

test('approved layout has full workflow versions table and selected detail timeline',()=>{
  for(const marker of ['vim-ac-v2-table','vim-ac-v2-filter-tabs','vim-ac-v2-detail-tabs','vim-ac-v2-timeline','vim-ac-v2-drawer'])
    assert.ok(jsx.includes(marker), `Missing ${marker}`);
});
test('new layout keeps real Laravel rows rather than image sample data',()=>{
  assert.ok(jsx.includes('listApprovalCircles()'));
  assert.ok(jsx.includes('rows.filter('));
  assert.ok(!jsx.includes('TANTRADE Data Approval'));
});
test('IA roles and assignees remain per step, not unsupported global role ids',()=>{
  assert.ok(jsx.includes('approvalUsersForRole'));
  assert.ok(jsx.includes('assigned_user_id'));
  assert.ok(jsx.includes('required_role_code'));
  assert.ok(jsx.includes("scope==='institution'&&level.assigned_user_id"));
  assert.ok(!jsx.includes('Applicable User Roles</label>'));
});
test('versioning actions stay mapped to verified API services',()=>{
  for(const method of ['createApprovalCircle','replaceApprovalCircle','cloneApprovalCircle','activateApprovalCircle'])
    assert.ok(jsx.includes(`${method}(`));
  assert.match(api,/\/approval-circles/);
  assert.ok(!jsx.includes("action:'submit'"));
});
test('CSS is prefixed to Approval Circle and includes mobile drawer/table rules',()=>{
  assert.ok(css.includes('.vim-ac-v2-table-scroll'));
  assert.ok(css.includes('.vim-ac-v2-drawer'));
  assert.ok(css.includes('@media(max-width:760px)'));
});
