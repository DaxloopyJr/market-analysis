import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildSubmissionValuesPayload} from '../src/utils/submissionValues.js';

const read=path=>readFileSync(new URL(`../src/${path}`,import.meta.url),'utf8');

// Regression: Laravel's two endpoints have DIFFERENT purposes. The POST body
// contains expectedRevision only; the values, remarks and multi-dimension
// breakdowns MUST be PUT and confirmed immediately BEFORE that POST.
test('Submit UI unconditionally saves and verifies full values before final POST',()=>{
  const component=read('pages/DataEntry/DataEntry.jsx');
  const start=component.indexOf('  async function submitForReview() {');
  const end=component.indexOf('\n  if (loading) return',start);
  assert.ok(start>=0 && end>start,'expected submit handler');
  const handler=component.slice(start,end);
  assert.match(handler,/const saved=await persistDraft\(\{quiet:true\}\)/);
  assert.match(handler,/if\(!saved\)return/);
  assert.match(handler,/if\(saved\.draftOnly\)/);
  assert.match(handler,/const id=Number\(saved\.id\)/);
  assert.match(handler,/const result=await submitDraft\(id\)/);
  assert.ok(handler.indexOf('persistDraft({quiet:true})')<handler.indexOf('submitDraft(id)'),
    'PUT/read-back must complete before POST');
  assert.doesNotMatch(handler,/if\s*\(\s*!id\s*\|\|\s*hasUnsavedChanges/,
    'Never skip PUT based on browser-local saved/dirty flags');
  assert.match(handler,/hasEnteredSubmissionValues/);
});

test('Draft persistence uses PUT values and GET read-back, final submit only moves workflow',()=>{
  const service=read('services/idoSubmissionService.jsx');
  const api=read('API/submission.jsx');
  const save=service.slice(service.indexOf('export async function saveDraft'),service.indexOf('export async function submitDraft'));
  assert.match(save,/buildSubmissionValuesPayload\(\{expectedRevision,values,remarks,dimensionValues,annualTargets,objective,performance\}\)/);
  assert.match(save,/await putSubmissionValues\(id,payload\)/);
  assert.match(save,/await getSubmissionById\(null,id\)/);
  assert.match(save,/savedValuesMatch/);
  const submit=service.slice(service.indexOf('export async function submitDraft'));
  assert.match(submit,/const before=await getSubmissionById\(null,id\)/);
  assert.match(submit,/await postSubmitSubmission\(id,\{expectedRevision\}\)/);
  assert.match(api,/api\.post\(path, \{expectedRevision:Number\(expectedRevision\)\}\)/);
});

test('PUT has all values/remarks/option breakdowns exactly as supplied by backend',()=>{
  const request=buildSubmissionValuesPayload({
    expectedRevision:4,
    values:{8:'123'},
    remarks:{8:'Idadi ya staff mwisho wa kipindi'},
    dimensionValues:{'8:2:3':'70','8:2:4':'23','8:2:5':'30','8:4:8':'73','8:4:9':'50'},
  });
  assert.deepEqual(request,{expectedRevision:4,values:[{
    indicatorId:8,value:'123',remarks:'Idadi ya staff mwisho wa kipindi',
    breakdowns:[
      {dimensionId:2,optionId:3,value:'70'},
      {dimensionId:2,optionId:4,value:'23'},
      {dimensionId:2,optionId:5,value:'30'},
      {dimensionId:4,optionId:8,value:'73'},
      {dimensionId:4,optionId:9,value:'50'},
    ],
  }]});
});
