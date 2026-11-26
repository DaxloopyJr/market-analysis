/** Regression: Approval Circle editor must be in-page at right, NOT an overlay modal. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const jsx=readFileSync(new URL('../src/pages/Admin/ApprovalCircle.jsx',import.meta.url),'utf8');
const css=readFileSync(new URL('../src/pages/Admin/approvalCircle.css',import.meta.url),'utf8');
test('Create/Edit is a side panel within the details grid',()=>{
  assert.match(jsx,/className=\{`vim-ac-v2-lower/);
  assert.match(jsx,/editorOpen&&<aside className="vim-ac-v2-drawer" role="region"/);
  assert.match(css,/\.vim-ac-v2-lower\.editor-open\{grid-template-columns:minmax\(0,1fr\) minmax\(365px,465px\)\}/);
});
test('No backdrop or modal trapping the table and timeline',()=>{
  for(const forbidden of ['vim-ac-v2-backdrop','vim-ac-v2-drawer-layer','aria-modal="true"']){
    assert.ok(!jsx.includes(forbidden),`Remove ${forbidden}`);
  }
  assert.ok(!css.includes('.vim-ac-v2-backdrop'));
  assert.ok(!css.includes('.vim-ac-v2-drawer-layer'));
});
test('Approval Circle save and workflow API calls remain in place',()=>{
  for(const name of ['createApprovalCircle','replaceApprovalCircle','activateApprovalCircle','cloneApprovalCircle','listApprovalCircles'])
    assert.ok(jsx.includes(`${name}(`));
});
