import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {normalizeSubmissionDataset, normalizeSubmissionIndicator, mergeGlobalPeriodWithAssignment} from '../src/utils/submissionReadModels.js';
import {isEntryEligible} from '../src/utils/reportingPeriodRules.js';
import {getEligibleFrequencyPeriods,getConfiguredFrequencies} from '../src/utils/submissionFrequency.js';

const service=readFileSync(new URL('../src/services/idoSubmissionService.jsx',import.meta.url),'utf8');
const ui=readFileSync(new URL('../src/pages/DataEntry/DataEntry.jsx',import.meta.url),'utf8');
const contract=()=>normalizeSubmissionDataset({id:22,datasetName:'Staff',status:'active',institutionId:4,frequencies:['monthly','quarterly','annual']});

test('Dataset list path is the documented GET /datasets, not unverified /datasets/assigned',()=>{
  assert.match(service,/listAll\(DATASETS, \{status: 'active'\}\)/);
  assert.doesNotMatch(service,/api\.get\([^\n]*\/assigned/);
  assert.equal(contract().name,'Staff');
  assert.deepEqual(getConfiguredFrequencies(contract()),['monthly','quarterly','annual']);
});
test('Laravel indicators are mapped to working input schema without inventing values',()=>{
  const indicator=normalizeSubmissionIndicator({id:7,indicatorId:8,isRequired:true,displayOrder:2,indicator:{id:8,nameEn:'Number of staff',dataType:'integer',unitId:11}});
  assert.deepEqual({id:indicator.id,key:indicator.key,type:indicator.type,precision:indicator.precision,label:indicator.label,required:indicator.required,order:indicator.order},
    {id:8,key:'8',type:'number',precision:0,label:'Number of staff',required:true,order:2});
  assert.equal(indicator.unit,''); // No invented unit label from unitId 11.
  const boolean=normalizeSubmissionIndicator({indicator:{id:9,nameEn:'Active',dataType:'boolean'},isRequired:false});
  assert.equal(boolean.type,'select');assert.equal(boolean.options.length,2);
});
test('Global periods visible without assignment are NOT falsely marked assigned',()=>{
  const p=mergeGlobalPeriodWithAssignment({id:7,periodType:'quarterly',startDate:'2026-10-01',endDate:'2026-12-31',deadline:'2027-01-15',isOpen:true,status:'open',label:'2026/2027 Q2'},null,15);
  assert.equal(p.assignmentConfirmed,false);
  assert.equal(p.assignmentDeadline,'2027-01-15');
  assert.equal(isEntryEligible(p,'2026-10-22'),true);
  assert.equal(getEligibleFrequencyPeriods([p],'2026/2027','quarterly','2026-10-22').length,1);
  assert.equal(isEntryEligible(p,'2027-01-16'),false);
});
test('Officer calendar deadline applies only to matching user and earlier cutoff',()=>{
  const p={id:7,deadline:'2027-01-15',startDate:'2026-10-01',endDate:'2026-12-31',isOpen:true,status:'open'};
  const assignment={id:3,reportingPeriodId:7,responsibleUserId:11,deadline:'2027-01-10'};
  assert.equal(mergeGlobalPeriodWithAssignment(p,assignment,11).assignmentDeadline,'2027-01-10');
  assert.equal(mergeGlobalPeriodWithAssignment(p,assignment,11).assignmentConfirmed,true);
  assert.equal(mergeGlobalPeriodWithAssignment(p,assignment,14).assignmentConfirmed,false);
});
test('New Submission loads real GET indicators and does not fetch missing previous-values',()=>{
  assert.match(ui,/getDatasetIndicators\(datasetId\)/);
  assert.doesNotMatch(ui,/getPreviousPeriodValues\(/);
  assert.match(ui,/submissionWritesReady/);
  assert.match(ui,/indicatorDefinitions/);
});
test('Five step UI and period cards remain, no Dataset action menu regression',()=>{
  assert.match(ui,/const STEPS = \["Dataset", "Submission Method", "Data Entry", "Review", "Submit"\]/);
  assert.match(ui,/ido-period-card-grid/);
  assert.match(ui,/getConfiguredFrequencies/);
});
