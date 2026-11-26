import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {isAccountOfficer,canAoApprove,canAoReturn,hasAoHistory} from '../src/utils/aoApprovalRules.js';
import {approvalActionPayload} from '../src/utils/submissionApprovalActions.js';
const src=path=>readFileSync(new URL(`../src/${path}`,import.meta.url),'utf8');
const ao={id:12,role_code:'AO',roles:[{code:'AO'}],permissions:['submissions.approve'],institution:{id:4}};
const base={id:25,status:'under_review',raw:{id:25,institutionId:4,submittedById:10,
  currentStep:{sequence:2,required_role_code:'AO',action:'approve',assigned_user_id:12,can_return:true},
  allowedActions:['approve','return']}};
test('AO assignment: only institution AO with matching reviewer can approve and return',()=>{
 assert.equal(isAccountOfficer(ao),true);
 assert.equal(canAoApprove(base,ao),true);
 assert.equal(canAoReturn(base,ao),true);
 assert.equal(canAoApprove(base,{...ao,id:11}),false);
 assert.equal(canAoApprove(base,{...ao,id:10}),false);
 assert.equal(canAoApprove({...base,raw:{...base.raw,institutionId:99}},ao),false);
 assert.equal(canAoApprove({...base,raw:{...base.raw,allowedActions:['return']}},ao),false);
 assert.equal(canAoApprove({...base,raw:{...base.raw,currentStep:{...base.raw.currentStep,action:'review'}}},ao),false);
 assert.equal(canAoReturn({...base,raw:{...base.raw,currentStep:{...base.raw.currentStep,can_return:false}}},ao),false);
 assert.equal(canAoApprove({...base,status:'returned'},ao),false);
});
test('AO without assigned user requires explicit backend allowedActions grant',()=>{
 const record={...base,raw:{...base.raw,currentStep:{required_role_code:'AO',action:'approve'}}};
 assert.equal(canAoApprove(record,ao),true);
 assert.equal(canAoApprove({...record,raw:{...record.raw,allowedActions:undefined}},ao),false);
});
test('AO Reviewed shows only actions from this logged-in reviewer',()=>{
 const record={...base,history:[{action:'approve',userId:ao.id}]};
 assert.equal(hasAoHistory(record,ao),true);
 assert.equal(hasAoHistory({...record,history:[{action:'approve',userId:77}]},ao),false);
});
test('Laravel approve payload: only revision plus optional comments, no correction date',()=>{
 assert.deepEqual(approvalActionPayload('approve',{expectedRevision:3,comments:'Nimeidhinisha taarifa za taasisi.'}),
  {expectedRevision:3,comments:'Nimeidhinisha taarifa za taasisi.'});
 assert.deepEqual(approvalActionPayload('approve',{expectedRevision:3}),{expectedRevision:3});
});
test('Laravel return payload requires comments and Tanzania local correction deadline',()=>{
 assert.deepEqual(approvalActionPayload('return',{expectedRevision:4,comments:'Hakiki idadi na urekebishe taarifa.',correctionDeadline:'2026-10-30'},{today:'2026-10-23'}),
  {expectedRevision:4,comments:'Hakiki idadi na urekebishe taarifa.',correctionDeadline:'2026-10-30'});
 assert.throws(()=>approvalActionPayload('return',{expectedRevision:4,comments:'',correctionDeadline:'2026-10-30'}),/requires comments/);
 assert.throws(()=>approvalActionPayload('return',{expectedRevision:4,comments:'Reason',correctionDeadline:'2026-01-01'},{today:'2026-10-23'}),/today or later/);
});
test('AO pages and permissions only: sidebar two entries, endpoints exact',()=>{
 const menu=src('config/sidebarMenu.js'),app=src('App.jsx'),service=src('services/aoApprovalService.jsx');
 assert.match(menu,/label:"Pending Approval"/);assert.match(menu,/id:"ao-reviewed",label:"Reviewed"/);
 assert.match(app,/path="ao\/pending"/);assert.match(app,/path="ao\/reviewed"/);
 assert.match(service,/postApproveSubmission\(id,payload\)/);
 assert.match(service,/postReturnSubmission\(id,payload\)/);
 assert.doesNotMatch(service,/\/Submissions\//);
 assert.match(src('pages/AO/AoApprovals.jsx'),/correctionDeadline/);
 assert.match(src('pages/AO/AoApprovals.jsx'),/read-only/i);
});

test('AO service calls real approval action shapes: PUT values not used, POST approve or return with revision',async()=>{
 const source=src('services/aoApprovalService.jsx')
  .replace(/^import .*;\s*$/gm,'')
  .replaceAll('export async function ','async function ');
 const record={...base,revision:3,history:[]};
 const requests=[];
 const construct=new Function('fetchSubmission','listSubmissionsPage','postApproveSubmission','postReturnSubmission',
  'normalizeSubmissionRecord','submissionExpectedRevision','positiveId','canAoApprove','canAoReturn','hasAoHistory','isAccountOfficer',
  source+'\nreturn {completeAoAction};');
 const svc=construct(async()=>({envelope:record}),async()=>({items:[record],paginated:false}),
  async(id,payload)=>{requests.push({method:'approve',id,payload});return {data:{id:25,status:'under_review',revision:4,currentStep:{sequence:1,required_role_code:'MDO',action:'review'}}};},
  async(id,payload)=>{requests.push({method:'return',id,payload});return {data:{id:25,status:'returned',revision:4,currentStep:null}};},
  raw=>raw,raw=>raw.revision,Number,canAoApprove,canAoReturn,hasAoHistory,isAccountOfficer);
 const a=await svc.completeAoAction({id:25,user:ao,action:'approve',comments:'Checked.'});
 assert.equal(a.after.currentStep.required_role_code,'MDO');
 assert.deepEqual(requests[0],{method:'approve',id:25,payload:{expectedRevision:3,comments:'Checked.'}});
 const b=await svc.completeAoAction({id:25,user:ao,action:'return',comments:'Correct staff totals',correctionDeadline:'2026-10-30'});
 assert.equal(b.after.status,'returned');
 assert.deepEqual(requests[1],{method:'return',id:25,payload:{expectedRevision:3,comments:'Correct staff totals',correctionDeadline:'2026-10-30'}});
});

test('AO never displays success if POST response lacks confirmed revision or backend returns 409',async()=>{
 const source=src('services/aoApprovalService.jsx').replace(/^import .*;\s*$/gm,'').replaceAll('export async function ','async function ');
 const construct=new Function('fetchSubmission','listSubmissionsPage','postApproveSubmission','postReturnSubmission',
  'normalizeSubmissionRecord','submissionExpectedRevision','positiveId','canAoApprove','canAoReturn','hasAoHistory','isAccountOfficer',
  source+'\nreturn {completeAoAction};');
 const svc=construct(async()=>({envelope:{...base,revision:3}}),null,
  async()=>({data:{id:25,status:'under_review',revision:3}}),null,x=>x,x=>x.revision,Number,
  canAoApprove,canAoReturn,hasAoHistory,isAccountOfficer);
 await assert.rejects(()=>svc.completeAoAction({id:25,user:ao,action:'approve'}),/could not be confirmed|did not confirm/);
 const rejected=construct(async()=>({envelope:{...base,revision:3}}),null,
  async()=>{const e=new Error('Missing next approver');e.response={status:409};throw e;},null,x=>x,x=>x.revision,Number,
  canAoApprove,canAoReturn,hasAoHistory,isAccountOfficer);
 await assert.rejects(()=>rejected.completeAoAction({id:25,user:ao,action:'approve'}),/Missing next approver/);
});
