import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mddInQueue,mddGroup,mddActionAllowed} from '../src/utils/mddApprovalRules.js';
import {normalizeSubmissionRecord} from '../src/utils/submissionValues.js';
const read=(p)=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const user={id:44,role_code:'MDD',permissions:['submissions.publish','submissions.return']};
const sample=(stepAction='publish')=>({
  id:7,status:'under_review',datasetId:6,revision:5,
  institutionId:3,submittedById:33,
  allowedActions:[stepAction,'return'],currentStep:{required_role_code:'MDD',action:stepAction,assignedUserId:44,can_return:true},
});
test('Under_review is recognized as a real pending MDD submission even without publish permission',()=>{
  const row=normalizeSubmissionRecord({...sample('approve'),allowedActions:['return']});
  assert.equal(row.dataset_id,6);
  assert.equal(row.status,'under_review');
  assert.equal(mddGroup(row,user),'Pending Review');
  assert.equal(mddInQueue(row),true);
  assert.equal(mddActionAllowed(row,user,'publish'),false);
});
test('Only MDD reviewer step is shown in MDD queue',()=>{
  const row=normalizeSubmissionRecord({...sample(),currentStep:{required_role_code:'MDO',action:'review'}});
  assert.equal(mddInQueue(row),false);
});
test('MDD can publish under_review only with explicit Laravel publish step and assignment',()=>{
  const row=normalizeSubmissionRecord(sample());
  assert.equal(mddActionAllowed(row,user,'publish'),true);
  assert.equal(mddActionAllowed(row,{...user,id:999},'publish'),false);
  assert.equal(mddActionAllowed(normalizeSubmissionRecord({...sample(),allowedActions:['return']}),user,'publish'),false);
});
test('Director queue is one path, with Review and only Publish/Return decisions',()=>{
  const page=read('src/pages/MDD/MddWorkspace.jsx');
  const menu=read('src/config/sidebarMenu.js');
  const app=read('src/App.jsx');
  assert.match(menu,/id:"mdd-queue",label:"Pending Review"/);
  assert.doesNotMatch(menu,/id:"mdd-ready"/);
  assert.match(app,/<Navigate to="\/dashboard\/mdd\/queue" replace/);
  assert.match(page,/const canReview=mddInQueue\(record\)/);
  assert.doesNotMatch(page,/const tabs=.*Ready to Publish/);
  assert.match(page,/canReview&&<button/);
  assert.match(page,/mode=view/);
  assert.doesNotMatch(page,/title="History"/);
  assert.match(page,/onClick=\{\(\)=>perform\('publish'\)\}/);
  assert.match(page,/onClick=\{\(\)=>perform\('return'\)\}/);
  assert.doesNotMatch(page,/> Approve<\/button>/);
  assert.match(page,/TableLoader active label="Loading Director submissions/);
});
test('Global breadcrumb is independent, sticky and shared with every dashboard page',()=>{
  const layout=read('src/layouts/DashboardLayout.jsx');
  const style=read('src/styles/global-breadcrumb.css');
  const mdo=read('src/pages/MDO/MdoWorkspace.jsx');
  assert.match(layout,/<GlobalBreadcrumb\s*\/>/);
  assert.match(layout,/<BreadcrumbContext.Provider/);
  assert.match(style,/position:sticky;top:72px/);
  assert.match(style,/prefers-reduced-motion:reduce/);
  assert.match(mdo,/context\?\.setBreadcrumb/);
});
