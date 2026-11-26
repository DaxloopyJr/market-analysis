import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeSubmissionRecord} from '../src/utils/submissionValues.js';
import {hasValue,readField,personName,submissionFacts} from '../src/utils/serverFields.js';
import {normalizeReadAliases} from '../src/utils/recordAliases.js';
import {mddDetailInfo,mddDocuments} from '../src/utils/mddReviewPresentation.js';

const laravel = {
  data:{
    id:41,
    status:'under_review',
    revision:7,
    datasetId:6,
    reportingCalendar:{startYear:2026,periodNumber:2,frequency:'quarterly',
      dataset:{id:6,datasetName:'Industrial Production', institutionId:3, departmentId:5}},
    submittedBy:{firstName:'Asha',lastName:'Mushi'},
    submissionMethod:'online',
    submittedAt:'2026-10-23T09:30:00+03:00',
    updatedAt:'2026-10-24T11:50:00+03:00',
    values:[{indicatorId:8,value:0,remarks:'',breakdowns:[]}],
  }
};
const catalogue={
  institutions:[{id:3,name:'Ministry of Industry and Trade'}],
  departments:[{id:5,name:'Industry Development',institutionId:3}],
  datasets:[{id:6,datasetName:'Industrial Production',institutionId:3,departmentId:5}],
};

test('Server display lookup preserves valid 0 and false; resolves nested fields',()=>{
  assert.equal(hasValue(0),true);
  assert.equal(hasValue(false),true);
  assert.equal(readField({dataset:{name:'Staff'}},'dataset.name'),'Staff');
  assert.equal(personName({first_name:'Asha',last_name:'Mushi'}),'Asha Mushi');
});

test('Actual submission joins its dataset, Ministry department and reporting calendar without inventing',()=>{
  const record=normalizeSubmissionRecord(laravel);
  const facts=submissionFacts(record,catalogue);
  assert.equal(record.status,'under_review');
  assert.equal(record.values['8'],0);
  assert.equal(record.dataset,'Industrial Production');
  assert.equal(facts.institution,'Ministry of Industry and Trade');
  assert.equal(facts.department,'Industry Development');
  assert.equal(facts.submittedBy,'Asha Mushi');
  assert.equal(facts.method,'online');
  assert.equal(facts.period,'2026/2027 Q2');
  assert.equal(facts.submittedAt,'2026-10-23T09:30:00+03:00');
  assert.equal(facts.updatedAt,'2026-10-24T11:50:00+03:00');
  const director=mddDetailInfo(record,catalogue);
  assert.equal(director.officer,'Asha Mushi');
  assert.equal(director.department,'Industry Development');
  assert.equal(director.method,'online');
});

test('Historical submission with no submitted method does not fabricate manual',()=>{
  const record=normalizeSubmissionRecord({data:{id:3,status:'published',datasetId:6}});
  assert.equal(record.status,'published');
  assert.equal(record.method,'');
  assert.equal(submissionFacts(record,catalogue).submittedBy,'');
});

test('Institution, department, user and dataset listings keep backend aliases in table reads',()=>{
  const institution=normalizeReadAliases({id:1,name:'CAMARTEC',shortName:'CAM',isActive:false,usersCount:0},'institution');
  assert.equal(institution.short_name,'CAM');
  assert.equal(institution.is_active,false);
  assert.equal(institution.users_count,0);
  const dept=normalizeReadAliases({id:7,name:'Policy',parentDepartmentId:2,institutionId:1},'department');
  assert.equal(dept.parent_department_id,2);
  assert.equal(dept.institution_id,1);
  const user=normalizeReadAliases({id:9,fullName:'Joseph M.',lastLoginAt:'2026-10-23',roleCode:'MDO'},'user');
  assert.equal(user.name,'Joseph M.');
  assert.equal(user.role_code,'MDO');
  assert.equal(user.last_login_at,'2026-10-23');
  const dataset=normalizeReadAliases({id:6,dataset_name:'Output',collection_method:'manual',responsible_user_id:9},'dataset');
  assert.equal(dataset.datasetName,'Output');
  assert.equal(dataset.collectionMethod,'manual');
  assert.equal(dataset.responsibleUserId,9);
});

test('Document uploader is taken from Laravel supplied uploader_name field',()=>{
  const files=mddDocuments({raw:{attachments:[{id:14,fileName:'Report.pdf',uploader_name:'Asha Mushi',uploaded_at:'2026-10-20',url:'/storage/report.pdf'}]}});
  assert.equal(files[0].uploader,'Asha Mushi');
  assert.equal(files[0].date,'2026-10-20');
});
