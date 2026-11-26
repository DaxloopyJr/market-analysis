/**
 * FILE: src/utils/executiveDashboard.js
 * Wording and figures for the Executive (ME) dashboard (mockup v2), read from GET /reports/executive-overview.
 * English by default, Kiswahili when the portal language is SW (9 Nov 2026). Nothing here invents a number:
 * a figure Laravel does not return is shown as "—" with "Figures not yet submitted".
 */
import {fmtInt, fmtNumber, num, r1} from './reportText.js';

const T = (en, sw) => ({en, sw});
/** Text of a {en, sw} pair (or a plain string) in the chosen language. */
export const tx = (value, lang = 'en') => (value && typeof value === 'object' ? value[lang] ?? value.en : value ?? '');

export const NOT_SUBMITTED = T('Figures not yet submitted', 'Takwimu bado hazijawasilishwa');
export const PENDING_BADGE = T('PENDING', 'BADO');

/** Section 01 – national headline cards (mockup v2 order and colours). */
export const NATIONAL_CARDS = [
  {key: 'gdp_share', color: '#0b5bd3', source: 'NBS', label: T('Industry share of GDP', 'Mchango wa viwanda kwenye Pato la Taifa')},
  {key: 'sector_growth', color: '#13873f', source: 'NBS', label: T('Industrial sector growth', 'Ukuaji wa sekta ya viwanda'), note: T('Growth compared with the previous year.', 'Ukuaji ukilinganisha na mwaka uliopita.')},
  {key: 'exports_usd', color: '#c77f0a', source: 'BoT', label: T('Exports', 'Mauzo ya bidhaa nje'), note: T('Value of goods exported.', 'Thamani ya mauzo ya bidhaa nje ya nchi.')},
  {key: 'companies', color: '#0a2a5c', source: 'BRELA', label: T('New companies registered', 'Makampuni mapya yaliyosajiliwa'), note: T('Company and business-name registration through online systems.', 'Usajili wa makampuni na majina ya biashara kupitia mifumo ya mtandao.')},
  {key: 'jobs', color: '#7a3fd6', source: T('institutions', 'taasisi'), label: T('Jobs created', 'Ajira zilizozalishwa'), note: T('Jobs reported by Ministry institutions.', 'Ajira zilizoripotiwa na taasisi za Wizara.')},
  {key: 'new_industries', color: '#00a3dd', source: T('institutions', 'taasisi'), label: T('New industries established', 'Viwanda vipya vilivyoanzishwa'), note: T('New industries reported this year.', 'Viwanda vipya vilivyoripotiwa mwaka huu.')},
];

/** Section 02 – year-to-date totals. */
export const TOTAL_CARDS = [
  {keys: ['jobs'], label: T('Jobs created', 'Ajira zilizozalishwa')},
  {keys: ['companies'], extra: 'business_names', label: T('Companies registered', 'Makampuni yaliyosajiliwa')},
  {keys: ['industrial_licences'], label: T('Industrial licences', 'Leseni za viwanda')},
  {keys: ['business_licences'], label: T('Business licences', 'Leseni za biashara')},
  {keys: ['markets'], label: T('Markets: fairs & missions', 'Masoko: maonesho & misheni')},
  {keys: ['research', 'technologies'], label: T('Research & technologies', 'Tafiti & teknolojia'), parts: [T('research', 'tafiti'), T('technologies', 'teknolojia')]},
  {keys: ['sme_loans_count'], money: 'sme_loans_amount', label: T('Loans to SMEs', 'Mikopo kwa SMEs')},
  {keys: ['investment'], label: T('Investment', 'Uwekezaji'), missing: T('external source (TIC)', 'chanzo cha nje (TIC)')},
];

/** "2025/2026" → "2025/26" (as on the mockup). */
export const shortYear = (label) => String(label ?? '').replace(/^(\d{4})\s*\/\s*\d{2}(\d{2})$/, '$1/$2');

const SECTOR = {industry: T('Industry', 'Viwanda'), trade: T('Trade', 'Biashara'), 'unassigned sector': T('Sector not set', 'Sekta haijawekwa')};
export const sectorName = (name, lang = 'en') => (SECTOR[String(name ?? '').toLowerCase()] ? tx(SECTOR[String(name).toLowerCase()], lang) : name);
/** Industry first, then Trade, then the rest (mockup order). */
const sectorRank = (sec) => { const i = ['industry', 'trade'].indexOf(String(sec.sectorName).toLowerCase()); return i < 0 ? 9 : i; };
export const sectorOrder = (a, b) => sectorRank(a) - sectorRank(b) || String(a.sectorName).localeCompare(String(b.sectorName));

/** Institution short name: code when Laravel sends it (patch v5), else the name. */
export const shortName = (i) => i?.institutionCode || i?.institutionName || '—';

/** Big number and its small unit, e.g. {value: '10.08', unit: 'USD bn'}. */
export function bigFigure(value, unit) {
  const n = num(value);
  if (n === null) return {value: '—', unit: ''};
  if (unit === '%') return {value: fmtNumber(n), unit: '%'};
  if (unit === 'USD' || unit === 'TZS') {
    for (const [size, word] of [[1e12, 'tn'], [1e9, 'bn'], [1e6, 'mn']]) {
      if (Math.abs(n) >= size) return {value: (n / size).toLocaleString('en-GB', {maximumFractionDigits: 2}), unit: `${unit} ${word}`};
    }
    return {value: fmtInt(n), unit};
  }
  return {value: fmtInt(n), unit: ''};
}
export const figureText = (value, unit) => { const f = bigFigure(value, unit); return f.unit === '%' ? `${f.value}%` : [f.unit.startsWith('USD') || f.unit.startsWith('TZS') ? f.unit.split(' ')[0] : '', f.value, f.unit.split(' ')[1] ?? ''].filter(Boolean).join(' '); };

/** Line under the big number: change on last year when known, otherwise share of target. */
export function deltaLine(item, lang = 'en') {
  const now = num(item?.actual), before = num(item?.previousActual);
  const sw = lang === 'sw';
  if (now !== null && before !== null && before !== 0) {
    if (item.unit === '%') { const d = r1(now - before); if (d) return {up: d > 0, text: `${d > 0 ? '▲' : '▼'} ${sw ? `pointi ${Math.abs(d)} dhidi ya mwaka uliopita` : `${Math.abs(d)} pts on last year`}`}; }
    else { const d = r1(((now - before) / before) * 100); if (d) return {up: d > 0, text: `${d > 0 ? '▲' : '▼'} ${Math.abs(d)}% ${sw ? 'kutoka' : 'from'} ${figureText(before, item.unit)}`}; }
  }
  if (num(item?.achievementPercent) !== null && num(item?.target) !== null) {
    const p = num(item.achievementPercent);
    return {up: p >= 100, text: `${p >= 100 ? '▲' : '▼'} ${fmtNumber(p)}% ${sw ? 'ya lengo' : 'of target'} (${figureText(item.target, item.unit)})`};
  }
  return null;
}

/** Description line of a national card. */
export function cardNote(card, item, lang = 'en') {
  if (card.key === 'gdp_share' && num(item?.target) !== null && num(item?.achievementPercent) !== null) {
    const p = Math.round(num(item.achievementPercent));
    return lang === 'sw' ? `Lengo la mwaka ni ${figureText(item.target, item.unit)} — imefikia ${p}% ya lengo.` : `Annual target ${figureText(item.target, item.unit)} — ${p}% achieved.`;
  }
  return tx(card.note ?? T('This year\'s figure.', 'Kiwango cha mwaka huu.'), lang);
}

/** Sparkline points (0–200 × 4–36) from the quarterly series, or '' when there are fewer than two points. */
export function sparkPoints(series = []) {
  const values = series.map(s => num(s.actual)).filter(v => v !== null);
  if (values.length < 2) return '';
  const min = Math.min(...values), max = Math.max(...values), span = max - min || 1;
  return values.map((v, i) => `${Math.round((i / (values.length - 1)) * 200)},${Math.round(36 - ((v - min) / span) * 30)}`).join(' ');
}

/** Short target note for a total card, e.g. "142% of target (437)". */
export const totalTarget = (item, lang = 'en') => (num(item?.achievementPercent) === null || num(item?.target) === null ? ''
  : `${Math.round(num(item.achievementPercent))}% ${lang === 'sw' ? 'ya lengo' : 'of target'} (${figureText(item.target, item.unit)})`);

export const headlineMap = (data) => Object.fromEntries((data?.headline ?? []).map(h => [h.key, h]));

/** Latest quarter in the returned figures ("Q4"), for "2025/26 to Q4". */
export function latestQuarter(data) {
  const labels = (data?.headline ?? []).flatMap(h => (h.series ?? []).map(s => s.periodLabel)).filter(Boolean);
  const q = labels.map(l => String(l).match(/Q(\d)/)?.[1]).filter(Boolean).map(Number);
  return q.length ? `Q${Math.max(...q)}` : '';
}

/** Hero headline and lead sentence. */
export function heroText(data, lang = 'en') {
  const sw = lang === 'sw';
  const s = data?.summary ?? {};
  const list = (data?.institutions ?? []).filter(i => num(i.deliveryPercent) !== null);
  if (num(s.deliveryPercent) === null) return {pct: null, before: sw ? 'Hakuna taarifa zilizochapishwa kwa kipindi hiki.' : 'No published returns for this period.', after: '', lead: ''};
  const above = list.filter(i => num(i.deliveryPercent) >= 75).length;
  const top = list.slice(0, 3).map(shortName);
  const low = list.length > 3 && num(list[list.length - 1].deliveryPercent) < 75 ? shortName(list[list.length - 1]) : null;
  const and = sw ? 'na' : 'and';
  const leaders = top.length > 1 ? `${top.slice(0, -1).join(', ')} ${and} ${top[top.length - 1]} ${sw ? 'zinaongoza' : 'lead'}` : top.length ? `${top[0]} ${sw ? 'inaongoza' : 'leads'}` : '';
  const measured = sw ? `Viashiria ${fmtInt(s.indicators)} vimepimwa kutoka taasisi ${fmtInt(s.institutions)}.` : `${fmtInt(s.indicators)} indicators measured across ${fmtInt(s.institutions)} institutions.`;
  return {
    pct: `${Math.round(num(s.deliveryPercent))}%`,
    before: sw ? 'Wizara imefikia ' : 'The Ministry has achieved ',
    after: sw ? ` ya malengo ya mwaka; taasisi ${above} kati ya ${list.length} ziko juu ya asilimia 75.` : ` of its annual targets; ${above} of ${list.length} institutions are above 75%.`,
    lead: `${measured}${leaders ? ` ${leaders}` : ''}${low ? `; ${low} ${sw ? 'inahitaji msukumo zaidi' : 'needs more support'}.` : leaders ? '.' : ''}`,
  };
}

/** Points for attention (max 5): red = act now, amber = watch, green = good news. Only from returned figures. */
export function attentionItems(data, lang = 'en') {
  const sw = lang === 'sw';
  const red = [], amber = [], green = [];
  const list = (data?.institutions ?? []).filter(i => num(i.deliveryPercent) !== null);
  list.filter(i => num(i.deliveryPercent) < 70).slice(-2).reverse().forEach(i => red.push({tone: 'red', strong: shortName(i),
    text: sw ? ` imefikia ${fmtNumber(i.deliveryPercent)}% — viashiria ${fmtInt(i.underperforming)} kati ya ${fmtInt(i.indicators)} viko chini ya 70%.`
      : ` is at ${fmtNumber(i.deliveryPercent)}% — ${fmtInt(i.underperforming)} of ${fmtInt(i.indicators)} indicators are below 70%.`}));
  const ex = data?.exceptions ?? {};
  if (num(ex['Zero delivery'])) red.push({tone: 'red', strong: sw ? `Viashiria ${fmtInt(ex['Zero delivery'])}` : `${fmtInt(ex['Zero delivery'])} indicators`, text: sw ? ' havijatekelezwa kabisa mwaka huu.' : ' have no delivery at all this year.'});
  Object.values(headlineMap(data)).filter(h => num(h.achievementPercent) !== null && num(h.achievementPercent) < 100 && num(h.target) !== null)
    .forEach(h => amber.push({tone: 'amber', strong: '', text: sw ? `${h.labelSw} (${figureText(h.actual, h.unit)}) iko chini ya lengo la ${figureText(h.target, h.unit)}.`
      : `${h.labelEn} (${figureText(h.actual, h.unit)}) is below its target of ${figureText(h.target, h.unit)}.`}));
  const budget = list.filter(i => num(i.budgetUtilisationPercent) !== null && num(i.budgetUtilisationPercent) < 50)
    .sort((a, b) => num(a.budgetUtilisationPercent) - num(b.budgetUtilisationPercent))[0];
  if (budget) amber.push({tone: 'amber', strong: '', text: sw ? `Matumizi ya bajeti ya ${shortName(budget)} ni ${fmtNumber(budget.budgetUtilisationPercent)}% dhidi ya utekelezaji wa ${fmtNumber(budget.deliveryPercent)}%.`
    : `${shortName(budget)} budget use is ${fmtNumber(budget.budgetUtilisationPercent)}% against delivery of ${fmtNumber(budget.deliveryPercent)}%.`});
  if (num(ex.Underperformance)) amber.push({tone: 'amber', strong: sw ? `Viashiria ${fmtInt(ex.Underperformance)}` : `${fmtInt(ex.Underperformance)} indicators`, text: sw ? ' viko chini ya 70% ya lengo la mwaka.' : ' are below 70% of the annual target.'});
  if (num(data?.summary?.publishedSubmissions)) green.push({tone: 'green', strong: '', text: sw ? `Taarifa ${fmtInt(data.summary.publishedSubmissions)} zimechapishwa kwa mwaka ${shortYear(data.financialYear)}.`
    : `${fmtInt(data.summary.publishedSubmissions)} returns published for ${shortYear(data.financialYear)}.`});
  return [...red, ...amber].slice(0, green.length ? 4 : 5).concat(green);
}

/** Who contributed how much to one national figure (backend contributions[]), e.g. "TBS 100 · CBE 10 · TANTRADE 1". */
export function contributionText(item, max = 4) {
  const parts = (item?.contributions ?? []).filter(c => num(c.actual) !== null);
  if (!parts.length) return (item?.institutions ?? []).join(', ');
  const shown = parts.slice(0, max).map(c => `${c.institutionCode} ${figureText(c.actual, item.unit)}`);
  return parts.length > max ? `${shown.join(' · ')} · +${parts.length - max}` : shown.join(' · ');
}

/* ---------- Mockup v3.3 (9 Nov 2026): sector panels first, institutions after ---------- */

/** The two sector panels: growth (NBS/BoT national figure) on top, the sector's institutions' delivery in the gauge. */
export const SECTOR_PANELS = [
  {key: 'industry', match: /industr/i, tone: 'ind', name: T('Industry sector', 'Sekta ya Viwanda'), source: 'NBS', growth: 'sector_growth',
    tiles: [{key: 'gdp_share', label: T('Share of GDP', 'Mchango kwenye Pato la Taifa')}, {key: 'industrial_licences', label: T('Industrial licences', 'Leseni za viwanda')},
      {key: 'new_industries', label: T('New industries', 'Viwanda vipya')}]},
  {key: 'trade', match: /trade/i, tone: 'tra', name: T('Trade sector', 'Sekta ya Biashara'), source: 'NBS · BoT', growth: 'trade_growth',
    tiles: [{key: 'exports_usd', label: T('Exports', 'Mauzo ya bidhaa nje')}, {key: 'companies', label: T('Companies', 'Makampuni')},
      {key: 'business_licences', label: T('Business licences', 'Leseni za biashara')}]},
];

/** Panel data: growth item, tiles, and the sector row (delivery %, institution codes, indicators) from Laravel. */
export function sectorPanels(data) {
  const heads = headlineMap(data);
  return SECTOR_PANELS.map(panel => ({...panel, growthItem: heads[panel.growth] ?? null,
    tiles: panel.tiles.map(t => ({...t, item: heads[t.key] ?? null})),
    row: (data?.sectors ?? []).find(s => panel.match.test(String(s.sectorName))) ?? null}));
}

/** Institution code → 'ind' | 'tra' (colour of its ranking bar). */
export function institutionSectors(data) {
  const map = {};
  for (const panel of SECTOR_PANELS) {
    const row = (data?.sectors ?? []).find(s => panel.match.test(String(s.sectorName)));
    (row?.institutionCodes ?? []).forEach(code => { map[code] = map[code] ?? panel.tone; });
  }
  return map;
}

/** Briefing headline: sector growth first when NBS/BoT figures exist, then the Ministry's delivery. */
export function briefHeadline(data, lang = 'en') {
  const sw = lang === 'sw';
  const heads = headlineMap(data), s = data?.summary ?? {};
  const g = k => (num(heads[k]?.actual) === null ? null : `${fmtNumber(heads[k].actual)}%`);
  const ind = g('sector_growth'), tra = g('trade_growth');
  if (num(s.deliveryPercent) === null) return sw ? 'Hakuna taarifa zilizochapishwa kwa kipindi hiki.' : 'No published returns for this period.';
  const delivery = `${Math.round(num(s.deliveryPercent))}%`;
  const growth = ind && tra ? (sw ? `Viwanda vimekua kwa ${ind} na biashara kwa ${tra}. ` : `Industry grew by ${ind} and trade by ${tra}. `)
    : ind ? (sw ? `Viwanda vimekua kwa ${ind}. ` : `Industry grew by ${ind}. `)
      : tra ? (sw ? `Biashara imekua kwa ${tra}. ` : `Trade grew by ${tra}. `) : '';
  if (growth) return `${growth}${sw ? `Taasisi za Wizara zimetekeleza ${delivery} ya malengo ya mwaka.` : `Ministry institutions delivered ${delivery} of their annual targets.`}`;
  const list = (data?.institutions ?? []).filter(i => num(i.deliveryPercent) !== null);
  const above = list.filter(i => num(i.deliveryPercent) >= 75).length;
  return sw ? `Taasisi za Wizara zimetekeleza ${delivery} ya malengo ya mwaka; taasisi ${above} kati ya ${list.length} ziko juu ya asilimia 75.`
    : `Ministry institutions delivered ${delivery} of their annual targets; ${above} of ${list.length} institutions are above 75%.`;
}

/** One-sentence reading above the attention list. */
export function analysisLead(data, lang = 'en') {
  const sw = lang === 'sw';
  const d = num(data?.summary?.deliveryPercent);
  if (d === null) return '';
  const level = d >= 80 ? (sw ? 'mzuri' : 'good') : d >= 60 ? (sw ? 'wa wastani' : 'moderate') : (sw ? 'wa chini' : 'low');
  const panels = sectorPanels(data).filter(p => num(p.row?.deliveryPercent) !== null);
  let gap = '';
  if (panels.length === 2) {
    const [a, b] = [...panels].sort((x, y) => num(x.row.deliveryPercent) - num(y.row.deliveryPercent));
    const pts = Math.round(num(b.row.deliveryPercent) - num(a.row.deliveryPercent));
    if (pts >= 3) gap = sw ? `, lakini ${tx(a.name, 'sw').toLowerCase()} iko nyuma ya ${tx(b.name, 'sw').replace('Sekta ya ', '').toLowerCase()} kwa pointi ${pts}`
      : `, but the ${tx(a.name, 'en').toLowerCase()} trails ${tx(b.name, 'en').replace(' sector', '').toLowerCase()} by ${pts} points`;
  }
  return sw ? `Utekelezaji wa jumla ni ${level}${gap}. Mambo yanayohitaji uamuzi:` : `Overall delivery is ${level}${gap}. Points that need a decision:`;
}

/**
 * One "results for citizens" cell (9 Nov 2026): this year's value, change on the previous year, and the running
 * total of all published years up to now (backend cumulativeActual / cumulativeFrom). Nulls stay null.
 */
export function cellFigures(items = []) {
  const sum = key => { const v = items.map(h => num(h?.[key])); return v.some(x => x === null) || !v.length ? null : v.reduce((a, b) => a + b, 0); };
  const now = sum('actual'), prev = sum('previousActual'), cum = sum('cumulativeActual');
  const change = now !== null && prev ? Math.round(((now - prev) / prev) * 1000) / 10 : null;
  const from = items.map(h => h?.cumulativeFrom).filter(Boolean).sort()[0] ?? null;
  return {now, prev, change, cum, from};
}
