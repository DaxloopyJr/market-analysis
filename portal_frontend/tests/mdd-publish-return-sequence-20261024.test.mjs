import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {approvalActionPayload} from '../src/utils/submissionApprovalActions.js';
import {positiveId,submissionExpectedRevision} from '../src/utils/submissionValues.js';

const doc=(step,revision,status='under_review',rights=[])=>({
  id:15,status,revision,values:{},dimensionValues:{},
  raw:{id:15,status,revision,allowedActions:rights,
    currentStep:{required_role_code:'MDO',assignedUserId:99,can_return:false,action:step}},
});
const source=readFileSync(new URL('../src/services/mddApprovalService.jsx',import.meta.url),'utf8');
const start=source.indexOf('const receiptOf =');
assert.ok(start>0);
const executable=source.slice(start).replace('export async function sendMddDecision','async function sendMddDecision');
const createService=({records,post})=>{
  const calls=[];
  const mocks={
    getMddSubmission:async()=>{
      calls.push(['GET']);
      const row=records.shift();
      if(row instanceof Error)throw row;
      return row;
    },
    submissionExpectedRevision,positiveId,approvalActionPayload,
    postPublishSubmission:async(id,payload)=>{calls.push(['publish',payload]);return post('publish',payload);},
    postReturnSubmission:async(id,payload)=>{calls.push(['return',payload]);return post('return',payload);},
  };
  const fn=new Function(...Object.keys(mocks),`${executable}; return sendMddDecision;`)(...Object.values(mocks));
  return {fn,calls};
};

test('Publish POST is sent even when currentStep says MDO review and allowedActions empty',async()=>{
  const {fn,calls}=createService({records:[doc('review',7)],post:()=>({data:{id:15,status:'published',revision:8}})});
  const outcome=await fn({id:15,action:'publish',comments:'Verified'});
  assert.equal(outcome.published,true);
  assert.deepEqual(calls.map(([method])=>method),['GET','publish']);
  assert.deepEqual(calls[1][1],{expectedRevision:7,comments:'Verified'});
});

test('Publish POST is sent even when only return is granted; Laravel rejection propagates',async()=>{
  const conflict=new Error('Laravel approval step is review');
  conflict.response={status:409,data:{message:'Current approval step does not permit publish.'}};
  const {fn,calls}=createService({records:[doc('review',3,'under_review',['return'])],post:()=>{throw conflict;}});
  await assert.rejects(()=>fn({id:15,action:'publish'}),error=>error.response.status===409);
  assert.deepEqual(calls.map(([method])=>method),['GET','publish']);
  assert.deepEqual(calls[1][1],{expectedRevision:3});
});

test('Return sends required fields even if can_return=false and MDO is current role',async()=>{
  const {fn,calls}=createService({records:[doc('review',4)],post:()=>({data:{id:15,status:'returned',revision:5}})});
  const receipt=await fn({id:15,action:'return',comments:'Please correct figures.',correctionDeadline:'2099-12-31'});
  assert.equal(receipt.status,'returned');
  assert.equal(receipt.partial,undefined);
  assert.deepEqual(calls.map(([method])=>method),['GET','return']);
  assert.deepEqual(calls[1][1],{expectedRevision:4,comments:'Please correct figures.',correctionDeadline:'2099-12-31'});
});

test('Return forwards backend error unchanged after actual POST',async()=>{
  const conflict=new Error('Return denied');
  conflict.response={status:403,data:{message:'Return is not permitted.'}};
  const {fn,calls}=createService({records:[doc('approve',2)],post:()=>{throw conflict;}});
  await assert.rejects(()=>fn({id:15,action:'return',comments:'Correct it',correctionDeadline:'2099-12-31'}),error=>error.response.data.message==='Return is not permitted.');
  assert.deepEqual(calls.map(([method])=>method),['GET','return']);
});

test('Return is not posted with an empty reason or missing deadline',async()=>{
  const {fn,calls}=createService({records:[doc('review',4)],post:()=>{throw new Error('not expected');}});
  await assert.rejects(()=>fn({id:15,action:'return',comments:'',correctionDeadline:'2099-12-31'}),/requires comments/);
  assert.deepEqual(calls.map(([method])=>method),['GET']);
});

test('Only Publish or Return offered in MDD decision; no permission guard and no approve chain',()=>{
  const page=readFileSync(new URL('../src/pages/MDD/MddWorkspace.jsx',import.meta.url),'utf8');
  assert.doesNotMatch(page,/if\(action==='publish'\?!canPublish:!canReturn\)/);
  assert.doesNotMatch(page,/if\(canReturn\)setReturning/);
  assert.doesNotMatch(page,/!canPublish/);
  assert.match(page,/onClick=\{\(\)=>perform\('publish'\)\}/);
  assert.match(page,/onClick=\{\(\)=>perform\('return'\)\}/);
  assert.match(page,/action==='return'&&receipt\.status!=='returned'/);
  assert.doesNotMatch(source,/postApproveSubmission|mddActionAllowed|mddPublishMode/);
});
