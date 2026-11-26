import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {normalizeSubmissionRecord} from '../src/utils/submissionValues.js';
import {mddGroup,mddInQueue,mddActionAllowed} from '../src/utils/mddApprovalRules.js';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const page=read('src/pages/MDD/MddWorkspace.jsx');
const style=read('src/pages/MDD/MddWorkspace.css');

test('all institution and ministry department cards remain discoverable even if pending=0',()=>{
  assert.match(page,/const visible=sources\.filter\(item=>/);
  assert.doesNotMatch(page,/relevantRows\(catalogue,sourceType,item\.id\)\.some\(mddInQueue\)/);
  assert.match(page,/const departments=ministryDepartments\(catalogue\.departments,ministry\);/);
  assert.match(page,/const sources=sourceType==='department'\?departments:catalogue\.institutions/);
});
test('MDD dataset inventory builds from definitions and preserves genuine Laravel statuses',()=>{
  assert.match(page,/for\(const definition of definitions\)/);
  assert.match(page,/for\(const record of submissions\)/);
  assert.match(page,/status:row\?mddGroup\(row,catalogue\.user\):'Not Submitted'/);
  assert.doesNotMatch(page,/item\.submissions\.filter\(r=>[\s\S]*?mddInQueue\(r\)\|\|/);
  const status=normalizeSubmissionRecord({id:17,datasetId:6,status:'under_review',currentStep:{action:'publish',required_role_code:'MDD'},allowedActions:['publish']});
  assert.equal(mddGroup(status,{id:22,roles:[{code:'MDD'}],permissions:['submissions.publish']}),'Pending Review');
  assert.equal(mddInQueue(status),true);
  assert.equal(mddGroup(normalizeSubmissionRecord({id:18,datasetId:6,status:'draft'}),null),'Draft');
});
test('universal TableLoader remains confined to positioned MDD table container',()=>{
  assert.match(style,/\.mdd-table-loading-host\{position:relative;isolation:isolate/);
  assert.match(page,/<div className="mdo-table-wrap mdd-table-loading-host" aria-busy="true">/);
  assert.match(page,/<TableLoader active label="Loading Director submissions/);
  assert.doesNotMatch(page,/<div className="mdo-surface"><TableLoader active label="Loading Director submissions/);
});
test('MDD decision submits Publish or Return; Laravel remains the only action permission authority',()=>{
  assert.match(page,/onClick=\{\(\)=>perform\('publish'\)\}/);
  assert.match(page,/onClick=\{\(\)=>setReturning\(true\)\}/);
  assert.doesNotMatch(page,/if\(canReturn\)setReturning\(true\)/);
  const user={id:22,role_code:'MDD',permissions:['submissions.publish','submissions.return']};
  const submission=normalizeSubmissionRecord({id:19,datasetId:6,status:'under_review',revision:3,
    currentStep:{required_role_code:'MDD',action:'publish',assignedUserId:22,can_return:true},allowedActions:['publish','return']});
  assert.equal(mddActionAllowed(submission,user,'publish'),true);
  assert.equal(mddActionAllowed(submission,user,'return'),true);
  assert.equal(mddActionAllowed(submission,{...user,id:44},'publish'),false);
});

test('explicit Return grant works without requiring the unrelated Approve grant',()=>{
  const user={id:42,role_code:'MDD',permissions:['submissions.publish','submissions.return']};
  const record=normalizeSubmissionRecord({id:7,status:'under_review',revision:2,
    currentStep:{required_role_code:'MDD',action:'approve',assignedUserId:42,can_return:true},
    allowedActions:['return'],submittedById:99});
  assert.equal(mddActionAllowed(record,user,'return'),true);
  assert.equal(mddActionAllowed(record,user,'publish'),false);
});
