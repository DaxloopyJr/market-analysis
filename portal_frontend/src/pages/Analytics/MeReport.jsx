/**
 * FILE: src/pages/Analytics/MeReport.jsx
 * ROUTE: /dashboard/analytics/:type/:id/report?year=&period=&department=&lang=en|sw
 * Printable M&E report of one institution/department (approved 29 Oct 2026), modelled on the institutions'
 * Performance Monitoring and Evaluation reports. Every figure comes from Laravel /reports/* (same bundle as the
 * Analytics tabs). The executive summary is generated from those figures; the conclusion and recommendations
 * are drafted the same way and can be edited before printing (kept in this browser only).
 * "Print / Save as PDF" uses the browser's print dialog; @page CSS gives A4 pages without the portal chrome.
 */
import {useEffect, useMemo, useState} from 'react';
import {useLocation, useNavigate, useOutletContext, useParams, useSearchParams} from 'react-router-dom';
import {ArrowLeft, Pencil, Printer, RotateCcw} from 'lucide-react';
import {MuSkeleton} from '../../components/modern/ModernUI.jsx';
import {loadMeBundle, loadMeFilters, periodsForYear, reportYearValue} from '../../services/meReportService.js';
import {KPI_BAND_LABEL, TONE_LABEL, cap100, draftConclusion, fmtMoney, fmtPct, round1, summarySentences} from '../../utils/meReport.js';
import {useAnalyticsBreadcrumb, useOrganisation} from './analyticsParts.jsx';
import {BAND_COLOR, TONE_COLOR} from './meTheme.js';
import {analyticsTrail} from '../../utils/orgScope.js';
import './MeReport.css';

const T = {
  en: {
    republic: 'THE UNITED REPUBLIC OF TANZANIA', ministry: 'MINISTRY OF INDUSTRY AND TRADE',
    title: 'PERFORMANCE MONITORING AND EVALUATION REPORT', ytd: 'Year to date', generated: 'Generated from VIWANDA PORTAL published data',
    reference: 'Reference', exec: 'Executive Summary', ch1: 'Chapter One · Performance by strategic objective',
    t1: 'Table 1: Performance by strategic objective', f1: 'Figure 1: Objective score (%)', objective: 'Objective', weight: 'Weight', kpis: 'KPIs',
    score: 'Score', rating: 'Rating', budget: 'Budget (TZS)', spent: 'Spent (TZS)', total: 'Institution',
    pace: 'Cumulative score progression', t2: 'Table 2: Cumulative score against the planned pace', period: 'Period', actual: 'Actual score', planned: 'Planned pace', gap: 'Gap',
    ch2: 'Chapter Two · Department and unit performance', t3: 'Table 3: Department and unit KPI status', dept: 'Department / unit',
    criteria: 'Criteria: achieved ≥100%, on track 80–99%, partial 40–79%, below <40%, not started 0%.',
    ch3: 'Chapter Three · KPI status and exceptions', t4: 'Table 4: KPI status', status: 'Status', count: 'KPIs', share: 'Share',
    t5: 'Table 5: KPIs requiring attention', kpi: 'KPI', target: 'Target', cumulative: 'Actual', variance: 'Variance',
    ch4: 'Chapter Four · Budget and expenditure', t6: 'Table 6: Budget and expenditure by objective', approved: 'Approved budget', expenditure: 'Expenditure',
    unspent: 'Unspent', utilisation: 'Utilisation', delivery: 'Delivery',
    ch5: 'Chapter Five · Achievements, challenges and corrective actions', achievements: 'Achievements', challenges: 'Challenges', actions: 'Corrective actions',
    none: 'None reported for this period.', ch6: 'Chapter Six · Conclusion and recommendations', conclusion: 'Conclusion', recommendations: 'Recommendations',
    appendix: 'Appendix 1: Results framework matrix', baseline: 'Baseline', page: 'Page', noData: 'No published M&E data for this selection yet.',
    report: 'M&E Report',
  },
  sw: {
    republic: 'JAMHURI YA MUUNGANO WA TANZANIA', ministry: 'WIZARA YA VIWANDA NA BIASHARA',
    title: 'TAARIFA YA UFUATILIAJI NA TATHMINI YA UTENDAJI', ytd: 'Mwaka hadi sasa', generated: 'Imetolewa kutoka takwimu zilizochapishwa VIWANDA PORTAL',
    reference: 'Kumbukumbu', exec: 'Muhtasari wa Taarifa', ch1: 'Sura ya Kwanza · Utendaji kwa malengo ya kimkakati',
    t1: 'Jedwali 1: Utendaji kwa malengo ya kimkakati', f1: 'Kielelezo 1: Alama kwa lengo (%)', objective: 'Lengo', weight: 'Uzito', kpis: 'Viashiria',
    score: 'Alama', rating: 'Daraja', budget: 'Bajeti (TZS)', spent: 'Matumizi (TZS)', total: 'Taasisi',
    pace: 'Mwenendo wa alama za utekelezaji', t2: 'Jedwali 2: Alama limbikizi dhidi ya kasi iliyopangwa', period: 'Kipindi', actual: 'Alama halisi', planned: 'Kasi iliyopangwa', gap: 'Tofauti',
    ch2: 'Sura ya Pili · Utendaji wa Idara na Vitengo', t3: 'Jedwali 3: Hali ya viashiria kwa Idara na Vitengo', dept: 'Idara / Kitengo',
    criteria: 'Vigezo: imefikiwa ≥100%, inaendelea vizuri 80–99%, kwa sehemu 40–79%, chini <40%, haijaanza 0%.',
    ch3: 'Sura ya Tatu · Hali ya viashiria na vilivyo chini ya lengo', t4: 'Jedwali 4: Hali ya viashiria', status: 'Hali', count: 'Viashiria', share: 'Asilimia',
    t5: 'Jedwali 5: Viashiria vinavyohitaji hatua', kpi: 'Kiashiria', target: 'Lengo', cumulative: 'Halisi', variance: 'Tofauti',
    ch4: 'Sura ya Nne · Bajeti na matumizi', t6: 'Jedwali 6: Bajeti na matumizi kwa lengo', approved: 'Bajeti iliyoidhinishwa', expenditure: 'Matumizi',
    unspent: 'Haijatumika', utilisation: 'Matumizi %', delivery: 'Utekelezaji',
    ch5: 'Sura ya Tano · Mafanikio, changamoto na hatua zilizochukuliwa', achievements: 'Mafanikio', challenges: 'Changamoto', actions: 'Hatua zilizochukuliwa',
    none: 'Hakuna kilichoripotiwa kwa kipindi hiki.', ch6: 'Sura ya Sita · Hitimisho na mapendekezo', conclusion: 'Hitimisho', recommendations: 'Mapendekezo',
    appendix: 'Kiambatisho 1: Jedwali la mfumo wa matokeo', baseline: 'Msingi', page: 'Ukurasa', noData: 'Hakuna takwimu za Ufuatiliaji na Tathmini zilizochapishwa kwa uchaguzi huu bado.',
    report: 'Taarifa ya U&T',
  },
};
const storageKey = (parts) => `vp-me-report:${parts.join(':')}`;
const readSaved = (key) => { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; } };
const writeSaved = (key, value) => { try { if (value) localStorage.setItem(key, JSON.stringify(value)); else localStorage.removeItem(key); } catch { /* private mode */ } };

function Bars({rows}) {
  return <div className="mer-fig">{rows.map(r => <div key={r.code} className="mer-fig-col">
    <span className="mer-fig-val">{fmtPct(r.score)}</span>
    <i style={{height: `${cap100(r.score) ?? 0}%`, background: TONE_COLOR[r.tone]}}/>
    <span className="mer-fig-lbl">{r.code}</span></div>)}</div>;
}

export default function MeReport() {
  const {user}=useOutletContext()??{};
  const {type = 'institution', id} = useParams();
  const [search, setSearch] = useSearchParams();
  const navigate = useNavigate(); const location = useLocation();
  const identity = useOrganisation(type, id, location.state?.org);
  const lang = search.get('lang') === 'sw' ? 'sw' : 'en';
  const t = T[lang];
  const year = search.get('year') || '';
  const periodId = search.get('period') || '';
  const departmentId = search.get('department') || '';
  const [state, setState] = useState({loading: true, data: null, error: '', periodLabel: ''});
  const [editing, setEditing] = useState(false);
  const name = identity.heading.title || identity.fullName || '';
  useAnalyticsBreadcrumb([...analyticsTrail(user),
    {text: name || 'Organisation', to: `/dashboard/analytics/${type}/${id}`}, {text: 'M&E report'}]);

  useEffect(() => { document.body.classList.add('me-print-mode'); return () => document.body.classList.remove('me-print-mode'); }, []);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const filters = await loadMeFilters().catch(() => ({financialYears: [], periods: []}));
        const label = year || filters.financialYears[0]?.label || '';
        const periodLabel = periodsForYear(filters, label).find(p => p.value === periodId)?.label || '';
        const data = await loadMeBundle({type, id, financialYear: reportYearValue(filters, label), reportingPeriodId: periodId, departmentId: type === 'institution' ? departmentId : ''});
        if (alive) setState({loading: false, data, error: '', periodLabel, yearLabel: label});
      } catch (error) {
        if (alive) setState({loading: false, data: null, error: error?.response?.data?.message || error?.message || 'Request failed.', periodLabel: ''});
      }
    })();
    return () => { alive = false; };
  }, [type, id, year, periodId, departmentId]);

  const bundle = state.data?.bundle;
  const yearLabel = state.yearLabel || year;
  const periodText = state.periodLabel || t.ytd;
  const key = storageKey([type, id, yearLabel, periodId || 'ytd', departmentId || 'all', lang]);
  const draft = useMemo(() => (bundle ? draftConclusion(bundle, {name: name || 'The institution', lang}) : {conclusion: '', recommendations: ''}), [bundle, name, lang]);
  const [edits, setEdits] = useState(() => readSaved(key));
  useEffect(() => { setEdits(readSaved(key)); }, [key]); // eslint-disable-line react-hooks/set-state-in-effect
  const text = {conclusion: edits?.conclusion ?? draft.conclusion, recommendations: edits?.recommendations ?? draft.recommendations};
  const setText = (field, value) => { const next = {...text, [field]: value}; setEdits(next); writeSaved(key, next); };
  const reset = () => { setEdits(null); writeSaved(key, null); };
  const setLang = (value) => setSearch(old => { const next = new URLSearchParams(old); if (value === 'sw') next.set('lang', 'sw'); else next.delete('lang'); return next; }, {replace: true});
  const today = new Date().toLocaleDateString(lang === 'sw' ? 'sw-TZ' : 'en-GB', {day: 'numeric', month: 'long', year: 'numeric'});
  const ref = `VP-ME-${String(name || id).replace(/[^A-Za-z0-9]+/g, '').slice(0, 10).toUpperCase()}-${String(yearLabel).replace(/\D+/g, '')}-${periodId ? `P${periodId}` : 'YTD'}`;
  const back = () => navigate(`/dashboard/analytics/${type}/${id}?${new URLSearchParams(Object.fromEntries(Object.entries({year, period: periodId, department: departmentId}).filter(([, v]) => v)))}`);
  const kpiName = (k) => (lang === 'sw' && k.nameSw ? k.nameSw : k.name);
  // Laravel ratings are English words; the Kiswahili report uses the matching Kiswahili band name.
  const toneLabel = (tone, rating) => (lang === 'sw' ? TONE_LABEL.sw[tone] : rating || TONE_LABEL.en[tone]);
  const narratives = bundle?.narratives ?? [];
  const byKind = (kind) => narratives.filter(n => n.kind === kind);
  const weightTotal = (bundle?.objectives ?? []).reduce((a, o) => a + (o.weight ?? 0), 0);
  const weightText = (w) => (w === null || w === undefined ? '—' : `${round1(weightTotal > 1.5 ? w : w * 100)}%`);
  const quarters = ['Q1', 'Q2', 'Q3', 'Q4'].filter(q => (bundle?.kpis ?? []).some(k => k.quarters?.[q] !== undefined));

  return <div className="mer-page">
    <div className="mer-toolbar">
      <button type="button" className="ia-back" onClick={back}><ArrowLeft size={15}/> Back to analytics</button>
      <div className="mer-lang" role="group" aria-label="Report language">
        <button type="button" className={lang === 'en' ? 'on' : ''} aria-pressed={lang === 'en'} onClick={() => setLang('en')}>English</button>
        <button type="button" className={lang === 'sw' ? 'on' : ''} aria-pressed={lang === 'sw'} onClick={() => setLang('sw')}>Kiswahili</button>
      </div>
      <button type="button" className={`ia-back${editing ? ' mer-on' : ''}`} onClick={() => setEditing(v => !v)} disabled={!bundle}><Pencil size={15}/> {editing ? 'Done editing' : 'Edit conclusion'}</button>
      {edits && <button type="button" className="ia-back" onClick={reset}><RotateCcw size={15}/> Reset text</button>}
      <button type="button" className="ia-back mer-print" onClick={() => window.print()} disabled={!bundle}><Printer size={15}/> Print / Save as PDF</button>
    </div>
    {editing && <p className="mer-hint">Edit the conclusion and recommendations below. Changes are kept in this browser for this report and language, and are printed as shown.</p>}

    {state.loading && <div className="mer-sheet"><MuSkeleton kind="lines" rows={12}/></div>}
    {!state.loading && state.error && <div className="mer-sheet mer-msg">{state.error}</div>}
    {!state.loading && state.data?.forbidden && <div className="mer-sheet mer-msg">You do not have access to the M&amp;E reports for this organisation.</div>}
    {!state.loading && bundle && !bundle.hasData && <div className="mer-sheet mer-msg">{t.noData}</div>}

    {bundle?.hasData && <article className="me-doc" lang={lang}>
      {/* ---------- cover ---------- */}
      <section className="mer-sheet mer-cover">
        <img className="mer-emblem" src="/reference/national-emblem.png" alt=""/>
        <h4>{t.republic}</h4><h4>{t.ministry}</h4>
        <div className="mer-flag" aria-hidden="true"/>
        {identity.picture ? <img className="mer-logo" src={identity.picture} alt=""/> : <span className="mer-logo mer-initials">{identity.initials}</span>}
        <h3 className="mer-org">{(identity.fullName || name).toUpperCase()}{identity.fullName && name && identity.fullName !== name ? ` (${name})` : ''}</h3>
        <h1>{t.title} {yearLabel}</h1>
        <p className="mer-period">({periodText})</p>
        <p className="mer-meta">{t.generated} · {today}<br/>{t.reference} {ref}</p>
      </section>

      {/* ---------- executive summary + objectives ---------- */}
      <section className="mer-sheet">
        <h2>{t.exec}</h2>
        {(() => { const all = summarySentences(bundle, {name: name || 'The institution', lang, year: yearLabel, periodLabel: state.periodLabel});
          return [all.slice(0, 3), all.slice(3)].filter(part => part.length).map((part, i) => <p key={i}>{part.join(' ')}</p>); })()}
        <h2>{t.ch1}</h2>
        <p className="mer-cap">{t.t1}</p>
        <table className="mer-table"><thead><tr><th>{t.objective}</th><th>{t.weight}</th><th>{t.kpis}</th><th>{t.score}</th><th>{t.rating}</th><th>{t.budget}</th><th>{t.spent}</th></tr></thead>
          <tbody>{bundle.objectives.map(o => <tr key={o.code}><td>{o.code}{o.name ? ` – ${o.name}` : ''}</td><td className="n">{weightText(o.weight)}</td><td className="n">{o.indicators}</td>
            <td className="n">{fmtPct(o.score)}</td><td className={`mer-tone is-${o.tone}`}>{toneLabel(o.tone, o.rating)}</td><td className="n">{fmtMoney(o.budget)}</td><td className="n">{fmtMoney(o.spent)}</td></tr>)}
            <tr className="mer-total"><td>{t.total}</td><td className="n">{weightTotal ? '100%' : ''}</td><td className="n">{bundle.counts.total}</td><td className="n">{fmtPct(bundle.score.score)}</td>
              <td className={`mer-tone is-${bundle.tone}`}>{toneLabel(bundle.tone, bundle.score.rating)}</td><td className="n">{fmtMoney(bundle.budget?.budget)}</td><td className="n">{fmtMoney(bundle.budget?.spent)}</td></tr></tbody></table>
        <p className="mer-cap">{t.f1}</p>
        <Bars rows={bundle.objectives}/>
        {bundle.pace.length > 0 && <>
          <h3>{t.pace}</h3>
          <p className="mer-cap">{t.t2}</p>
          <table className="mer-table mer-narrow"><thead><tr><th>{t.period}</th><th>{t.actual}</th><th>{t.planned}</th><th>{t.gap}</th></tr></thead>
            <tbody>{bundle.pace.map(p => <tr key={p.period}><td>{p.period}</td><td className="n">{fmtPct(p.actual)}</td><td className="n">{fmtPct(p.planned)}</td>
              <td className={`n ${p.gap < 0 ? 'mer-neg' : ''}`}>{p.gap === null ? '—' : `${p.gap > 0 ? '+' : ''}${p.gap}`}</td></tr>)}</tbody></table>
        </>}
      </section>

      {/* ---------- departments + KPI status ---------- */}
      <section className="mer-sheet">
        {type === 'institution' && bundle.departments.length > 0 && <>
          <h2>{t.ch2}</h2>
          <p className="mer-cap">{t.t3}</p>
          <table className="mer-table"><thead><tr><th>{t.dept}</th><th>{t.kpis}</th>
            {['achieved', 'onTrack', 'partial', 'below', 'notStarted'].map(b => <th key={b} style={{background: `${BAND_COLOR[b]}22`}}>{KPI_BAND_LABEL[lang][b].replace(/\s*\(.*\)/, '')}</th>)}
            <th>{t.score}</th></tr></thead>
            <tbody>{bundle.departments.map(d => <tr key={d.label}><td>{d.label}</td><td className="n">{d.indicators}</td>
              {['achieved', 'onTrack', 'partial', 'below', 'notStarted'].map(b => <td key={b} className="n">{d.counts?.[b] ?? '—'}</td>)}
              <td className={`n mer-tone is-${d.tone}`}>{fmtPct(d.score)}</td></tr>)}</tbody></table>
          <p className="mer-small">{t.criteria}</p>
        </>}
        <h2>{t.ch3}</h2>
        <p className="mer-cap">{t.t4}</p>
        <table className="mer-table mer-narrow"><thead><tr><th>{t.status}</th><th>{t.count}</th><th>{t.share}</th></tr></thead>
          <tbody>{['achieved', 'onTrack', 'partial', 'below', 'notStarted', 'noTarget'].filter(b => bundle.counts[b]).map(b =>
            <tr key={b}><td><span className="mer-dot" style={{background: BAND_COLOR[b]}}/>{KPI_BAND_LABEL[lang][b]}</td><td className="n">{bundle.counts[b]}</td>
              <td className="n">{bundle.counts.total ? `${round1(bundle.counts[b] / bundle.counts.total * 100)}%` : '—'}</td></tr>)}
            <tr className="mer-total"><td>{t.total}</td><td className="n">{bundle.counts.total}</td><td className="n">100%</td></tr></tbody></table>
        {bundle.exceptions.length > 0 && <>
          <p className="mer-cap">{t.t5}</p>
          <table className="mer-table"><thead><tr><th>{t.objective}</th><th>{t.kpi}</th><th>{t.target}</th><th>{t.cumulative}</th><th>{t.score}</th><th>{t.variance}</th></tr></thead>
            <tbody>{bundle.exceptions.map((k, i) => <tr key={`${k.indicatorId}-${i}`}><td>{k.objective.code}</td><td>{kpiName(k)}</td><td className="n">{k.target ?? '—'}</td>
              <td className="n">{k.cumulativeActual ?? k.actual ?? '—'}</td><td className="n mer-tone is-red">{fmtPct(k.achievement)}</td>
              <td className="n mer-neg">{k.achievement === null ? '—' : `${round1(k.achievement - 100)}%`}</td></tr>)}</tbody></table>
        </>}
      </section>

      {/* ---------- budget + narratives + conclusion ---------- */}
      <section className="mer-sheet">
        {bundle.budget && <>
          <h2>{t.ch4}</h2>
          <div className="mer-figures">
            <div><small>{t.approved}</small><b>TZS {fmtMoney(bundle.budget.budget)}</b></div>
            <div><small>{t.expenditure}</small><b>TZS {fmtMoney(bundle.budget.spent)}</b></div>
            <div><small>{t.unspent}</small><b>TZS {fmtMoney(bundle.budget.unspent)}</b></div>
            <div><small>{t.utilisation}</small><b>{fmtPct(bundle.budget.utilisation)}</b></div>
          </div>
          {bundle.objectives.some(o => o.budget !== null) && <>
            <p className="mer-cap">{t.t6}</p>
            <table className="mer-table mer-narrow"><thead><tr><th>{t.objective}</th><th>{t.approved}</th><th>{t.expenditure}</th><th>{t.utilisation}</th><th>{t.delivery}</th></tr></thead>
              <tbody>{bundle.objectives.filter(o => o.budget !== null || o.spent !== null).map(o => <tr key={o.code}><td>{o.code}</td><td className="n">{fmtMoney(o.budget, {compact: false})}</td>
                <td className="n">{fmtMoney(o.spent, {compact: false})}</td><td className="n">{fmtPct(o.utilisation)}</td><td className="n">{fmtPct(o.score)}</td></tr>)}</tbody></table>
          </>}
        </>}
        <h2>{t.ch5}</h2>
        {[['achievement', t.achievements], ['challenge', t.challenges], ['action', t.actions]].map(([kind, label]) => <div key={kind}>
          <h3>{label}</h3>
          {byKind(kind).length ? <ul>{byKind(kind).slice(0, 12).map((n, i) => <li key={i}>{n.text}{(n.objective || n.dataset || n.period) && <span className="mer-src"> ({[n.objective ? `${t.objective} ${n.objective}` : '', n.dataset, n.period].filter(Boolean).join(' · ')})</span>}</li>)}</ul> : <p className="mer-small">{t.none}</p>}
        </div>)}
        <h2>{t.ch6}</h2>
        <h3>{t.conclusion}</h3>
        {editing ? <textarea className="mer-edit" rows={5} value={text.conclusion} onChange={e => setText('conclusion', e.target.value)} aria-label={t.conclusion}/>
          : <p className="mer-pre">{text.conclusion}</p>}
        <h3>{t.recommendations}</h3>
        {editing ? <textarea className="mer-edit" rows={7} value={text.recommendations} onChange={e => setText('recommendations', e.target.value)} aria-label={t.recommendations}/>
          : <p className="mer-pre">{text.recommendations}</p>}
      </section>

      {/* ---------- appendix ---------- */}
      <section className="mer-sheet mer-appendix">
        <h2>{t.appendix}</h2>
        <table className="mer-table mer-rf"><thead><tr><th>{t.objective}</th><th>{t.kpi}</th><th>{t.baseline}</th><th>{t.target}</th>
          {quarters.map(q => <th key={q}>{q}</th>)}<th>{t.cumulative}</th><th>{t.score}</th><th>{t.budget}</th><th>{t.spent}</th></tr></thead>
          <tbody>{bundle.kpis.map((k, i) => <tr key={`${k.indicatorId}-${i}`}><td>{k.objective.code}</td><td>{kpiName(k)}{k.department && <span className="mer-src"> · {k.department}</span>}</td>
            <td className="n">{k.baseline ?? '—'}</td><td className="n">{k.target ?? '—'}</td>{quarters.map(q => <td key={q} className="n">{k.quarters?.[q] ?? '—'}</td>)}
            <td className="n">{k.cumulativeActual ?? k.actual ?? '—'}</td><td className="n" style={{color: BAND_COLOR[k.band]}}>{fmtPct(k.achievement)}</td>
            <td className="n">{fmtMoney(k.budget)}</td><td className="n">{fmtMoney(k.expenditure)}</td></tr>)}</tbody></table>
        <p className="mer-small">{name} · {t.report} {yearLabel} · {periodText}</p>
      </section>
    </article>}
  </div>;
}
