import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildHodReviewPatch,hodPatchMatches} from '../src/utils/hodReviewPatch.js';
import {validateHodIndicator} from '../src/utils/hodReviewRules.js';
import {reviewWorkflow} from '../src/utils/hodApprovalPresentation.js';
const read=path=>readFileSync(`src/${path}`,'utf8');
const old={values:{8:'123',9:'5'},remarks:{8:'Original'},dimensionValues:{'8:2:3':'70','8:2:4':'53'}};
test('HOD correction uses confirmed PATCH expectedRevision/reason/values, never PUT Draft',()=>{
  const payload=buildHodReviewPatch({expectedRevision:1,reason:'Kusahihisha idadi ya staff iliyokosewa.',original:old,
    values:{8:'125',9:'5'},remarks:old.remarks,dimensionValues:old.dimensionValues});
  assert.deepEqual(payload,{expectedRevision:1,reason:'Kusahihisha idadi ya staff iliyokosewa.',values:[{indicatorId:8,value:'125'}]});
  assert.match(read('API/submission.jsx'),/api\.patch\(path,payload\)/);
  const service=read('services/hodReviewService.jsx');
  assert.match(service,/patchSubmissionReviewValues\(id,payload\)/);
  assert.doesNotMatch(service,/putSubmissionValues\(id,payload\)/);
});
test('HOD correction keeps multiple breakdown categories when officer edited them',()=>{
  const payload=buildHodReviewPatch({expectedRevision:2,reason:'Correcting breakdown totals',
    original:{values:{8:'50'},dimensionValues:{'8:2:3':'30','8:2:4':'20','8:4:8':'35','8:4:9':'15'}},
    values:{8:'50'},dimensionValues:{'8:2:3':'31','8:2:4':'19','8:4:8':'35','8:4:9':'15'}});
  assert.deepEqual(payload.values[0].breakdowns,[{dimensionId:2,optionId:3,value:'31'},{dimensionId:2,optionId:4,value:'19'},{dimensionId:4,optionId:8,value:'35'},{dimensionId:4,optionId:9,value:'15'}]);
  assert.equal(hodPatchMatches({valuesProvided:true,values:{8:'50'},remarks:{},dimensionValues:{'8:2:3':'31','8:2:4':'19','8:4:8':'35','8:4:9':'15'}},payload),true);
});
test('HOD PATCH fails early without reason, invalid revision or any changes',()=>{
  assert.throws(()=>buildHodReviewPatch({expectedRevision:1,reason:'',original:old,values:{8:'125'}}),/Reason/);
  assert.throws(()=>buildHodReviewPatch({expectedRevision:undefined,reason:'corrected',original:old,values:{8:'125'}}),/expectedRevision/);
  assert.throws(()=>buildHodReviewPatch({expectedRevision:1,reason:'corrected',original:old,values:old.values,remarks:old.remarks,dimensionValues:old.dimensionValues}),/No changed/);
});
test('live count validation blocks mismatch per category and validates each independently',()=>{
  const indicator={id:8,label:'Number of Staff',type:'number',precision:0};
  const categories=[{id:2,name:'By Gender',options:[{id:3},{id:4}]},{id:4,name:'By Role',options:[{id:8},{id:9}]}];
  const values={8:'50'};
  const good=validateHodIndicator(indicator,categories,values,{'8:2:3':'30','8:2:4':'20','8:4:8':'35','8:4:9':'15'});
  assert.deepEqual(good.map(x=>x.valid),[true,true]);
  const bad=validateHodIndicator(indicator,categories,values,{'8:2:3':'30','8:2:4':'15','8:4:8':'35','8:4:9':'15'});
  assert.deepEqual(bad.map(x=>x.valid),[false,true]);
  const decimals=validateHodIndicator(indicator,categories,values,{'8:2:3':'30.5','8:2:4':'19.5','8:4:8':'35','8:4:9':'15'});
  assert.equal(decimals[0].valid,false);
  assert.match(read('pages/DataEntry/DataEntry.jsx'),/setTouched\(true\); \/\/ Immediately show inline/);
  assert.match(read('pages/DataEntry/DataEntry.jsx'),/validateCurrent\(\)/);
});
test('notification bell is popup and page uses sourced Laravel calls',()=>{
  const bell=read('components/NotificationBell.jsx');
  const topbar=read('components/Topbar.jsx');
  assert.match(topbar,/<NotificationBell unreadCount=\{unreadCount\}/);
  assert.match(bell,/aria-haspopup="dialog"/);
  assert.match(bell,/getNotifications\(/);
  assert.match(bell,/markNotificationRead\(/);
  assert.match(bell,/View all notifications/);
  assert.doesNotMatch(topbar,/to="\/dashboard\/notifications"\s+className="portal-topbar-icon-button/);
  assert.match(read('pages/Notifications/Notifications.css'),/\.vi-notifications-columns/);
});
test('HOD Inbox and Review use identical three-stage approval timeline and AO role mapping',()=>{
  const timeline=read('pages/HOD/HodApprovalJourney.jsx');
  assert.match(timeline,/Submitted/);assert.match(timeline,/Under Review \(Current\)/);assert.match(timeline,/Next Step/);
  assert.match(read('pages/HOD/HodInbox.jsx'),/<HodApprovalJourney record=\{selectedDetail\|\|selected\}/);
  assert.match(read('pages/HOD/HodReview.jsx'),/<HodApprovalJourney record=\{record\}/);
  const flow=reviewWorkflow({raw:{currentStep:{sequence:2},approvalCircle:{steps:[{sequence:1,required_role_code:'HOD'},{sequence:2,required_role_code:'HOD'},{sequence:3,required_role_code:'AO'}]}}});
  assert.equal(flow.next.role,'Account Officer');
});
