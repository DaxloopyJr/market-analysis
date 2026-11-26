import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeSubmissionRecord, buildSubmissionValuesPayload } from '../src/utils/submissionValues.js';
import { annualBudgetContextOf, budgetStatus, parseMoney, performanceErrors, performancePayload, savedPerformanceMatch, yearToDateBudget } from '../src/utils/budgetPerformance.js';
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

const sample = {data: {id: 14, status: 'draft', revision: 3,
  annualBudgetContext: {reportingYearId: 1, yearLabel: '2026/2027', approvedBudget: null, optional: true, readOnly: false},
  performance: {approved_budget: null, budget_scope: 'annual', actual_received: '300000000', actual_expenditure: '260000000',
    achievements: 'Mashine 42', implementation_challenges: 'Fedha', corrective_actions: null, me_comments: null}}};

test('reads annualBudgetContext and performance from GET /submissions/{id}', () => {
  const r = normalizeSubmissionRecord(sample);
  assert.equal(r.annualBudgetContext.yearLabel, '2026/2027');
  assert.equal(r.annualBudgetContext.locked, false);
  assert.equal(r.performance.received, 300000000);
  assert.equal(r.performance.spent, 260000000);
  assert.equal(r.performance.challenges, 'Fedha');
});

test('approved budget is sent once; omitted after it is locked for the year', () => {
  const form = {approvedBudget: '1,200,000,000', received: '300,000,000', spent: '260,000,000', achievements: 'a', challenges: 'b', correctiveActions: ''};
  assert.equal(performancePayload(form, {locked: false}).approved_budget, 1200000000);
  assert.ok(!('approved_budget' in performancePayload(form, annualBudgetContextOf({annualBudgetContext: {approvedBudget: 5}}))));
  const body = buildSubmissionValuesPayload({expectedRevision: 3, values: {51: '30'}, performance: performancePayload(form, {locked: true})});
  assert.deepEqual(body.performance, {actual_received: 300000000, actual_expenditure: 260000000, achievements: 'a', implementation_challenges: 'b', corrective_actions: null});
  assert.ok(savedPerformanceMatch(normalizeSubmissionRecord(sample).performance, {actual_received: 300000000, actual_expenditure: 260000000}));
  assert.ok(!savedPerformanceMatch(null, body.performance));
});

test('spending status: above / within / under / none', () => {
  assert.equal(budgetStatus({received: 300, spent: 320}).label, 'Above budget');
  assert.equal(budgetStatus({received: 300, spent: 280}).label, 'Within budget');
  assert.equal(budgetStatus({received: 300, spent: 100}).label, 'Under budget');
  assert.equal(budgetStatus({received: 0, spent: 0}).key, 'none');
  assert.equal(budgetStatus({received: null, spent: null}), null);
  assert.match(budgetStatus({received: 300, spent: 280, approved: 200}).message, /above the approved annual budget/);
});

test('year to date sums same-year reports and replaces the current saved row', () => {
  const rows = [{id: 1, raw: {periodLabel: '2026/2027 Q1'}, performance: {received: 250, spent: 220}},
    {id: 2, raw: {periodLabel: '2026/2027 Q2'}, performance: {received: 999, spent: 999}},
    {id: 3, raw: {periodLabel: '2025/2026 Q4'}, performance: {received: 50, spent: 50}}];
  const ytd = yearToDateBudget(rows, {currentId: 2, yearLabel: '2026/2027', current: {received: 300, spent: 260}});
  assert.deepEqual([ytd.received, ytd.spent, ytd.balance], [550, 480, 70]);
});

test('validation: achievements and challenges required; money must be valid', () => {
  assert.equal(parseMoney('1,200,000'), 1200000);
  const errors = performanceErrors({received: 'abc', spent: '', achievements: '', challenges: 'x'}, {optional: true});
  assert.ok(errors.received && errors.achievements && !errors.challenges && !errors.spent);
});

test('Data Entry step 3 and every review page show the budget + notes', () => {
  const entry = read('src/pages/DataEntry/DataEntry.jsx');
  assert.match(entry, /<BudgetEntry form=\{perfForm\}/);
  assert.match(entry, /<NotesEntry form=\{perfForm\}/);
  assert.match(entry, /performanceInput:perfForm/);
  for (const file of ['MDO/MdoWorkspace.jsx', 'MDD/MddWorkspace.jsx', 'HOD/HodReview.jsx', 'Submissions/OfficerSubmissionDetails.jsx'])
    assert.match(read(`src/pages/${file}`), /<PerformanceSummary record=\{record\}\/>/, file);
  assert.match(read('src/pages/AO/AoApprovals.jsx'), /<PerformanceSummary record=\{selected\}\/>/);
});
