import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildSubmissionValuesPayload,hasEnteredSubmissionValues,normalizeSubmissionRecord,savedValuesMatch} from '../src/utils/submissionValues.js';
const source = file => readFileSync(new URL('../src/'+file, import.meta.url), 'utf8');

test('Laravel nested-key 422: values[0] is an associative row object with required indicatorId and present value', () => {
 const payload=buildSubmissionValuesPayload({expectedRevision:2, values:{8:'20',9:'0'},remarks:{8:'Confirmed'},dimensionValues:{'8:3:14':'5'}});
 const json=JSON.parse(JSON.stringify(payload));
 assert.equal(json.expectedRevision,2);
 assert.ok(Array.isArray(json.values));
 assert.ok(json.values.every(row => row && typeof row === 'object' && !Array.isArray(row)));
 assert.ok(json.values.every(row => Object.hasOwn(row, 'indicatorId') && Object.hasOwn(row, 'value')));
 assert.deepEqual(json.values[0],{indicatorId:8,value:'20',remarks:'Confirmed',breakdowns:[{dimensionId:3,optionId:14,value:'5'}]});
 assert.deepEqual(json.values[1],{indicatorId:9,value:'0'});
 assert.equal(json.values.length,2);
});
test('empty draft does not invent indicator values, zero remains user-entered', () => {
 assert.equal(hasEnteredSubmissionValues({}),false);
 assert.equal(hasEnteredSubmissionValues({values:{8:''},remarks:{8:'  '}}),false);
 assert.equal(hasEnteredSubmissionValues({values:{8:'0'}}),true);
 assert.equal(hasEnteredSubmissionValues({dimensionValues:{'8:3:14':4}}),true);
 const service=source('services/idoSubmissionService.jsx');
 assert.match(service,/const enteredValues = hasEnteredSubmissionValues\(\{values,remarks,dimensionValues\}\);[\s\S]*if \(!enteredValues && !annualTargets\.length && !objective && !performance\)/);
 assert.match(service,/draftOnly:true/);
 assert.match(service,/nothing was overwritten/);
});
test('read-back normalization supports prior responses and does not claim success if values missing', () => {
 const record=normalizeSubmissionRecord({data:{id:1,status:'draft',values:[[{indicatorId:8,value:'20',remarks:'Confirmed',dimensions:[{dimensionId:3,optionId:14,value:'5'}]}]]}});
 assert.equal(record.values['8'],'20');
 assert.equal(record.remarks['8'],'Confirmed');
 assert.equal(record.dimensionValues['8:3:14'],'5');
 assert.ok(savedValuesMatch(record,{8:20},{8:'Confirmed'},{'8:3:14':5}));
 assert.ok(!savedValuesMatch(normalizeSubmissionRecord({data:{id:1,status:'draft'}}),{8:20},{},{}));
});
test('exact PUT URL spelling remains lowercase and plural',()=>{
 const api=source('API/submission.jsx');
 assert.match(api,/api\.put\(`\/submissions\/\$\{checkedId\(id\)\}\/values`, payload\)/);
 assert.doesNotMatch(api,/\/Submissions\//);
 assert.doesNotMatch(api,/\/submissions\/\$\{checkedId\(id\)\}\/value`/);
});
