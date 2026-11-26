/**
 * FILE: src/config/reportDefinitions.js
 * How each Laravel report (/reports/{slug}) is presented in the report document (8 Nov 2026):
 *   kpis      – headline figures (Muhtasari) from the payload summary/rows
 *   chart     – one chart built from the rows
 *   narrative – "Uchambuzi": sentences generated only from the returned figures
 *   columns   – the table (also the CSV export)
 * Row and summary keys follow ReportController (API document entries 5–19). Missing values show "—".
 */
import {
  avg, combineObjectives, exceptionText, objectiveLabel, fmtHours, fmtInt, fmtMoney, fmtPct, groupRows, num, r1, ratingOf, ratingText, RATING_ORDER,
  statusText, sum, toneOf,
} from '../utils/reportText.js';

const T = (sw, en) => ({sw, en});
const pick = (lang, sw, en) => (lang === 'en' ? en : sw);
const orgName = (row) => row.departmentName && row.institutionName === 'Ministry of Industry and Trade' ? row.departmentName : (row.institutionName ?? row.departmentName ?? '—');
const indName = (row, lang) => (lang === 'sw' && row.indicatorNameSw ? row.indicatorNameSw : row.indicatorName) ?? row.indicatorCode ?? '—';
const objective = (row) => row.strategicObjective ?? '—';
const best = (items, key) => items.filter(i => num(i[key]) !== null).sort((a, b) => num(b[key]) - num(a[key]));

// ---------- common column sets ----------
const C = {
  institution: {key: 'institutionName', label: T('Taasisi / Idara', 'Institution / Department'), get: orgName},
  dataset: {key: 'datasetName', label: T('Seti ya data', 'Dataset')},
  period: {key: 'periodLabel', label: T('Kipindi', 'Period')},
  deadline: {key: 'deadline', label: T('Tarehe ya mwisho', 'Deadline'), fmt: 'date'},
  submitted: {key: 'submittedAt', label: T('Iliwasilishwa', 'Submitted'), fmt: 'date'},
  published: {key: 'publishedAt', label: T('Ilichapishwa', 'Published'), fmt: 'date'},
  status: {key: 'status', label: T('Hali', 'Status'), fmt: 'status'},
  revision: {key: 'revision', label: T('Toleo', 'Revision'), fmt: 'int'},
  reference: {key: 'reference', label: T('Kumbukumbu', 'Reference')},
  daysLate: {key: 'daysLate', label: T('Siku za kuchelewa', 'Days late'), fmt: 'int'},
};
const groupColumns = (labelKey, label) => [
  {key: labelKey, label},
  {key: 'indicators', label: T('Viashiria', 'Indicators'), fmt: 'int'},
  {key: 'fullyAchieved', label: T('Vimefikia lengo', 'Fully achieved'), fmt: 'int'},
  {key: 'underperforming', label: T('Chini ya 70%', 'Below 70%'), fmt: 'int'},
  {key: 'deliveryPercent', label: T('Utekelezaji', 'Delivery'), fmt: 'pct', tone: true},
  {key: 'budgetUtilisationPercent', label: T('Matumizi ya bajeti', 'Budget used'), fmt: 'pct'},
  {key: 'compositeScore', label: T('Alama ya jumla', 'Composite score'), fmt: 'pct'},
  {key: 'rating', label: T('Daraja', 'Rating'), fmt: 'rating'},
];
const performanceKpis = [
  {label: T('Wastani wa utekelezaji', 'Average delivery'), value: (s) => s.deliveryPercent, fmt: 'pct', tone: true},
  {label: T('Viashiria vilivyopimwa', 'Indicators assessed'), value: (s) => s.indicators, fmt: 'int'},
  {label: T('Vimefikia au kuvuka lengo', 'Met or exceeded target'), value: (s) => s.fullyAchieved, fmt: 'int'},
  {label: T('Chini ya 70% ya lengo', 'Below 70% of target'), value: (s) => s.underperforming, fmt: 'int', bad: true},
];
/** Ranked horizontal bars of a grouped performance report. */
const rankChart = (labelKey, title) => (rows, s, lang) => ({type: 'hbar', unit: '%', title,
  items: best(rows, 'deliveryPercent').map(r => ({label: labelKey === 'strategicObjective' ? objectiveLabel(r, lang) : (r[labelKey] ?? '—'), value: r1(r.deliveryPercent), tone: toneOf(r.deliveryPercent)}))});
/**
 * Sentences for a ranked group report (objectives, institutions, departments, sectors).
 * word: {sw, en, cls} — cls 'li' for "lengo/malengo" (limeongoza / yamefikia), otherwise 'i' (imeongoza / zimefikia).
 */
function rankNarrative(rows, summary, lang, word) {
  const ranked = best(rows, 'deliveryPercent');
  if (!ranked.length) return [];
  const [top, second] = ranked;
  const low = ranked[ranked.length - 1];
  const high = ranked.filter(r => num(r.deliveryPercent) >= 90).length;
  const li = word.cls === 'li';
  const out = [pick(lang,
    `Wastani wa utekelezaji ni ${fmtPct(summary.deliveryPercent)} katika viashiria ${fmtInt(summary.indicators)} vilivyopimwa.`,
    `Average delivery is ${fmtPct(summary.deliveryPercent)} across ${fmtInt(summary.indicators, 'en')} indicators assessed.`)];
  out.push(pick(lang,
    `${top.label} ${li ? 'limeongoza' : 'imeongoza'} kwa ${fmtPct(top.deliveryPercent)}${second ? `, ${li ? 'likifuatiwa' : 'ikifuatiwa'} na ${second.label} (${fmtPct(second.deliveryPercent)})` : ''}.`,
    `${top.label} leads with ${fmtPct(top.deliveryPercent)}${second ? `, followed by ${second.label} (${fmtPct(second.deliveryPercent)})` : ''}.`));
  if (ranked.length > 1) out.push(high ? pick(lang,
    `${word.sw[0].toUpperCase()}${word.sw.slice(1)} ${high} kati ya ${ranked.length} ${li ? (high === 1 ? 'limefikia' : 'yamefikia') : (high === 1 ? 'imefikia' : 'zimefikia')} asilimia 90 au zaidi ya malengo.`.replace(/^Malengo 1 /, 'Lengo 1 '),
    `${high} of ${ranked.length} ${word.en} reached 90% or more of their targets.`) : pick(lang,
    `Hakuna ${li ? 'lengo' : word.sw} kati ya ${ranked.length} ${li ? 'lililofikia' : 'iliyofikia'} asilimia 90 au zaidi.`,
    `None of the ${ranked.length} ${word.en} reached 90% or more.`));
  if (ranked.length > 2) out.push(pick(lang,
    `${low.label} ${li ? 'lina' : 'ina'} utekelezaji wa chini zaidi (${fmtPct(low.deliveryPercent)}) na ${li ? 'linahitaji' : 'inahitaji'} msukumo zaidi.`,
    `${low.label} has the lowest delivery (${fmtPct(low.deliveryPercent)}) and needs closer follow-up.`));
  return out;
}

export const REPORT_DEFINITIONS = {
  // ======================= M&E performance =======================
  'indicator-performance': {
    kpis: performanceKpis,
    chart: (rows, s, lang) => {
      const counts = Object.fromEntries(RATING_ORDER.map(k => [k, 0]));
      rows.forEach(r => { counts[r.rating ?? ratingOf(r.achievementPercent)] = (counts[r.rating ?? ratingOf(r.achievementPercent)] ?? 0) + 1; });
      return {type: 'bars', title: T('Mgawanyo wa viashiria kwa daraja la utekelezaji', 'Indicators by performance rating'),
        items: RATING_ORDER.filter(k => counts[k]).map(k => ({label: ratingText(k, lang), value: counts[k], tone: toneOf(k === 'Exceeded' ? 101 : k === 'High' ? 80 : k === 'Moderate' ? 50 : k === 'Not assessed' ? null : 10)}))};
    },
    narrative: (rows, s, lang) => {
      const ranked = best(rows, 'achievementPercent');
      const out = [pick(lang,
        `Viashiria ${fmtInt(s.indicators)} vilipimwa kutoka taarifa ${fmtInt(s.submissions)} zilizochapishwa, na wastani wa utekelezaji ni ${fmtPct(s.deliveryPercent)} (${ratingText(ratingOf(s.deliveryPercent))}).`,
        `${fmtInt(s.indicators, 'en')} indicators were assessed from ${fmtInt(s.submissions, 'en')} published returns, with average delivery of ${fmtPct(s.deliveryPercent)} (${ratingText(ratingOf(s.deliveryPercent), 'en')}).`)];
      if (num(s.indicators)) out.push(pick(lang,
        `Viashiria ${fmtInt(s.fullyAchieved)} (${fmtPct(num(s.fullyAchieved) / num(s.indicators) * 100)}) vimefikia au kuvuka lengo, na ${fmtInt(s.underperforming)} viko chini ya asilimia 70 ya lengo.`,
        `${fmtInt(s.fullyAchieved, 'en')} indicators (${fmtPct(num(s.fullyAchieved) / num(s.indicators) * 100)}) met or exceeded target, while ${fmtInt(s.underperforming, 'en')} are below 70%.`));
      if (ranked.length > 1) out.push(pick(lang,
        `Kiashiria kilichofanya vizuri zaidi ni "${indName(ranked[0], lang)}" (${fmtPct(ranked[0].achievementPercent)}), na cha chini zaidi ni "${indName(ranked[ranked.length - 1], lang)}" (${fmtPct(ranked[ranked.length - 1].achievementPercent)}).`,
        `The best performing indicator is "${indName(ranked[0], lang)}" (${fmtPct(ranked[0].achievementPercent)}); the lowest is "${indName(ranked[ranked.length - 1], lang)}" (${fmtPct(ranked[ranked.length - 1].achievementPercent)}).`));
      return out;
    },
    sort: (a, b) => (num(b.achievementPercent) ?? -1) - (num(a.achievementPercent) ?? -1),
    columns: [
      {key: 'indicatorName', label: T('Kiashiria', 'Indicator'), get: indName, wide: true},
      {key: 'institutionName', label: T('Taasisi', 'Institution'), get: orgName},
      {key: 'strategicObjective', label: T('Lengo', 'Objective'), get: objective},
      {key: 'periodLabel', label: T('Kipindi', 'Period')},
      {key: 'baseline', label: T('Msingi', 'Baseline'), fmt: 'num'},
      {key: 'target', label: T('Lengo la mwaka', 'Annual target'), fmt: 'num'},
      {key: 'actual', label: T('Halisi', 'Actual'), fmt: 'num'},
      {key: 'achievementPercent', label: T('Utekelezaji', 'Achievement'), fmt: 'pct', tone: true},
      {key: 'rating', label: T('Daraja', 'Rating'), fmt: 'rating'},
    ],
  },
  'quarterly-trend': {
    kpis: performanceKpis,
    chart: (rows) => {
      const byPeriod = groupRows(rows, r => r.periodLabel, items => ({value: r1(avg(items.map(i => i.achievementPercent))), cumulative: r1(avg(items.map(i => i.cumulativeAchievementPercent))), start: items[0].startDate}));
      return {type: 'line', unit: '%', title: T('Wastani wa utekelezaji kwa kila kipindi na wa jumla', 'Average achievement per period and cumulative'),
        series: [T('Kipindi husika', 'Period'), T('Jumla tangu mwanzo wa mwaka', 'Cumulative')],
        items: byPeriod.sort((a, b) => String(a.start).localeCompare(String(b.start))).map(p => ({label: p.label, value: p.value, value2: p.cumulative}))};
    },
    narrative: (rows, s, lang) => {
      const periods = groupRows(rows, r => r.periodLabel, items => ({value: avg(items.map(i => i.achievementPercent)), start: items[0].startDate}))
        .sort((a, b) => String(a.start).localeCompare(String(b.start)));
      if (!periods.length) return [];
      const top = [...periods].sort((a, b) => (b.value ?? -1) - (a.value ?? -1))[0];
      const last = periods[periods.length - 1];
      const prev = periods[periods.length - 2];
      const out = [pick(lang,
        `Takwimu zinahusu vipindi ${periods.length}; kipindi chenye utekelezaji wa juu zaidi ni ${top.label} (${fmtPct(top.value)}).`,
        `The data covers ${periods.length} periods; the strongest period is ${top.label} (${fmtPct(top.value)}).`)];
      if (prev && last.value !== null && prev.value !== null) {
        const diff = r1(last.value - prev.value);
        out.push(pick(lang,
          `Katika ${last.label} utekelezaji ulikuwa ${fmtPct(last.value)}, ${diff >= 0 ? `ongezeko la pointi ${diff}` : `upungufu wa pointi ${Math.abs(diff)}`} ukilinganisha na ${prev.label}.`,
          `${last.label} recorded ${fmtPct(last.value)}, ${diff >= 0 ? `up ${diff} points` : `down ${Math.abs(diff)} points`} from ${prev.label}.`));
      }
      return out;
    },
    sort: (a, b) => String(a.indicatorName).localeCompare(String(b.indicatorName)) || String(a.startDate).localeCompare(String(b.startDate)),
    columns: [
      {key: 'indicatorName', label: T('Kiashiria', 'Indicator'), get: indName, wide: true},
      {key: 'institutionName', label: T('Taasisi', 'Institution'), get: orgName},
      {key: 'periodLabel', label: T('Kipindi', 'Period')},
      {key: 'target', label: T('Lengo la mwaka', 'Annual target'), fmt: 'num'},
      {key: 'actual', label: T('Halisi (kipindi)', 'Actual (period)'), fmt: 'num'},
      {key: 'cumulativeActual', label: T('Halisi (jumla)', 'Actual (cumulative)'), fmt: 'num'},
      {key: 'achievementPercent', label: T('Kipindi', 'Period %'), fmt: 'pct', tone: true},
      {key: 'cumulativeAchievementPercent', label: T('Jumla', 'Cumulative %'), fmt: 'pct', tone: true},
    ],
  },
  'strategic-objective': {
    kpis: performanceKpis,
    rows: (rows) => combineObjectives(rows),
    chart: rankChart('strategicObjective', T('Utekelezaji kwa kila lengo la kimkakati', 'Delivery by strategic objective')),
    narrative: (rows, s, lang) => rankNarrative(rows.map(r => ({...r, label: `${lang === 'en' ? 'Objective' : 'Lengo'} ${r.strategicObjective}`})), s, lang, {sw: 'malengo', en: 'objectives', cls: 'li'}),
    sort: (a, b) => String(a.strategicObjective).localeCompare(String(b.strategicObjective)),
    columns: [{key: 'strategicObjective', label: T('Lengo la kimkakati', 'Strategic objective'), get: (r, lang) => objectiveLabel(r, lang), wide: true},
      ...groupColumns('strategicObjective', T('Lengo', 'Objective')).slice(1), {key: 'institutions', label: T('Taasisi zinazochangia', 'Contributing institutions'), fmt: 'int'}],
  },
  'organisation-performance': {
    kpis: performanceKpis,
    groupBy: true,
    chart: (rows, s, lang, ctx) => rankChart(ctx.labelKey, ctx.groupBy === 'department' ? T('Utekelezaji kwa Idara na Vitengo', 'Delivery by department and unit') : T('Utekelezaji kwa Taasisi', 'Delivery by institution'))(rows, s, lang),
    narrative: (rows, s, lang, ctx) => rankNarrative(rows.map(r => ({...r, label: r[ctx.labelKey]})), s, lang, ctx.groupBy === 'department' ? {sw: 'idara na vitengo', en: 'departments and units'} : {sw: 'taasisi', en: 'institutions'}),
    // Laravel puts institution-level data under "No department / institution level" when grouping by department.
    rows: (rows, ctx) => (ctx.groupBy === 'department' ? rows.filter(r => !/^no department/i.test(String(r.departmentName ?? ''))) : rows),
    sort: (a, b) => (num(b.deliveryPercent) ?? -1) - (num(a.deliveryPercent) ?? -1),
    columns: (ctx) => [{key: 'rank', label: T('Na.', 'No.'), get: (r, lang, i) => i + 1},
      ...groupColumns(ctx.labelKey, ctx.groupBy === 'department' ? T('Idara / Kitengo', 'Department / Unit') : T('Taasisi', 'Institution'))],
  },
  'sector-performance': {
    kpis: performanceKpis,
    chart: rankChart('sectorName', T('Utekelezaji kwa sekta', 'Delivery by sector')),
    narrative: (rows, s, lang) => rankNarrative(rows.map(r => ({...r, label: r.sectorName})), s, lang, {sw: 'sekta', en: 'sectors'}),
    sort: (a, b) => (num(b.deliveryPercent) ?? -1) - (num(a.deliveryPercent) ?? -1),
    columns: [...groupColumns('sectorName', T('Sekta', 'Sector')), {key: 'institutions', label: T('Taasisi zinazochangia', 'Contributing institutions'), fmt: 'int'}],
  },
  'target-exceptions': {
    kpis: [
      {label: T('Maeneo yanayohitaji msukumo', 'Exceptions'), value: (s) => s.exceptions, fmt: 'int', bad: true},
      {label: T('Viashiria vilivyopimwa', 'Indicators assessed'), value: (s) => s.indicators, fmt: 'int'},
      {label: T('Chini ya 70% ya lengo', 'Below 70% of target'), value: (s) => s.underperforming, fmt: 'int', bad: true},
      {label: T('Wastani wa utekelezaji', 'Average delivery'), value: (s) => s.deliveryPercent, fmt: 'pct', tone: true},
    ],
    chart: (rows, s, lang) => ({type: 'bars', title: T('Maeneo kwa aina', 'Exceptions by type'),
      items: groupRows(rows, r => r.exceptionType, items => ({value: items.length})).sort((a, b) => b.value - a.value)
        .map(g => ({label: exceptionText(g.label, lang), value: g.value, tone: g.label === 'Overachievement' ? 'blue' : g.label.startsWith('Missing') ? 'grey' : 'red'}))}),
    narrative: (rows, s, lang) => {
      if (!rows.length) return [pick(lang, 'Hakuna kiashiria kilichoonekana kuwa na tatizo katika kipindi hiki.', 'No exceptions were found for this selection.')];
      const types = groupRows(rows, r => r.exceptionType, items => ({value: items.length})).sort((a, b) => b.value - a.value);
      const orgs = groupRows(rows, orgName, items => ({value: items.length})).sort((a, b) => b.value - a.value);
      return [pick(lang,
        `Maeneo ${fmtInt(rows.length)} yanahitaji msukumo: ${types.map(t => `${exceptionText(t.label).toLowerCase()} (${t.value})`).join(', ')}.`,
        `${fmtInt(rows.length, 'en')} exceptions need attention: ${types.map(t => `${exceptionText(t.label, 'en').toLowerCase()} (${t.value})`).join(', ')}.`),
      pick(lang, `${orgs[0].label} ina maeneo mengi zaidi (${orgs[0].value}).`, `${orgs[0].label} has the most exceptions (${orgs[0].value}).`)];
    },
    sort: (a, b) => (num(a.achievementPercent) ?? 999) - (num(b.achievementPercent) ?? 999),
    columns: [
      {key: 'indicatorName', label: T('Kiashiria', 'Indicator'), get: indName, wide: true},
      {key: 'institutionName', label: T('Taasisi', 'Institution'), get: orgName},
      {key: 'exceptionType', label: T('Aina', 'Type'), fmt: 'exception'},
      {key: 'target', label: T('Lengo', 'Target'), fmt: 'num'},
      {key: 'actual', label: T('Halisi', 'Actual'), fmt: 'num'},
      {key: 'achievementPercent', label: T('Utekelezaji', 'Achievement'), fmt: 'pct', tone: true},
      {key: 'implementationChallenges', label: T('Changamoto', 'Challenges')},
    ],
  },
  'budget-delivery': {
    landscape: true,
    kpis: [
      {label: T('Bajeti iliyoidhinishwa', 'Approved budget'), value: (s) => s.approvedBudget, fmt: 'money'},
      {label: T('Fedha zilizopokelewa', 'Funds received'), value: (s) => s.actualReceived, fmt: 'money'},
      {label: T('Matumizi halisi', 'Actual expenditure'), value: (s) => s.actualExpenditure, fmt: 'money'},
      {label: T('Matumizi dhidi ya bajeti', 'Budget utilisation'), value: (s) => s.budgetUtilisationPercent, fmt: 'pct'},
    ],
    chart: (rows) => ({type: 'pair', unit: '%', title: T('Utekelezaji dhidi ya matumizi ya bajeti kwa taasisi', 'Delivery against budget utilisation by institution'),
      series: [T('Utekelezaji', 'Delivery'), T('Matumizi ya bajeti', 'Budget used')],
      items: groupRows(rows, orgName, items => ({value: r1(avg(items.map(i => i.deliveryPercent))), value2: r1(avg(items.map(i => i.budgetUtilisationPercent)))}))
        .filter(g => g.value !== null || g.value2 !== null).sort((a, b) => (b.value ?? -1) - (a.value ?? -1)).map(g => ({...g}))}),
    narrative: (rows, s, lang) => {
      const out = [];
      if (num(s.approvedBudget) !== null) out.push(pick(lang,
        `Bajeti iliyoidhinishwa ni ${fmtMoney(s.approvedBudget)}, fedha zilizopokelewa ni ${fmtMoney(s.actualReceived)} na matumizi halisi ni ${fmtMoney(s.actualExpenditure)}, sawa na ${fmtPct(s.budgetUtilisationPercent)} ya bajeti.`,
        `The approved budget is ${fmtMoney(s.approvedBudget, 'en')}; funds received are ${fmtMoney(s.actualReceived, 'en')} and expenditure is ${fmtMoney(s.actualExpenditure, 'en')}, i.e. ${fmtPct(s.budgetUtilisationPercent)} of the budget.`));
      const delivery = avg(rows.map(r => r.deliveryPercent));
      if (delivery !== null && num(s.budgetUtilisationPercent) !== null) {
        const gap = r1(delivery - num(s.budgetUtilisationPercent));
        out.push(pick(lang,
          `Wastani wa utekelezaji halisi ni ${fmtPct(delivery)}; ${gap >= 0 ? `utekelezaji umezidi matumizi kwa pointi ${gap}, ishara ya matumizi yenye tija` : `matumizi yamezidi utekelezaji kwa pointi ${Math.abs(gap)}, hivyo thamani ya fedha inahitaji kufuatiliwa`}.`,
          `Average physical delivery is ${fmtPct(delivery)}; ${gap >= 0 ? `delivery exceeds spending by ${gap} points, indicating good value for money` : `spending exceeds delivery by ${Math.abs(gap)} points, so value for money needs follow-up`}.`));
      }
      const missing = rows.filter(r => r.financialDataStatus === 'Missing financial data').length;
      if (missing) out.push(pick(lang, `Taarifa ${missing} hazina takwimu za fedha.`, `${missing} returns have no financial data.`));
      return out;
    },
    sort: (a, b) => String(orgName(a)).localeCompare(String(orgName(b))),
    columns: [
      C.institution, C.dataset, C.period,
      {key: 'approvedBudget', label: T('Bajeti iliyoidhinishwa (TZS milioni)', 'Approved budget (TZS million)'), fmt: 'millions'},
      {key: 'actualReceived', label: T('Iliyopokelewa (TZS milioni)', 'Received (TZS million)'), fmt: 'millions'},
      {key: 'actualExpenditure', label: T('Matumizi (TZS milioni)', 'Expenditure (TZS million)'), fmt: 'millions'},
      {key: 'budgetUtilisationPercent', label: T('Matumizi %', 'Used %'), fmt: 'pct'},
      {key: 'deliveryPercent', label: T('Utekelezaji', 'Delivery'), fmt: 'pct', tone: true},
      {key: 'deliveryExpenditureGap', label: T('Tofauti (pointi)', 'Gap (points)'), fmt: 'num'},
    ],
  },

  // ======================= Submission & workflow =======================
  'data-submission': {
    landscape: true,
    kpis: [
      {label: T('Taarifa zilizowasilishwa', 'Returns submitted'), value: (s) => s.returns, fmt: 'int'},
      {label: T('Zilizochapishwa', 'Published'), value: (s) => s.published, fmt: 'int'},
      {label: T('Zilizochelewa', 'Submitted late'), value: (s) => s.late, fmt: 'int', bad: true},
      {label: T('Kwa wakati', 'On time'), value: (s) => (num(s.returns) ? r1((num(s.returns) - num(s.late)) / num(s.returns) * 100) : null), fmt: 'pct', tone: true},
    ],
    chart: (rows, s, lang) => ({type: 'bars', title: T('Taarifa kwa hali', 'Returns by status'),
      items: groupRows(rows, r => r.status, items => ({value: items.length})).sort((a, b) => b.value - a.value)
        .map(g => ({label: statusText(g.label, lang), value: g.value, tone: g.label === 'published' ? 'green' : g.label === 'returned' ? 'red' : 'blue'}))}),
    narrative: (rows, s, lang) => [pick(lang,
      `Taarifa ${fmtInt(s.returns)} ziliwasilishwa; ${fmtInt(s.published)} zimechapishwa na ${fmtInt(s.late)} ziliwasilishwa baada ya tarehe ya mwisho.`,
      `${fmtInt(s.returns, 'en')} returns were submitted; ${fmtInt(s.published, 'en')} are published and ${fmtInt(s.late, 'en')} arrived after the deadline.`)],
    sort: (a, b) => String(orgName(a)).localeCompare(String(orgName(b))) || String(a.startDate).localeCompare(String(b.startDate)),
    columns: [C.institution, C.dataset, C.period, C.deadline, C.submitted, C.daysLate, C.status, C.revision, C.published],
  },
  'submission-compliance': {
    kpis: [
      {label: T('Uwasilishaji kwa wakati', 'On-time compliance'), value: (s) => s.returnCompliancePercent, fmt: 'pct', tone: true},
      {label: T('Taasisi zilizozingatia kikamilifu', 'Fully compliant institutions'), value: (s) => s.institutionalFullCompliancePercent, fmt: 'pct'},
      {label: T('Taarifa zilizotarajiwa', 'Expected returns'), value: (s) => s.expectedReturns, fmt: 'int'},
      {label: T('Zilizowasilishwa kwa wakati', 'On-time returns'), value: (s) => s.onTimeReturns, fmt: 'int'},
    ],
    chart: (rows) => ({type: 'hbar', unit: '%', title: T('Uwasilishaji kwa wakati kwa kila taasisi', 'On-time compliance by institution'),
      items: groupRows(rows, orgName, items => ({value: sum(items.map(i => i.expectedReturns)) ? r1(sum(items.map(i => i.onTimeReturns)) / sum(items.map(i => i.expectedReturns)) * 100) : null}))
        .sort((a, b) => (b.value ?? -1) - (a.value ?? -1)).map(g => ({...g, tone: g.value >= 90 ? 'green' : g.value >= 70 ? 'amber' : 'red'}))}),
    narrative: (rows, s, lang) => {
      const orgs = groupRows(rows, orgName, items => ({value: sum(items.map(i => i.expectedReturns)) ? sum(items.map(i => i.onTimeReturns)) / sum(items.map(i => i.expectedReturns)) * 100 : null}))
        .filter(g => g.value !== null).sort((a, b) => a.value - b.value);
      const out = [pick(lang,
        `Kati ya taarifa ${fmtInt(s.expectedReturns)} zilizotarajiwa, ${fmtInt(s.onTimeReturns)} ziliwasilishwa kwa wakati, sawa na ${fmtPct(s.returnCompliancePercent)}.`,
        `Of ${fmtInt(s.expectedReturns, 'en')} expected returns, ${fmtInt(s.onTimeReturns, 'en')} were submitted on time (${fmtPct(s.returnCompliancePercent)}).`),
      pick(lang, `${fmtPct(s.institutionalFullCompliancePercent)} ya taasisi zimezingatia kikamilifu.`, `${fmtPct(s.institutionalFullCompliancePercent)} of institutions are fully compliant.`)];
      if (orgs.length > 1) out.push(pick(lang, `${orgs[0].label} ina kiwango cha chini zaidi (${fmtPct(orgs[0].value)}) na inahitaji ufuatiliaji.`, `${orgs[0].label} has the lowest rate (${fmtPct(orgs[0].value)}) and needs follow-up.`));
      return out;
    },
    sort: (a, b) => (num(a.compliancePercent) ?? 999) - (num(b.compliancePercent) ?? 999),
    columns: [C.institution, C.period,
      {key: 'expectedReturns', label: T('Zilizotarajiwa', 'Expected'), fmt: 'int'},
      {key: 'onTimeReturns', label: T('Kwa wakati', 'On time'), fmt: 'int'},
      {key: 'lateReturns', label: T('Zilichelewa', 'Late'), fmt: 'int'},
      {key: 'outstandingReturns', label: T('Bado', 'Outstanding'), fmt: 'int'},
      {key: 'returnedReturns', label: T('Zilirudishwa', 'Returned'), fmt: 'int'},
      {key: 'compliancePercent', label: T('Uzingatiaji', 'Compliance'), fmt: 'pct', tone: true}],
  },
  'outstanding-overdue': {
    landscape: true,
    kpis: [
      {label: T('Taarifa ambazo bado', 'Outstanding returns'), value: (s) => s.outstanding, fmt: 'int', bad: true},
      {label: T('Zimepita tarehe ya mwisho', 'Overdue'), value: (s) => s.overdue, fmt: 'int', bad: true},
      {label: T('Hazijaanzishwa', 'Not started'), value: (s) => s.notStarted, fmt: 'int'},
      {label: T('Siku nyingi zaidi za kuchelewa', 'Longest delay (days)'), value: (s, rows) => (rows.length ? Math.max(...rows.map(r => num(r.daysOverdue) ?? 0)) : null), fmt: 'int'},
    ],
    chart: (rows) => ({type: 'hbar', title: T('Taarifa ambazo bado kwa kila taasisi', 'Outstanding returns by institution'),
      items: groupRows(rows, orgName, items => ({value: items.length})).sort((a, b) => b.value - a.value).map(g => ({...g, tone: 'red'}))}),
    narrative: (rows, s, lang) => {
      const out = [pick(lang,
        `Taarifa ${fmtInt(s.outstanding)} bado hazijawasilishwa; ${fmtInt(s.overdue)} zimepita tarehe ya mwisho na ${fmtInt(s.notStarted)} hazijaanzishwa kabisa.`,
        `${fmtInt(s.outstanding, 'en')} returns are outstanding; ${fmtInt(s.overdue, 'en')} are past their deadline and ${fmtInt(s.notStarted, 'en')} have not been started.`)];
      const worst = rows[0];
      if (worst && num(worst.daysOverdue)) out.push(pick(lang,
        `Iliyochelewa zaidi ni ${worst.datasetName} ya ${orgName(worst)} (${worst.periodLabel}), siku ${fmtInt(worst.daysOverdue)}; afisa anayehusika ni ${worst.responsibleOfficer ?? '—'}.`,
        `The longest delay is ${worst.datasetName} of ${orgName(worst)} (${worst.periodLabel}), ${fmtInt(worst.daysOverdue, 'en')} days; responsible officer: ${worst.responsibleOfficer ?? '—'}.`));
      return out;
    },
    sort: (a, b) => (num(b.daysOverdue) ?? 0) - (num(a.daysOverdue) ?? 0),
    columns: [C.institution, C.dataset, C.period, C.deadline,
      {key: 'daysOverdue', label: T('Siku zilizopita', 'Days overdue'), fmt: 'int'}, C.status,
      {key: 'responsibleOfficer', label: T('Afisa anayehusika', 'Responsible officer')}],
  },
  'approval-turnaround': {
    landscape: true,
    kpis: [
      {label: T('Wastani hadi kuchapishwa', 'Average time to publication'), value: (s) => s.averagePublicationHours, fmt: 'hours'},
      {label: T('Taarifa zilizowasilishwa', 'Returns submitted'), value: (s) => s.returns, fmt: 'int'},
      {label: T('Zilizochapishwa', 'Published'), value: (s) => s.published, fmt: 'int'},
      {label: T('Wastani wa mapitio', 'Average review time'), value: (s, rows) => avg(rows.map(r => r.reviewHours)), fmt: 'hours'},
    ],
    chart: (rows) => ({type: 'hbar', title: T('Wastani wa muda hadi kuchapishwa kwa taasisi (siku)', 'Average days to publication by institution'),
      items: groupRows(rows, orgName, items => ({value: r1((avg(items.map(i => i.publicationHours)) ?? 0) / 24)})).filter(g => g.value)
        .sort((a, b) => b.value - a.value).map(g => ({...g, tone: g.value > 14 ? 'red' : g.value > 7 ? 'amber' : 'green'}))}),
    narrative: (rows, s, lang) => [pick(lang,
      `Wastani wa muda kutoka uwasilishaji hadi uchapishaji ni ${fmtHours(s.averagePublicationHours)}; mapitio ya kwanza huchukua wastani wa ${fmtHours(avg(rows.map(r => r.reviewHours)))}.`,
      `Average time from submission to publication is ${fmtHours(s.averagePublicationHours, 'en')}; the first review takes ${fmtHours(avg(rows.map(r => r.reviewHours)), 'en')} on average.`)],
    sort: (a, b) => (num(b.publicationHours) ?? -1) - (num(a.publicationHours) ?? -1),
    columns: [C.institution, C.dataset, C.period, C.submitted,
      {key: 'reviewHours', label: T('Mapitio', 'Review'), fmt: 'hours'},
      {key: 'approvalHours', label: T('Uidhinishaji', 'Approval'), fmt: 'hours'},
      {key: 'publicationHours', label: T('Hadi kuchapishwa', 'To publication'), fmt: 'hours'},
      {key: 'currentStep', label: T('Hatua ya sasa', 'Current step'), fmt: 'status'}, C.status],
  },
  'returned-corrections': {
    landscape: true,
    kpis: [
      {label: T('Taarifa zilizorudishwa', 'Returned submissions'), value: (s) => s.returnedSubmissions, fmt: 'int', bad: true},
      {label: T('Jumla ya marejesho', 'Total returns'), value: (s) => s.totalReturns, fmt: 'int'},
      {label: T('Wastani wa marekebisho', 'Average correction time'), value: (s) => s.averageCorrectionHours, fmt: 'hours'},
      {label: T('Zilizorudishwa zaidi ya mara moja', 'Returned more than once'), value: (s, rows) => rows.filter(r => num(r.returnCount) > 1).length, fmt: 'int'},
    ],
    chart: (rows) => ({type: 'hbar', title: T('Marejesho kwa kila taasisi', 'Returns by institution'),
      items: groupRows(rows, orgName, items => ({value: sum(items.map(i => i.returnCount))})).sort((a, b) => b.value - a.value).map(g => ({...g, tone: 'amber'}))}),
    narrative: (rows, s, lang) => [pick(lang,
      `Taarifa ${fmtInt(s.returnedSubmissions)} zilirudishwa kwa marekebisho mara ${fmtInt(s.totalReturns)}; wastani wa muda wa marekebisho ni ${fmtHours(s.averageCorrectionHours)}.`,
      `${fmtInt(s.returnedSubmissions, 'en')} submissions were returned ${fmtInt(s.totalReturns, 'en')} times; average correction time is ${fmtHours(s.averageCorrectionHours, 'en')}.`)],
    sort: (a, b) => (num(b.returnCount) ?? 0) - (num(a.returnCount) ?? 0),
    columns: [C.institution, C.dataset, C.period,
      {key: 'returnCount', label: T('Mara', 'Times'), fmt: 'int'},
      {key: 'returnReason', label: T('Sababu ya kurudishwa', 'Return reason'), wide: true},
      {key: 'correctionDeadline', label: T('Mwisho wa marekebisho', 'Correction deadline'), fmt: 'date'},
      {key: 'resubmittedAt', label: T('Iliwasilishwa tena', 'Resubmitted'), fmt: 'date'},
      {key: 'correctionHours', label: T('Muda', 'Time taken'), fmt: 'hours'}],
  },
  'published-register': {
    landscape: true,
    kpis: [
      {label: T('Taarifa zilizochapishwa', 'Published returns'), value: (s) => s.publishedReturns, fmt: 'int'},
      {label: T('Taasisi', 'Institutions'), value: (s) => s.institutions, fmt: 'int'},
      {label: T('Seti za data', 'Datasets'), value: (s) => s.datasets, fmt: 'int'},
    ],
    chart: (rows) => ({type: 'hbar', title: T('Taarifa zilizochapishwa kwa taasisi', 'Published returns by institution'),
      items: groupRows(rows, orgName, items => ({value: items.length})).sort((a, b) => b.value - a.value).map(g => ({...g, tone: 'green'}))}),
    narrative: (rows, s, lang) => [pick(lang,
      `Taarifa ${fmtInt(s.publishedReturns)} zimechapishwa kutoka taasisi ${fmtInt(s.institutions)} kwa seti za data ${fmtInt(s.datasets)}. Kila takwimu katika taarifa za Wizara inaweza kufuatiliwa hadi kumbukumbu yake hapa.`,
      `${fmtInt(s.publishedReturns, 'en')} returns are published from ${fmtInt(s.institutions, 'en')} institutions across ${fmtInt(s.datasets, 'en')} datasets. Every figure in Ministry reports can be traced to its reference here.`)],
    sort: (a, b) => String(b.publishedAt).localeCompare(String(a.publishedAt)),
    columns: [C.reference, C.institution, C.dataset, C.period, C.revision, C.submitted, C.published],
  },
  'data-quality': {
    landscape: true,
    kpis: [
      {label: T('Wastani wa ukamilifu', 'Average completeness'), value: (s) => s.averageCompletenessPercent, fmt: 'pct', tone: true},
      {label: T('Taarifa zilizokaguliwa', 'Returns assessed'), value: (s) => s.submissionsAssessed, fmt: 'int'},
      {label: T('Hazijakamilika', 'Incomplete'), value: (s) => s.incomplete, fmt: 'int', bad: true},
      {label: T('Marekebisho ya mara kwa mara', 'Repeated corrections'), value: (s, rows) => rows.filter(r => r.qualityFlag === 'Repeated corrections').length, fmt: 'int'},
    ],
    chart: (rows) => ({type: 'hbar', unit: '%', title: T('Wastani wa ukamilifu wa data kwa taasisi', 'Average data completeness by institution'),
      items: groupRows(rows, orgName, items => ({value: r1(avg(items.map(i => i.completenessPercent)))})).filter(g => g.value !== null)
        .sort((a, b) => a.value - b.value).map(g => ({...g, tone: g.value >= 95 ? 'green' : g.value >= 80 ? 'amber' : 'red'}))}),
    narrative: (rows, s, lang) => [pick(lang,
      `Taarifa ${fmtInt(s.submissionsAssessed)} zilikaguliwa; wastani wa ukamilifu ni ${fmtPct(s.averageCompletenessPercent)} na ${fmtInt(s.incomplete)} zina viashiria vya lazima ambavyo havijajazwa.`,
      `${fmtInt(s.submissionsAssessed, 'en')} returns were assessed; average completeness is ${fmtPct(s.averageCompletenessPercent)} and ${fmtInt(s.incomplete, 'en')} have required indicators left empty.`)],
    sort: (a, b) => (num(a.completenessPercent) ?? 999) - (num(b.completenessPercent) ?? 999),
    columns: [C.institution, C.dataset, C.period,
      {key: 'requiredIndicators', label: T('Vinavyohitajika', 'Required'), fmt: 'int'},
      {key: 'filledIndicators', label: T('Vimejazwa', 'Filled'), fmt: 'int'},
      {key: 'missingIndicators', label: T('Vimekosekana', 'Missing'), fmt: 'int'},
      {key: 'completenessPercent', label: T('Ukamilifu', 'Completeness'), fmt: 'pct', tone: true},
      {key: 'returnCount', label: T('Marejesho', 'Returns'), fmt: 'int'},
      {key: 'qualityFlag', label: T('Tathmini', 'Assessment'), fmt: 'quality'}],
  },
};

