import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {submissionExpectedRevision, normalizeSubmissionRecord, buildSubmissionValuesPayload} from '../src/utils/submissionValues.js';
const read=path=>readFileSync(new URL('../src/'+path, import.meta.url),'utf8');

test('revision 0 is legitimate and is not lost by truthy checks',()=>{
 assert.equal(submissionExpectedRevision({data:{id:101,status:'draft',revision:0}}),0);
 const record=normalizeSubmissionRecord({data:{id:101,status:'draft',revision:0}});
 assert.equal(record.revision,0);
 assert.deepEqual(buildSubmissionValuesPayload({expectedRevision:0,values:{'8':'5'}}),{
  expectedRevision:0, values:[{indicatorId:8,value:'5'}],
 });
});
test('camel, snake, metadata and envelope revisions are supported without guessing',()=>{
 assert.equal(submissionExpectedRevision({data:{submission:{id:5,status:'draft'},currentRevision:3}}),3);
 assert.equal(submissionExpectedRevision({meta:{revision:'12'},data:{id:5}}),12);
 assert.equal(submissionExpectedRevision({raw:{current_revision:4}}),4);
 assert.equal(submissionExpectedRevision({id:5,status:'draft'}),null);
});
test('missing or malformed revision blocks PUT construction',()=>{
 for (const invalid of [null,undefined,'',-1,'abc',1.5]) {
   assert.throws(()=>buildSubmissionValuesPayload({expectedRevision:invalid,values:{'8':'5'}}),/draft changed/);
 }
});
test('save uses GET revision then PUT; failures include each Laravel 422 field name',()=>{
 const service=read('services/idoSubmissionService.jsx');
 const api=read('API/submission.jsx');
 assert.match(service,/const expectedRevision = submissionExpectedRevision\(before\)/);
 assert.match(service,/buildSubmissionValuesPayload\(\{expectedRevision,values,remarks,dimensionValues,annualTargets,objective,performance\}\)/);
 assert.match(api,/api\.put\(`\/submissions\/\$\{checkedId\(id\)\}\/values`, payload\)/);
 assert.match(api,/validationErrors\(error\)/);
 assert.match(api,/details \|\| generic/);
 assert.match(api,/envelope:response\.data/);
 assert.match(api,/`\/submissions\/\$\{checkedId\(id\)\}\/values`/);
});
