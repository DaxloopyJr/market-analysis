import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mddApprovalTimeline,mddRemarks,mddDocuments,mddDetailInfo,safeDocumentUrl} from '../src/utils/mddReviewPresentation.js';
const read=file=>readFileSync(new URL('../src/'+file,import.meta.url),'utf8');
const mk=()=>({id:52,status:'under_review',dataset_id:17,financialYear:'2025/2026',period:'Q2',
  remarks:{5:'Reviewed figures'},history:[
    {action:'submit',actor:{name:'Data Officer'},createdAt:'2026-10-20T09:00:00+03:00'},
    {action:'review',required_role_code:'HOD',actor:{name:'Head of Department'},comments:'Checked.',createdAt:'2026-10-21T10:00:00+03:00'},
    {action:'approve',required_role_code:'AO',actor:{name:'Account Officer'},comments:'Approved.',createdAt:'2026-10-22T11:00:00+03:00'},
    {action:'review',required_role_code:'MDO',actor:{name:'Ministry Reviewer'},comments:'Verified.',createdAt:'2026-10-23T13:00:00+03:00'},
  ],raw:{submittedBy:{name:'Data Officer'},submittedAt:'2026-10-20T09:00:00+03:00',
    dataset:{id:17,datasetName:'Industrial Employment',institutionId:3},
    reportingCalendar:{startYear:2025,periodNumber:2,frequency:'quarterly'},
    currentStep:{sequence:4,required_role_code:'MDD',action:'publish'},
    approvalCircle:{steps:[
      {sequence:1,required_role_code:'HOD',action:'review',step_name:'Department Review'},
      {sequence:2,required_role_code:'AO',action:'approve',step_name:'Institution Approval'},
      {sequence:3,required_role_code:'MDO',action:'review',step_name:'Ministry Review'},
      {sequence:4,required_role_code:'MDD',action:'publish',step_name:'Director Decision'}]},
    documents:[{id:3,originalName:'Report.pdf',downloadUrl:'https://example.org/report.pdf',uploadedBy:{name:'Data Officer'}}],
  }});
test('Approval History uses connected action steps, no drafts, and real current step',()=>{
  const timeline=mddApprovalTimeline(mk());
  assert.deepEqual(timeline.steps.map(x=>x.label),['Submission Received','Department Review','Institution Approval','Ministry Review','Director Decision']);
  assert.deepEqual(timeline.steps.map(x=>x.status),['completed','completed','completed','completed','current']);
  assert.equal(timeline.currentRole,'MDD');
  assert.equal(mddApprovalTimeline({...mk(),status:'draft'}).steps.length,0);
});
test('Submission remarks and reviewer comments are separated from workflow timeline; documents read from backend',()=>{
  const remarks=mddRemarks(mk());
  assert.equal(remarks.comments.length,3);
  assert.equal(remarks.indicators[0][1],'Reviewed figures');
  assert.equal(mddDocuments(mk())[0].uploader,'Data Officer');
  assert.equal(safeDocumentUrl('javascript:alert(1)'),'');
});
test('MDD read labels resolve backend nested dataset, institution, submission method, officer and period',()=>{
  const record=mk();record.raw.submissionMethod='Online Form';
  const info=mddDetailInfo(record,{institutions:[{id:3,name:'TANTRADE'}],datasets:[{id:17,institutionId:3,datasetName:'Industrial Employment'}]});
  assert.equal(info.dataset,'Industrial Employment');
  assert.equal(info.institution,'TANTRADE');
  assert.equal(info.officer,'Data Officer');
  assert.equal(info.method,'Online Form');
  assert.equal(info.period,'2025/2026 Q2');
  assert.equal(info.submittedAt,record.raw.submittedAt);
});
test('MDD design has a single View, separate Review, and Director Decision not in view mode',()=>{
  const page=read('pages/MDD/MddWorkspace.jsx');
  const sections=read('pages/MDD/MddReviewSections.jsx');
  const styles=read('pages/MDD/MddWorkspace.css');
  assert.match(page,/reviewMode&&!finalStatus/);
  assert.match(page,/\{showDecision&&<aside/);
  assert.match(page,/mode=view/);
  assert.match(page,/mode=review/);
  assert.doesNotMatch(page,/title="History"/);
  assert.match(sections,/mdd-workflow-line/);
  assert.match(styles,/mdd-workflow-item:not\(:last-child\)::before/);
  assert.match(styles,/mdo-review-columns\.mdd-view-mode/);
});
