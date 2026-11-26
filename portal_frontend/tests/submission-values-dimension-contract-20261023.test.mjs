import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildSubmissionValuesPayload,normalizeSubmissionRecord,savedValuesMatch} from '../src/utils/submissionValues.js';

// Confirmed 23 Oct 2026 Laravel request: grouped breakdowns inside a single indicator row.
test('PUT /submissions/{id}/values sends ONE row for indicator with total, remarks and all breakdowns', () => {
  const body = buildSubmissionValuesPayload({
    expectedRevision: 4,
    values: {'8': '123'},
    remarks: {'8': 'Idadi ya staff mwisho wa kipindi'},
    dimensionValues: {
      '8:2:3': '70', '8:2:4': '23', '8:2:5': '30',
      '8:4:8': '73', '8:4:9': '50',
    },
  });
  assert.deepEqual(body, {
    expectedRevision: 4,
    values: [{
      indicatorId: 8,
      value: '123',
      remarks: 'Idadi ya staff mwisho wa kipindi',
      breakdowns: [
        {dimensionId: 2, optionId: 3, value: '70'},
        {dimensionId: 2, optionId: 4, value: '23'},
        {dimensionId: 2, optionId: 5, value: '30'},
        {dimensionId: 4, optionId: 8, value: '73'},
        {dimensionId: 4, optionId: 9, value: '50'},
      ],
    }],
  });
  assert.equal(JSON.stringify(body).includes('"dimensionValues"'), false);
  assert.equal(body.values.length,1);
});

test('multiple indicators keep totals and their breakdown categories separate',()=>{
 const body = buildSubmissionValuesPayload({expectedRevision:4,values:{8:'20',9:'0'},dimensionValues:{
   '8:2:3':'5','8:2:4':'10','8:5:9':'5','9:5:9':'0'
 }});
 assert.deepEqual(body.values,[
   {indicatorId:8,value:'20',breakdowns:[
     {dimensionId:2,optionId:3,value:'5'},
     {dimensionId:2,optionId:4,value:'10'},
     {dimensionId:5,optionId:9,value:'5'}]},
   {indicatorId:9,value:'0',breakdowns:[{dimensionId:5,optionId:9,value:'0'}]},
 ]);
});

test('GET response with new breakdowns restores total, remarks and independent option counts',()=>{
 const server=normalizeSubmissionRecord({data:{id:10,status:'draft',revision:2,values:[
  {indicatorId:8,value:'20',remarks:'OK',breakdowns:[
   {dimensionId:2,optionId:3,value:'5'},
   {dimensionId:2,optionId:4,value:'15'},
   {dimensionId:5,optionId:9,value:'0'},
  ]},
 ]}});
 assert.deepEqual(server.values,{'8':'20'});
 assert.deepEqual(server.remarks,{'8':'OK'});
 assert.deepEqual(server.dimensionValues,{'8:2:3':'5','8:2:4':'15','8:5:9':'0'});
 assert.ok(savedValuesMatch(server,{'8':'20'},{'8':'OK'},{'8:2:3':'5','8:2:4':'15','8:5:9':'0'}));
 assert.ok(!savedValuesMatch(server,{'8':'20'},{'8':'OK'},{'8:2:3':'999'}));
});

test('no unsupported dimension option identifier silently becomes an API request',()=>{
 assert.throws(()=>buildSubmissionValuesPayload({expectedRevision:1,
   dimensionValues:{'8:2:TEACHING':'1234'}}),/breakdown value could not be saved/);
});

test('context HTTP 403 remains a distinct authorization error, not a values schema error',()=>{
 const api=readFileSync(new URL('../src/API/submission.jsx',import.meta.url),'utf8');
 const dataEntry=readFileSync(new URL('../src/pages/DataEntry/DataEntry.jsx',import.meta.url),'utf8');
 assert.match(api,/api\.put\(`\/submissions\/\$\{checkedId\(id\)\}\/values`, payload\)/);
 assert.match(dataEntry,/showUserFacingError/);
 const trace=readFileSync(new URL('../src/utils/submissionWorkflowTrace.js',import.meta.url),'utf8');
 assert.match(trace,/failure\.response = error\?\.response/);
 assert.doesNotMatch(trace,/HTTP \$\{status/);
});
