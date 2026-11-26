import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {isHodReviewer,reviewerAssignment,hodInboxRows,validateHodIndicator,
  categoriesForIndicator,additiveIndicator} from '../src/utils/hodReviewRules.js';
import {buildSubmissionValuesPayload} from '../src/utils/submissionValues.js';
const src = file => readFileSync(new URL(file,import.meta.url),'utf8');
const user={id:18,roles:[{code:'HOD'}],role_code:'HOD',permissions:['dashboard.view','submissions.review']};
const record=(id,assignee,status='Submitted')=>({id,status,raw:{currentStep:{assignedUserId:assignee}}});

test('HOD role AND permission required; IA/IDO cannot open HOD workspace',()=>{
  assert.equal(isHodReviewer(user),true);
  assert.equal(isHodReviewer({...user,permissions:[]}),false);
  assert.equal(isHodReviewer({...user,role_code:'IDO',roles:[{code:'IDO'}]}),false);
});
test('inbox only sees current personally assigned submissions, not every institution record',()=>{
  const records=[record(1,18),record(2,19),record(3,null),record(4,18,'Draft')];
  assert.deepEqual(hodInboxRows(records,user).map(r=>r.id),[1]);
  assert.equal(reviewerAssignment(record(5,null),user).assigned,false);
});
test('independent category totals match indicator overall total; do not sum Gender+Role',()=>{
  const indicator={id:8,key:'8',type:'number',precision:0,label:'Number of Staff'};
  const cats=[{id:2,name:'By Gender',options:[{id:3},{id:4}]},
              {id:4,name:'By Role',options:[{id:8},{id:9}]}];
  const valid=validateHodIndicator(indicator,cats,{'8':'50'},
    {'8:2:3':'30','8:2:4':'20','8:4:8':'35','8:4:9':'15'});
  assert.ok(valid.every(row=>row.valid));
  const bad=validateHodIndicator(indicator,cats,{'8':'50'},
    {'8:2:3':'30','8:2:4':'15','8:4:8':'35','8:4:9':'15'});
  assert.equal(bad[0].valid,false);assert.equal(bad[1].valid,true);
  assert.match(bad[0].reason,/45.*50/);
});
test('non-additive indicator is not forced to equal category sums',()=>{
  const indicator={id:8,key:'8',type:'number',precision:6,label:'Average Wage'};
  assert.equal(additiveIndicator(indicator),false);
  assert.equal(validateHodIndicator(indicator,[{id:2,name:'Locations',options:[{id:3}]}],{'8':'5'}, {'8:2:3':'10'})[0].valid,true);
});
test('Laravel dimension attachments preserve separate categories and option IDs',()=>{
  const cats=categoriesForIndicator([{dimensionId:2,indicatorIds:[8],dimension:{nameEn:'By Gender',options:[{id:3,name_en:'Male'}]}},
    {dimensionId:4,indicatorIds:[8],dimension:{nameEn:'By Role',options:[{id:8,name_en:'Academic'}]}},
    {dimensionId:5,indicatorIds:[7],dimension:{nameEn:'Other',options:[]}}],8);
  assert.deepEqual(cats.map(x=>x.id),[2,4]);
});
test('Data Officer saving uses confirmed Laravel PUT values body, with separate breakdown values',()=>{
  const payload=buildSubmissionValuesPayload({expectedRevision:4,values:{8:'50'},remarks:{8:'Reviewed'},
    dimensionValues:{'8:2:3':'30','8:2:4':'20','8:4:8':'35','8:4:9':'15'}});
  assert.deepEqual(payload.values,[{indicatorId:8,value:'50',remarks:'Reviewed',breakdowns:[
    {dimensionId:2,optionId:3,value:'30'},{dimensionId:2,optionId:4,value:'20'},
    {dimensionId:4,optionId:8,value:'35'},{dimensionId:4,optionId:9,value:'15'}]}]);
});
test('new HOD routes and user menu are wired without moving old submission routes',()=>{
  const app=src('../src/App.jsx');const menu=src('../src/config/sidebarMenu.js');
  for(const path of ['hod/inbox','hod/history','hod/review/:id'])assert.ok(app.includes(`path="${path}"`));
  assert.ok(menu.includes('submissions.review'));
  assert.ok(menu.includes('Pending Review'));
  assert.ok(!menu.includes('Approval Inbox'));
  assert.ok(app.includes('path="submissions/new"'));
});
test('HOD Return has required feedback and approval actions isolated in service',()=>{
  const review=src('../src/pages/HOD/HodReview.jsx'), service=src('../src/services/hodReviewService.jsx');
  assert.match(review,/action==='return' && !comment\.trim\(\)/);
  assert.match(service,/postSubmissionApprovalAction\(id,action/);
  assert.match(service,/confirmed on 23 October 2026|CONFIRMED HOD ROUTING FLOW/);
  assert.match(service,/getHodSubmission\(id,user\)/);
});
