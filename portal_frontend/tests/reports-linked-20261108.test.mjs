import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, readFileSync} from 'node:fs';
import {REPORTS} from '../src/config/reportCatalogue.js';
import {REPORT_DEFINITIONS} from '../src/config/reportDefinitions.js';
import {fmtMoney, previousYear, ratingOf, toCsv, yearIsOpen} from '../src/utils/reportText.js';
import {draftClosing, executiveModel, headline, keyMessages, objectivesAt90} from '../src/utils/executiveText.js';
const read = p => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
// meReports.js imports axios (browser module): read its slug list from source instead.
const ME_REPORT_SLUGS = [...read('src/API/meReports.js').match(/ME_REPORT_SLUGS = \[([\s\S]*?)\];/)[1].matchAll(/'([a-z-]+)'/g)].map(m => m[1]);

test('every catalogue report is linked to a Laravel report slug and has a presentation', () => {
  for (const r of REPORTS) {
    assert.ok(ME_REPORT_SLUGS.includes(r.api), r.id);
    if (r.view === 'standard') assert.ok(REPORT_DEFINITIONS[r.api], r.id);
    assert.ok(r.title.sw && r.title.en && r.description.sw, r.id);
  }
  assert.equal(ME_REPORT_SLUGS.length, 15);
});

const perfRow = (i, a) => ({indicatorId: i, indicatorName: `Indicator ${i}`, indicatorNameSw: `Kiashiria ${i}`, institutionName: i % 2 ? 'TBS' : 'BRELA',
  achievementPercent: a, rating: ratingOf(a), target: 100, actual: a, periodLabel: `2025/2026 Q${(i % 4) + 1}`, startDate: `2025-0${(i % 4) + 1}-01`});

test('each standard report builds tiles, chart and Kiswahili/English analysis from its payload', () => {
  const perf = [perfRow(1, 120), perfRow(2, 80), perfRow(3, 40)];
  const summary = {indicators: 3, submissions: 2, deliveryPercent: 80, fullyAchieved: 1, underperforming: 1, returns: 3, published: 2, late: 1};
  for (const [slug, def] of Object.entries(REPORT_DEFINITIONS)) {
    const ctx = {groupBy: '', labelKey: 'institutionName'};
    const rows = slug.endsWith('-performance') && slug !== 'indicator-performance' ? [{institutionName: 'TBS', sectorName: 'Industry', deliveryPercent: 90}, {institutionName: 'BRELA', sectorName: 'Trade', deliveryPercent: 70}] : perf;
    for (const lang of ['sw', 'en']) {
      const sentences = def.narrative(rows, summary, lang, ctx);
      assert.ok(Array.isArray(sentences), slug);
      sentences.forEach(t => assert.doesNotMatch(t, /undefined|NaN|\[object/, `${slug} ${lang}: ${t}`));
      def.chart?.(rows, summary, lang, ctx);
      def.kpis.forEach(k => k.value(summary, rows));
    }
  }
  assert.match(REPORT_DEFINITIONS['indicator-performance'].narrative(perf, summary, 'sw').join(' '), /Viashiria 3 vilipimwa/);
});

test('Kiswahili wording: money, provisional year, previous year and zero / one counts', () => {
  assert.equal(fmtMoney(93900697000), 'TZS bilioni 93.9');
  assert.equal(fmtMoney(93900697000, 'en'), 'TZS 93.9 billion');
  assert.equal(yearIsOpen('2026/2027', new Date('2026-11-08')), true);
  assert.equal(yearIsOpen('2024/2025', new Date('2026-11-08')), false);
  assert.equal(previousYear('2025/2026', ['2023/2024', '2024/2025', '2025/2026']), '2024/2025');
  assert.match(objectivesAt90([{deliveryPercent: 80}, {deliveryPercent: 70}]), /^Hakuna lengo la kimkakati kati ya 2/);
  assert.match(objectivesAt90([{deliveryPercent: 95}, {deliveryPercent: 70}]), /^Lengo 1 kati ya 2 ya kimkakati limefikia/);
  assert.match(toCsv([{key: 'a', label: {sw: 'Jina', en: 'Name'}}], [{a: 'x, y'}]), /^﻿Jina\r\n"x, y"$/);
});

test('executive model: headline with comparison, leaders, ministry vs institutions, editable closing', () => {
  const annual = {summary: {indicators: 191, deliveryPercent: 90.2, fullyAchieved: 120, underperforming: 20, publishedSubmissions: 40, institutions: 14},
    sections: {objectives: [{strategicObjective: 'A', deliveryPercent: 96}, {strategicObjective: 'G', deliveryPercent: 74}],
      institutions: [{institutionName: 'Ministry of Industry and Trade', deliveryPercent: 93.1}, {institutionName: 'TBS', deliveryPercent: 96.7}, {institutionName: 'FCC', deliveryPercent: 70.1}],
      exceptions: [{exceptionType: 'Missing target'}], budgetSummary: {approvedBudget: '93900697000', budgetUtilisationPercent: 87.2}, quarterlyTrend: [], narratives: []}};
  const m = executiveModel(annual, {summary: {deliveryPercent: 86}}, {rows: [{departmentName: 'DPP', deliveryPercent: 98.8}, {departmentName: 'No department / institution level', deliveryPercent: 1}]});
  assert.equal(m.institutions.length, 2);
  assert.equal(m.departments.length, 1);
  assert.match(headline(m, {year: '2025/2026', previousYear: '2024/2025'}), /imefikia wastani wa 90.2%.*ikilinganishwa na 86% mwaka 2024\/2025 \(ongezeko la pointi 4.2\)/);
  const messages = keyMessages(m).join(' ');
  assert.match(messages, /Taasisi zilizoongoza ni TBS \(96.7%\) na FCC \(70.1%\)/);
  assert.match(messages, /Idara na Vitengo vya Wizara vimefikia wastani wa 98.8%/);
  const closing = draftClosing(m, {year: '2025/2026'});
  assert.match(closing.conclusion, /utendaji imara/);
  assert.match(closing.recommendations, /kiashiria 1 kisicho na lengo la mwaka/);
});

test('team build: the Reports page is a list only; report pages are not shipped and old links return to the list', () => {
  const list = read('src/pages/Reports/Reports.jsx');
  assert.doesNotMatch(list, /navigate\(/);
  assert.match(list, /Report page in preparation/);
  assert.match(read('src/App.jsx'), /path="reports\/:reportId" element=\{<Navigate to="\/dashboard\/reports" replace \/>\}/);
  for (const gone of ['ReportView.jsx', 'ExecutiveReport.jsx', 'ReportScreen.jsx', 'reportParts.jsx', 'useReportFrame.js']) {
    assert.equal(existsSync(new URL(`../src/pages/Reports/${gone}`, import.meta.url)), false, gone);
  }
});
