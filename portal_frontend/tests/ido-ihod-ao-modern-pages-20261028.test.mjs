import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL(`../${p}`,import.meta.url),'utf8');

test('IDO / IHOD / AO dashboards use the shared modern pieces with ⋮-only table actions',()=>{
  for(const p of ['src/pages/Dashboard/Dashboard.jsx','src/pages/IhodDashboard/IhodDashboard.jsx','src/pages/AoDashboard/AoDashboard.jsx']){
    const src=read(p);
    assert.match(src,/<MuHeader /,p);assert.match(src,/<MuKpi /,p);assert.match(src,/<MuSelect /,p);
    assert.match(src,/<RowActionsMenu /,p);
    assert.doesNotMatch(src,/className="ihod-review"|btn btn-sm btn-outline-primary/,p);
    assert.match(src,/useErrorDialogState/,p);
  }
});
test('KPI cards keep each role\'s original colours: tinted background, coloured value',()=>{
  const css=read('src/components/modern/ModernUI.css');
  assert.match(css,/\.mu-kpi\{background:var\(--mu-bg,#fff\);border-color:var\(--mu-bd/);
  assert.match(css,/\.mu-kpi \.mu-kpi-text b\{color:var\(--mu-c\)\}/);
  assert.match(css,/\.mu-tone-orange/);assert.match(css,/\.mu-tone-indigo/);
  const ihod=read('src/pages/IhodDashboard/IhodDashboard.jsx');
  assert.match(ihod,/tone="blue"[\s\S]*tone="green"[\s\S]*tone="orange"[\s\S]*tone="indigo"/);
  const ido=read('src/pages/Dashboard/Dashboard.jsx');
  assert.match(ido,/tone="blue"[\s\S]*tone="amber"[\s\S]*tone="green"[\s\S]*tone="red"/);
});
test('Labelled select is one clean box (no inner native border/arrow)',()=>{
  const css=read('src/components/modern/ModernUI.css');
  assert.match(css,/\.mu-select select,\.dashboard-shell \.mu-select select\{-webkit-appearance:none;-moz-appearance:none;appearance:none;border:0!important/);
});
test('AO review opens as a full page; approve/return contracts unchanged',()=>{
  const app=read('src/App.jsx'),ao=read('src/pages/AO/AoApprovals.jsx'),menu=read('src/config/sidebarMenu.js');
  assert.match(app,/path="ao\/review\/:id" element=\{<AoAccess><AoApprovals review \/><\/AoAccess>\}/);
  assert.match(menu,/\\\/dashboard\\\/ao\\\/review\\\/\\d\+\$/);
  assert.match(ao,/completeAoAction\(\{id:selected\.id,user,action,comments,correctionDeadline/);
  assert.match(ao,/canAoApprove\(selected,user\)/);
  assert.match(ao,/navigate\(`\/dashboard\/ao\/review\/\$\{notified\}`/);
  assert.match(ao,/<ReviewSummary record=\{selected\}\/>/);
});
test('HOD review keeps validation, save-before-forward and history; adds stepper summary',()=>{
  const src=read('src/pages/HOD/HodReview.jsx');
  assert.match(src,/disabled=\{working\|\|!changed\|\|issues.length>0\}/);
  assert.match(src,/if\(changed\)\{setStep\('Saving values before review…'\)/);
  assert.match(src,/<HodApprovalJourney record=\{record\}/);
  assert.match(src,/<ReviewSummary record=\{record\}\/>/);
});
test('IDO submission tabs count Laravel lowercase statuses', async ()=>{
  const {idoStatusGroup,currentStepText}=await import('../src/utils/roleDisplay.js');
  assert.equal(idoStatusGroup('draft'),'Draft');assert.equal(idoStatusGroup('returned'),'Returned');
  assert.equal(idoStatusGroup('under_review'),'Submitted');assert.equal(idoStatusGroup('published'),'Published');
  assert.equal(currentStepText({status:'under_review',raw:{currentStep:{required_role_code:'AO'}}}),'AO approval');
  assert.equal(currentStepText({status:'returned'}),'Back to you');
});
