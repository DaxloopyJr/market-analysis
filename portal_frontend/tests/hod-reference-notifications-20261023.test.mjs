import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {reviewWorkflow} from '../src/utils/hodApprovalPresentation.js';
const read = file => readFileSync(file,'utf8');
test('HOD reference has summary cards, dataset table and selectable details side panel',()=>{
  const src=read('src/pages/HOD/HodInbox.jsx');
  assert.match(src,/Department Submissions/);
  assert.match(src,/hod-inbox-stats/);
  assert.match(src,/hod-inbox-aside/);
  assert.match(src,/Reporting Period/);
  assert.match(src,/Submitted By/);
  assert.match(src,/Submission Details/);
});
test('HOD review has editable totals, breakdown percentages, comments and three-stage history',()=>{
  const src=read('src/pages/HOD/HodReview.jsx');
  const journey=read('src/pages/HOD/HodApprovalJourney.jsx');
  for(const item of ['Total Value','% of Total','Indicator Remarks','Return for Correction','Review & Forward','Save changes']) assert.ok(src.includes(item),item);
  for(const item of ['Submitted','Under Review (Current)','Next Step']) assert.ok(journey.includes(item),item);
  assert.ok(read('src/pages/HOD/HodInbox.jsx').includes('HodApprovalJourney'));
  assert.ok(src.includes('HodApprovalJourney'));
  assert.match(src,/return' && !comment.trim\(\)/);
  assert.match(src,/getHodSubmission/);
});
test('next approver is computed from backend, never hardcoded as Account Officer',()=>{
  const src=read('src/utils/hodApprovalPresentation.js');
  assert.match(src,/source\.nextStep/);
  assert.match(src,/source\.approvalCircle/);
  assert.match(src,/ordered\.findIndex/);
  assert.match(src,/AO:'Account Officer'/);
  assert.doesNotMatch(read('src/pages/HOD/HodReview.jsx'),/Next: Account Officer/);
});
test('notifications consume four confirmed lowercase Laravel endpoints',()=>{
  const src=read('src/API/notifications.jsx');
  assert.match(src,/api\.get\('\/notifications'/);
  assert.match(src,/api\.get\('\/notifications\/unread-count'/);
  assert.match(src,/api\.get\(`\/notifications\/\$\{checkId\(id\)\}`\)/);
  assert.match(src,/api\.patch\(`\/notifications\/\$\{checkId\(id\)\}\/read`\)/);
  assert.doesNotMatch(src,/\/Notifications/);
});
test('notifications page has functional list, filter, details, mark as read and pager',()=>{
  const src=read('src/pages/Notifications/Notifications.jsx');
  for (const name of ['getNotifications','getNotification','markNotificationRead','Unread','Mark as Read','Next page']) assert.ok(src.includes(name),name);
  assert.match(read('src/components/Topbar.jsx'),/unreadCount/);
});

test('HOD sidebar offers Pending Review without changing officer submission routes',()=>{
  const menu=read('src/config/sidebarMenu.js');
  assert.match(menu,/id:"hod-inbox",label:"Pending Review"/);
  assert.doesNotMatch(menu,/id:"hod-pending"/);
  assert.match(read('src/App.jsx'),/path="hod\/pending"/);
});

test('timeline derives next role Account Officer from pinned workflow, never by guess',()=>{
  const example={raw:{currentStep:{id:2,sequence:2,step_name:'HOD Review'},
    approvalCircle:{steps:[
      {id:1,sequence:1,step_name:'Initial Review',required_role_code:'HOD'},
      {id:2,sequence:2,step_name:'HOD Review',required_role_code:'HOD'},
      {id:3,sequence:3,step_name:'Institution Approval',required_role_code:'AO'}
    ]},submittedBy:{name:'Officer A'},submittedAt:'2026-10-23T12:00:00+03:00'}};
  const journey=reviewWorkflow(example);
  assert.equal(journey.current.label,'HOD Review');
  assert.equal(journey.next.role,'Account Officer');
  assert.equal(journey.next.label,'Institution Approval');
  assert.equal(journey.hasNext,true);
  const unknown=reviewWorkflow({raw:{currentStep:{step_name:'HOD Review'}}});
  assert.equal(unknown.hasNext,false);
  assert.equal(unknown.next.role,'');
});
