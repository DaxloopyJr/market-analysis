import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {confirmedHodActionReceipt,recordedReviewActions} from '../src/utils/hodReviewActionDisplay.js';
import {loadVerifiedHodHistory} from '../src/utils/hodHistoryData.js';

const reviewer={id:18,role_code:'HOD',roles:[{code:'HOD'}],permissions:['submissions.review']};

test('POST /review confirmed receipt includes id, revision, next AO and action comment',()=>{
 const receipt=confirmedHodActionReceipt({id:105,action:'review',comments:'Taarifa zimehakikiwa',
  confirmation:{confirmed:{id:105,status:'under_review',revision:8,
  currentStep:{sequence:2,required_role_code:'AO',action:'approve'}}}});
 assert.equal(receipt.label,'Reviewed & Forwarded');
 assert.equal(receipt.submissionId,105);
 assert.equal(receipt.revision,8);
 assert.equal(receipt.nextReviewer,'Account Officer');
 assert.equal(receipt.comments,'Taarifa zimehakikiwa');
});
test('Return receipt captures action and deadline from Laravel',()=>{
 const receipt=confirmedHodActionReceipt({id:105,action:'return',comments:'Masahihisho',
  confirmation:{confirmed:{id:105,status:'returned',revision:9,currentStep:null,correctionDeadline:'2026-10-30'}}});
 assert.equal(receipt.label,'Returned for Correction');
 assert.equal(receipt.correctionDeadline,'2026-10-30');
 assert.equal(receipt.nextReviewer,'');
});
test('No unverified receipt for wrong submission ID or absent revision',()=>{
 assert.throws(()=>confirmedHodActionReceipt({id:105,action:'review',confirmation:{confirmed:{id:106,revision:9}}}),/did not confirm/);
 assert.throws(()=>confirmedHodActionReceipt({id:105,action:'review',confirmation:{confirmed:{id:105}}}),/did not confirm/);
});
test('Review action history uses Laravel comments plural and actor/createdAt',()=>{
 const events=recordedReviewActions({raw:{history:[
   {id:2,action:'review',comments:'Taarifa zimehakikiwa',actor:{id:18,name:'HOD Amina'},createdAt:'2026-10-23T12:00:00+03:00'},
   {id:3,action:'return',comment:'Fix totals',user:{id:18,name:'HOD Amina'}}
 ]}});
 assert.equal(events[0].comments,'Taarifa zimehakikiwa');
 assert.equal(events[0].actor,'HOD Amina');
 assert.equal(events[1].comments,'Fix totals');
});
test('Review History hydrates detail records, filters only current HOD actions',async()=>{
 const list=[{id:105,status:'under_review',raw:{}},{id:106,status:'approved',raw:{}},{id:107,status:'submitted',raw:{}}];
 const requests=[];
 const detail=async(id)=>{
   requests.push(id);
   if(id===107)throw Object.assign(new Error('Forbidden'),{status:403});
   return {data:{id,status:'under_review',history:[
     {action:'review',userId:id===105?18:99,comments:'Review done'}]}};
 };
 const result=await loadVerifiedHodHistory(list,reviewer,detail);
 assert.deepEqual(result.map(x=>x.id),[105]);
 assert.deepEqual(requests,[105,106,107]);
 assert.equal(result[0].history[0].comments,'Review done');
});
test('Forward routes to History and SweetAlert is shown after navigation, not before unmount',()=>{
 const review=readFileSync('src/pages/HOD/HodReview.jsx','utf8');
 const history=readFileSync('src/pages/HOD/HodReviewed.jsx','utf8');
 assert.match(review,/navigate\('\/dashboard\/hod\/history',\{state:\{hodReviewAction:receipt\}\}\)/);
 assert.doesNotMatch(review,/showPortalToast\(\{type:'success',title:isReturn/);
 assert.match(history,/void showPortalToast\(\{type:'success',title:receipt\.label/);
 assert.match(history,/getHodSubmissions\(user,\{history:true\}\)/);
 assert.match(history,/RowActionsMenu/);
});
