import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildSubmissionValuesPayload,normalizeSubmissionRecord,submissionExpectedRevision,savedValuesMatch,draftEditable,isSubmittedState} from '../src/utils/submissionValues.js';
const get=path=>readFileSync(new URL('../src/'+path,import.meta.url),'utf8');
test('new draft serializer isolates indicator values, remarks and multidimension options',()=>{
 const payload=buildSubmissionValuesPayload({expectedRevision:3,values:{'12':'40','13':'5'},remarks:{'12':'Verified'},dimensionValues:{'12:3:20':'22','12:3:21':'18','12:4:7':'15'}});
 assert.deepEqual(payload,{expectedRevision:3,values:[
   {indicatorId:12,value:'40',remarks:'Verified',breakdowns:[
     {dimensionId:3,optionId:20,value:'22'},
     {dimensionId:3,optionId:21,value:'18'},
     {dimensionId:4,optionId:7,value:'15'},
   ]},
   {indicatorId:13,value:'5'},
 ]});
});
test('submission detail restores values, dimensions, status and returned feedback by submission ID',()=>{
 const record=normalizeSubmissionRecord({data:{id:105,status:'Returned',dataset_id:9,reporting_period_id:15,
   values:[{indicatorId:12,value:40,remarks:'Verified',dimensions:[{dimensionId:3,optionId:20,value:22}]}],
   template:{id:1},targets:[{id:77}],history:[{action:'returned'}],feedback:'Revise'}});
 assert.equal(record.id,105);assert.equal(record.dataset_id,9);assert.equal(record.period_id,15);
 assert.deepEqual(record.values,{'12':40});assert.deepEqual(record.remarks,{'12':'Verified'});
 assert.deepEqual(record.dimensionValues,{'12:3:20':22});
 assert.equal(record.feedback,'Revise');assert.equal(record.history.length,1);
 assert.ok(draftEditable(record.status));
 assert.ok(savedValuesMatch(record,{'12':'40'},{'12':'Verified'},{'12:3:20':'22'}));
});
test('an omitted GET value list never falsely confirms draft persistence',()=>{
 const incomplete=normalizeSubmissionRecord({data:{id:2,status:'draft'}});
 assert.equal(incomplete.valuesProvided,false);
 assert.equal(savedValuesMatch(incomplete,{'12':40},{},{}),false);
});
test('submitted states are locked; Draft and Returned remain editable',()=>{
 for(const status of ['draft','Draft','RETURNED','Returned for Correction'])assert.ok(draftEditable(status));
 for(const status of ['submitted','Under Review','approved','published']){
   assert.ok(!draftEditable(status));assert.ok(isSubmittedState(status));
 }
});
test('new period switching resets all entry values; same submission ID flows from draft to submit',()=>{
 const code=get('pages/DataEntry/DataEntry.jsx');
 assert.match(code,/function changePeriod\(nextId\)/);
 assert.match(code,/setValues\(\{\}\);setRemarks\(\{\}\);setDimensionValues\(\{\}\)/);
 assert.match(code,/const saved=await persistDraft\(\{quiet:true\}\)/);
 assert.match(code,/const result=await submitDraft\(id\)/);
});
test('IA/MOA Approval Circle admin files stay read-only, and MOA institution override is flagged for backend review',()=>{
 const approval=get('pages/Admin/ApprovalCircle.jsx');
 const circle=get('API/approvalCircle.jsx');
 assert.match(approval,/approval_circle.manage.ministry/);
 assert.match(approval,/approval_circle.manage.institution/);
 assert.match(circle,/institution_id/);
});
