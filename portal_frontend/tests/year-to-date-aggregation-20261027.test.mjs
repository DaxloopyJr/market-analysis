import test from 'node:test';
import assert from 'node:assert/strict';
import {aggregateYearToDate, priorPeriodValues, periodFacts, aggregationRuleOf, ytdForIndicator, periodOrderFromLabel} from '../src/utils/yearToDate.js';
import {annualTargetContextOf, missingTargetText} from '../src/utils/annualTargets.js';

const sub = (id, label, values, status = 'published', yearId = 40, datasetId = 1) => ({
  id, datasetId, status, periodLabel: label, frequency: label.includes('Q') ? 'quarterly' : 'monthly',
  values: Object.entries(values).map(([indicatorId, value]) => ({indicatorId: Number(indicatorId), value})),
  annualTargetContext: {reportingYearId: yearId, yearLabel: '2026/2027', targets: []},
});

test('SUM: Q1+Q2+Q3 are added and compared with the annual target', () => {
  const rows = [sub(1, '2026/2027 Q1', {8: '30'}), sub(2, '2026/2027 Q2', {8: '25'}), sub(3, '2026/2027 Q3', {8: '20'}, 'under_review')];
  const current = periodFacts(sub(3, '2026/2027 Q3', {8: '20'}, 'under_review'));
  const prior = priorPeriodValues(current, rows);
  assert.deepEqual(prior.periods, ['Q1', 'Q2']);
  const r = aggregateYearToDate({rule: 'sum', current: '20', currentLabel: 'Q3', prior: prior.byIndicator['8'], frequency: 'quarterly'});
  assert.equal(r.actual, '75');
  assert.match(r.basis, /Sum Q1–Q3 \(3 of 4 periods\)/);
});

test('MONTHLY sum over the financial year (Jul..)', () => {
  const rows = [sub(1, '2026/2027 M1', {8: '10'}), sub(2, '2026/2027 M2', {8: '12'})];
  const current = periodFacts(sub(9, '2026/2027 M3', {8: '8'}, 'submitted'));
  const prior = priorPeriodValues(current, rows);
  assert.equal(aggregateYearToDate({rule: 'sum', current: '8', currentLabel: 'M3', prior: prior.byIndicator['8'], frequency: 'monthly'}).actual, '30');
  assert.equal(periodOrderFromLabel('2026/2027 Oct'), 4);
});

test('other rules: latest, average, min, max, none', () => {
  const prior = [{label: 'Q1', order: 1, value: '40'}, {label: 'Q2', order: 2, value: '60'}];
  const run = rule => aggregateYearToDate({rule, current: '50', currentLabel: 'Q3', prior, frequency: 'quarterly'});
  assert.equal(run('latest').actual, '50');
  assert.equal(run('average').actual, '50');
  assert.match(run('average').basis, /partial/);
  assert.equal(run('min').actual, '40');
  assert.equal(run('max').actual, '60');
  assert.equal(run('none').actual, '50');
  assert.match(run('none').basis, /Q3 only/);
});

test('excluded: drafts, other year, other dataset, later periods, other frequency, the record itself', () => {
  const current = periodFacts(sub(5, '2026/2027 Q2', {8: '1'}, 'submitted'));
  const rows = [
    sub(5, '2026/2027 Q2', {8: '999'}),               // itself
    sub(6, '2026/2027 Q1', {8: '999'}, 'draft'),      // draft
    sub(7, '2025/2026 Q1', {8: '999'}, 'published', 39), // other year
    sub(8, '2026/2027 Q1', {8: '999'}, 'published', 40, 2), // other dataset
    sub(9, '2026/2027 Q3', {8: '999'}),               // later
    sub(10, '2026/2027 M1', {8: '999'}),              // monthly
    sub(11, '2026/2027 Q1', {8: '7'}),                // counted
  ];
  assert.deepEqual(priorPeriodValues(current, rows).byIndicator['8'], [{label: 'Q1', order: 1, value: '7'}]);
});

test('aggregation rule is read from indicator definitions / template rows', () => {
  assert.equal(aggregationRuleOf({raw: {indicator: {aggregationRule: 'sum'}}}), 'sum');
  assert.equal(aggregationRuleOf({raw: {aggregation_rule: 'LATEST'}}), 'latest');
  assert.equal(aggregationRuleOf({raw: {}}), '');
  const y = ytdForIndicator({indicator: {key: '8', raw: {indicator: {aggregationRule: 'sum'}}}, current: '20',
    ytdState: {byIndicator: {8: [{label: 'Q1', order: 1, value: '30'}]}}, facts: {label: 'Q2', frequency: 'quarterly'}});
  assert.equal(y.ytd, '50');
  assert.match(y.text, /To date: 50/);
});

test('MDD history: deep-nested target snapshot is found; legacy records are labelled', () => {
  const ctx = annualTargetContextOf({raw: {versions: [{snapshot: {annualTargetSnapshot: [{indicatorId: 8, targetValue: '100'}]}}]}});
  assert.equal(ctx.byIndicator['8'], '100');
  const legacy = annualTargetContextOf({raw: {annualTargetContext: {targets: [], historicalSnapshotAvailable: false}}});
  assert.equal(missingTargetText(legacy), 'Not recorded at submission');
});

test('regression: normalised record with annualTargetContext.targets keeps its targets (MDD/AO/IHoD/MDO)', async () => {
  const {normalizeSubmissionRecord} = await import('../src/utils/submissionValues.js');
  const record = normalizeSubmissionRecord({data:{id:22,status:'approved',values:[{indicatorId:8,value:'36'}],
    annualTargetContext:{reportingYearId:40,yearLabel:'2026/2027',targets:[{indicatorId:8,targetValue:'120'}]}}});
  assert.equal(annualTargetContextOf(record).byIndicator['8'], '120');
  // A merged copy (as MDO/MDD services build) with an EMPTY normalised context still reads raw.
  const merged = {...record, annualTargetContext:{byIndicator:{}}, raw:record.raw};
  assert.equal(annualTargetContextOf(merged).byIndicator['8'], '120');
});
