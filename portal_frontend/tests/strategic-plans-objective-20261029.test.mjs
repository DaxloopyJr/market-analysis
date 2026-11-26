import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {annualObjectiveContextOf, objectivePickerState, objectiveSelectionPayload} from '../src/utils/annualObjective.js';
import {buildSubmissionValuesPayload} from '../src/utils/submissionValues.js';
import {latestObjectiveVersions, planFinancialYears} from '../src/utils/strategicPlanDisplay.js';
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const ctx = (over = {}) => ({data: {annualObjectiveContext: {reportingYearId: 40, yearLabel: '2026/2027', selectedObjective: null,
  availableObjectives: [{objectiveVersionId: 1, objectiveId: 1, versionNumber: 1, code: 'A', description: 'Kuimarisha uzalishaji', strategicPlanName: 'CBE Plan'},
    {objectiveVersionId: 3, objectiveId: 2, versionNumber: 2, code: 'B', description: 'Ubora'}],
  requiresEntry: true, selectionValid: false, readOnly: false, planConfigured: true, historicalSnapshotAvailable: true, ...over}}});

test('annualObjectiveContext is read from Laravel envelopes and frozen snapshots', () => {
  const c = annualObjectiveContextOf(ctx());
  assert.equal(c.yearLabel, '2026/2027');
  assert.deepEqual(c.available.map((o) => o.code), ['A', 'B']);
  assert.equal(objectivePickerState(c), 'select');
  const frozen = annualObjectiveContextOf({raw: {submittedVersions: [{attempt: 1, objective_snapshot: {objectiveVersionId: 1, code: 'A', description: 'Kuimarisha uzalishaji', yearLabel: '2026/2027'}}]}});
  assert.equal(frozen.selected.code, 'A');
  assert.equal(objectivePickerState(frozen), 'locked');
  assert.equal(objectivePickerState(annualObjectiveContextOf(ctx({planConfigured: false, availableObjectives: [], requiresEntry: false}))), 'no-plan');
  assert.equal(annualObjectiveContextOf({data: {}}), null);
  // A normalised record (context already parsed) keeps its selected objective.
  const record = {annualObjectiveContext: annualObjectiveContextOf(ctx({selectedObjective: {objectiveVersionId: 1, code: 'A', description: 'x'}})), raw: {}};
  assert.equal(annualObjectiveContextOf(record).selected.code, 'A');
});

test('draft can change the objective: payload sends version + expected (null first, then saved id)', () => {
  const first = annualObjectiveContextOf(ctx());
  assert.deepEqual(objectiveSelectionPayload(first, '1'), {objectiveVersionId: 1, expectedObjectiveVersionId: null});
  const saved = annualObjectiveContextOf(ctx({selectedObjective: {objectiveVersionId: 1, code: 'A', description: 'x'}, selectionValid: true}));
  assert.equal(objectiveSelectionPayload(saved, '1'), null); // unchanged -> omit
  assert.deepEqual(objectiveSelectionPayload(saved, '3'), {objectiveVersionId: 3, expectedObjectiveVersionId: 1});
  assert.equal(objectiveSelectionPayload(saved, '99'), null); // not offered by Laravel
  const locked = annualObjectiveContextOf(ctx({readOnly: true, availableObjectives: [], selectedObjective: {objectiveVersionId: 1, code: 'A', description: 'x'}}));
  assert.equal(objectiveSelectionPayload(locked, '3'), null);
  const payload = buildSubmissionValuesPayload({expectedRevision: 0, values: {8: '20'}, objective: {objectiveVersionId: 1, expectedObjectiveVersionId: null}});
  assert.deepEqual(payload, {expectedRevision: 0, values: [{indicatorId: 8, value: '20'}], objectiveVersionId: 1, expectedObjectiveVersionId: null});
  assert.equal('objectiveVersionId' in buildSubmissionValuesPayload({expectedRevision: 0, values: {8: '1'}}), false);
});

test('Strategic plan helpers: latest version per objective and plan reporting years', () => {
  const latest = latestObjectiveVersions([{objectiveId: 1, versionNumber: 1, code: 'A'}, {objectiveId: 1, versionNumber: 2, code: 'A'}, {objectiveId: 2, versionNumber: 1, code: 'B'}]);
  assert.deepEqual(latest.map((v) => `${v.code}${v.versionNumber}`), ['A2', 'B1']);
  assert.deepEqual(planFinancialYears('2026-07-01', '2031-06-30'), ['2026/2027', '2027/2028', '2028/2029', '2029/2030', '2030/2031']);
});

test('Strategic Plans page, menu and API routes follow the confirmed contract', () => {
  const api = read('src/API/strategicPlans.js');
  for (const route of ['/activate', '/objectives`', '/versions`']) assert.ok(api.includes(route), route);
  const menu = read('src/config/sidebarMenu.js');
  assert.match(menu, /"strategic-plans": \{ path: "\/dashboard\/strategic-plans", icon: "Target"/);
  assert.match(read('src/config/moduleRoutes.js'), /path: "strategic-plans", moduleId: "strategic-plans"/);
  const access = read('src/utils/strategicPlanAccess.js');
  assert.match(access, /MINISTRY_OBJECTIVES = \["MOA", "MDO", "MDD"\]/);
  assert.match(access, /INSTITUTION_OBJECTIVES = \["IA", "IDO"\]/);
  assert.match(access, /MINISTRY_PLAN = \["MOA"\]/);
  const page = read('src/pages/StrategicPlans/StrategicPlans.jsx');
  for (const marker of ['Create Strategic Plan', 'Add Objective', 'Activate plan', 'New objective version', 'RowActionsMenu', 'TableLoader']) assert.ok(page.includes(marker), marker);
});

test('New Submission step 1 holds the objective picker (no extra wizard step) and reviewers see the objective', () => {
  const entry = read('src/pages/DataEntry/DataEntry.jsx');
  assert.match(entry, /const STEPS = \["Dataset", "Submission Method", "Data Entry", "Review", "Submit"\];/);
  assert.match(entry, /<ObjectivePicker mode=\{objectiveMode\}/);
  assert.match(entry, /saveDraft\(\{id,values,remarks,dimensionValues,method,targetInputs,indicators,objectiveChoice,performanceInput:perfForm\}\)/);
  assert.match(read('src/services/idoSubmissionService.jsx'), /objectiveSelectionPayload\(before\.annualObjectiveContext, objectiveChoice\)/);
  for (const file of ['MDO/MdoWorkspace.jsx', 'MDD/MddWorkspace.jsx', 'HOD/HodReview.jsx', 'Submissions/OfficerSubmissionDetails.jsx']) assert.match(read(`src/pages/${file}`), /<ObjectiveCard record=\{record\}\/>/, file);
  assert.match(read('src/pages/AO/AoApprovals.jsx'), /<ObjectiveCard record=\{selected\}\/>/);
});

test('Institution logos shown in profile menu, profile, delegations, approval circle, audit and reports', () => {
  assert.match(read('src/components/Topbar.jsx'), /portal-profile-org"><MuLogo src=\{institutionLogoUrl\(user\?\.institution\)\}/);
  assert.match(read('src/pages/Admin/Delegations.jsx'), /<AdmOrg logo=\{institutionLogoUrl\(org\)\}/);
  assert.match(read('src/pages/Admin/ApprovalCircle.jsx'), /<MuLogo src=\{institutionLogoUrl\(org\)\}/);
  assert.match(read('src/pages/AuditLogs/AuditLogs.jsx'), /<MuLogo src=\{institutionLogoUrl\(event\.institution\)\}/);
  assert.match(read('src/pages/Reports/Reports.jsx'), /logo=\{ownOrg\(user\)\.logo\}/);
  assert.match(read('src/pages/Profile/AppearancePreferences.jsx'), /vw-pf-logo-icon/);
});

test('objective loading is not cancelled by its own "loading" state (stuck "Loading objectives…" bug)', () => {
  const entry = read('src/pages/DataEntry/DataEntry.jsx');
  assert.match(entry, /const objectiveRequests = useRef\(new Set\(\)\);/);
  assert.match(entry, /objectiveRequests\.current\.has\(templateKey\)/);
  assert.match(entry, /\.finally\(\(\) => \{ objectiveRequests\.current\.delete\(key\); \}\)/);
  // No "alive" cancellation inside the objective request.
  const block = entry.slice(entry.indexOf('const objectiveRequests'), entry.indexOf('const retryObjectives'));
  assert.doesNotMatch(block, /alive/);
  assert.match(entry, /mode === 'missing'/);
  assert.match(entry, /ido-objective-retry/);
});

import {existingSubmissionState, submissionsByPeriod, lockedReportMessage} from '../src/utils/periodSubmissions.js';
test('one report per dataset + period: submitted locks, draft/returned reopen the same record', () => {
  assert.equal(existingSubmissionState({status: 'under_review'}), 'locked');
  assert.equal(existingSubmissionState({status: 'Published'}), 'locked');
  assert.equal(existingSubmissionState({status: 'draft'}), 'draft');
  assert.equal(existingSubmissionState({status: 'returned_for_correction'}), 'returned');
  assert.equal(existingSubmissionState(null), null);
  const map = submissionsByPeriod([{id: 3, period_id: 41, status: 'draft'}, {id: 9, period_id: 41, status: 'submitted'}, {id: 4, period_id: 42, status: 'draft'}]);
  assert.equal(map['41'].id, 9);
  assert.match(lockedReportMessage({id: 9, status: 'under_review'}, 'Q2 2026/2027', 'Machinery Testing'), /already been submitted \(SUB-9, under review\)/);
  const entry = read('src/pages/DataEntry/DataEntry.jsx');
  assert.match(entry, /listSubmissionsPage\(\{datasetId: Number\(datasetId\), perPage: 100, page: 1\}\)/);
  assert.match(entry, /onClick=\{\(\)=>existingState\?void announceExisting\(item,existing\):changePeriod/);
  assert.match(entry, /navigate\(`\/dashboard\/submissions\/new\?edit=\$\{encodeURIComponent\(record\.id\)\}`\)/);
  assert.match(entry, /if \(step === 0 && selectedExistingState\)/);
});

test('other quarters of a locked year show the locked objective read-only, never a raw Laravel refusal', () => {
  const entry = read('src/pages/DataEntry/DataEntry.jsx');
  assert.match(entry, /async function lockedYearObjective\(\)/);
  assert.match(entry, /if \(context\?\.selected\) return \{\.\.\.context, readOnly: true, available: \[\]\};/);
  assert.match(entry, /const locked = await lockedYearObjective\(\);/);
  assert.doesNotMatch(entry, /Objectives could not be loaded from Laravel\{error/);
});
