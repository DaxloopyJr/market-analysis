/**
 * FILE: src/utils/executiveText.js
 * Executive wording (Taarifa za Viongozi, 8 Nov 2026), modelled on the Ministry's "Taarifa ya Ufuatiliaji na
 * Tathmini ya Wizara 2025/26": headline first, then comparison, leaders, laggards, budget and actions.
 * Every sentence is built only from Laravel GET /reports/annual-me (+ organisation-performance) figures.
 */
import {combineObjectives, fmtInt, fmtMoney, fmtPct, num, r1} from './reportText.js';

const pick = (lang, sw, en) => (lang === 'en' ? en : sw);
const ranked = (list) => list.filter(i => num(i.deliveryPercent) !== null).sort((a, b) => num(b.deliveryPercent) - num(a.deliveryPercent));
const joinNames = (names, lang) => (names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} ${lang === 'en' ? 'and' : 'na'} ${names[names.length - 1]}`);
const MINISTRY = /ministry of industry|wizara ya viwanda/i;

/** How strong a delivery level is, in words. */
export function strength(pct, lang = 'sw') {
  const n = num(pct);
  if (n === null) return pick(lang, 'ambao bado haujapimwa', 'not yet assessed');
  if (n >= 90) return pick(lang, 'imara', 'strong');
  if (n >= 75) return pick(lang, 'wa kuridhisha', 'satisfactory');
  if (n >= 60) return pick(lang, 'wa wastani', 'moderate');
  return pick(lang, 'unaohitaji kuimarishwa', 'in need of strengthening');
}

/** "Malengo 4 kati ya 7 yamefikia…" / "Lengo 1 kati ya 7 limefikia…" / "Hakuna lengo…" */
export function objectivesAt90(objectives, lang = 'sw') {
  const high = objectives.filter(o => num(o.deliveryPercent) >= 90).length;
  const n = objectives.length;
  if (!high) return pick(lang, `Hakuna lengo la kimkakati kati ya ${n} lililofikia asilimia 90 au zaidi`, `None of the ${n} strategic objectives reached 90% or more`);
  if (high === 1) return pick(lang, `Lengo 1 kati ya ${n} ya kimkakati limefikia asilimia 90 au zaidi`, `1 of ${n} strategic objectives reached 90% or more`);
  return pick(lang, `Malengo ${high} kati ya ${n} ya kimkakati yamefikia asilimia 90 au zaidi`, `${high} of ${n} strategic objectives reached 90% or more`);
}
/** Kiswahili noun class for indicators: "kiashiria 1 kisicho…" / "viashiria 3 visivyo…". */
export const indicatorsWord = (n, one, many) => (Number(n) === 1 ? `kiashiria 1 ${one}` : `viashiria ${n} ${many}`);

/** Change in points between two percentages, as words. */
export function changeWords(now, before, lang = 'sw') {
  if (num(now) === null || num(before) === null) return '';
  const d = r1(num(now) - num(before));
  if (d === 0) return pick(lang, 'sawa na mwaka uliopita', 'unchanged from last year');
  return d > 0 ? pick(lang, `ongezeko la pointi ${d}`, `up ${d} points`) : pick(lang, `upungufu wa pointi ${Math.abs(d)}`, `down ${Math.abs(d)} points`);
}

/**
 * Split the annual institutions section into the Ministry (its own departments and units) and the institutions under it.
 * `departments` = organisation-performance rows grouped by department (optional).
 */
export function executiveModel(annual, previous = null, departmentPayload = null) {
  const s = annual?.summary ?? {};
  const sec = annual?.sections ?? {};
  const objectives = ranked(combineObjectives(sec.objectives ?? annual?.rows ?? []).map(o => ({...o, label: o.strategicObjective ?? '—'})));
  const allOrgs = (sec.institutions ?? []).map(o => ({...o, label: o.institutionName ?? '—'}));
  const ministryRow = allOrgs.find(o => MINISTRY.test(o.label)) ?? null;
  const institutions = ranked(allOrgs.filter(o => o !== ministryRow));
  const departments = ranked((departmentPayload?.rows ?? []).filter(d => d.departmentName && !/^no department/i.test(d.departmentName))
    .map(d => ({...d, label: d.departmentName})));
  const avgOf = (list) => { const v = list.map(i => num(i.deliveryPercent)).filter(x => x !== null); return v.length ? r1(v.reduce((a, b) => a + b, 0) / v.length) : null; };
  const narratives = sec.narratives ?? [];
  // Latest cumulative row per indicator series (Laravel quarterly-trend) = the year's result of each indicator.
  const latest = new Map();
  for (const row of sec.quarterlyTrend ?? []) {
    const key = row.seriesKey ?? `${row.indicatorId}-${row.institutionId}`;
    if (!latest.has(key) || String(row.startDate) > String(latest.get(key).startDate)) latest.set(key, row);
  }
  const indicators = [...latest.values()];
  // Areas needing attention judged on the year to date (cumulative), not on one quarter against the annual target.
  const cumulativeOf = (r) => num(r.cumulativeAchievementPercent ?? r.achievementPercent);
  const exceptions = indicators.length ? indicators.map(r => {
    const pct = cumulativeOf(r);
    const type = num(r.cumulativeTarget ?? r.target) === null ? 'Missing target' : pct === null ? 'Missing actual'
      : pct === 0 ? 'Zero delivery' : pct < 70 ? 'Underperformance' : pct > 120 ? 'Overachievement' : null;
    return type ? {...r, exceptionType: type, achievementPercent: pct} : null;
  }).filter(Boolean) : (sec.exceptions ?? []);
  const exceptionCounts = exceptions.reduce((acc, e) => { acc[e.exceptionType] = (acc[e.exceptionType] ?? 0) + 1; return acc; }, {});
  // Year-to-date trend: average cumulative achievement per period, each indicator counted at most 100% (as Laravel's delivery).
  const periodMap = new Map();
  for (const row of sec.quarterlyTrend ?? []) {
    const key = row.periodLabel ?? '—';
    if (!periodMap.has(key)) periodMap.set(key, {label: key, start: row.startDate, cumulative: []});
    if (num(row.cumulativeAchievementPercent) !== null) periodMap.get(key).cumulative.push(Math.min(100, num(row.cumulativeAchievementPercent)));
  }
  const mean = (v) => (v.length ? r1(v.reduce((a, b) => a + b, 0) / v.length) : null);
  const trend = [...periodMap.values()].sort((a, b) => String(a.start).localeCompare(String(b.start)))
    .map(p => ({label: p.label, value: mean(p.cumulative)}));
  return {
    summary: s, previous: previous?.summary ?? null, budget: sec.budgetSummary ?? {}, budgetRows: sec.budgetDelivery ?? [],
    objectives, institutions, ministryRow, departments, institutionAverage: avgOf(institutions), departmentAverage: avgOf(departments),
    exceptions, exceptionCounts, narratives, trend, indicators,
    hasData: num(s.indicators) > 0,
  };
}

/** The opening sentence of the report ("headline"). */
export function headline(m, {lang = 'sw', year = '', previousYear = ''} = {}) {
  const s = m.summary;
  const cmp = m.previous && num(m.previous.deliveryPercent) !== null
    ? pick(lang, `, ikilinganishwa na ${fmtPct(m.previous.deliveryPercent)} mwaka ${previousYear} (${changeWords(s.deliveryPercent, m.previous.deliveryPercent, lang)})`,
      `, compared with ${fmtPct(m.previous.deliveryPercent)} in ${previousYear} (${changeWords(s.deliveryPercent, m.previous.deliveryPercent, lang)})`)
    : '';
  return pick(lang,
    `Katika Mwaka wa Fedha ${year}, Wizara ya Viwanda na Biashara imefikia wastani wa ${fmtPct(s.deliveryPercent)} ya utekelezaji wa malengo katika viashiria ${fmtInt(s.indicators)} vilivyopimwa${cmp}.`,
    `In Financial Year ${year}, the Ministry of Industry and Trade reached an average of ${fmtPct(s.deliveryPercent)} of its targets across ${fmtInt(s.indicators, 'en')} indicators assessed${cmp}.`);
}

/** Five key messages for the executive brief and chapter 2. */
export function keyMessages(m, {lang = 'sw', previousYear = ''} = {}) {
  const s = m.summary;
  const out = [];
  if (num(s.indicators)) out.push(pick(lang,
    `Viashiria ${fmtInt(s.fullyAchieved)} sawa na ${fmtPct(num(s.fullyAchieved) / num(s.indicators) * 100)} vimefikia au kuvuka malengo, wakati ${fmtInt(s.underperforming)} viko chini ya asilimia 70 ya malengo.`,
    `${fmtInt(s.fullyAchieved, 'en')} indicators (${fmtPct(num(s.fullyAchieved) / num(s.indicators) * 100)}) met or exceeded their targets, while ${fmtInt(s.underperforming, 'en')} are below 70%.`));
  if (m.objectives.length) {
    out.push(`${objectivesAt90(m.objectives, lang)}; ${pick(lang, `Lengo ${m.objectives[0].label} limeongoza kwa ${fmtPct(m.objectives[0].deliveryPercent)}`, `Objective ${m.objectives[0].label} leads with ${fmtPct(m.objectives[0].deliveryPercent)}`)}.`);
  }
  if (m.institutions.length > 1) {
    const top = m.institutions.slice(0, 3).map(i => `${i.label} (${fmtPct(i.deliveryPercent)})`);
    const low = m.institutions[m.institutions.length - 1];
    out.push(pick(lang,
      `Taasisi zilizoongoza ni ${joinNames(top, lang)}; ${low.label} inahitaji msukumo zaidi kwa kuwa imefikia ${fmtPct(low.deliveryPercent)}.`,
      `The leading institutions are ${joinNames(top, 'en')}; ${low.label} needs more support at ${fmtPct(low.deliveryPercent)}.`));
  }
  const ministry = m.departmentAverage ?? num(m.ministryRow?.deliveryPercent);
  if (ministry !== null && m.institutionAverage !== null) out.push(pick(lang,
    `Idara na Vitengo vya Wizara vimefikia wastani wa ${fmtPct(ministry)}, wakati Taasisi ${m.institutions.length} zilizo chini ya Wizara zimefikia wastani wa ${fmtPct(m.institutionAverage)}.`,
    `The Ministry's departments and units averaged ${fmtPct(ministry)}, while the ${m.institutions.length} institutions under the Ministry averaged ${fmtPct(m.institutionAverage)}.`));
  if (num(m.budget.budgetUtilisationPercent) !== null) out.push(pick(lang,
    `Matumizi ya fedha yamefikia ${fmtPct(m.budget.budgetUtilisationPercent)} ya bajeti iliyoidhinishwa ya ${fmtMoney(m.budget.approvedBudget)}.`,
    `Spending reached ${fmtPct(m.budget.budgetUtilisationPercent)} of the approved budget of ${fmtMoney(m.budget.approvedBudget, 'en')}.`));
  else if (m.previous && previousYear && num(m.previous.indicators)) out.push(pick(lang,
    `Mwaka ${previousYear} viashiria ${fmtInt(m.previous.indicators)} vilipimwa na ${fmtInt(m.previous.fullyAchieved)} vilifikia malengo.`,
    `In ${previousYear}, ${fmtInt(m.previous.indicators, 'en')} indicators were assessed and ${fmtInt(m.previous.fullyAchieved, 'en')} met their targets.`));
  return out;
}

/** One paragraph per department / institution. */
export function orgParagraph(o, lang = 'sw') {
  const budget = num(o.budgetUtilisationPercent) !== null
    ? pick(lang, `, huku matumizi ya bajeti yakifikia ${fmtPct(o.budgetUtilisationPercent)}`, `, with budget utilisation of ${fmtPct(o.budgetUtilisationPercent)}`) : '';
  return pick(lang,
    `${o.label} ilipimwa kwa viashiria ${fmtInt(o.indicators)}, ambapo ${fmtInt(o.fullyAchieved)} vilifikia au kuvuka malengo na ${fmtInt(o.underperforming)} viko chini ya asilimia 70, hivyo kufikia ${fmtPct(o.deliveryPercent)} ya utekelezaji${budget}.`,
    `${o.label} was assessed on ${fmtInt(o.indicators, 'en')} indicators: ${fmtInt(o.fullyAchieved, 'en')} met or exceeded target and ${fmtInt(o.underperforming, 'en')} are below 70%, giving ${fmtPct(o.deliveryPercent)} delivery${budget}.`);
}

/** Achievements / challenges / actions written by institutions, grouped by organisation. */
export function narrativeItems(narratives, field, limit = 12) {
  const seen = new Set();
  const out = [];
  for (const n of narratives) {
    const text = String(n?.[field] ?? '').trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    out.push({text: text.length > 420 ? `${text.slice(0, 417)}…` : text, org: n.institutionName ?? n.departmentName ?? '', dataset: n.datasetName ?? '', period: n.periodLabel ?? ''});
    if (out.length >= limit) break;
  }
  return out;
}

/** Draft conclusion and recommendations (editable before printing). */
export function draftClosing(m, {lang = 'sw', year = ''} = {}) {
  const s = m.summary;
  const conclusion = [pick(lang,
    `Kwa ujumla, Wizara ya Viwanda na Biashara imeonesha utendaji ${strength(s.deliveryPercent, lang)} katika Mwaka wa Fedha ${year}, ikifikia ${fmtPct(s.deliveryPercent)} ya utekelezaji wa malengo katika viashiria ${fmtInt(s.indicators)} vilivyopimwa.`,
    `Overall, the Ministry of Industry and Trade showed ${strength(s.deliveryPercent, 'en')} performance in Financial Year ${year}, reaching ${fmtPct(s.deliveryPercent)} of its targets across ${fmtInt(s.indicators, 'en')} indicators.`)];
  if (m.institutions.length) conclusion.push(pick(lang,
    `Matokeo haya yanaonesha utekelezaji wa mipango na sera kwa kasi inayotofautiana kati ya Taasisi, ambapo ${m.institutions[0].label} imeongoza.`,
    `Results show plans and policies being implemented at different speeds across institutions, led by ${m.institutions[0].label}.`));
  const recs = [];
  const weak = m.institutions.filter(i => num(i.deliveryPercent) < 75).map(i => i.label);
  if (weak.length) recs.push(pick(lang, `Kuimarisha ufuatiliaji wa karibu na usaidizi kwa ${joinNames(weak.slice(0, 4), lang)} ili kuongeza kasi ya utekelezaji.`,
    `Strengthen close follow-up and support for ${joinNames(weak.slice(0, 4), 'en')} to speed up delivery.`));
  if (m.exceptionCounts['Missing target']) recs.push(pick(lang, `Kukamilisha uwekaji wa malengo kwa ${indicatorsWord(m.exceptionCounts['Missing target'], 'kisicho na lengo la mwaka', 'visivyo na malengo ya mwaka')}.`,
    `Set annual targets for the ${m.exceptionCounts['Missing target']} indicators that have none.`));
  if (m.exceptionCounts['Zero delivery']) recs.push(pick(lang, `Kuchukua hatua za haraka kwa ${indicatorsWord(m.exceptionCounts['Zero delivery'], 'ambacho hakijatekelezwa kabisa', 'ambavyo havijatekelezwa kabisa')}.`,
    `Take urgent action on the ${m.exceptionCounts['Zero delivery']} indicators with no delivery.`));
  if (num(m.budget.budgetUtilisationPercent) !== null && num(s.deliveryPercent) !== null && num(m.budget.budgetUtilisationPercent) > num(s.deliveryPercent) + 10)
    recs.push(pick(lang, 'Kuhakikisha thamani ya fedha kwa kuoanisha matumizi ya bajeti na matokeo halisi ya utekelezaji.', 'Ensure value for money by aligning spending with physical results.'));
  recs.push(pick(lang, 'Kuhakikisha Taasisi na Idara zote zinawasilisha takwimu kwa wakati kupitia VIWANDA PORTAL ili kuboresha maamuzi.',
    'Ensure all institutions and departments submit data on time through VIWANDA PORTAL to support decisions.'));
  return {conclusion: conclusion.join(' '), recommendations: recs.map((r, i) => `${i + 1}. ${r}`).join('\n')};
}

export const INTRO = {
  sw: 'Ufuatiliaji na Tathmini (U&T) unalenga kufuatilia utekelezaji wa sera, mikakati na programu za Sekta ya Viwanda na Biashara kupitia Mpango Mkakati wa Wizara, ili kubaini mafanikio, changamoto na hatua stahiki za kuboresha utendaji. Taarifa hii imeandaliwa kutoka takwimu zilizowasilishwa, kukaguliwa na kuchapishwa na Idara, Vitengo na Taasisi zilizo chini ya Wizara kupitia VIWANDA PORTAL.',
  en: 'Monitoring and Evaluation (M&E) tracks the implementation of the policies, strategies and programmes of the Industry and Trade Sector through the Ministry\'s Strategic Plan, to identify achievements, challenges and the actions needed to improve performance. This report is prepared from figures submitted, reviewed and published by the Ministry\'s departments, units and institutions through VIWANDA PORTAL.',
};
