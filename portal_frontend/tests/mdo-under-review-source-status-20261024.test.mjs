import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  isMdoPending,canMdoReview,sourceOf,withDatasetOwnership
} from '../src/utils/mdoReviewRules.js';
import {normalizeSubmissionRecord} from '../src/utils/submissionValues.js';

const user={id:51,roles:[{code:'MDO'}],permissions:['submissions.review']};
const detail=(extra={})=>normalizeSubmissionRecord({
  id:111,datasetId:6,status:'under_review',revision:3,
  currentStep:{sequence:1,required_role_code:'MDO',action:'review',assignedUserId:51,can_return:true},
  allowedActions:['review','return'],submittedById:16,...extra,
});

test('Laravel under_review plus required_role_code MDO is the queue criterion',()=>{
  const row=detail();
  assert.equal(row.status,'under_review');
  assert.equal(isMdoPending(row),true);
  assert.equal(canMdoReview(row,user),true);
  assert.equal(isMdoPending(detail({currentStep:{required_role_code:'MDD',action:'publish'}})),false);
  assert.equal(isMdoPending(detail({status:'returned'})),false);
  assert.equal(isMdoPending(detail({status:'draft'})),false);
});

test('Pending label does not depend on allowedActions or local user permission',()=>{
  const record=detail({allowedActions:[]});
  assert.equal(isMdoPending(record),true);
  assert.equal(canMdoReview(record,user),false);
  assert.equal(isMdoPending({...record,raw:{...record.raw,allowedActions:undefined}}),true);
});

test('Dataset registry ownership links a submitted row when Laravel detail lacks institutionId',()=>{
  const row=detail();
  assert.deepEqual(sourceOf(row),{institutionId:null,departmentId:null,institutionName:'',departmentName:''});
  const linked=withDatasetOwnership(row,{id:6,institutionId:2,departmentId:17});
  assert.equal(sourceOf(linked).institutionId,2);
  assert.equal(sourceOf(linked).departmentId,17);
  assert.equal(linked.id,111);
  assert.equal(linked.status,'under_review');
  assert.equal(isMdoPending(linked),true);
  assert.equal(canMdoReview(linked,user),true);
});

test('Do not overwrite backend ownership with an unrelated dataset registry owner',()=>{
  const actual=detail({institutionId:9,departmentId:18});
  assert.equal(withDatasetOwnership(actual,{id:6,institutionId:2,departmentId:17}),actual);
  assert.deepEqual(sourceOf(withDatasetOwnership(actual,{id:6,institutionId:2,departmentId:17})),{
    institutionId:9,departmentId:18,institutionName:'',departmentName:''
  });
});

test('MDO UI uses workflow pending status, not action gate, for badges and list rows',()=>{
  const page=readFileSync(new URL('../src/pages/MDO/MdoWorkspace.jsx',import.meta.url),'utf8');
  const service=readFileSync(new URL('../src/services/mdoReviewService.jsx',import.meta.url),'utf8');
  assert.match(page,/pending:scoped\.filter\(isMdoPending\)/);
  assert.match(page,/const pending=submissions\.find\(isMdoPending\)/);
  assert.match(page,/status:pending\?'Pending Review'/);
  assert.match(page,/const record=row\.displayed/);
  assert.match(service,/withDatasetOwnership\(record,ownersByDataset\.get/);
});
