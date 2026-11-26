import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {additiveIndicator, categoriesForIndicator, validateHodIndicator, reviewValueIssues} from '../src/utils/hodReviewRules.js';

const staff={id:8,label:'Number of Staff',type:'text',raw:{}};
const dims=[
  {dimensionId:2,indicatorId:8,dimension:{id:2,nameEn:'By Gender',options:[{id:3,nameEn:'Male'},{id:4,nameEn:'Female'}]}},
  {dimensionId:4,indicatorIds:[8],dimension:{id:4,nameEn:'By Role',options:[{id:8,nameEn:'Academic'},{id:9,nameEn:'Administrative'}]}},
];
const breakdown={'8:2:3':'30','8:2:4':'20','8:4:8':'35','8:4:9':'15'};

test('Staff count validates in real time even when snapshot dataType is missing',()=>{
  assert.equal(additiveIndicator(staff),true);
  const categories=categoriesForIndicator(dims,8,breakdown);
  assert.deepEqual(categories.map(c=>c.name),['By Gender','By Role']);
  assert.deepEqual(validateHodIndicator(staff,categories,{8:'50'},breakdown).map(x=>x.valid),[true,true]);
  const changed={...breakdown,'8:2:4':'15'};
  const rows=validateHodIndicator(staff,categories,{8:'50'},changed);
  assert.equal(rows[0].total,45);
  assert.equal(rows[0].valid,false);
  assert.match(rows[0].reason,/45 \/ 50.*Missing 5/);
  assert.equal(rows[1].valid,true);
  assert.deepEqual(reviewValueIssues([staff],dims,{8:'50'},changed).map(r=>r.name),['By Gender']);
});

test('Value change updates both category sums and rejects mismatch immediately',()=>{
  const errors=reviewValueIssues([staff],dims,{8:'51'},breakdown);
  assert.equal(errors.length,2);
  assert.ok(errors.every(x=>x.reason.includes('50 / 51')));
  assert.equal(reviewValueIssues([staff],dims,{8:'50'},breakdown).length,0);
});

test('Unverified saved breakdown options cannot be treated as matched',()=>{
  const fallback=categoriesForIndicator([],8,breakdown);
  assert.equal(fallback.length,2);
  assert.equal(fallback.every(c=>c.optionsKnown===false),true);
  const errors=reviewValueIssues([staff],[],{8:'50'},breakdown);
  assert.equal(errors.length,2);
  assert.ok(errors.every(e=>/cannot be verified/.test(e.reason)));
});

test('Non-additive percentage and average indicators are not forced to sum',()=>{
  assert.equal(additiveIndicator({id:9,label:'Average Staff Salary',type:'number',precision:2}),false);
  assert.equal(additiveIndicator({id:10,label:'Percentage of Staff',type:'number',precision:0}),false);
  const categories=categoriesForIndicator(dims,8,breakdown);
  assert.equal(validateHodIndicator({id:8,label:'Percentage of Staff'},categories,{8:'50'},breakdown)
    .every(r=>r.valid&&r.enforced===false),true);
});

test('HOD and Data Entry show live errors and prevent invalid review writes',()=>{
  const ui=readFileSync('src/pages/HOD/HodReview.jsx','utf8');
  const service=readFileSync('src/services/hodReviewService.jsx','utf8');
  assert.match(ui,/reviewValueIssues\(indicators,dimensions,values,dimensionValues\)/);
  assert.match(ui,/disabled=\{working\|\|!changed\|\|issues.length>0\}/);
  assert.match(ui,/aria-invalid=\{checked.some\(item=>!item.valid\)\}/);
  assert.match(service,/if\(issues.length\) throw new Error/);
  const dataEntry=readFileSync('src/pages/DataEntry/DataEntry.jsx','utf8');
  assert.match(dataEntry,/validateHodIndicator/);
});
