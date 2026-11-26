import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildMeBundle, draftConclusion, kpiBand, kpiCsv, objectiveOf, periodOrder, ratingTone, summarySentences } from '../src/utils/meReport.js';
import { payloads } from './fixtures/me-camartec-sample.mjs';
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('CAMARTEC sample reproduces the M&E Excel results', () => {
  const b = buildMeBundle(payloads());
  assert.equal(b.score.score, 76.2);
  assert.equal(b.tone, 'amber');
  assert.equal(b.counts.total, 20);
  assert.equal(b.counts.onTrackAll, 9);
  assert.equal(b.counts.partial, 3);
  assert.equal(b.counts.belowAll, 8);
  assert.deepEqual(b.pace.map(p => p.actual), [13.7, 39.5, 49, 76.2]);
  assert.deepEqual(b.pace.map(p => p.planned), [25, 50, 75, 100]);
  assert.equal(b.pace[3].gap, -23.8);
  assert.deepEqual(b.objectives.map(o => o.code), ['D', 'E', 'F', 'C', 'B', 'A']);
  assert.equal(b.budget.utilisation, 14.6);
  assert.equal(b.exceptionsTotal, 11);
  assert.equal(b.variance.over, 6);
  assert.ok(b.narratives.some(n => n.kind === 'challenge'));
});

test('objectives fall back to KPI rows when the objective report is missing', () => {
  const p = payloads(); delete p.objectives;
  const b = buildMeBundle(p);
  const c = b.objectives.find(o => o.code === 'C');
  assert.equal(c.score, 47.9);
  assert.equal(b.objectives.find(o => o.code === 'D').score, 100);
  assert.equal(b.objectives.find(o => o.code === 'D').raw > 100, true);
});

test('helpers: objective code, period order, bands, rating tone', () => {
  assert.deepEqual(objectiveOf('F - Good Governance'), {code: 'F', name: 'Good Governance'});
  assert.equal(periodOrder('2025/2026 Q3').order, 3);
  assert.equal(periodOrder('2025/2026 H2').of, 2);
  assert.equal(kpiBand(0), 'notStarted');
  assert.equal(kpiBand(100), 'achieved');
  assert.equal(kpiBand(null), 'noTarget');
  assert.equal(ratingTone('Amber - Moderate'), 'amber');
  assert.equal(ratingTone('', 85), 'green');
  assert.equal(ratingTone('Below target'), 'red');
});

test('summary and conclusion in English and Kiswahili; CSV opens in Excel', () => {
  const b = buildMeBundle(payloads());
  assert.match(summarySentences(b, {name: 'CAMARTEC'}).join(' '), /scored 76.2% \(Moderate\) on 20 KPIs/);
  assert.match(summarySentences(b, {name: 'CAMARTEC', lang: 'sw'}).join(' '), /imepata alama ya jumla ya 76.2%/);
  assert.match(draftConclusion(b, {name: 'CAMARTEC', lang: 'sw'}).recommendations, /viashiria 11/);
  const csv = kpiCsv(b.kpis);
  assert.ok(csv.startsWith('﻿Objective,KPI'));
  assert.equal(csv.split('\r\n').length, 21);
});

test('Institution dashboard keeps the dataset cards and adds the M&E tabs + PDF route', () => {
  const page = read('src/pages/Analytics/InstitutionDashboard.jsx');
  assert.match(page, /<DatasetCard key=\{row\.key\} row=\{row\} onOpen=\{\(\)=>openDataset\(row\.dataset\.id\)\}\/>/);
  assert.match(page, /<MeOverview bundle=\{view\.bundle\}/); // reports bundle, or the analytics bundle for roles without reports.view.* (30 Oct 2026)
  assert.match(page, /Open PDF report/);
  assert.match(read('src/App.jsx'), /analytics\/:type\/:id\/report/);
  assert.match(read('src/config/sidebarMenu.js'), /\\\/report\)\?\$/);
  const report = read('src/pages/Analytics/MeReport.jsx');
  assert.match(report, /window\.print\(\)/);
  assert.match(report, /Kiswahili/);
  assert.match(report, /mer-edit/);
  assert.match(read('src/API/meReports.js'), /api\.get\(`\/reports\/\$\{slug\}`/);
});
