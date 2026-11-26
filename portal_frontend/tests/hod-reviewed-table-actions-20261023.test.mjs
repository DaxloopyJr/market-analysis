import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {canHodReopenReturned} from '../src/utils/hodReviewRules.js';
import {ownHodReviewEvents,latestHodReviewAction,reviewedSubmissionStatus,reviewedSubmissionAt} from '../src/utils/hodReviewedModel.js';
const read=p=>readFileSync(p,'utf8');
const hod={id:17,role_code:'HOD'};
const data={id:9,status:'under_review',raw:{history:[
  {id:1,action:'review',userId:17,comments:'Okay',createdAt:'2026-10-23T09:30:00+03:00'},
  {id:2,action:'return',userId:17,comments:'Correct totals',createdAt:'2026-10-23T11:30:00+03:00'},
  {id:3,action:'approve',userId:99,comments:'Not this HOD',createdAt:'2026-10-23T12:30:00+03:00'}
]}};
test('Reviewed table reads actions only from current HOD and displays last verified action',()=>{
  assert.equal(ownHodReviewEvents(data,hod).length,2);
  assert.equal(latestHodReviewAction(data,hod).comments,'Correct totals');
  assert.equal(reviewedSubmissionStatus(data,hod),'Returned');
  assert.equal(reviewedSubmissionAt(data,hod),'2026-10-23T11:30:00+03:00');
  assert.equal(ownHodReviewEvents(data,{id:500}).length,0);
});
test('Approved table exactly matches user approved table-only layout and uses shared ⋮ icon menu',()=>{
  const component=read('src/pages/HOD/HodReviewed.jsx');
  const app=read('src/App.jsx');
  const menu=read('src/config/sidebarMenu.js');
  const shared=read('src/components/common/RowActionsMenu.jsx');
  assert.match(app,/const HodReviewed = lazy/);
  assert.match(app,/path="hod\/history" element=\{<HodAccess><HodReviewed\s*\/>/);
  assert.match(menu,/id:"hod-history",label:"Reviewed"/);
  assert.match(component,/<RowActionsMenu/);
  assert.match(shared,/<EllipsisVertical/);
  for(const item of ['Submission ID','Dataset','Reporting Period','Submitted By','Method','Reviewed On','Status','Action'])assert.ok(component.includes(item),item);
  assert.match(component,/title="View Submission"/);
  assert.match(component,/title="Review \/ Edit"/);
  assert.match(component,/title="View Review History"/);
  assert.doesNotMatch(component,/hod-inbox-stats|hod-inbox-aside|<HodApprovalJourney/);
});
test('Pending Review page and HOD review values and API contracts remain intact',()=>{
  const inbox=read('src/pages/HOD/HodInbox.jsx');
  const service=read('src/services/hodReviewService.jsx');
  assert.match(inbox,/<HodApprovalJourney/);
  assert.match(service,/patchSubmissionReviewValues/);
  assert.match(service,/postSubmissionApprovalAction/);
});

test('Returned submission is editable by HOD only when reassigned AND Laravel grants editing',()=>{
  const hodUser={id:17,role_code:'HOD',roles:[{code:'HOD'}],permissions:['submissions.review']};
  const returned={status:'returned',raw:{currentStep:{assignedUserId:17},allowedActions:['save']}};
  assert.equal(canHodReopenReturned(returned,hodUser),true);
  assert.equal(canHodReopenReturned({...returned,raw:{...returned.raw,allowedActions:[]}},hodUser),false);
  assert.equal(canHodReopenReturned({...returned,raw:{...returned.raw,currentStep:{assignedUserId:99}}},hodUser),false);
  assert.equal(canHodReopenReturned({...returned,status:'under_review'},hodUser),false);
});
