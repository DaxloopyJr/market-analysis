// Admin Submission Monitoring (10 Nov 2026): read-only, existing reads only, stuck = 5 working days.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {isMinistryAdmin, monitorRow, workingDaysSince, STUCK_WORKING_DAYS} from '../src/utils/submissionMonitor.js';

const today = new Date(2026, 10, 10); // Tue 10 Nov 2026
const lookups = {
  datasets: new Map([['70', {id: 70, institutionId: 15, datasetName: 'WRRB – Objective G', responsibleUserId: 101}]]),
  institutions: new Map([['15', {id: 15, code: 'WRRB', name: 'Warehouse Receipts Regulatory Board'}], ['1', {id: 1, code: 'MIT', name: 'Ministry'}]]),
  people: new Map([['101', {name: 'Officer', institutionId: 15, roles: ['IDO'], active: true}], ['7', {name: 'Ao One', institutionId: 15, roles: ['AO'], active: true}],
    ['8', {name: 'Mdo One', institutionId: 1, roles: ['MDO'], active: true}], ['9', {name: 'Ao Other', institutionId: 2, roles: ['AO'], active: true}]]),
};

test('working days skip weekends', () => {
  assert.equal(workingDaysSince(new Date(2026, 10, 6), today), 2); // Fri -> Mon, Tue
  assert.equal(workingDaysSince(new Date(2026, 10, 3), today), 5);
  assert.equal(STUCK_WORKING_DAYS, 5);
});

test('a row at the AO step is held by AOs of that institution and is stuck after 5 working days', () => {
  const r = monitorRow({id: 1, datasetId: 70, status: 'under_review', currentStep: {required_role_code: 'AO'}, deadline: '2026-11-07',
    submittedAt: '2026-11-02T08:00:00Z', history: [{acted_at: '2026-11-03T09:00:00Z'}]}, lookups, today);
  assert.equal(r.role, 'AO');
  assert.deepEqual(r.holders, ['Ao One']);
  assert.equal(r.days, 5);
  assert.equal(r.stuck, true);
  assert.equal(r.deadline.key, 'ontime');
  assert.equal(r.institution, 'WRRB');
});

test('ministry steps are held by ministry staff; drafts past the deadline are overdue', () => {
  assert.deepEqual(monitorRow({id: 2, datasetId: 70, status: 'under_review', currentStep: {required_role_code: 'MDO'}, history: []}, lookups, today).holders, ['Mdo One']);
  const draft = monitorRow({id: 3, datasetId: 70, status: 'draft', deadline: '2026-11-07', updatedAt: '2026-11-09T08:00:00Z'}, lookups, today);
  assert.equal(draft.late, true);
  assert.equal(draft.deadline.days, 3);
  assert.deepEqual(draft.holders, ['Officer']);
  const done = monitorRow({id: 4, datasetId: 70, status: 'published', deadline: '2026-11-07', submittedAt: '2026-11-08T08:00:00Z'}, lookups, today);
  assert.equal(done.stuck, false);
  assert.equal(done.deadline.key, 'late');
});

test('MOA gets monitoring only: no approval queue in its menu and no approval buttons on the page', () => {
  assert.equal(isMinistryAdmin({roles: [{code: 'MOA'}]}), true);
  assert.equal(isMinistryAdmin({roles: [{code: 'MDO'}]}), false);
  const menu = readFileSync(new URL('../src/config/sidebarMenu.js', import.meta.url), 'utf8');
  assert.match(menu, /roleCodes\.has\("MOA"\) && !officer[\s\S]*?Submission Monitoring[\s\S]*?return items;/);
  const page = readFileSync(new URL('../src/pages/Submissions/SubmissionMonitor.jsx', import.meta.url), 'utf8');
  assert.doesNotMatch(page, /postReviewSubmission|approveSubmission|\/approve|\/publish|\/return/);
});
