/**
 * FILE: src/components/insights/BudgetPerformance.jsx
 * Budget + implementation notes of a submission.
 *  - BudgetEntry / NotesEntry : editable cards under the indicators in Data Entry (step 3).
 *  - PerformanceSummary       : read-only cards on Review and at every approval step (IDO details, IHOD, AO, MDO, MDD).
 * Data: utils/budgetPerformance.js (Laravel performance + annualBudgetContext). Nothing is invented:
 * when Laravel returns no budget and no notes the summary is not shown.
 */
import {useEffect, useState} from 'react';
import {ChevronDown, Lock, Wallet, NotebookPen} from 'lucide-react';
import {annualBudgetContextOf, budgetStatus, formatTzs, moneyInputText, parseMoney, performanceOf} from '../../utils/budgetPerformance.js';
import './BudgetPerformance.css';

/** Header that shrinks/expands its card (same pattern as the indicator accordions). */
function useFold(initial, forceOpen) {
  const [open, setOpen] = useState(initial);
  // Validation errors always reopen the card so the message is visible.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (forceOpen) setOpen(true); }, [forceOpen]);
  return [open, () => setOpen(v => !v)];
}
function FoldHead({id, icon, title, summary, extra, open, onToggle}) {
  return <button type="button" className="bp-head bp-fold" aria-expanded={open} aria-controls={`${id}-body`} onClick={onToggle}>
    {icon || <span className="bp-dot"/>}
    <span className="bp-fold-title"><span className="bp-fold-h" id={id}>{title}</span>{!open && summary && <small>{summary}</small>}</span>
    {extra}
    <ChevronDown size={18} className={`bp-chevron ${open ? 'is-open' : ''}`} aria-hidden="true"/>
  </button>;
}

export function BudgetStatusPill({status}) {
  if (!status) return null;
  return <span className={`bp-pill is-${status.tone}`}>{status.label}</span>;
}

function MoneyField({id, label, required, value, onChange, error, hint, disabled}) {
  return <div className="bp-field">
    <label htmlFor={id}>{label} {required && <b>*</b>}</label>
    <div className={`bp-money ${error ? 'is-invalid' : ''}`}>
      <span>TZS</span>
      <input id={id} inputMode="decimal" autoComplete="off" placeholder="0" value={value} disabled={disabled}
        aria-invalid={!!error} onChange={e => onChange(moneyInputText(e.target.value))}/>
    </div>
    {error ? <small className="bp-error">{error}</small> : hint ? <small className="bp-hint">{hint}</small> : null}
  </div>;
}

export function BudgetEntry({form, onChange, context, errors = {}, ytd, periodLabel, disabled}) {
  const received = parseMoney(form.received);
  const spent = parseMoney(form.spent);
  const approved = context?.approvedBudget ?? parseMoney(form.approvedBudget);
  const balance = received === null && spent === null ? null : (received ?? 0) - (spent ?? 0);
  const year = context?.yearLabel || '';
  const required = context?.optional === false;
  const status = ytd ? budgetStatus({received: ytd.received, spent: ytd.spent, approved}) : budgetStatus({received, spent, approved});
  const set = (key) => (value) => onChange({...form, [key]: value});
  const [open, toggle] = useFold(false, !!(errors.approvedBudget || errors.received || errors.spent));
  const summary = received === null && spent === null ? 'This period not filled yet · optional'
    : `Received ${formatTzs(received, {compact: true})} · Spent ${formatTzs(spent, {compact: true})}`;
  return <section className={`bp-card ${open ? 'is-open' : 'is-closed'}`} aria-labelledby="bp-budget-title">
    <FoldHead id="bp-budget-title" title="Budget for this report" summary={summary} open={open} onToggle={toggle} extra={<BudgetStatusPill status={status}/>}/>
    {open && <div id="bp-budget-title-body">
    <p className="bp-sub">The approved budget is set once for {year || 'the reporting year'} and cannot be changed afterwards. Enter the funds received and spent{periodLabel ? ` in ${periodLabel}` : ' in this period'}.</p>
    <div className="bp-grid">
      {context?.locked
        ? <div className="bp-field"><label>Approved budget {year && `(${year})`}</label>
            <div className="bp-locked"><Lock size={15}/>{approved === null ? 'Not set' : formatTzs(approved)}</div>
            <small className="bp-hint">Locked for this reporting year</small></div>
        : <MoneyField id="bp-approved" label={`Approved budget ${year ? `(${year})` : ''}`} value={form.approvedBudget} onChange={set('approvedBudget')}
            error={errors.approvedBudget} disabled={disabled} hint="Set once for the year. It will be locked after saving."/>}
      <MoneyField id="bp-received" label="Funds received this period" required={required} value={form.received} onChange={set('received')} error={errors.received} disabled={disabled}/>
      <MoneyField id="bp-spent" label="Funds spent this period" required={required} value={form.spent} onChange={set('spent')} error={errors.spent} disabled={disabled}/>
      <div className="bp-field"><label>Balance</label>
        <div className={`bp-calc ${balance !== null && balance < 0 ? 'is-negative' : ''}`}>{balance === null ? '—' : formatTzs(balance)}</div>
        <small className="bp-hint">Received − spent (calculated)</small></div>
    </div>
    {ytd && <div className="bp-ytd">
      <div className="bp-kpi"><small>Received, year to date</small><b>{formatTzs(ytd.received, {compact: true})}</b>
        {approved > 0 && <><i className="bp-bar"><em style={{width: `${Math.min(100, ytd.received / approved * 100)}%`}}/></i><small>{Math.round(ytd.received / approved * 100)}% of approved budget</small></>}</div>
      <div className="bp-kpi"><small>Spent, year to date</small><b>{formatTzs(ytd.spent, {compact: true})}</b>
        {ytd.received > 0 && <><i className={`bp-bar is-${status?.tone}`}><em style={{width: `${Math.min(100, ytd.spent / ytd.received * 100)}%`}}/></i><small>{Math.round(ytd.spent / ytd.received * 100)}% of funds received</small></>}</div>
      <div className="bp-kpi"><small>Balance, year to date</small><b className={ytd.balance < 0 ? 'is-negative' : ''}>{formatTzs(ytd.balance, {compact: true})}</b><small>{ytd.periods.join(' + ')}</small></div>
      <div className="bp-kpi"><small>Spending status</small><b><BudgetStatusPill status={status}/></b><small>{status?.message}</small></div>
    </div>}
    </div>}
  </section>;
}

function NoteField({id, label, required, value, onChange, error, placeholder, disabled}) {
  return <div className="bp-field">
    <label htmlFor={id}>{label} {required && <b>*</b>}</label>
    <textarea id={id} rows={4} className={error ? 'is-invalid' : ''} placeholder={placeholder} value={value} disabled={disabled}
      aria-invalid={!!error} onChange={e => onChange(e.target.value)}/>
    {error && <small className="bp-error">{error}</small>}
  </div>;
}

export function NotesEntry({form, onChange, errors = {}, disabled}) {
  const set = (key) => (value) => onChange({...form, [key]: value});
  const [open, toggle] = useFold(false, !!(errors.achievements || errors.challenges));
  const filled = ['achievements', 'challenges', 'correctiveActions'].filter(k => String(form[k] || '').trim()).length;
  const needed = !String(form.achievements || '').trim() || !String(form.challenges || '').trim();
  return <section className={`bp-card ${open ? 'is-open' : 'is-closed'}`} aria-labelledby="bp-notes-title">
    <FoldHead id="bp-notes-title" title="Implementation notes" summary={`${filled} of 3 written`} open={open} onToggle={toggle}
      extra={<span className={`bp-pill ${needed ? 'is-warning' : 'is-success'}`}>{needed ? 'Achievements & challenges required' : 'Complete'}</span>}/>
    {open && <div id="bp-notes-title-body">
    <p className="bp-sub">Write in your own words. Reviewers see these notes at every approval step.</p>
    <div className="bp-grid bp-grid-3">
      <NoteField id="bp-achievements" label="Achievements" required value={form.achievements} onChange={set('achievements')} error={errors.achievements}
        placeholder="What was achieved in this period…" disabled={disabled}/>
      <NoteField id="bp-challenges" label="Challenges" required value={form.challenges} onChange={set('challenges')} error={errors.challenges}
        placeholder="Challenges faced during implementation…" disabled={disabled}/>
      <NoteField id="bp-corrective" label="Implementation / corrective actions" value={form.correctiveActions} onChange={set('correctiveActions')}
        placeholder="Actions taken or planned to address the challenges…" disabled={disabled}/>
    </div>
    </div>}
  </section>;
}

/** Read-only budget + notes. `performance`/`context` may be passed directly, otherwise read from `record`. */
export function PerformanceSummary({record, performance, context}) {
  const perf = performance ?? performanceOf(record);
  const budget = context ?? annualBudgetContextOf(record);
  const approved = budget?.approvedBudget ?? perf?.approvedBudget ?? null;
  const hasBudget = !!perf && (perf.received !== null || perf.spent !== null) || approved !== null;
  const notes = perf ? [['Achievements', perf.achievements], ['Challenges', perf.challenges], ['Implementation / corrective actions', perf.correctiveActions], ['M&E comments', perf.meComments]].filter(([, v]) => String(v || '').trim()) : [];
  if (!hasBudget && !notes.length) return null;
  const status = perf ? budgetStatus({received: perf.received, spent: perf.spent, approved}) : null;
  const balance = perf && (perf.received !== null || perf.spent !== null) ? (perf.received ?? 0) - (perf.spent ?? 0) : null;
  return <div className="bp-summary">
    {hasBudget && <SummaryFold id="bp-sum-budget" icon={<Wallet size={17} className="bp-icon"/>} title="Budget"
      summary={`Received ${formatTzs(perf?.received, {compact: true})} · Spent ${formatTzs(perf?.spent, {compact: true})}`}
      extra={<BudgetStatusPill status={status}/>}>
      <dl className="bp-rows">
        <div><dt>Approved budget{budget?.yearLabel ? ` (${budget.yearLabel})` : ''}</dt><dd>{approved === null ? 'Not set' : formatTzs(approved)}</dd></div>
        <div><dt>Funds received (period)</dt><dd>{formatTzs(perf?.received)}</dd></div>
        <div><dt>Funds spent (period)</dt><dd>{formatTzs(perf?.spent)}</dd></div>
        <div><dt>Balance</dt><dd className={balance !== null && balance < 0 ? 'is-negative' : ''}>{balance === null ? '—' : formatTzs(balance)}</dd></div>
      </dl>
      {status?.message && <p className={`bp-note is-${status.tone}`}>{status.message}</p>}
    </SummaryFold>}
    {notes.length > 0 && <SummaryFold id="bp-sum-notes" icon={<NotebookPen size={17} className="bp-icon"/>} title="Implementation notes"
      summary={notes.map(([label]) => label.split(' ')[0]).join(' · ')}>
      {notes.map(([label, text]) => <div className="bp-text" key={label}><h4>{label}</h4><p>{text}</p></div>)}
    </SummaryFold>}
  </div>;
}

function SummaryFold({id, icon, title, summary, extra, children}) {
  const [open, toggle] = useFold(true, false);
  return <section className={`bp-card bp-card-ro ${open ? 'is-open' : 'is-closed'}`} aria-labelledby={id}>
    <FoldHead id={id} icon={icon} title={title} summary={summary} extra={extra} open={open} onToggle={toggle}/>
    {open && <div id={`${id}-body`}>{children}</div>}
  </section>;
}

export default PerformanceSummary;
