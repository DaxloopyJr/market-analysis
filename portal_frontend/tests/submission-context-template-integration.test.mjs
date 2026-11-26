import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  startYearFromFinancialYear, periodNumberFromPeriod, submissionContextPayload,
  reportingCalendarIdFromResponse, submissionTemplateIdFromResponse,
} from '../src/utils/submissionContext.js';

const page = readFileSync(new URL('../src/pages/DataEntry/DataEntry.jsx',import.meta.url),'utf8');
const api = readFileSync(new URL('../src/API/submission.jsx',import.meta.url),'utf8');
const service = readFileSync(new URL('../src/services/idoSubmissionService.jsx',import.meta.url),'utf8');

test('contract request for fiscal quarter Q2 matches actual backend camelCase field names', () => {
  assert.deepEqual(submissionContextPayload({financialYear:'2026/2027',frequency:'quarterly',period:{label:'FY 2026/2027 Q2'}}),
    {startYear:2026,frequency:'quarterly',periodNumber:2});
  assert.equal(startYearFromFinancialYear('2026/2027'),2026);
  assert.equal(periodNumberFromPeriod({periodNumber:2},'quarterly'),2);
});
test('does not confuse calendar month with fiscal month; fails closed for ambiguous periods', () => {
  assert.deepEqual(submissionContextPayload({financialYear:'2026/2027',frequency:'monthly',period:{periodNumber:1,startDate:'2026-07-01'}}),
    {startYear:2026,frequency:'monthly',periodNumber:1});
  assert.throws(()=>submissionContextPayload({financialYear:'2026/2027',frequency:'monthly',period:{startDate:'2026-07-01'}}),/reporting period is incomplete/);
  assert.equal(periodNumberFromPeriod({label:'M12'},'monthly'),12);
  assert.equal(periodNumberFromPeriod({label:'Annual FY 2026/2027'},'annual'),1);
  assert.throws(()=>startYearFromFinancialYear('2026/2029'),/invalid/);
  assert.throws(()=>periodNumberFromPeriod({periodNumber:5},'quarterly'),/not valid/);
});
test('accepts documented possible Laravel JSON envelopes, rejects missing record IDs',()=>{
  assert.equal(reportingCalendarIdFromResponse({data:{reportingCalendarId:9}}),9);
  assert.equal(reportingCalendarIdFromResponse({data:{id:9}}),9);
  assert.equal(reportingCalendarIdFromResponse({reporting_calendar_id:9}),9);
  assert.equal(reportingCalendarIdFromResponse({data:{}}),null);
  assert.equal(submissionTemplateIdFromResponse({data:{submissionId:22}}),22);
  assert.equal(submissionTemplateIdFromResponse({data:{id:22}}),22);
  assert.equal(submissionTemplateIdFromResponse({data:{status:'draft'}}),null);
});
test('API implements supplied draft and final-submit endpoints with the Axios auth client',()=>{
  assert.match(api,/\/submission-context`/);
  assert.match(api,/api.post\('\/submissions', \{ reportingCalendarId: id \}\)/);
  assert.match(api,/api.get\('\/submissions'/);
  assert.match(api,/api.get\(`\/submissions\/\$\{/);
  assert.match(api,/api.put\(`\/submissions\/\$\{checkedId\(id\)\}\/values`/);
  assert.match(api,/api.post\(path, \{expectedRevision:Number\(expectedRevision\)\}\)/);
  assert.match(service,/export const submissionWritesReady = true/);
});
test('wizard saves a Laravel-verified draft then routes same ID and locks editing',()=>{
  assert.match(page,/onClick=\{\(\)=>persistDraft\(\)\}/);
  assert.match(page,/onClick=\{submitForReview\}/);
  assert.match(page,/const saved=await saveDraft\(/);
  assert.match(page,/const result=await submitDraft\(id\)/);
  assert.match(service,/savedValuesMatch\(after,values,remarks,dimensionValues\)/);
  assert.match(service,/!draftEditable\(before.status\)/);
  assert.doesNotMatch(page,/onClick=\{\(\) => save\(true\)\}/);
});
