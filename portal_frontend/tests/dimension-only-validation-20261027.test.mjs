import test from 'node:test';
import assert from 'node:assert/strict';
import {dimensionIndicatorIssues,dimensionsForIndicator} from '../src/utils/dimensionValidation.js';
import {reviewValueIssues} from '../src/utils/hodReviewRules.js';

const dims=[{id:2,dimensionId:2,isRequired:true,indicatorIds:[9],dimension:{id:2,nameEn:'By Gender',options:[{id:3,name_en:'Male'},{id:4,name_en:'Female'}]}}];
const plain={key:'8',id:8,label:'Number of machines tested',type:'number',precision:0,required:true,raw:{aggregationRule:'sum'}};
const staff={key:'9',id:9,label:'Number of staff',type:'number',precision:0,required:true};

test('indicator without a dimension passes as entered', () => {
  assert.deepEqual(dimensionsForIndicator(dims,'8'),[]);
  assert.deepEqual(dimensionIndicatorIssues({indicator:plain,definitions:dims,values:{8:''},fieldError:'Number of machines tested is required.'}),[]);
  assert.deepEqual(dimensionIndicatorIssues({indicator:plain,definitions:dims,values:{8:'12.5'},fieldError:'must be a whole number'}),[]);
});
test('indicator with a dimension must be complete and add up', () => {
  assert.equal(dimensionsForIndicator(dims,'9').length,1);
  const empty=dimensionIndicatorIssues({indicator:staff,definitions:dims,values:{9:'340'},dimensionValues:{}});
  assert.match(empty[0][1],/enter at least one value for By Gender/);
  const wrong=dimensionIndicatorIssues({indicator:staff,definitions:dims,values:{9:'340'},dimensionValues:{'9:2:3':'190','9:2:4':'100'}});
  assert.match(wrong.map(x=>x[1]).join(' '),/290 \/ 340/);
  const ok=dimensionIndicatorIssues({indicator:staff,definitions:dims,values:{9:'340'},dimensionValues:{'9:2:3':'190','9:2:4':'150'}});
  assert.deepEqual(ok,[]);
  const missingTotal=dimensionIndicatorIssues({indicator:staff,definitions:dims,values:{},dimensionValues:{'9:2:3':'1','9:2:4':'1'},fieldError:'Number of staff is required.'});
  assert.equal(missingTotal[0][1],'Number of staff is required.');
});
test('HOD / MDO / MDD gate ignores saved breakdowns on an indicator with no assigned dimension', () => {
  const issues=reviewValueIssues([plain,staff],dims,{8:'50',9:'340'},{'8:7:1':'10','9:2:3':'190','9:2:4':'150'});
  assert.deepEqual(issues,[]);
  assert.equal(reviewValueIssues([staff],dims,{9:'340'},{'9:2:3':'190','9:2:4':'10'}).length,1);
});
