/**
 * FILE: src/pages/ExecutiveDashboard/ExecutiveDashboard.jsx
 * ROUTE: /dashboard for role ME (Minister, Deputy Minister, Permanent Secretary, Deputy PS).
 * Approved mockup v3.3 (9 Nov 2026), one request: GET /reports/executive-overview.
 *   briefing headline → 7 key facts → two sector panels (growth from NBS/BoT, gauge = delivery of the sector's
 *   institutions) → results for citizens → institution ranking + points for attention + executive reports.
 * English / Kiswahili follow the portal switch. Figures Laravel does not return are shown as "—" (never estimated).
 */
import {useEffect, useMemo, useState} from 'react';
import useRemembered, {isRefreshing} from '../../hooks/useRemembered.js';
import {Link} from 'react-router-dom';
import {MuSkeleton} from '../../components/modern/ModernUI.jsx';
import {meReportsAPI} from '../../API/meReports.js';
import {loadMeFilters, periodsForYear, reportYearValue} from '../../services/meReportService.js';
import {currentFinancialYear, sameFinancialYear} from '../../utils/orgCards.js';
import {showUserFacingError} from '../../utils/userFacingErrors.js';
import {fmtInt, fmtNumber, num} from '../../utils/reportText.js';
import {useAnalyticsBreadcrumb} from '../Analytics/analyticsParts.jsx';
import {useLanguage} from '../../i18n/LanguageContext.jsx';
import {analysisLead, attentionItems, briefHeadline, cellFigures, contributionText, figureText, headlineMap, institutionSectors, latestQuarter, NOT_SUBMITTED,
  sectorPanels, shortName, shortYear, TOTAL_CARDS, totalTarget, tx} from '../../utils/executiveDashboard.js';
import {EXECUTIVE_SAMPLE} from '../../config/executiveSample.js';
import './ExecutiveDashboard.css';

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Counts up once from 0 to the value (one orchestrated page-load moment; skipped for reduced motion). */
function useCountUp(target, duration = 900) {
  const [shown, setShown] = useState(reducedMotion() ? target : 0);
  useEffect(() => {
    if (target === null || reducedMotion()) { setShown(target); return undefined; } // eslint-disable-line react-hooks/set-state-in-effect
    let frame, start;
    const step = t => { start ??= t; const p = Math.min(1, (t - start) / duration); setShown(target * (1 - (1 - p) ** 3)); if (p < 1) frame = requestAnimationFrame(step); };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target, duration]);
  return shown;
}

function Gauge({percent, label}) {
  const p = num(percent), L = Math.PI * 62;
  const [fill, setFill] = useState(reducedMotion() ? p ?? 0 : 0);
  useEffect(() => { const id = requestAnimationFrame(() => setFill(p ?? 0)); return () => cancelAnimationFrame(id); }, [p]);
  return <div className="xd-gauge"><svg width="160" height="96" viewBox="0 0 160 96" aria-hidden="true">
    <path d="M18 86 A62 62 0 0 1 142 86" stroke="rgba(255,255,255,.18)" strokeWidth="14" fill="none" strokeLinecap="round"/>
    {p !== null && <path className="xd-gauge-fill" d="M18 86 A62 62 0 0 1 142 86" stroke="#D9A21B" strokeWidth="14" fill="none" strokeLinecap="round" strokeDasharray={`${(L * Math.min(100, fill)) / 100} ${L}`}/>}
    <text x="80" y="80" textAnchor="middle" fill="#fff" fontSize="28" fontWeight="600">{p === null ? '—' : `${fmtNumber(p)}%`}</text>
  </svg><small>{label}</small></div>;
}

function Ring({percent}) {
  const c = 2 * Math.PI * 22, p = Math.max(0, Math.min(100, num(percent) ?? 0));
  return <svg width="54" height="54" viewBox="0 0 54 54" aria-hidden="true"><circle cx="27" cy="27" r="22" stroke="#E2E9E7" strokeWidth="7" fill="none"/>
    {num(percent) !== null && <circle cx="27" cy="27" r="22" stroke="#12306A" strokeWidth="7" fill="none" strokeLinecap="round" strokeDasharray={`${(c * p) / 100} ${c}`} transform="rotate(-90 27 27)"/>}</svg>;
}

const Factory = () => <svg className="xd-art" viewBox="0 0 300 200" fill="none" stroke="#fff" strokeWidth="5" strokeLinejoin="round" strokeLinecap="round" aria-hidden="true">
  <path d="M20 190V120l45 26v-26l45 26v-26l45 26V70h22V30h18v40h20V48h18v22h22v120z"/>
  <path d="M60 162h18v28H60zM110 162h18v28h-18zM160 162h18v28h-18zM214 150h22v40h-22z"/>
  <path d="M175 22c6-12 22-12 26-2 10-4 18 6 12 14"/><path d="M215 40c6-10 18-10 22-2 9-3 15 5 10 11"/><path d="M8 190h284"/></svg>;
const Ship = () => <svg className="xd-art" viewBox="0 0 300 200" fill="none" stroke="#fff" strokeWidth="5" strokeLinejoin="round" strokeLinecap="round" aria-hidden="true">
  <path d="M30 132h220l-28 40H56z"/>
  <path d="M62 132v-24h38v24M100 132v-24h38v24M138 132v-24h38v24M80 108V86h38v22M118 108V86h38v22"/>
  <path d="M200 132V98h34v34M206 98V84h20v14"/><path d="M262 172V30M246 30h46M262 30l24 0M276 30v26M270 56h12v10h-12z"/>
  <path d="M10 186c16-8 32 8 48 0s32 8 48 0 32 8 48 0 32 8 48 0 32 8 48 0"/></svg>;

const prevYearOf = label => { const m = String(label ?? '').match(/^(\d{4})\s*\/\s*(\d{2,4})$/); return m ? `${Number(m[1]) - 1}/${m[2].length === 2 ? String(Number(m[1])).slice(-2) : Number(m[1])}` : ''; };

function SectorPanel({panel, year, lang, pick}) {
  const g = panel.growthItem;
  const value = useCountUp(num(g?.actual));
  const prev = num(g?.previousActual), now = num(g?.actual);
  const diff = prev !== null && now !== null ? Math.round((now - prev) * 10) / 10 : null;
  const row = panel.row;
  return <article className={`xd-sector ${panel.tone}`}>
    {panel.key === 'industry' ? <Factory/> : <Ship/>}
    <div className="xd-sector-head"><h2>{tx(panel.name, lang)}</h2><span>{pick('Source', 'Chanzo')}: {panel.source}</span></div>
    <div className="xd-sector-body">
      <div>
        <div className="xd-lbl">{pick(`Sector growth ${shortYear(year)}`, `Ukuaji wa sekta mwaka ${shortYear(year)}`)}</div>
        {g ? <div className="xd-big">{fmtNumber(value)}<sup>%</sup></div> : <div className="xd-big xd-none">—</div>}
        {g && diff !== null && diff !== 0 && <span className={`xd-chip ${diff > 0 ? 'up' : 'dn'}`}><b>{diff > 0 ? '▲' : '▼'} {pick(`${Math.abs(diff)} pts`, `pointi ${Math.abs(diff)}`)}</b> {pick('on', 'dhidi ya')} {shortYear(prevYearOf(year))} ({fmtNumber(prev)}%)</span>}
        {!g && <span className="xd-chip">{tx(NOT_SUBMITTED, lang)} · {panel.source}</span>}
      </div>
      <Gauge percent={row?.deliveryPercent ?? null} label={pick('Delivery by this sector’s institutions', 'Utekelezaji wa taasisi za sekta hii')}/>
    </div>
    <div className="xd-tiles">{panel.tiles.map(t => {
      const item = t.item, target = item ? totalTarget(item, lang) : '';
      return <div key={t.key} className="xd-tile"><b>{item ? figureText(item.actual, item.unit) : '—'}</b>
        <small>{tx(t.label, lang)}{item ? (target ? <> · <span className="ok">{target.replace(/ \(.*\)$/, '')}</span></> : '') : ` (${pick('pending', 'bado')})`}</small></div>;
    })}</div>
    <div className="xd-who">{pick('Institutions', 'Taasisi')}: {row?.institutionCodes?.length ? row.institutionCodes.join(' · ') : '—'}{row ? ` — ${pick('indicators', 'viashiria')} ${fmtInt(row.indicators)}` : ''}</div>
  </article>;
}

export default function ExecutiveDashboard({user}) {
  useAnalyticsBreadcrumb([{text: 'Sector Overview'}]);
  const {lang, pick} = useLanguage();
  const [filters, setFilters] = useState(null);
  const [choice, setChoice] = useState({year: '', period: ''});
  // Loading style F: the last briefing stays on screen (faded, "Updating") while a new one loads.
  const [state, setState] = useRemembered('dashboard:ME', {key: '', data: null, error: ''});
  // Remembered data is shown as "Updating" until this visit's own answer arrives.
  const [answered, setAnswered] = useState('');

  useEffect(() => {
    let alive = true;
    loadMeFilters().then(f => { if (alive) setFilters(f); }).catch(() => { if (alive) setFilters({financialYears: [], periods: []}); });
    return () => { alive = false; };
  }, []);

  const years = filters?.financialYears ?? [];
  // Open on the latest year that already has published results (one request instead of two), 9 Nov 2026.
  const published = filters?.publishedYears ?? [];
  const opening = published.length && !published.some(y => sameFinancialYear(y, currentFinancialYear())) ? reportYearValue(filters, published[published.length - 1]) : '';
  const year = filters ? (choice.year || opening || reportYearValue(filters, currentFinancialYear()) || years[years.length - 1]?.value || currentFinancialYear()) : '';
  const periods = filters && year ? periodsForYear(filters, year) : [];
  const key = JSON.stringify({financialYear: year, reportingPeriodId: choice.period});

  useEffect(() => {
    if (!year) return undefined;
    let alive = true;
    meReportsAPI.executiveOverview(JSON.parse(key)).then(data => {
      if (!alive) return;
      // The current year often has nothing published yet: open on the last year that has results.
      if (!choice.year && !choice.period && !num(data?.summary?.indicators) && data?.previousFinancialYear && years.some(y => y.value === data.previousFinancialYear)) {
        setChoice({year: data.previousFinancialYear, period: '', fellBack: year});
        return;
      }
      setState({key, data, error: ''});
      setAnswered(key);
    }).catch(error => {
      if (!alive) return;
      const status = error?.response?.status;
      // Original backend (no executive endpoint): clearly labelled sample data instead of an empty page (10 Nov 2026).
      if (status === 404) {
        setState({key, data: EXECUTIVE_SAMPLE, error: ''});
        setAnswered(key);
        return;
      }
      const text = status === 404 ? pick('The executive dashboard service is not installed on the server yet (backend patch v4 or later).', 'Huduma ya Dashboard ya Viongozi haijawekwa kwenye seva bado (backend patch v4 au zaidi).')
        : status === 403 ? pick('This account has not been given the executive dashboard permission (reports.view.executive-overview). The system administrator should run RolesPermissionsSeeder or grant it in Roles & Permissions.',
          'Akaunti hii bado haijapewa ruhusa ya Dashboard ya Viongozi (reports.view.executive-overview). Msimamizi wa mfumo aendeshe RolesPermissionsSeeder au ampe ruhusa hiyo kwenye Roles & Permissions.')
          : (error?.response?.data?.message || error?.message || '');
      setState({key, data: null, error: text});
      setAnswered(key);
      void showUserFacingError(status === 403 || status === 404 ? new Error(text) : error, pick('Dashboard could not be loaded', 'Dashboard haikuweza kupakiwa'));
    });
    return () => { alive = false; };
  }, [key, year]); // eslint-disable-line react-hooks/exhaustive-deps

  const loading = !year || state.key !== key || answered !== key;
  const data = state.data;
  const sample = Boolean(data?.sample);
  const refreshing = isRefreshing(loading, data);
  const heads = useMemo(() => headlineMap(data), [data]);
  const s = data?.summary ?? {};
  const institutions = (data?.institutions ?? []).filter(i => num(i.deliveryPercent) !== null);
  const sectorOf = institutionSectors(data);
  const periodLabel = periods.find(p => String(p.value) === String(choice.period))?.label;
  const fy = shortYear(data?.financialYear ?? year);
  const quarter = latestQuarter(data);
  const q = `year=${encodeURIComponent(year)}`;
  const fullyPct = num(s.indicators) ? Math.round((num(s.fullyAchieved) / num(s.indicators)) * 100) : null;
  const wait = v => (loading && !data ? '—' : v);
  const scope = periodLabel ?? (quarter ? pick(`to ${quarter}`, `hadi robo ya ${{Q1: 'kwanza', Q2: 'pili', Q3: 'tatu', Q4: 'nne'}[quarter] ?? quarter}`) : pick('whole year', 'mwaka mzima'));

  return <div className={`xd-page mu-page${refreshing ? ' mu-refreshing' : ''}${sample ? ' xd-sample' : ''}`}>
    {sample && <div className="xd-sample-band" role="note">
      <b>{pick('SAMPLE DATA', 'DATA YA MFANO')}</b>
      <span>{pick('These are not official Ministry figures. Real figures appear here once the server provides the executive dashboard service.',
        'Hizi si takwimu rasmi za Wizara. Takwimu halisi zitaonekana hapa seva ikishaweka huduma ya Dashboard ya Viongozi.')}</span>
    </div>}
    <header className="xd-brief">
      <div>
        <div className="xd-for">{pick('Briefing for the Ministry leadership', 'Taarifa kwa Viongozi wa Wizara')} · {pick('Financial Year', 'Mwaka wa Fedha')} {fy || '…'}, {scope}</div>
        <h1>{data ? briefHeadline(data, lang) : '…'}</h1>
        {choice.fellBack && !loading && <p className="xd-fell">{pick(`${shortYear(choice.fellBack)} has no published returns yet; showing ${shortYear(choice.year)}.`, `Mwaka ${shortYear(choice.fellBack)} bado hauna taarifa zilizochapishwa; inaonyeshwa ${shortYear(choice.year)}.`)}</p>}
      </div>
      <div className="xd-ctrl">
        <label className="xd-sel"><small>{pick('Financial year', 'Mwaka wa fedha')}</small>
          <select value={year} onChange={e => setChoice({year: e.target.value, period: ''})}>{years.map(y => <option key={y.value} value={y.value}>{y.label}</option>)}</select></label>
        <label className="xd-sel"><small>{pick('Period', 'Kipindi')}</small>
          <select value={choice.period} onChange={e => setChoice(c => ({year: c.year || year, period: e.target.value}))}>
            <option value="">{pick('Whole year', 'Mwaka mzima')}</option>{periods.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}</select></label>
        {!sample && <Link className="xd-pdf" to={`/dashboard/reports/executive-brief?${q}`}>{pick('Download brief (PDF)', 'Pakua muhtasari (PDF)')}</Link>}
      </div>
    </header>

    <section className="xd-strip" aria-label={pick('Key figures', 'Takwimu kuu')}>
      <div className="xd-strip-lead"><Ring percent={data ? s.deliveryPercent : null}/><div><small>{pick('Delivery against targets', 'Utekelezaji wa malengo')}</small><b>{wait(num(s.deliveryPercent) === null ? '—' : `${Math.round(num(s.deliveryPercent))}%`)}</b></div></div>
      <div><small>{pick('Indicators measured', 'Viashiria vilivyopimwa')}</small><b>{wait(fmtInt(s.indicators))}</b></div>
      <div><small>{pick('Targets met', 'Vimefikia malengo')}</small><b>{wait(fmtInt(s.fullyAchieved))}</b>{data && fullyPct !== null && <em>{fullyPct}%</em>}</div>
      <div><small>{pick('Budget use', 'Matumizi ya bajeti')}</small><b>{wait(num(data?.budget?.budgetUtilisationPercent) === null ? '—' : `${fmtNumber(data.budget.budgetUtilisationPercent)}%`)}</b></div>
      <div><small>{pick('Institutions', 'Taasisi')}</small><b>{wait(fmtInt(s.institutions))}</b></div>
      <div><small>{pick('Below 70%', 'Chini ya 70%')}</small><b className="xd-red">{wait(fmtInt(s.underperforming))}</b></div>
      <div><small>{pick('Published returns', 'Taarifa zilizochapishwa')}</small><b>{wait(fmtInt(s.publishedSubmissions))}</b></div>
    </section>

    {loading && !data && <div className="xd-panel xd-wait"><MuSkeleton height={220}/></div>}
    {!loading && state.error && <div className="xd-panel xd-error">{state.error}</div>}
    {data && <>
      <section className="xd-duo">{sectorPanels(data).map(panel => <SectorPanel key={panel.key} panel={panel} year={data.financialYear} lang={lang} pick={pick}/>)}</section>

      <div className="xd-sec"><h3>{pick('Results for citizens', 'Matokeo kwa wananchi')}</h3>
        <small>{pick('All institutions', 'Taasisi zote')} · {fy}{periodLabel ? ` · ${periodLabel}` : quarter ? ` ${pick('to', 'hadi')} ${quarter}` : ''}</small></div>
      <section className="xd-ledger">{TOTAL_CARDS.map(c => {
        const items = c.keys.map(k => heads[k]).filter(Boolean);
        const money = c.money ? heads[c.money] : null, extra = c.extra ? heads[c.extra] : null;
        const total = items.length ? items.reduce((a, h) => a + (num(h.actual) ?? 0), 0) : null;
        const target = items.length === 1 && !c.money ? totalTarget(items[0], lang) : '';
        const merged = items.length > 1 ? {unit: items[0].unit, contributions: Object.values(items.flatMap(h => h.contributions ?? [])
          .reduce((all, part) => ({...all, [part.institutionCode]: {institutionCode: part.institutionCode, actual: (all[part.institutionCode]?.actual ?? 0) + (num(part.actual) ?? 0)}}), {}))
          .sort((a, b) => b.actual - a.actual)} : null;
        const lines = [];
        if (extra) lines.push(`+ ${pick('business names', 'majina ya biashara')} ${fmtInt(extra.actual)}`);
        if (items.length > 1) lines.push(c.keys.map((k, i) => heads[k] && `${tx(c.parts?.[i], lang)} ${fmtInt(heads[k].actual)}`).filter(Boolean).join(' · '));
        if (merged?.contributions.length) lines.push(contributionText(merged, 3));
        else if (items.length === 1) lines.push(contributionText(items[0], 3));
        return <div key={c.keys[0]} className="xd-cell">
          <div className="xd-l">{tx(c.label, lang)}</div>
          <div className={`xd-n${total === null ? ' none' : ''}`}>{total === null ? '—' : figureText(total, items[0].unit)}</div>
          {total !== null && (() => { const f = cellFigures(items); const prevLabel = shortYear(prevYearOf(data.financialYear)); return <>
            {(f.change !== null || target) && <div className="xd-chg">
              {f.change !== null && <span className={f.change >= 0 ? 'up' : 'dn'}>{f.change >= 0 ? '▲' : '▼'} {Math.abs(f.change)}% {pick('on', 'ukilinganisha na')} {prevLabel}</span>}
              {target && <span className={`xd-tg${num(items[0].achievementPercent) < 100 ? ' dn' : ''}`}>{f.change !== null ? ' · ' : ''}{target.replace(/ \(.*\)$/, '')}</span>}</div>}
            {/* Shown only when earlier years exist: a total equal to this year's figure adds nothing. */}
            {f.cum !== null && f.from && f.from !== data.financialYear && <div className="xd-cum">{pick('Total to date', 'Jumla hadi sasa')}: <b>{figureText(f.cum, items[0].unit)}</b> <span>({pick('since', 'tangu')} {shortYear(f.from)})</span></div>}
          </>; })()}
          {c.money && total !== null && <div className="xd-m">{money ? figureText(money.actual, 'TZS') : `TZS — (${pick('value pending', 'thamani bado')})`}</div>}
          {total === null ? <div className="xd-src">{c.missing ? `${pick('External source', 'Chanzo cha nje')}: TIC` : pick('Not yet submitted', 'Bado hazijawasilishwa')}</div>
            : lines.filter(Boolean).map((line, i) => <div key={i} className="xd-src">{line}</div>)}
        </div>;
      })}</section>

      <div className="xd-sec"><h3>{pick('Institution performance and points for attention', 'Utendaji wa taasisi na mambo ya kuzingatia')}</h3>
        <small>{pick('Each indicator counts up to 100%', 'Kila kiashiria kinahesabiwa hadi 100%')}</small></div>
      <section className="xd-split">
        <div className="xd-panel">
          <div className="xd-key"><span><i className="ind"/>{pick('Industry', 'Viwanda')}</span><span><i className="tra"/>{pick('Trade', 'Biashara')}</span><span><i className="lo"/>{pick('Below 70%', 'Chini ya 70%')}</span></div>
          {institutions.map((i, n) => { const low = num(i.deliveryPercent) < 70; return <div key={i.institutionName} className="xd-row" title={i.institutionName}>
            <span className="xd-rk">{n + 1}</span><span className="xd-cd">{shortName(i)}</span>
            <span className="xd-b"><i className={low ? 'lo' : sectorOf[i.institutionCode] ?? 'ind'} style={{width: `${Math.min(100, num(i.deliveryPercent))}%`}}/></span>
            <span className={`xd-p${low ? ' lo' : ''}`}>{num(i.deliveryPercent).toFixed(1)}%</span>
          </div>; })}
          {!institutions.length && <p className="xd-muted">{pick('No institutions with published returns.', 'Hakuna taasisi zenye taarifa zilizochapishwa.')}</p>}
        </div>
        <div className="xd-panel xd-note">
          <p>{analysisLead(data, lang)}</p>
          <ul>{attentionItems(data, lang).map((a, i) => <li key={i} className={a.tone}>{a.strong && <b>{a.strong}</b>}{a.text}</li>)}</ul>
          {!sample && <><div className="xd-reps-h"><b>{pick('Executive reports', 'Taarifa kwa Viongozi')}</b><small>{pick('Ready to print or present at meetings', 'Tayari kuchapishwa au kuwasilishwa kikaoni')}</small></div>
          <div className="xd-reps">
            {[['E1', 'executive-brief', pick('Performance Brief', 'Muhtasari wa Utendaji'), pick('2 pages · PDF', 'Kurasa 2 · PDF')],
              ['E2', 'annual-me', pick('Annual M&E Report', 'Taarifa ya Mwaka ya U&T'), pick('Full report · PDF', 'Taarifa kamili · PDF')],
              ['11', 'organisation-performance', pick('Institution Performance', 'Utendaji wa Taasisi'), pick('Ranking · PDF · Excel', 'Mpangilio · PDF · Excel')],
              ['12', 'sector-performance', pick('Sector Performance', 'Utendaji wa Sekta'), pick('Industry · Trade', 'Viwanda · Biashara')]].map(([ic, id, title, note]) =>
              <Link key={id} className="xd-rep" to={`/dashboard/reports/${id}?${q}`}><span className="xd-ic">{ic}</span><span><b>{title}</b><small>{note}</small></span></Link>)}
          </div></>}
        </div>
      </section>
      <p className="xd-foot">{pick('Source: published returns in Viwanda Portal; sector growth, GDP share and exports from NBS/BoT through National Indicators · generated', 'Chanzo: taarifa zilizochapishwa kwenye Viwanda Portal; ukuaji wa sekta, mchango kwenye Pato la Taifa na mauzo ya nje kutoka NBS/BoT kupitia Namba Kuu za Kitaifa · imetolewa')} {data.generatedAt ? new Date(data.generatedAt).toLocaleString(lang === 'sw' ? 'sw-TZ' : 'en-GB') : '—'}{data.trace?.generatedBy?.name ?? user?.name ? ` · ${data.trace?.generatedBy?.name ?? user.name}` : ''}{data.trace?.reference ? ` · ${pick('Ref', 'Kumb.')} ${data.trace.reference}` : ''}</p>
    </>}
  </div>;
}
