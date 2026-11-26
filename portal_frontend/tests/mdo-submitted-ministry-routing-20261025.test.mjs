import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeSubmissionRecord} from '../src/utils/submissionValues.js';
import {isMdoPending,canMdoReview} from '../src/utils/mdoReviewRules.js';
import {mddInQueue} from '../src/utils/mddApprovalRules.js';
const mdo={id:51,roles:[{code:'MDO'}],permissions:['submissions.review']};
const response={id:1,reference:'SUB-1-3',reportingCalendarId:2,datasetId:1,reportingPeriodId:3,periodLabel:'2026/2027 Q2',workflowStage:'ministry',status:'submitted',revision:6,attempt:2,currentStep:{id:1,approval_circle_id:1,sequence:1,step_name:'M&E review',required_role_code:'MDO',assigned_user_id:null,action:'review',level:'ministry',can_return:true}};
test('real ministry response: submitted MDO is pending and can review with role permission',()=>{
 const r=normalizeSubmissionRecord(response);
 assert.equal(isMdoPending(r),true);
 assert.equal(canMdoReview(r,mdo),true);
});
test('explicit backend denial is respected and another role is not counted',()=>{
 const denied=normalizeSubmissionRecord({...response,allowedActions:[]});
 assert.equal(isMdoPending(denied),true);
 assert.equal(canMdoReview(denied,mdo),false);
 assert.equal(isMdoPending(normalizeSubmissionRecord({...response,currentStep:{...response.currentStep,required_role_code:'MDD'}})),false);
});
test('submitted MDD stage is included in MDD queue',()=>{
 assert.equal(mddInQueue(normalizeSubmissionRecord({...response,currentStep:{...response.currentStep,required_role_code:'MDD',action:'approve'}})),true);
});
test('backend user payload with MDO role but omitted permissions is not blocked at frontend',()=>{
 const r=normalizeSubmissionRecord(response);
 assert.equal(canMdoReview(r,{id:51,roles:[{code:'MDO'}]}),true);
});
