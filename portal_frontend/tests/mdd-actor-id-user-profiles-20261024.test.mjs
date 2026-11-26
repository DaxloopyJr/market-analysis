import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {approvalActorIds,approvalEventActorId,displayApprovalActor,indexedActorProfiles,approvalUploaderId,findApprovalActorsPaged} from '../src/utils/approvalActorPresentation.js';
import {mddApprovalTimeline,mddRemarks,mddDocuments} from '../src/utils/mddReviewPresentation.js';

const record={id:77,status:'under_review',history:[
  {action:'submit',actor_id:3,createdAt:'2026-10-22'},
  {action:'review',required_role_code:'HOD',actor_id:5,comments:'Reviewed',createdAt:'2026-10-23'},
  {action:'approve',required_role_code:'AO',actorId:8,comments:'Approved',createdAt:'2026-10-24'},
  {action:'review',required_role_code:'MDO',actor_id:12,comments:'Verified',createdAt:'2026-10-24'},
],raw:{status:'under_review',submitted_by_id:3,
  currentStep:{sequence:4,required_role_code:'MDD',action:'publish'},
  approvalCircle:{steps:[
    {sequence:1,required_role_code:'HOD',action:'review'},
    {sequence:2,required_role_code:'AO',action:'approve'},
    {sequence:3,required_role_code:'MDO',action:'review'},
    {sequence:4,required_role_code:'MDD',action:'publish'},
  ]},
  attachments:[{id:42,name:'evidence.pdf',uploaded_by_id:3}],
}};

test('actor_id is preserved on remarks, timeline and document uploader',()=>{
  assert.equal(approvalEventActorId({actor_id:5}),'5');
  assert.equal(approvalUploaderId({uploaded_by_id:3}),'3');
  assert.deepEqual(approvalActorIds(record),['3','5','8','12']);
  const comments=mddRemarks(record).comments;
  assert.deepEqual(comments.map(x=>x.actorId),['5','8','12']);
  const history=mddApprovalTimeline(record).steps;
  assert.equal(history[0].actorId,'3');
  assert.equal(history.find(x=>x.role==='AO').actorId,'8');
  assert.equal(history.find(x=>x.role==='MDO').actorId,'12');
  assert.equal(mddDocuments(record)[0].uploaderId,'3');
});

test('GET /users profile data maps actual actor name and role without mistaking step role for identity',()=>{
  const map=indexedActorProfiles([
    {id:5,first_name:'Rehema',last_name:'Juma',roles:[{code:'HOD',name:'Head of Department'}]},
    {id:8,name:'Hamisi K.',role_code:'AO'},
    {id:12,name:'Fatma L.',role:{name:'Ministry Data Officer'}},
  ]);
  assert.deepEqual(displayApprovalActor({actorId:5,role:'HOD'},map),{name:'Rehema Juma',role:'Head of Department'});
  assert.deepEqual(displayApprovalActor({actorId:8,role:'AO'},map),{name:'Hamisi K.',role:'AO'});
  assert.deepEqual(displayApprovalActor({actorId:12,role:'MDO'},map),{name:'Fatma L.',role:'Ministry Data Officer'});
  assert.equal(displayApprovalActor({actorId:93,role:'HOD'},map).name,'Name unavailable in response');
});

test('MDD UI wires resolved actor profiles to both tabs and confirmed users list endpoint',()=>{
  const ui=readFileSync(new URL('../src/pages/MDD/MddWorkspace.jsx',import.meta.url),'utf8');
  const sections=readFileSync(new URL('../src/pages/MDD/MddReviewSections.jsx',import.meta.url),'utf8');
  const service=readFileSync(new URL('../src/services/approvalActorLookupService.jsx',import.meta.url),'utf8');
  assert.match(ui,/lookupApprovalActorProfiles\(ids\)/);
  assert.match(ui,/<MddRemarksDocuments record=\{record\} actorProfiles=\{actorProfiles\}/);
  assert.match(ui,/<MddApprovalHistory record=\{record\} actorProfiles=\{actorProfiles\}/);
  assert.match(sections,/displayApprovalActor/);
  assert.match(service,/listUsers/);
  assert.doesNotMatch(service,/api\.get\(['"]\/users\/\$\{/);
});

test('GET /users pagination stops once all actor profiles are found',async()=>{
  const calls=[];
  const actors=await findApprovalActorsPaged(['3','5','5','12'],async({page,perPage})=>{
    calls.push([page,perPage]);
    return {items:page===1?[{id:3,name:'Data Officer'}]:
      [{id:5,name:'Reviewer'},{id:12,name:'Officer',role_code:'MDO'}],
      paginated:true,lastPage:5};
  });
  assert.deepEqual(calls,[[1,100],[2,100]]);
  assert.equal(actors['3'].name,'Data Officer');
  assert.equal(actors['12'].role,'MDO');
});
