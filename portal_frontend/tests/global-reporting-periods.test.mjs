/** Global Submission Periods regression. Test pure payloads + source integration. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  dateOnly, deadlineOffset, globalPeriodListParams, annualPeriodPayload,
  childPeriodPayload, globalPeriodUpdatePayload,
} from '../src/utils/globalReportingPeriods.js';
const source=path=>readFileSync(new URL(`../src/${path}`, import.meta.url),'utf8');
const year={institutionId: null, institution_id:33,yearType:'financial',startDate:'2026-07-01',endDate:'2027-06-30',deadlineDays:'15'};

test('global annual payload omits prohibited institution ID entirely (not even null)',()=>{
  const body=annualPeriodPayload(year);
  assert.deepEqual(body,{periodType:'annual',yearType:'financial',startDate:'2026-07-01',endDate:'2027-06-30',deadlineDays:15});
  assert.equal('institutionId' in body,false);
  assert.equal('institution_id' in body,false);
});
test('monthly/quarterly payloads omit institution and follow backend numbering',()=>{
  assert.deepEqual(childPeriodPayload({institutionId:2,parentId:6,periodType:'monthly',periodNumber:10,deadlineDays:'7'}),{parentId:6,periodType:'monthly',periodNumber:10,deadlineDays:7});
  assert.deepEqual(childPeriodPayload({institutionId:null,parentId:6,periodType:'quarterly',quarter:2,deadlineDays:'5'}),{parentId:6,periodType:'quarterly',quarter:2,deadlineDays:5});
});
test('list filters are global even for old callers with cached institution filter',()=>{
  assert.deepEqual(globalPeriodListParams({institutionId:5,institution_id:12,page:2,periodType:'monthly'}),{page:2,periodType:'monthly'});
});
test('edit only includes date-only deadline and status; no arbitrary fields leak',()=>{
  assert.deepEqual(globalPeriodUpdatePayload({institutionId:null,deadline:'2027-01-10',status:'open'}),{deadline:'2027-01-10',status:'open'});
});
test('dates require strict YYYY-MM-DD and calendar validity',()=>{
  assert.equal(dateOnly('2026-10-22'), '2026-10-22');
  for(const date of ['2026-10-22T00:00:00Z','2026/10/22','22-10-2026','2026-02-30','2026-2-1','2027-02-29']) assert.throws(()=>dateOnly(date));
  assert.equal(dateOnly('2028-02-29'),'2028-02-29');
  assert.throws(()=>annualPeriodPayload({...year,startDate:'2027-06-30',endDate:'2026-07-01'}));
});
test('deadlineDays validates 0..365 whole number',()=>{
  assert.equal(deadlineOffset('0'),0);
  assert.equal(deadlineOffset('365'),365);
  for (const n of ['',null,-1,366,'2.5','NaN']) assert.throws(()=>deadlineOffset(n));
});
test('MOA page has no institution selector or institution source import',()=>{
  const code=source('pages/SubmissionPeriods/SubmissionPeriods.jsx');
  assert.doesNotMatch(code,/listInstitutions|setInstitutionId|form\.institutionId|institutionId:Number\(/);
  assert.match(code,/roleCodes\(user\)\.includes\('MOA'\)/);
  assert.match(code,/Global reporting calendar/);
  assert.match(code,/type="date"/);
});
test('Data Entry GET global periods without institution filters; Dataset Builder does not fetch periods',()=>{
  const ido=source('services/idoSubmissionService.jsx');
  const ds=source('pages/ModulePage/Datasets.jsx');
  assert.match(ido,/listAll\('\/reporting-periods'\)/);
  assert.doesNotMatch(ido,/listAll\('\/reporting-periods',\s*\{institutionId/);
  assert.doesNotMatch(ds,/api\.listPeriods/);
});
test('period service uses dedicated validated builders for writes and GET',()=>{
  const api=source('API/reportingPeriods.jsx');
  for(const part of ['globalPeriodListParams(params)','annualPeriodPayload(fields)','childPeriodPayload(fields)','globalPeriodUpdatePayload(fields)']) assert.ok(api.includes(part),part);
  assert.match(api,/api\.delete\(path\(id\)\)/);
});
test('dataset assignment remains institution-scoped without modifying dataset source IDs',()=>{
  const api=source('API/dataset.jsx');
  assert.match(api,/datasetSourceIds\(form\)/);
  assert.match(api,/reportingPeriodsAPI\.list\(params\)/);
});
