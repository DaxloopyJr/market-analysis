/** New Submission Step 1 multiple-frequency regression tests; no live Laravel requests. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  getConfiguredFrequencies,
  getEligibleFrequencyPeriods,
  recommendPeriod,
  frequencyLabel,
  formattedReportingDate,
} from '../src/utils/submissionFrequency.js';
const jsx = readFileSync(new URL('../src/pages/DataEntry/DataEntry.jsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/pages/DataEntry/DataEntry.css', import.meta.url), 'utf8');
const period = (id, type, start, end, due, more = {}) => ({
  id,periodType:type,reportingYear:'2026/2027',label:`2026/2027 ${id}`,
  startDate:start,endDate:end,assignmentDeadline:due,status:'open',isOpen:true,...more,
});
const items = [
  period('M9','monthly','2026-09-01','2026-09-30','2026-10-05'), // expired
  period('M10','monthly','2026-10-01','2026-10-31','2026-11-05'),
  period('M11','monthly','2026-11-01','2026-11-30','2026-12-05'), // upcoming
  period('Q1','quarterly','2026-07-01','2026-09-30','2026-10-05'), // expired
  period('Q2','quarterly','2026-10-01','2026-12-31','2027-01-10'),
  period('Annual','annual','2026-07-01','2027-06-30','2027-07-15'),
  period('Q3','quarterly','2027-01-01','2027-03-31','2027-04-07'), // upcoming
];
test('single frequency dataset uses exactly its configured option', () => {
  assert.deepEqual(getConfiguredFrequencies({frequencies:['quarterly']},items),['quarterly']);
  assert.deepEqual(getEligibleFrequencyPeriods(items,'2026/2027','quarterly','2026-10-22').map(p=>p.id),['Q2']);
});
test('multi-frequency dataset preserves supported choices, in readable order', () => {
  assert.deepEqual(getConfiguredFrequencies({frequencies:['annual','monthly','quarterly']},items),['monthly','quarterly','annual']);
  assert.deepEqual(getConfiguredFrequencies({frequencies:['quarterly','annual']},items),['quarterly','annual']);
  assert.equal(frequencyLabel('annual'),'Annual');
  assert.equal(frequencyLabel('quarterly'),'Quarterly');
});
test('frequency filtering never combines annual, quarterly, monthly cards', () => {
  const pick=(frequency)=>getEligibleFrequencyPeriods(items,'2026/2027',frequency,'2026-10-22').map(p=>p.id);
  assert.deepEqual(pick('monthly'),['M10']);
  assert.deepEqual(pick('quarterly'),['Q2']);
  assert.deepEqual(pick('annual'),['Annual']);
  assert.deepEqual(pick('weekly'),[]);
});
test('only assigned, open and due-not-expired eligible period cards', () => {
  const closed=period('Q2-closed','quarterly','2026-10-01','2026-12-31','2027-01-10',{status:'closed'});
  const wrongYear=period('Q2-25','quarterly','2025-10-01','2025-12-31','2026-11-10',{reportingYear:'2025/2026'});
  assert.deepEqual(getEligibleFrequencyPeriods([...items,closed,wrongYear],'2026/2027','quarterly','2026-10-22').map(x=>x.id),['Q2']);
});
test('late-allowed period is available until inclusive deadline; no blind selection of past window', () => {
  const late=period('Q1-late','quarterly','2026-07-01','2026-09-30','2026-10-24');
  assert.deepEqual(getEligibleFrequencyPeriods([late],'2026/2027','quarterly','2026-10-22').map(p=>p.id),['Q1-late']);
  assert.equal(recommendPeriod([late],'2026-10-22'),null);
  assert.equal(recommendPeriod([items[4]],'2026-10-22')?.id,'Q2');
  assert.equal(getEligibleFrequencyPeriods([late],'2026/2027','quarterly','2026-10-25').length,0);
});
test('Due date rendering uses provided YYYY-MM-DD (not guess based on quarter)',()=>{
  assert.equal(formattedReportingDate('2027-01-10'),'10 Jan 2027');
  assert.equal(formattedReportingDate(''), '—');
});
test('Five-step wizard and existing indicator split kept; Step 1 uses frequency tabs and cards',()=>{
  assert.match(jsx,/const STEPS = \["Dataset", "Submission Method", "Data Entry", "Review", "Submit"\]/);
  for(const token of ['ido-financial-year','ido-frequency-options','ido-period-card-grid','role="radiogroup"','ido-indicator-picker','ido-indicator-editor','ido-submission-methods'])assert.ok(jsx.includes(token),token);
  assert.doesNotMatch(jsx,/id="ido-period"/);
  assert.match(jsx,/setReportingFrequency\(freq\);[\s\S]*?changePeriod\(match\?String\(match.id\):''\)/);
  assert.match(jsx,/setFinancialYear\(next\);[\s\S]*?changePeriod\(match\?String\(match.id\):''\)/);
  assert.match(css,/\.ido-period-card\.is-selected/);
});
test('Multiple datasets preserve frequency separately in workspace',()=>{
  assert.match(jsx,/periodId,financialYear,reportingFrequency,method,values,remarks,dimensionValues,filename/);
  assert.match(jsx,/setReportingFrequency\(target\.reportingFrequency\|\|''\)/);
  assert.match(jsx,/const period = periodCards\.find/); // always match currently displayed frequency/year
});
