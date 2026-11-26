import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  hasMdoRole,isMdoReviewer,sourceOf,sourceOfDataset,institutionLogo,
  ministryOf,ministryDepartments,canMdoReview,canMdoReturn,hasMdoHistory
} from '../src/utils/mdoReviewRules.js';
import {approvalActionPayload} from '../src/utils/submissionApprovalActions.js';

const src=new URL('../src/',import.meta.url);
const contents=path=>readFileSync(new URL(path,src),'utf8');
const user={id:44,roles:[{code:'MDO'}],permissions:['submissions.review'],institution:{id:1,name:'Ministry of Industry and Trade'}};
const ministry={id:1,name:'Wizara ya Viwanda na Biashara',type:'ministry'};
const record={id:5,status:'under_review',raw:{
  dataset:{id:17,institutionId:1,departmentId:13},submittedById:25,
  currentStep:{sequence:2,action:'review',required_role_code:'MDO',assignedUserId:44,can_return:true},
  allowedActions:['review','return']
}};

test('MDO role and permission required; AO/HOD do not enter MDO',()=>{
  assert.equal(hasMdoRole(user),true);assert.equal(isMdoReviewer(user),true);
  assert.equal(isMdoReviewer({...user,permissions:[]}),false);
  assert.equal(isMdoReviewer({...user,roles:[{code:'AO'}]}),false);
});
test('Source links Department to ministry institution, not standalone institution',()=>{
  assert.deepEqual(sourceOf(record),{institutionId:1,departmentId:13,institutionName:'',departmentName:''});
  assert.deepEqual(sourceOfDataset({institutionId:1,departmentId:13}),{institutionId:1,departmentId:13});
  assert.equal(ministryOf([ministry,{id:2,name:'TANTRADE'}],user).id,1);
  assert.deepEqual(ministryDepartments([
    {id:13,institutionId:1},{id:14,institutionId:2},{id:15,parent_department_id:13}
  ],ministry).map(row=>row.id),[13,15]);
});
test('Institution logo is sourced from API data; no injected or invented URL',()=>{
  assert.equal(institutionLogo({logoUrl:'https://example.org/logo.png'}),'https://example.org/logo.png');
  assert.equal(institutionLogo({logo_url:'/storage/tbs-logo.png'}),'/storage/tbs-logo.png');
  assert.equal(institutionLogo({code:'TBS'}),'');
  assert.equal(institutionLogo({logoUrl:'javascript:alert(1)'}),'');
});
test('MDO can review assigned record and return when allowed',()=>{
  assert.equal(canMdoReview(record,user),true);
  assert.equal(canMdoReturn(record,user),true);
  assert.equal(canMdoReview({...record,raw:{...record.raw,currentStep:{...record.raw.currentStep,assignedUserId:13}}},user),false);
  assert.equal(canMdoReview({...record,raw:{...record.raw,currentStep:{...record.raw.currentStep,action:'approve'}}},user),false);
  assert.equal(canMdoReturn({...record,raw:{...record.raw,currentStep:{...record.raw.currentStep,can_return:false}}},user),false);
  assert.equal(canMdoReview({...record,raw:{...record.raw,allowedActions:[]}},user),false);
});
test('Reviewed only from MDO actor events, not other reviewers',()=>{
  assert.equal(hasMdoHistory({...record,history:[{action:'review',actorId:44}]},user),true);
  assert.equal(hasMdoHistory({...record,history:[{action:'review',actorId:55}]},user),false);
});
test('Review/Return payload matches Laravel, deadline required for return',()=>{
  assert.deepEqual(approvalActionPayload('review',{expectedRevision:3,comments:'Checked'}),{expectedRevision:3,comments:'Checked'});
  assert.deepEqual(approvalActionPayload('return',{expectedRevision:3,comments:'Fix values',correctionDeadline:'2026-10-30'},{today:'2026-10-24'}),
    {expectedRevision:3,comments:'Fix values',correctionDeadline:'2026-10-30'});
  assert.throws(()=>approvalActionPayload('return',{expectedRevision:3,comments:'',correctionDeadline:'2026-10-30'},{today:'2026-10-24'}),/comments/);
  assert.throws(()=>approvalActionPayload('return',{expectedRevision:3,comments:'Fix',correctionDeadline:'2026-10-20'},{today:'2026-10-24'}),/today or later/);
});
test('UI respects route, existing 3-dot menu, existing alerts and source catalogue',()=>{
  const routes=contents('App.jsx'),menus=contents('config/sidebarMenu.js');
  const page=contents('pages/MDO/MdoWorkspace.jsx');
  const service=contents('services/mdoReviewService.jsx');
  for(const path of ['mdo/queue','mdo/source/:sourceType/:sourceId','mdo/review/:id','mdo/reviewed','mdo/returned']) assert.ok(routes.includes(path),path);
  for(const label of ['Ministry Review Queue','Reviewed Submissions','Returned to Institutions'])assert.ok(menus.includes(label),label);
  for(const name of ['InstitutionMark','Departments & Units','RowActionsMenu','Review & Forward','Return for Correction','Approval History'])assert.ok(page.includes(name),name);
  assert.match(service,/postReviewSubmission\(id,input\)/);
  assert.match(service,/postReturnSubmission\(id,input\)/);
  assert.match(service,/getMdoCatalogue/);
  assert.match(page,/showPortalToast/);
  assert.match(service,/TODO\(BACKEND\): Add persisted institution\.logoUrl/);
});
