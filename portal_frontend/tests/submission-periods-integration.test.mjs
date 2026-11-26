/** Contract regression: no remote calls. Checks published periods and UI invariants. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {periodState,isEntryEligible,dateFromDays,calculateDeadlineDays,reportingYear} from '../src/utils/reportingPeriodRules.js';
const src=key=>readFileSync(new URL(`../src/${key}`,import.meta.url),'utf8');
const p={id:7,status:'open',isOpen:true,startDate:'2026-07-01',endDate:'2026-09-30',deadline:'2026-10-31',label:'2026/2027 Q1',periodType:'quarterly'};
test('Past endDate but before due date stays eligible',()=>{assert.equal(periodState(p,'2026-10-21'),'available');assert.equal(periodState(p,'2026-10-31'),'available');});
test('Past deadline rejected even when status open',()=>{assert.equal(periodState(p,'2026-11-01'),'past_due');assert.equal(isEntryEligible(p,'2026-11-01'),false);});
test('Closed and future periods rejected',()=>{assert.equal(periodState({...p,status:'closed'},'2026-08-01'),'closed');assert.equal(periodState({...p,startDate:'2027-01-01',deadline:'2027-04-05'},'2026-10-21'),'upcoming');});
test('Dataset assignment deadline takes precedence over period deadline',()=>{assert.equal(periodState({...p,assignmentDeadline:'2026-10-10'},'2026-10-21'),'past_due');});
test('Missing dates fail closed',()=>{assert.equal(periodState({...p,deadline:undefined},'2026-10-21'),'unavailable');});
test('Date helpers use calendar days and FY label',()=>{assert.equal(dateFromDays('2026-09-30',10),'2026-10-10');assert.equal(calculateDeadlineDays('2026-09-30','2026-10-10'),10);assert.equal(reportingYear(p),'2026/2027');});
test('Module route points to real SubmissionPeriods page not generic placeholder',()=>{assert.match(src('App.jsx'),/moduleId === "periods"[\s\S]*?<SubmissionPeriods/);assert.match(src('pages/SubmissionPeriods/SubmissionPeriods.jsx'),/roleCodes\(user\)\.includes\('MOA'\)/);});
test('Only MOA sees Periods in sidebar',()=>{assert.match(src('config/sidebarMenu.js'),/c\.key === "submission-periods" && !isMOA/);});
test('Period API GET/POST/PATCH/DELETE and quarterly generation use supplied routes',()=>{const code=src('API/reportingPeriods.jsx');for(const item of ['api.get(\'/reporting-periods\'','api.post(\'/reporting-periods\'','api.patch(path(id)','api.delete(path(id)','/quarters'])assert.ok(code.includes(item),item);});
test('Global reminders must not be posted to undocumented backend',()=>{const code=src('pages/SubmissionPeriods/SubmissionPeriods.jsx');assert.match(code,/disabled checked=\{remindersEnabled\}/);assert.match(code,/Global reminders are currently unavailable/);});
test('DataEntry same wizard with financial year, eligible period and due date',()=>{const code=src('pages/DataEntry/DataEntry.jsx');assert.match(code,/const STEPS = \["Dataset", "Submission Method", "Data Entry", "Review", "Submit"\]/);for(const x of ['ido-financial-year','periodCards.map','isEntryEligible(period)','assignmentDeadline','ido-indicator-picker'])assert.ok(code.includes(x),x);});
test('DataEntry reads verified period/calendars, no deprecated submission-periods path',()=>{const code=src('services/idoSubmissionService.jsx');assert.ok(code.includes("listAll('/reporting-periods'"));assert.ok(code.includes('/reporting-calendar'));assert.doesNotMatch(code,/const PERIODS =/);});
test('Dataset five actions including real calendar read and deactivate',()=>{const code=src('pages/ModulePage/Datasets.jsx');for(const x of ['View Details','Edit Dataset','View Reporting Calendar','Indicators & Dimensions','Deactivate Dataset','api.periodsOfDataset']) assert.ok(code.includes(x),x);assert.match(code,/<RowActionsMenu label=\{`Dataset actions/);});

test('New Submission supports multi-dataset selection without falsely claiming that values were saved or submitted',()=>{
 const code=src('pages/DataEntry/DataEntry.jsx');
 for(const token of ['selectedDatasetIds','toggleDataset','datasetWork','preparedTemplates','Continue with next selected dataset']) assert.ok(code.includes(token),token);
 assert.match(code,/Choose a reporting period and enter values separately for each selected dataset/);
 assert.match(code,/submissionWritesReady/);
 assert.doesNotMatch(code,/Drafts are stored under their own Submission ID/);
});
