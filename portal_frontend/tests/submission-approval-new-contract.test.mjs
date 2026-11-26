import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {checkedDatasetId,workflowFailure} from '../src/utils/submissionWorkflowTrace.js';
import {approvalCirclePayload} from '../src/utils/approvalCircleContract.js';
import {submissionContextPayload,reportingCalendarIdFromResponse} from '../src/utils/submissionContext.js';
const get=f=>readFileSync(new URL(`../src/${f}`,import.meta.url),'utf8');
test('Dataset ID in POST URL must be numeric Laravel master dataset ID',()=>{
 assert.equal(checkedDatasetId('6'),6);
 for(const invalid of ['',0,'not-an-id',undefined,-2])assert.throws(()=>checkedDatasetId(invalid),/Select a dataset/);
 const code=get('pages/DataEntry/DataEntry.jsx');
 assert.match(code,/selectedDatasetId=Number\(datasetId\)/);
 assert.match(code,/createSubmissionContext\(selectedDatasetId/);
 assert.doesNotMatch(code,/createSubmissionContext\(period\.id/);
});
test('context body contains only the three documented fields',()=>{
 const body=submissionContextPayload({financialYear:'2026/2027',frequency:'quarterly',period:{periodNumber:2}});
 assert.deepEqual(body,{startYear:2026,frequency:'quarterly',periodNumber:2});
});
test('read response nested calendar ID and reject mismatched dataset ID',()=>{
 assert.equal(reportingCalendarIdFromResponse({data:{reportingCalendarId:9,datasetId:6}},6),9);
 assert.throws(()=>reportingCalendarIdFromResponse({data:{reportingCalendarId:9,datasetId:999}},6),/different dataset/);
 assert.equal(reportingCalendarIdFromResponse({data:{reportingCalendar:{id:9,datasetId:6}}},6),9);
});
test('API errors show backend message without exposing the failed route or HTTP status',()=>{
 const err=workflowFailure('SUBMISSION CONTEXT','/datasets/6/submission-context',{
   response:{status:422,data:{message:'Validation failed',errors:{periodNumber:['The selected period is invalid.']}}}
 });
 assert.equal(err.message,'Validation failed');
 assert.equal(err.response.status,422);
 assert.equal(err.workflowStage,'SUBMISSION CONTEXT');
 assert.doesNotMatch(err.message,/Bearer/);
});
test('MOA creates ministry only and never posts forbidden institution/department/scope',()=>{
 const body=approvalCirclePayload({name:'Ministry Approval', institution_id:12,scope_key:'wrong',steps:[
  {step_name:'Ministry Review',required_role_code:'MDO',action:'review',assigned_user_id:55},
  {step_name:'Ministry Approval',required_role_code:'MDD',action:'approve'},
  {step_name:'Publication',required_role_code:'MDD',action:'publish'}
 ]},'ministry');
 assert.equal(body.steps.length,3);
 for(const key of ['institution_id','department_id','scope_key'])assert.equal(Object.hasOwn(body,key),false);
 assert.ok(body.steps.every(step=>step.level==='ministry' && !Object.hasOwn(step,'assigned_user_id')));
 assert.equal(body.steps[2].action,'publish');
});
test('IA approvers are institution-only and cannot publish',()=>{
 const body=approvalCirclePayload({name:'IA',institution_id:22,steps:[
   {step_name:'HOD review',required_role_code:'HOD',action:'review',assigned_user_id:15},
   {step_name:'IA approve',required_role_code:'DDO',action:'approve'}
 ]},'institution');
 assert.equal(body.steps[0].assigned_user_id,15);
 assert.ok(body.steps.every(step=>step.level==='institution'));
 assert.equal(Object.hasOwn(body,'institution_id'),false);
 assert.throws(()=>approvalCirclePayload({name:'bad',steps:[{step_name:'a',required_role_code:'x',action:'publish'}]},'institution'),/cannot publish/);
});
test('Approval API has confirmed PUT /activate /clone and matches role scope',()=>{
 const code=get('API/approvalCircle.jsx');
 for(const fragment of ['replaceApprovalCircle','activateApprovalCircle','cloneApprovalCircle','approvalCirclePayload(fields,scope)'])assert.ok(code.includes(fragment),fragment);
 const ui=get('pages/Admin/ApprovalCircle.jsx');
 assert.match(ui,/cloneForEdit/);
 assert.match(ui,/scope==='ministry'\?'Ministry/);
 assert.doesNotMatch(ui,/payload=\{name:form\.name,institution_id:/);
});
