import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {isMddDirector,mddActionAllowed,mddGroup,mddOwnHistory} from '../src/utils/mddApprovalRules.js';
import {approvalActionPayload} from '../src/utils/submissionApprovalActions.js';
const src=new URL('../src/',import.meta.url);
const contents=file=>readFileSync(new URL(file,src),'utf8');
const user={id:101,roles:[{code:'MDD'}],permissions:['submissions.approve','submissions.publish']};
const mk=(action,status='under_review')=>({id:15,status,raw:{submittedById:12,allowedActions:[action,'return'],currentStep:{required_role_code:'MDD',action,assignedUserId:101,can_return:true}}});

test('MDD has role-based access and no ungranted review',()=>{
  assert.equal(isMddDirector(user),true);
  assert.equal(isMddDirector({...user,roles:[{code:'MDO'}]}),false);
  assert.equal(isMddDirector({...user,permissions:[]}),false);
});
test('MDD can approve only its current approval step and assigned submission',()=>{
  assert.equal(mddActionAllowed(mk('approve'),user,'approve'),true);
  assert.equal(mddActionAllowed(mk('approve'),user,'return'),true);
  assert.equal(mddActionAllowed(mk('approve'),user,'publish'),false);
  assert.equal(mddActionAllowed({...mk('approve'),raw:{...mk('approve').raw,currentStep:{...mk('approve').raw.currentStep,assignedUserId:90}}},user,'approve'),false);
  assert.equal(mddActionAllowed({...mk('approve'),raw:{...mk('approve').raw,submittedById:101}},user,'approve'),false);
});
test('MDD publish requires Laravel publication step and permission, even if server status is under_review',()=>{
  assert.equal(mddActionAllowed(mk('publish','approved'),user,'publish'),true);
  assert.equal(mddActionAllowed(mk('publish','under_review'),user,'publish'),true);
  assert.equal(mddActionAllowed(mk('publish','approved'),user,'approve'),false);
  assert.equal(mddGroup(mk('publish','approved'),user),'Pending Review');
  assert.equal(mddGroup(mk('approve'),user),'Pending Review');
});
test('Return needs permission + active circle and no publishing from institution circle',()=>{
  assert.equal(mddActionAllowed({...mk('approve'),raw:{...mk('approve').raw,currentStep:{...mk('approve').raw.currentStep,can_return:false}}},user,'return'),false);
  assert.equal(mddActionAllowed({...mk('approve'),raw:{...mk('approve').raw,allowedActions:['approve']}},user,'return'),false);
  assert.equal(mddActionAllowed({...mk('publish','approved'),raw:{...mk('publish','approved').raw,workflowStage:'institution'}},user,'publish'),false);
});
test('MDD reviewed history only includes logged-in director',()=>{
  const record={history:[{action:'approve',actorId:101},{action:'return',actorId:102},{action:'publish',actorId:101}]};
  assert.equal(mddOwnHistory(record,user).length,2);
  assert.equal(mddOwnHistory(record,{...user,id:999}).length,0);
});
test('MDD official action payloads contain comments, deadline only on return',()=>{
  assert.deepEqual(approvalActionPayload('approve',{expectedRevision:3,comments:'Verified'}),{expectedRevision:3,comments:'Verified'});
  assert.deepEqual(approvalActionPayload('publish',{expectedRevision:4}),{expectedRevision:4});
  assert.deepEqual(approvalActionPayload('return',{expectedRevision:5,comments:'Fix data',correctionDeadline:'2026-10-31'},{today:'2026-10-24'}),{expectedRevision:5,comments:'Fix data',correctionDeadline:'2026-10-31'});
  assert.throws(()=>approvalActionPayload('return',{expectedRevision:5,comments:'',correctionDeadline:'2026-10-31'},{today:'2026-10-24'}),/requires comments/);
});
test('Routes, menu, approved MDO components, filters, three-dot actions and Laravel post endpoints exist',()=>{
  const routes=contents('App.jsx'),menu=contents('config/sidebarMenu.js'),page=contents('pages/MDD/MddWorkspace.jsx'),service=contents('services/mddApprovalService.jsx'),rules=contents('utils/mddApprovalRules.js');
  for(const path of ['mdd/queue','mdd/ready','mdd/source/:sourceType/:sourceId','mdd/review/:id','mdd/reviewed','mdd/published','mdd/returned']) assert.ok(routes.includes(path),path);
  for(const item of ['Pending Review','Reviewed','Published','Returned'])assert.ok(menu.includes(item));
  assert.ok(!menu.includes('id:"mdd-ready"'));
  assert.match(routes,/mdd\/ready.*Navigate to="\/dashboard\/mdd\/queue"/);
  for(const component of ['InstitutionMark','RowActionsMenu','SubmittedTable','MddRemarksDocuments','MddApprovalHistory','Breadcrumb','Departments & Units','Institution'])assert.ok(page.includes(component),component);
  for(const post of ['postReturnSubmission','postPublishSubmission','expectedRevision'])assert.ok(service.includes(post));
  assert.ok(!service.includes('postApproveSubmission'),'No hidden Approve action on Publish');
  assert.match(page,/showPortalToast/);assert.match(page,/Swal\.fire/);assert.match(rules,/assignedUserId/);
  assert.ok(!page.includes('mdd-summary-cards'));
});
