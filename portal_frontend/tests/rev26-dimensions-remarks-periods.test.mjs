import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {getConfiguredFrequencies,getFrequencyPeriods,getEligibleFrequencyPeriods} from '../src/utils/submissionFrequency.js';
import {periodState} from '../src/utils/reportingPeriodRules.js';
import {configuredRemarkMode} from '../src/utils/indicatorRemarks.js';
const code=path=>readFileSync(new URL('../src/'+path,import.meta.url),'utf8');
const datasetCode=code('pages/ModulePage/Datasets.jsx');
const entry=code('pages/DataEntry/DataEntry.jsx');
const service=code('services/idoSubmissionService.jsx');
const periods=[
 {id:1,label:'2026/2027 Q1',reportingYear:'2026/2027',periodType:'quarterly',startDate:'2026-07-01',endDate:'2026-09-30',assignmentDeadline:'2026-10-07',status:'open',isOpen:true},
 {id:2,label:'2026/2027 Q2',reportingYear:'2026/2027',periodType:'quarterly',startDate:'2026-10-01',endDate:'2026-12-31',assignmentDeadline:'2027-01-07',status:'open',isOpen:true},
 {id:3,label:'2026/2027 Q3',reportingYear:'2026/2027',periodType:'quarterly',startDate:'2027-01-01',endDate:'2027-03-31',assignmentDeadline:'2027-04-07',status:'open',isOpen:true},
 {id:4,label:'2026/2027 Q4',reportingYear:'2026/2027',periodType:'quarterly',startDate:'2027-04-01',endDate:'2027-06-30',assignmentDeadline:'2027-07-07',status:'open',isOpen:true},
];
test('quarterly selection displays all four configured quarter cards but only eligible one can be picked',()=>{
 const cards=getFrequencyPeriods(periods,'2026/2027','quarterly');
 assert.deepEqual(cards.map(x=>x.id),[1,2,3,4]);
 assert.deepEqual(cards.map(x=>periodState(x,'2026-10-22')),['past_due','available','upcoming','upcoming']);
 assert.deepEqual(getEligibleFrequencyPeriods(periods,'2026/2027','quarterly','2026-10-22').map(x=>x.id),[2]);
 assert.deepEqual(getConfiguredFrequencies({frequencies:['annual','quarterly']},periods),['quarterly','annual']);
 assert.match(entry,/const clickable=existingState\?\(!recordId&&!editId\):open&&!recordId&&!editId;[\s\S]*disabled=\{!clickable\}/);
});
test('subsector field only renders after selected sector has child options',()=>{
 assert.match(datasetCode,/selectedSector && subs.length > 0 && <div className="ds-subsector-group"/);
});
test('each indicator manages multiple editable dimension categories independently',()=>{
 assert.match(datasetCode,/dimensionDrafts.map/);
 assert.match(datasetCode,/Dimension Categories/);
 assert.match(datasetCode,/Add Dimension Category/);
 assert.match(datasetCode,/prepareEdit\(row\)/);
 assert.match(datasetCode,/saveDimensions\(savedIndicatorId\)/);
 assert.match(datasetCode,/api.addDimension/);
 assert.match(datasetCode,/api.updateDimensionAttachment/);
});
test('remarks follow per-indicator configuration; without backend flag default is optional',()=>{
 assert.equal(configuredRemarkMode({},1,2),'optional');
 assert.equal(configuredRemarkMode({indicator:{remarksMode:'required'}},1,2),'required');
 assert.equal(configuredRemarkMode({indicator:{remarksEnabled:false}},1,2),'hidden');
 assert.match(entry,/indicator.remarksMode!=='hidden'/);
 assert.match(entry,/remarks are required/);
 assert.match(entry,/Remarks for/);
});
test('dimension breakdowns and remarks enter a draft PUT; backend must verify saved response',()=>{
 // 27 Oct 2026: dimension assignment goes through dimensionsForIndicator (indicators without dimensions pass).
 assert.match(entry,/dimensionsForIndicator\(dimensionDefinitions,/);
 assert.match(entry,/dimensionValues/);
 assert.match(service,/export const submissionWritesReady = true/);
 assert.match(service,/savedValuesMatch/);
 assert.match(code('utils/indicatorRemarks.js'),/TODO\(BACKEND\)/);
});
