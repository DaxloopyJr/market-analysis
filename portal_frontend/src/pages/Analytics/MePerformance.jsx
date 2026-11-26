/**
 * FILE: src/pages/Analytics/MePerformance.jsx
 * M&E performance views of ONE institution/department (approved 29 Oct 2026), modelled on the institutions'
 * M&E Excel tools (Dashboard, Variance & alignment, Result framework, Performance calculation).
 * Data: services/meReportService.js -> Laravel /reports/* (published data, scoped by Laravel).
 * The dataset cards of the Institution dashboard are NOT part of this file and stay unchanged.
 */
import {useMemo, useState} from 'react';
import {Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis} from 'recharts';
import {AlertTriangle, Download, Search} from 'lucide-react';
import {KPI_BAND_LABEL, KPI_BAND_ORDER, TONE_LABEL, cap100, fmtMoney, fmtPct, kpiCsv, round1, summarySentences} from '../../utils/meReport.js';
import {BAND_COLOR, ME_TABS, TONE_COLOR, TONE_INK} from './meTheme.js';
import './MePerformance.css';

export function MeTabs({tab, onTab, showDepartments = true, only = null, unitWord = 'Department'}) {
  return <nav className="ia-tabs me-tabs" aria-label="Analytics views">
    {ME_TABS.filter(t => (showDepartments || t.id !== 'departments') && (!only || only.includes(t.id))).map(t =>
      <button type="button" key={t.id} className={`ia-tab${tab === t.id ? ' active' : ''}`} aria-pressed={tab === t.id} onClick={() => onTab(t.id)}>{t.id === 'departments' ? `${unitWord}s` : t.label}</button>)}
  </nav>;
}

const Pill = ({tone, children}) => <span className={`me-pill is-${tone}`}>{children}</span>;
const Missing = ({error, what}) => error
  ? <div className="me-missing"><AlertTriangle size={15}/> {error.status === 403 ? `You do not have access to the ${what} report.` : `${what} could not be loaded: ${error.message}`}</div>
  : null;
const Empty = ({children}) => <div className="ia-empty me-empty">{children}</div>;

function ScoreBar({value, tone}) {
  const v = cap100(value);
  return <span className="me-bar" aria-hidden="true"><i style={{width: `${v ?? 0}%`, background: TONE_COLOR[tone] ?? TONE_COLOR.none}}/></span>;
}

function Kpi({label, value, note, tone = 'blue'}) {
  return <div className={`me-kpi is-${tone}`}><small>{label}</small><b>{value}</b>{note && <span>{note}</span>}</div>;
}

/* ===================== OVERVIEW ===================== */
export function MeOverview({bundle, errors = {}, name, year, periodLabel, orgWord = 'Institution'}) {
  const byDataset = bundle.groupBy === 'dataset';
  const {score, counts, objectives, pace, exceptions, budget} = bundle;
  const donut = [
    {key: 'onTrack', name: 'On track (≥80%)', value: counts.onTrackAll, color: TONE_COLOR.green},
    {key: 'partial', name: 'Partial (40–79%)', value: counts.partial, color: TONE_COLOR.amber},
    {key: 'below', name: 'Below (<40%)', value: counts.belowAll, color: TONE_COLOR.red},
    {key: 'none', name: 'No target', value: counts.noTarget, color: TONE_COLOR.none},
  ].filter(d => d.value);
  const lastPace = pace[pace.length - 1];
  const sentences = summarySentences(bundle, {name, year, periodLabel});
  const objectiveBudget = objectives.filter(o => o.budget !== null || o.spent !== null);
  return <div className="me-view">
    <div className="ia-kpis ia-five me-kpis">
      <Kpi tone={bundle.tone} label={`${orgWord} score`} value={fmtPct(score.score)}
        note={score.score === null ? 'No published targets yet' : `${TONE_LABEL.en[bundle.tone]}${score.source === 'laravel' ? '' : score.source === 'weighted' ? ' · weighted by objective' : byDataset ? ' · average of datasets' : ' · average of objectives'}`}/>
      <Kpi tone="blue" label="KPIs reported" value={counts.total} note={`across ${objectives.length} ${byDataset ? 'dataset' : 'objective'}${objectives.length === 1 ? '' : 's'}`}/>
      <Kpi tone="green" label="On track (≥80%)" value={counts.onTrackAll} note={`of ${counts.withTarget} KPIs · ${counts.achieved} achieved`}/>
      <Kpi tone="red" label="Below target (<40%)" value={counts.belowAll} note={`${counts.notStarted} not started`}/>
      <Kpi tone="purple" label="Budget utilisation" value={budget ? fmtPct(budget.utilisation) : '—'}
        note={budget ? `TZS ${fmtMoney(budget.spent)} of ${fmtMoney(budget.budget)}` : 'No budget reported'}/>
    </div>
    <div className="ia-grid2">
      <section className="ia-surface ia-card">
        <h3>{byDataset ? 'Performance by dataset' : 'Performance by strategic objective'} <span className="ia-tag">Ranked</span></h3>
        <p className="ia-note">Score = average KPI achievement, capped at 100%</p>
        <Missing error={errors.objectives} what="Strategic objective"/>
        {objectives.length ? <div className="me-objlist">{objectives.map(o =>
          <div className="me-obj" key={o.code} title={o.name}>
            <span className="me-code">{o.code}</span><span className="me-obj-name">{o.name || `Objective ${o.code}`}</span>
            <ScoreBar value={o.score} tone={o.tone}/><b>{fmtPct(o.score)}</b><Pill tone={o.tone}>{o.rating || TONE_LABEL.en[o.tone]}</Pill>
          </div>)}</div> : <Empty>No objective results for this selection.</Empty>}
      </section>
      <section className="ia-surface ia-card">
        <h3>Planned pace vs actual score <span className="ia-tag">Line</span></h3>
        <p className="ia-note">Cumulative score each period against an even pace through the year</p>
        <Missing error={errors.trend} what="Quarterly trend"/>
        {pace.length ? <>
          <ResponsiveContainer width="100%" height={230}>
            <LineChart data={pace} margin={{top: 16, right: 18, bottom: 0, left: -12}}>
              <CartesianGrid stroke="#eef1f6" vertical={false}/><XAxis dataKey="period" tick={{fontSize: 11}}/>
              <YAxis tick={{fontSize: 11}} unit="%" domain={[0, 100]}/>
              <Tooltip formatter={v => (v === null || v === undefined ? '—' : `${v}%`)}/><Legend wrapperStyle={{fontSize: 11}}/>
              <Line type="monotone" dataKey="planned" name="Planned pace" stroke="#9fb0c8" strokeDasharray="6 5" strokeWidth={2.4} dot={false}/>
              <Line type="monotone" dataKey="actual" name="Actual score" stroke="#0b5bd3" strokeWidth={3} dot={{r: 4}}
                label={{position: 'top', fontSize: 10.5, fill: '#0b5bd3', formatter: v => (v === null || v === undefined ? '' : `${v}%`)}}/>
            </LineChart>
          </ResponsiveContainer>
          {lastPace?.gap !== null && lastPace?.gap !== undefined && <p className={`me-gap ${lastPace.gap < 0 ? 'is-neg' : 'is-pos'}`}>
            {lastPace.period} gap {lastPace.gap > 0 ? '+' : ''}{lastPace.gap} points vs planned pace</p>}
        </> : <Empty>The trend appears once quarterly reports are published.</Empty>}
      </section>
    </div>
    <div className="ia-grid3 me-grid3">
      <section className="ia-surface ia-card">
        <h3>KPI status <span className="ia-tag">Donut</span></h3>
        <p className="ia-note">{counts.total} KPIs by cumulative achievement</p>
        {donut.length ? <div className="ia-donut-wrap"><div className="ia-donut"><ResponsiveContainer width="100%" height="100%"><PieChart>
          <Pie data={donut} dataKey="value" nameKey="name" innerRadius={48} outerRadius={78} stroke="#fff" strokeWidth={2}>{donut.map(d => <Cell key={d.key} fill={d.color}/>)}</Pie>
          <Tooltip/></PieChart></ResponsiveContainer><div className="ia-donut-center"><strong>{counts.total}</strong><span>KPIs</span></div></div>
          <div className="ia-legend" style={{flex: 1}}>{donut.map(d => <div key={d.key}><i style={{background: d.color}}/>{d.name}<b>{d.value}</b></div>)}</div></div>
          : <Empty>No KPIs for this selection.</Empty>}
      </section>
      <section className="ia-surface ia-card">
        <h3>Attention list <span className="ia-tag">Exceptions</span></h3>
        <p className="ia-note">Largest shortfalls against the annual target</p>
        <Missing error={errors.exceptions} what="Target exceptions"/>
        {exceptions.length ? <table className="me-mini"><thead><tr><th>{byDataset ? 'Set' : 'Obj'}</th><th>KPI</th><th className="n">Score</th></tr></thead>
          <tbody>{exceptions.slice(0, 6).map((k, i) => <tr key={`${k.indicatorId}-${i}`}><td>{k.objective.code}</td><td>{k.name}</td>
            <td className="n" style={{color: TONE_INK.red}}>{fmtPct(k.achievement)}</td></tr>)}</tbody></table>
          : <Empty>No KPIs below target.</Empty>}
      </section>
      <section className="ia-surface ia-card">
        <h3>Budget vs expenditure by objective <span className="ia-tag">TZS</span></h3>
        <p className="ia-note">Utilisation = expenditure ÷ approved budget</p>
        <Missing error={errors.budget} what="Budget utilisation"/>
        {objectiveBudget.length ? <table className="me-mini"><thead><tr><th>Obj</th><th className="n">Budget</th><th className="n">Spent</th><th className="n">Used</th></tr></thead>
          <tbody>{objectiveBudget.map(o => <tr key={o.code}><td>{o.code}</td><td className="n">{fmtMoney(o.budget)}</td><td className="n">{fmtMoney(o.spent)}</td>
            <td className="n" style={{color: o.utilisation !== null && o.utilisation < 40 ? TONE_INK.red : undefined}}>{fmtPct(o.utilisation)}</td></tr>)}
            {budget && <tr className="me-total"><td>Total</td><td className="n">{fmtMoney(budget.budget)}</td><td className="n">{fmtMoney(budget.spent)}</td><td className="n">{fmtPct(budget.utilisation)}</td></tr>}</tbody></table>
          : <Empty>No budget reported for this selection.</Empty>}
      </section>
    </div>
    {sentences.length > 0 && <div className="me-verdict"><b>Summary</b> {sentences.join(' ')}</div>}
  </div>;
}

/* ===================== OBJECTIVES ===================== */
export function MeObjectives({bundle, errors = {}}) {
  const {objectives, counts} = bundle;
  const chart = objectives.map(o => ({name: o.code, full: o.name, capped: o.score, raw: o.raw === null ? null : round1(o.raw)}));
  const weighted = objectives.some(o => o.weight !== null);
  const totalWeight = objectives.reduce((a, o) => a + (o.weight ?? 0), 0);
  return <div className="me-view">
    <Missing error={errors.objectives} what="Strategic objective"/>
    {!objectives.length ? <Empty>No objective results for this selection.</Empty> : <>
      <section className="ia-surface ia-card me-block">
        <h3>Strategic objectives <span className="ia-tag">{objectives.length}</span></h3>
        <div className="ia-table-wrap"><table className="ia-table me-table">
          <thead><tr><th>Objective</th>{weighted && <th className="n">Weight</th>}<th className="n">KPIs</th><th>Score</th><th className="n">Uncapped</th>
            <th className="n">Fully achieved</th><th className="n">Under-performing</th><th className="n">Budget</th><th className="n">Spent</th><th className="n">Used</th><th>Rating</th></tr></thead>
          <tbody>{objectives.map(o => <tr key={o.code}>
            <td><span className="me-code sm">{o.code}</span> {o.name}</td>{weighted && <td className="n">{o.weight === null ? '—' : `${round1(totalWeight > 1.5 ? o.weight : o.weight * 100)}%`}</td>}
            <td className="n">{o.indicators}</td><td className="me-scorecell"><ScoreBar value={o.score} tone={o.tone}/><b>{fmtPct(o.score)}</b></td>
            <td className="n">{fmtPct(o.raw)}</td><td className="n">{o.fullyAchieved}</td><td className="n">{o.underperforming}</td>
            <td className="n">{fmtMoney(o.budget)}</td><td className="n">{fmtMoney(o.spent)}</td><td className="n">{fmtPct(o.utilisation)}</td>
            <td><Pill tone={o.tone}>{o.rating || TONE_LABEL.en[o.tone]}</Pill></td></tr>)}</tbody>
        </table></div>
      </section>
      <div className="ia-grid2">
        <section className="ia-surface ia-card">
          <h3>Objective score · uncapped vs capped <span className="ia-tag">Bar</span></h3>
          <p className="ia-note">Uncapped shows over-achievement; the score used for rating is capped at 100%</p>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={chart} margin={{top: 14, right: 8, bottom: 0, left: -14}}>
              <CartesianGrid stroke="#eef1f6" vertical={false}/><XAxis dataKey="name" tick={{fontSize: 11}}/><YAxis tick={{fontSize: 11}} unit="%"/>
              <Tooltip formatter={v => (v === null || v === undefined ? '—' : `${v}%`)} labelFormatter={(l, p) => p?.[0]?.payload?.full || l}/><Legend wrapperStyle={{fontSize: 11}}/>
              <Bar dataKey="raw" name="Uncapped" fill="#0b5bd3" radius={[5, 5, 0, 0]} maxBarSize={26}/>
              <Bar dataKey="capped" name="Capped" fill="#f07b22" radius={[5, 5, 0, 0]} maxBarSize={26}/>
            </BarChart>
          </ResponsiveContainer>
        </section>
        <section className="ia-surface ia-card">
          <h3>Effort vs strategic weight <span className="ia-tag">Alignment</span></h3>
          <p className="ia-note">Share of KPIs per objective compared with the objective's strategic weight</p>
          {weighted ? <table className="me-mini"><thead><tr><th>Obj</th><th className="n">Weight</th><th className="n">Share of KPIs</th><th className="n">Effort gap</th><th className="n">Contribution</th></tr></thead>
            <tbody>{objectives.map(o => {
              const w = o.weight === null ? null : (totalWeight > 1.5 ? o.weight / 100 : o.weight);
              const share = counts.total ? o.indicators / counts.total : null;
              return <tr key={o.code}><td>{o.code}</td><td className="n">{w === null ? '—' : `${round1(w * 100)}%`}</td><td className="n">{share === null ? '—' : `${round1(share * 100)}%`}</td>
                <td className="n" style={{color: w !== null && share !== null && share - w < -0.05 ? TONE_INK.red : undefined}}>{w === null || share === null ? '—' : `${share - w > 0 ? '+' : ''}${round1((share - w) * 100)}%`}</td>
                <td className="n">{w === null || o.score === null ? '—' : `${round1(w * cap100(o.score))}%`}</td></tr>;
            })}</tbody></table>
            : <Empty>Objective weights are not set yet, so alignment cannot be measured.</Empty>}
        </section>
      </div>
    </>}
  </div>;
}

/* ===================== KPIs (RESULT FRAMEWORK) ===================== */
export function MeKpis({bundle, errors = {}, fileName = 'kpis', unitWord = 'Department'}) {
  const {kpis} = bundle;
  const [query, setQuery] = useState('');
  const [objective, setObjective] = useState('');
  const [band, setBand] = useState('');
  const codes = useMemo(() => [...new Set(kpis.map(k => k.objective.code))].sort(), [kpis]);
  const list = kpis.filter(k => (!objective || k.objective.code === objective) && (!band || k.band === band)
    && (!query || `${k.name} ${k.department} ${k.dataset}`.toLowerCase().includes(query.toLowerCase())));
  const quarters = ['Q1', 'Q2', 'Q3', 'Q4'].filter(q => kpis.some(k => k.quarters?.[q] !== undefined));
  const download = () => {
    const blob = new Blob([kpiCsv(list)], {type: 'text/csv;charset=utf-8'});
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${fileName}.csv`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  return <div className="me-view">
    <Missing error={errors.indicators} what="Indicator performance"/>
    <section className="ia-surface ia-card me-block">
      <div className="me-filters">
        <label className="me-search"><Search size={15}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder={`Search KPI, ${unitWord.toLowerCase()} or dataset…`} aria-label="Search KPIs"/></label>
        <div className="ia-chips">
          <button type="button" className={`ia-chip-btn${!objective ? ' active' : ''}`} onClick={() => setObjective('')}>All objectives</button>
          {codes.map(c => <button type="button" key={c} className={`ia-chip-btn${objective === c ? ' active' : ''}`} onClick={() => setObjective(c)}>{c}</button>)}
        </div>
        <select className="me-select" value={band} onChange={e => setBand(e.target.value)} aria-label="Status">
          <option value="">All statuses</option>{KPI_BAND_ORDER.map(b => <option key={b} value={b}>{KPI_BAND_LABEL.en[b]}</option>)}
        </select>
        <button type="button" className="ia-back" onClick={download} disabled={!list.length}><Download size={15}/> Excel (CSV)</button>
      </div>
      {list.length ? <div className="ia-table-wrap"><table className="ia-table me-table me-rf">
        <thead><tr><th>Obj</th><th>KPI / output indicator</th><th className="n">Baseline</th><th className="n">Annual target</th>
          {quarters.map(q => <th className="n" key={q}>{q}</th>)}<th className="n">Cumulative</th><th>Achievement</th><th className="n">Budget</th><th className="n">Spent</th></tr></thead>
        <tbody>{list.map((k, i) => <tr key={`${k.indicatorId}-${i}`}>
          <td><span className="me-code sm">{k.objective.code}</span></td>
          <td><b className="me-kpi-name">{k.name}</b><small>{[k.unit, k.department, k.dataset].filter(Boolean).join(' · ')}</small>
            {(k.challenges || k.achievements) && <small className="me-note-line" title={[k.achievements, k.challenges, k.actions].filter(Boolean).join('\n')}>
              {k.challenges ? `Challenge: ${k.challenges}` : `Achievement: ${k.achievements}`}</small>}</td>
          <td className="n">{k.baseline ?? '—'}</td><td className="n">{k.target ?? '—'}</td>
          {quarters.map(q => <td className="n" key={q}>{k.quarters?.[q] ?? '—'}</td>)}
          <td className="n">{k.cumulativeActual ?? k.actual ?? '—'}</td>
          <td className="me-scorecell"><span className="me-bar"><i style={{width: `${cap100(k.achievement) ?? 0}%`, background: BAND_COLOR[k.band]}}/></span>
            <b>{fmtPct(k.achievement)}</b><span className="me-band" style={{color: BAND_COLOR[k.band]}}>{KPI_BAND_LABEL.en[k.band].replace(/\s*\(.*\)/, '')}</span></td>
          <td className="n">{fmtMoney(k.budget)}</td><td className="n">{fmtMoney(k.expenditure)}</td></tr>)}</tbody>
      </table></div> : <Empty>No KPIs match this filter.</Empty>}
      <p className="ia-note me-foot">{list.length} of {kpis.length} KPIs · score = cumulative actual ÷ annual target</p>
    </section>
  </div>;
}

/* ===================== VARIANCE & EXCEPTIONS ===================== */
const NARRATIVE_LABEL = {achievement: 'Achievement', challenge: 'Challenge', action: 'Corrective action'};
export function MeVariance({bundle, errors = {}}) {
  const {variance, objectives, exceptions, narratives, pace} = bundle;
  const objVar = objectives.map(o => ({name: o.code, full: o.name, variance: o.score === null ? null : round1(o.score - 100)}));
  const [kind, setKind] = useState('');
  const notes = narratives.filter(n => !kind || n.kind === kind);
  return <div className="me-view">
    <div className="ia-kpis me-kpis">
      <Kpi tone="green" label="KPIs over-achieved" value={variance.over} note=">100% of target"/>
      <Kpi tone="blue" label="KPIs on target" value={variance.on} note="80% – 100% of target"/>
      <Kpi tone="red" label="KPIs below target" value={variance.below} note="<80% of target"/>
      <Kpi tone={pace.length && pace[pace.length - 1].gap < 0 ? 'red' : 'green'} label="Alignment gap" value={pace.length ? `${pace[pace.length - 1].gap ?? '—'} pts` : '—'} note="actual vs even pace"/>
    </div>
    <div className="ia-grid2">
      <section className="ia-surface ia-card">
        <h3>Objective variance vs 100% target <span className="ia-tag">Bar</span></h3>
        <p className="ia-note">Negative bars show how far each objective is from its annual target</p>
        {objVar.length ? <ResponsiveContainer width="100%" height={240}>
          <BarChart data={objVar} margin={{top: 14, right: 8, bottom: 0, left: -14}}>
            <CartesianGrid stroke="#eef1f6" vertical={false}/><XAxis dataKey="name" tick={{fontSize: 11}}/><YAxis tick={{fontSize: 11}} unit="%" domain={[-100, 0]}/>
            <Tooltip formatter={v => `${v}%`} labelFormatter={(l, p) => p?.[0]?.payload?.full || l}/>
            <Bar dataKey="variance" name="Variance" radius={[0, 0, 5, 5]} maxBarSize={30}>{objVar.map(o => <Cell key={o.name} fill={o.variance < -20 ? TONE_COLOR.red : o.variance < 0 ? TONE_COLOR.amber : TONE_COLOR.green}/>)}</Bar>
          </BarChart></ResponsiveContainer> : <Empty>No objective results.</Empty>}
      </section>
      <section className="ia-surface ia-card">
        <h3>Attention list <span className="ia-tag">{exceptions.length}</span></h3>
        <p className="ia-note">KPIs with the largest negative variance</p>
        <Missing error={errors.exceptions} what="Target exceptions"/>
        {exceptions.length ? <table className="me-mini"><thead><tr><th>#</th><th>{bundle.groupBy === 'dataset' ? 'Set' : 'Obj'}</th><th>KPI</th><th className="n">Score</th><th className="n">Variance</th><th>Type</th></tr></thead>
          <tbody>{exceptions.map((k, i) => <tr key={`${k.indicatorId}-${i}`}><td>{i + 1}</td><td>{k.objective.code}</td><td>{k.name}</td>
            <td className="n">{fmtPct(k.achievement)}</td><td className="n" style={{color: TONE_INK.red}}>{k.achievement === null ? '—' : `${round1(k.achievement - 100)}%`}</td>
            <td><small>{k.exceptionType || (k.achievement === 0 ? 'zero delivery' : 'underperformance')}</small></td></tr>)}</tbody></table>
          : <Empty>No exceptions for this selection.</Empty>}
      </section>
    </div>
    <section className="ia-surface ia-card me-block">
      <h3>Achievements, challenges and corrective actions <span className="ia-tag">From submitted reports</span></h3>
      <div className="ia-chips me-chips">{['', 'achievement', 'challenge', 'action'].map(k =>
        <button type="button" key={k || 'all'} className={`ia-chip-btn${kind === k ? ' active' : ''}`} onClick={() => setKind(k)}>{k ? `${NARRATIVE_LABEL[k]}s` : 'All'}</button>)}</div>
      {notes.length ? <ul className="me-notes">{notes.map((n, i) => <li key={i} className={`is-${n.kind}`}><b>{NARRATIVE_LABEL[n.kind]}</b><p>{n.text}</p>{n.source && <small>{n.source}</small>}</li>)}</ul>
        : <Empty>No implementation notes were submitted for this selection.</Empty>}
    </section>
  </div>;
}

/* ===================== BUDGET ===================== */
export function MeBudget({bundle, errors = {}}) {
  const {budget, objectives} = bundle;
  const rows = objectives.filter(o => o.budget !== null || o.spent !== null);
  const chart = rows.map(o => ({name: o.code, full: o.name, budget: o.budget ?? 0, spent: o.spent ?? 0}));
  return <div className="me-view">
    <Missing error={errors.budget} what="Budget utilisation"/>
    {!budget && !rows.length ? <Empty>No budget has been reported for this selection.</Empty> : <>
      <div className="ia-kpis ia-five me-kpis">
        <Kpi tone="blue" label="Approved budget" value={`TZS ${fmtMoney(budget?.budget)}`}/>
        <Kpi tone="purple" label="Expenditure" value={`TZS ${fmtMoney(budget?.spent)}`}/>
        <Kpi tone="amber" label="Unspent" value={`TZS ${fmtMoney(budget?.unspent)}`} note="budget less expenditure"/>
        <Kpi tone={budget?.utilisation > 100 ? 'red' : budget?.utilisation >= 80 ? 'green' : 'amber'} label="Utilisation" value={fmtPct(budget?.utilisation)}/>
        <Kpi tone={bundle.tone} label="Delivery vs spending" value={budget?.delivery !== null && budget?.delivery !== undefined && budget?.utilisation !== null ? `${round1(budget.delivery - budget.utilisation)} pts` : '—'}
          note={budget?.delivery !== null && budget?.delivery !== undefined ? `delivery ${fmtPct(budget.delivery)} vs spend ${fmtPct(budget?.utilisation)}` : 'delivery not reported'}/>
      </div>
      {rows.length > 0 && <div className="ia-grid2">
        <section className="ia-surface ia-card">
          <h3>Budget vs expenditure by objective <span className="ia-tag">Bar</span></h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={chart} margin={{top: 14, right: 8, bottom: 0, left: 6}}>
              <CartesianGrid stroke="#eef1f6" vertical={false}/><XAxis dataKey="name" tick={{fontSize: 11}}/><YAxis tick={{fontSize: 11}} tickFormatter={v => fmtMoney(v)}/>
              <Tooltip formatter={v => `TZS ${fmtMoney(v, {compact: false})}`} labelFormatter={(l, p) => p?.[0]?.payload?.full || l}/><Legend wrapperStyle={{fontSize: 11}}/>
              <Bar dataKey="budget" name="Approved budget" fill="#0a2a5c" radius={[5, 5, 0, 0]} maxBarSize={28}/>
              <Bar dataKey="spent" name="Expenditure" fill="#e0a100" radius={[5, 5, 0, 0]} maxBarSize={28}/>
            </BarChart>
          </ResponsiveContainer>
        </section>
        <section className="ia-surface ia-card">
          <h3>Delivery against spending <span className="ia-tag">Table</span></h3>
          <p className="ia-note">A large positive gap means results without spending; a negative gap means spending without results</p>
          <table className="me-mini"><thead><tr><th>Obj</th><th className="n">Budget</th><th className="n">Spent</th><th className="n">Used</th><th className="n">Delivery</th><th className="n">Gap</th></tr></thead>
            <tbody>{rows.map(o => {
              const gap = o.gap ?? (o.score !== null && o.utilisation !== null ? round1(o.score - o.utilisation) : null);
              return <tr key={o.code}><td>{o.code}</td><td className="n">{fmtMoney(o.budget)}</td><td className="n">{fmtMoney(o.spent)}</td><td className="n">{fmtPct(o.utilisation)}</td>
                <td className="n">{fmtPct(o.score)}</td><td className="n" style={{color: gap !== null && gap < 0 ? TONE_INK.red : undefined}}>{gap === null ? '—' : `${gap > 0 ? '+' : ''}${gap}`}</td></tr>;
            })}</tbody></table>
        </section>
      </div>}
    </>}
  </div>;
}

/* ===================== DEPARTMENTS ===================== */
/** unitWord: 'Unit' for institution users (they never see "Department"), 'Department' otherwise. */
export function MeDepartments({bundle, errors = {}, unitWord = 'Department'}) {
  const w = unitWord, wl = unitWord.toLowerCase(), col = w === 'Unit' ? 'Unit' : 'Department / unit';
  const {departments, objectives} = bundle;
  const codes = objectives.map(o => o.code).sort();
  const withCounts = departments.some(d => d.counts);
  return <div className="me-view">
    <Missing error={errors.departments} what={`${w} performance`}/>
    {!departments.length ? <Empty>No {wl} results for this selection.</Empty> : <>
      <section className="ia-surface ia-card me-block">
        <h3>{w === 'Unit' ? 'Unit performance' : 'Department and unit performance'} <span className="ia-tag">{departments.length}</span></h3>
        <div className="ia-table-wrap"><table className="ia-table me-table">
          <thead><tr><th>{col}</th><th className="n">KPIs</th><th>Score</th>
            {withCounts && ['achieved', 'onTrack', 'partial', 'below', 'notStarted'].map(b => <th key={b} className="n"><span className="me-dot" style={{background: BAND_COLOR[b]}}/>{KPI_BAND_LABEL.en[b].replace(/\s*\(.*\)/, '')}</th>)}
            <th>Rating</th></tr></thead>
          <tbody>{departments.map(d => <tr key={d.label}><td><b>{d.label}</b></td><td className="n">{d.indicators}</td>
            <td className="me-scorecell"><ScoreBar value={d.score} tone={d.tone}/><b>{fmtPct(d.score)}</b></td>
            {withCounts && ['achieved', 'onTrack', 'partial', 'below', 'notStarted'].map(b => <td key={b} className="n">{d.counts?.[b] ?? '—'}</td>)}
            <td><Pill tone={d.tone}>{d.rating || TONE_LABEL.en[d.tone]}</Pill></td></tr>)}</tbody>
        </table></div>
        {withCounts && <p className="ia-note me-foot">Status criteria: achieved ≥100%, on track 80–99%, partial 40–79%, below &lt;40%, not started 0%.</p>}
      </section>
      {codes.length > 0 && departments.some(d => Object.keys(d.byObjective).length) && <section className="ia-surface ia-card me-block">
        <h3>Average score by {wl} and objective <span className="ia-tag">Matrix</span></h3>
        <div className="ia-table-wrap"><table className="ia-table me-table me-matrix">
          <thead><tr><th>{col}</th>{codes.map(c => <th key={c} className="n">Objective {c}</th>)}<th className="n">Average</th></tr></thead>
          <tbody>{departments.map(d => <tr key={d.label}><td><b>{d.label}</b></td>
            {codes.map(c => { const v = d.byObjective[c]; const tone = v === undefined || v === null ? 'none' : v >= 80 ? 'green' : v >= 60 ? 'amber' : 'red';
              return <td key={c} className={`n me-cell is-${tone}`}>{v === undefined || v === null ? '' : fmtPct(v)}</td>; })}
            <td className="n"><b>{fmtPct(d.score)}</b></td></tr>)}</tbody>
        </table></div>
      </section>}
    </>}
  </div>;
}
