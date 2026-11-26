/**
 * FILE: tests/dataset-reference-contract.test.mjs
 * FLOW: npm run test:modules -> checks Dataset 3-step wizard, ownership, target rules,
 *       server-backed Reference Data and immutable API payloads; no remote Laravel calls.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateDatasetBasic,datasetUpdatePayload,datasetWizardCompletion,validateNumericTarget} from '../src/pages/ModulePage/datasetFormRules.js';
import {datasetSourceIds} from '../src/utils/datasetSource.js';
import {getDatasetOwnership,userInstitutionId,userDepartmentId,roleCodes} from '../src/utils/datasetOwnership.js';
const root=new URL('../src/',import.meta.url);
const ui=readFileSync(new URL('pages/ModulePage/Datasets.jsx',root),'utf8');
const service=readFileSync(new URL('API/dataset.jsx',root),'utf8');
const refs=readFileSync(new URL('API/referenceData.jsx',root),'utf8');
const good=()=>({datasetName:' CBE Staff ',description:' Staff count ',institutionId:'2',departmentId:'',
 sourceDescription:' HR Team ',sectors:[{sectorId:9,subsectorIds:[]}],frequencies:['quarterly'],
 consumers:[{id:3,name:'MIT'},{name:'Consumer Outside'}],collectionMethod:'manual',sourceSystemName:''});
const user=(code,inst,dept)=>({id:7,roles:[{code}],institution:{id:inst,name:'Example Institution'},
 ...(dept!=null?{department:{id:dept,name:'HR'}}:{})});

test('Basic fields validate and never require former Source Level',()=>{
 assert.deepEqual(validateDatasetBasic(good()),{});
 const errors=validateDatasetBasic({...good(),datasetName:' ',institutionId:'',description:'',sourceDescription:'',frequencies:[],sectors:[],consumers:[]});
 for(const f of ['datasetName','institutionId','description','sourceDescription','frequencies','sectors','consumers'])assert.ok(errors[f],f);
 assert.ok(!('sourceLevel' in errors));
});
test('Ministry department is required only when ministry scope is true',()=>{
 assert.ok(validateDatasetBasic({...good(),requiresMinistryDepartment:true}).departmentId);
 assert.deepEqual(validateDatasetBasic({...good(),requiresMinistryDepartment:true,departmentId:'11'}),{});
 assert.deepEqual(validateDatasetBasic({...good(),requiresMinistryDepartment:false,departmentId:''}),{});
});
test('System method requires system name; Portal does not',()=>{
 assert.ok(validateDatasetBasic({...good(),collectionMethod:'system'}).sourceSystemName);
 assert.deepEqual(validateDatasetBasic({...good(),collectionMethod:'system',sourceSystemName:'HRMIS'}),{});
});
test('MOA ministry institution + manually selected department follows /me scope',()=>{
 const u=user('MOA',1);
 assert.equal(getDatasetOwnership(u).institutionId,1);
 assert.equal(getDatasetOwnership(u).canChooseDepartment,true);
 assert.equal(getDatasetOwnership(u).kind,'ministry');
 assert.deepEqual(datasetSourceIds({...good(),institutionId:'1',departmentId:'12'}),{institutionId:1,departmentId:12});
});
test('DDO ministry uses authenticated department; no dropdown owned by DDO',()=>{
 const scope=getDatasetOwnership(user('DDO',1,9));
 assert.deepEqual({kind:scope.kind,institutionId:scope.institutionId,departmentId:scope.departmentId,canChooseDepartment:scope.canChooseDepartment},
  {kind:'ministry',institutionId:1,departmentId:9,canChooseDepartment:false});
});
test('IA and IDO use their own institution only',()=>{
 for(const code of ['IA','IDO']){
   const scope=getDatasetOwnership(user(code,22));
   assert.equal(scope.kind,'institution');assert.equal(scope.institutionId,22);
   assert.equal(scope.canChooseDepartment,false);
 }
});
test('Missing Ministry institution ID blocks creation rather than guessing ID',()=>{
 assert.match(getDatasetOwnership(user('MOA',null)).error,/no institution/i);
 assert.equal(userInstitutionId(user('IA',2)),2);
 assert.equal(userDepartmentId(user('DDO',1,7)),7);
 assert.deepEqual(roleCodes({roles:[{code:'MOA'},{code:'IDO'}]}),['MOA','IDO']);
});
test('POST dataset source payload sends authenticated institution and department IDs',()=>{
 assert.deepEqual(datasetSourceIds({...good(),institutionId:9,departmentId:null}),{institutionId:9,departmentId:null});
 assert.deepEqual(datasetSourceIds({...good(),institutionId:1,departmentId:5}),{institutionId:1,departmentId:5});
 assert.match(service,/datasetSourceIds\(form\)/);
});
test('Dataset PATCH preserves Consumers but not institution/department/priority/sections',()=>{
 const payload=datasetUpdatePayload(good());
 assert.deepEqual(payload.consumers,[{consumerId:3},{name:'Consumer Outside',shortName:null,description:null}]);
 for(const excluded of ['institutionId','departmentId','priority','datasetCode','sections','sourceLevel','type']) assert.ok(!(excluded in payload));
});
test('Numeric targets respect backend integer/decimal only and numeric string max 18+6',()=>{
 assert.equal(validateNumericTarget('123','integer'),true);
 assert.equal(validateNumericTarget('12.34','decimal'),true);
 assert.equal(validateNumericTarget('-12.34','decimal'),true);
 for(const t of ['text','boolean','date'])assert.equal(validateNumericTarget('12',t),false);
 assert.equal(validateNumericTarget('1.5','integer'),false);
 assert.equal(validateNumericTarget('1e5','decimal'),false);
 assert.equal(validateNumericTarget('1234567890123456789','integer'),false);
 assert.equal(validateNumericTarget('1.1234567','decimal'),false);
});
test('Targets remain in API for future dedicated module, but not in Dataset Builder',()=>{
 for(const endpoint of ['targets: (id','addTarget: async','updateTarget: async'])assert.ok(service.includes(endpoint));
 assert.doesNotMatch(ui,/targetValue|targetScope|Add Target|Target Settings|Configuration Progress \(Laravel\)/);
});
test('Wizard has exactly three steps and no reporting creation step',()=>{
 assert.match(ui,/const steps=\['Basic Information','Indicators & Dimensions','Review & Submit'\]/);
 assert.doesNotMatch(ui,/const ReportingStep/);
 for(const forbidden of ['Create Annual Period','Generate Q1–Q4','title="Source Level"','title="Input/Output Type"','Add Section'])assert.ok(!ui.includes(forbidden),forbidden);
 assert.match(ui,/Save & Next/);assert.match(ui,/setStep\(1\)/);assert.match(ui,/setStep\(2\)/);
});
test('Green step tick only after persisted dataset/indicator or active state',()=>{
 assert.deepEqual(datasetWizardCompletion({dataset:null}),[false,false,false]);
 assert.deepEqual(datasetWizardCompletion({dataset:{id:9,status:'draft'}}),[true,false,false]);
 assert.deepEqual(datasetWizardCompletion({dataset:{id:9,status:'draft'},indicators:[{indicatorId:2}]}),[true,true,false]);
 assert.deepEqual(datasetWizardCompletion({dataset:{id:9,status:'active'},indicators:[{indicatorId:2}]}),[true,true,true]);
 assert.deepEqual(datasetWizardCompletion({dataset:{id:9,status:'draft'},basicSaved:false}),[false,false,false]);
 assert.match(ui,/completedSteps\[i\]/);
});
test('Dataset form contains no reporting period details or creator',()=>{
 assert.doesNotMatch(ui,/Available Submission Periods|api\.listPeriods|Create Annual Period|Generate Q1–Q4/);
 assert.match(ui,/Reporting Frequency/);
 assert.ok(!ui.includes('api.createYear('));
 assert.ok(!ui.includes('api.generateQuarters('));
});
test('Responsible officer exists with Assign Myself and no fabricated persisted assignment',()=>{
 assert.match(ui,/Responsible IDO\/DDO/);
 assert.match(ui,/Assign Myself/);
 assert.ok(!ui.includes('api.assignPeriod('));
});
test('Reference Types and Values still use verified backend services',()=>{
 assert.match(refs,/reference-data/);
 assert.match(refs,/\/values/);
});
