import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {approvalActionPayload,approvalAccess,darDate} from '../src/utils/submissionApprovalActions.js';
const read = path => readFileSync(new URL(`../src/${path}`, import.meta.url),'utf8');
const source=read('API/submission.jsx');
const service=read('services/hodReviewService.jsx');
const review=read('pages/HOD/HodReview.jsx');
const menu=read('config/sidebarMenu.js');
const inbox=read('pages/HOD/HodInbox.jsx');

test('74 POST /review uses current Laravel revision and optional comments, never a deadline',()=>{
  assert.deepEqual(approvalActionPayload('review',{expectedRevision:2,comments:'Taarifa zimehakikiwa.'}),{
    expectedRevision:2, comments:'Taarifa zimehakikiwa.'
  });
  assert.deepEqual(approvalActionPayload('review',{expectedRevision:2}),{expectedRevision:2});
  assert.throws(()=>approvalActionPayload('review',{expectedRevision:2,correctionDeadline:'2026-10-30'}),/must not be sent/);
  assert.match(source,/postReviewSubmission=\(id,input\)=>postSubmissionApprovalAction\(id,'review',input\)/);
});
test('75 /approve hands off to ministry via Laravel; comments optional',()=>{
  assert.deepEqual(approvalActionPayload('approve',{expectedRevision:3,comments:'Nimeidhinisha taarifa za taasisi.'}),{
    expectedRevision:3,comments:'Nimeidhinisha taarifa za taasisi.'
  });
  assert.match(source,/postApproveSubmission=\(id,input\)=>postSubmissionApprovalAction\(id,'approve',input\)/);
});
test('76 /return REQUIRES comments and correctionDeadline on or after Dar date',()=>{
  const today='2026-10-23';
  assert.deepEqual(approvalActionPayload('return',{expectedRevision:4,comments:'Hakiki idadi na urekebishe taarifa.',correctionDeadline:'2026-10-30'},{today}),{
    expectedRevision:4,comments:'Hakiki idadi na urekebishe taarifa.',correctionDeadline:'2026-10-30'
  });
  assert.throws(()=>approvalActionPayload('return',{expectedRevision:4,comments:'',correctionDeadline:'2026-10-30'},{today}),/requires comments/);
  assert.throws(()=>approvalActionPayload('return',{expectedRevision:4,comments:'fix'},{today}),/correctionDeadline/);
  assert.throws(()=>approvalActionPayload('return',{expectedRevision:4,comments:'fix',correctionDeadline:'2026-10-22'},{today}),/today or later/);
  assert.throws(()=>approvalActionPayload('return',{expectedRevision:4,comments:'fix',correctionDeadline:'2026-02-30'},{today}),/valid correctionDeadline/);
  assert.match(review,/input:'date'/);
  assert.match(review,/correctionDeadline=isReturn\?decision\.value/);
});
test('77 /publish only for ministry publish step; status returned by Laravel',()=>{
  assert.deepEqual(approvalActionPayload('publish',{expectedRevision:6,comments:'Taarifa zimeidhinishwa kuchapishwa.'}),{
    expectedRevision:6,comments:'Taarifa zimeidhinishwa kuchapishwa.'
  });
  assert.match(source,/postPublishSubmission=\(id,input\)=>postSubmissionApprovalAction\(id,'publish',input\)/);
  assert.equal(approvalAccess({raw:{currentStep:{action:'publish'},workflowStage:'institution'}},'publish').allowed,false);
});
test('UI action must match configured currentStep; return only when can_return',()=>{
  const record={raw:{currentStep:{sequence:1,action:'review',can_return:true},allowedActions:['review','return']}};
  assert.equal(approvalAccess(record,'review').allowed,true);
  assert.equal(approvalAccess(record,'approve').allowed,false);
  assert.equal(approvalAccess(record,'return').allowed,true);
  assert.equal(approvalAccess({raw:{currentStep:{action:'review',can_return:false}}},'return').allowed,false);
  assert.equal(approvalAccess({raw:{currentStep:{action:'review'},allowedActions:[]}},'review').allowed,false);
});
test('Laravel paths are lowercase plural; no obsolete forward and comment singular',()=>{
  assert.match(source,/`\/submissions\/\$\{checkedId\(id\)\}\/\$\{action\}`/);
  assert.match(source,/APPROVAL_ACTIONS/);
  assert.match(service,/actOnHodSubmission\(\{id,user,action,comment='',correctionDeadline\}\)/);
  assert.match(service,/comments:comment/);
  assert.doesNotMatch(service,/action==='forward'|comment:String\(comment\)/);
  assert.match(review,/takeAction\('review'\)/);
  assert.doesNotMatch(review,/takeAction\('forward'\)/);
});
test('UI remains exactly two HOD menu entries and uses timeline on both approved views',()=>{
  assert.match(menu,/id:"hod-inbox",label:"Pending Review"/);
  assert.match(menu,/id:"hod-history",label:"Reviewed"/);
  assert.doesNotMatch(menu,/label:"Approval Inbox"|id:"hod-pending"/);
  assert.match(inbox,/history\?reviewed:pending/);
  assert.match(inbox,/<HodApprovalJourney/);
  assert.match(review,/<HodApprovalJourney/);
  assert.doesNotMatch(review,/hod-current-step|Current Approval Step/);
});
test('Date helper returns Dar-es-Salaam local date not UTC',()=>{
  const d=new Date('2026-10-22T22:30:00Z');
  assert.equal(darDate(d),'2026-10-23');
});
