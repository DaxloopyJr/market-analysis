import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {annualTargetContextOf, buildAnnualTargetsPayload, performanceOf, targetLocked,
  savedTargetsMatch, isNumericIndicator, targetInputError} from '../src/utils/annualTargets.js';
import {buildSubmissionValuesPayload, normalizeSubmissionRecord} from '../src/utils/submissionValues.js';

const context = {reportingYearId:40, yearLabel:'2026/2027',
  targets:[{id:1, indicatorId:8, reportingYearId:40, targetValue:'100.000000', templateVersionId:10}],
  missingIndicatorIds:[9], readOnly:false, historicalSnapshotAvailable:true};
const indicators = [
  {key:'8', type:'number', raw:{indicator:{dataType:'integer'}}},
  {key:'9', type:'number', raw:{indicator:{dataType:'decimal'}}},
  {key:'10', type:'text', raw:{indicator:{dataType:'text'}}},
];

test('reads annualTargetContext from a Laravel submission response', () => {
  const record = normalizeSubmissionRecord({data:{id:2, status:'draft', revision:1, values:[], annualTargetContext:context}});
  assert.equal(record.annualTargetContext.yearLabel, '2026/2027');
  assert.equal(record.annualTargetContext.byIndicator['8'], '100.000000');
});

test('only NEW numeric targets are sent; existing target (locked) and text indicators are omitted', () => {
  const ctx = annualTargetContextOf({annualTargetContext:context});
  const rows = buildAnnualTargetsPayload({targetInputs:{8:'150', 9:'75.5', 10:'9'}, context:ctx, indicators, status:'draft'});
  assert.deepEqual(rows, [{indicatorId:9, targetValue:'75.5'}]);
  assert.equal(targetLocked(ctx, 8, 'draft'), true);
  assert.equal(targetLocked(ctx, 9, 'draft'), false);
});

test('returned submissions never send annualTargets (Laravel rule)', () => {
  const ctx = annualTargetContextOf({annualTargetContext:context});
  assert.deepEqual(buildAnnualTargetsPayload({targetInputs:{9:'75'}, context:ctx, indicators, status:'returned'}), []);
  assert.equal(targetLocked(ctx, 9, 'returned'), true);
});

test('PUT values payload carries annualTargets alongside values', () => {
  const payload = buildSubmissionValuesPayload({expectedRevision:1, values:{8:'20'}, annualTargets:[{indicatorId:8, targetValue:'100'}]});
  assert.deepEqual(payload, {expectedRevision:1, values:[{indicatorId:8, value:'20'}], annualTargets:[{indicatorId:8, targetValue:'100'}]});
  assert.equal('annualTargets' in buildSubmissionValuesPayload({expectedRevision:1, values:{8:'20'}}), false);
});

test('performance bands: <50 Under, 50-80 Good, >80 Excellence', () => {
  assert.equal(performanceOf('20', '100').band, 'under');
  assert.equal(performanceOf('50', '100').band, 'good');
  assert.equal(performanceOf('80', '100').band, 'good');
  assert.equal(performanceOf('81', '100').band, 'excellence');
  assert.equal(performanceOf('', '100'), null);
  assert.equal(performanceOf('10', '0'), null);
});

test('read-back confirmation and input validation', () => {
  const ctx = annualTargetContextOf({annualTargetContext:context});
  assert.equal(savedTargetsMatch(ctx, [{indicatorId:8, targetValue:'100'}]), true);
  assert.equal(savedTargetsMatch(ctx, [{indicatorId:9, targetValue:'5'}]), false);
  assert.equal(isNumericIndicator(indicators[2]), false);
  assert.ok(targetInputError('-5'));
  assert.equal(targetInputError('12.5'), '');
});

test('all review pages render the shared target/performance component', () => {
  for (const file of ['src/pages/DataEntry/DataEntry.jsx','src/pages/HOD/HodReview.jsx','src/pages/AO/AoApprovals.jsx',
    'src/pages/MDO/MdoWorkspace.jsx','src/pages/Submissions/OfficerSubmissionDetails.jsx']) {
    const source = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
    assert.match(source, /TargetPerformance|PerformanceBar/, file);
  }
});

test('dataset Draft sector is editable and verified by read-back', () => {
  const source = readFileSync(new URL('../src/pages/ModulePage/Datasets.jsx', import.meta.url), 'utf8');
  assert.match(source, /disabled=\{Boolean\(sectorError\)\|\|readOnly\}/);
  assert.match(source, /api\.update\(id,\{sectors:sectorWritePayload\(form\.sectors\)\}\)/);
  assert.match(source, /sectorsMatch\(serverRecord,form\.sectors\)/);
});

test('reviewer GET after submit: frozen snapshot shapes are all read (IHoD/AO/MDO/MDD)', () => {
  // 1. context with empty targets + submittedVersions[].annual_targets_snapshot (array, snake_case)
  const a = normalizeSubmissionRecord({data:{id:5,status:'submitted',revision:3,values:[{indicatorId:8,value:'20'}],
    annualTargetContext:{reportingYearId:40,yearLabel:'2026/2027',targets:[],readOnly:true},
    submittedVersions:[{id:1,attempt:1,annual_targets_snapshot:[{indicator_id:8,target_value:'100.000000'}]}]}});
  assert.equal(a.annualTargetContext.byIndicator['8'], '100.000000');
  assert.equal(a.annualTargetContext.yearLabel, '2026/2027');
  // 2. object map keyed by indicator inside the context
  const b = annualTargetContextOf({data:{annualTargetContext:{yearLabel:'2026/2027',targets:{'8':'100','9':{targetValue:'40'}}}}});
  assert.deepEqual(b.byIndicator, {'8':'100','9':'40'});
  // 3. snapshot wrapped in {targets:[...]} and JSON string, no context at all
  const c = annualTargetContextOf({raw:{submitted_versions:[{attempt:2,annual_targets_snapshot:JSON.stringify({targets:[{indicatorId:10,targetValue:'450'}]})}]}});
  assert.equal(c.byIndicator['10'], '450');
  // 4. snake_case context key
  const d = annualTargetContextOf({raw:{annual_target_context:{year_label:'2026/2027',targets:[{indicator_id:8,target_value:'120'}]}}});
  assert.equal(d.byIndicator['8'], '120');
});
