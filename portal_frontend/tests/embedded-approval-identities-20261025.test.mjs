import test from 'node:test';
import assert from 'node:assert/strict';
import {displayApprovalActor} from '../src/utils/approvalActorPresentation.js';
import {submissionFacts} from '../src/utils/serverFields.js';
import {mddRemarks,mddApprovalTimeline} from '../src/utils/mddReviewPresentation.js';
const officer={userId:32,id:32,name:'[TEST] CBE Data Officer 1',institutionId:4,departmentId:null,roles:[{code:'IDO',name:'Institutional Data Officer'}]};
test('embedded history user displays name and backend role',()=>{
  const presentation=displayApprovalActor({actorId:32,actor:officer});
  assert.equal(presentation.name,officer.name);
  assert.equal(presentation.role,'Institutional Data Officer');
});
test('Submitted By displays backend name and role',()=>{
  const record={raw:{submittedBy:officer,datasetId:1},history:[]};
  const facts=submissionFacts(record);
  assert.equal(facts.submittedBy,officer.name);
  assert.equal(facts.submittedByDisplay,`${officer.name} · Institutional Data Officer`);
});
test('Remarks & Approval History keep embedded user and roles',()=>{
  const record={raw:{submittedBy:officer,status:'submitted'},history:[{action:'submit',user:officer,userId:32,createdAt:'2026-10-25T05:50:15Z'},{action:'review',user:officer,userId:32,comments:'Reviewed',createdAt:'2026-10-25T06:00:00Z'}]};
  assert.equal(mddRemarks(record).comments[0].actor.name,officer.name);
  const received=mddApprovalTimeline(record).steps.find(node=>node.id==='submitted');
  assert.equal(displayApprovalActor(received).role,'Institutional Data Officer');
});
