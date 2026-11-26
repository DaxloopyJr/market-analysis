import {useErrorDialogState} from '../../utils/userFacingErrors.js';
/**
 * FILE: src/pages/SubmissionPeriods/SubmissionPeriods.jsx
 * ROUTE: /dashboard/submission-periods (Dataset Management sidebar child)
 * ACCESS: MOA alone may create/edit/close global periods shared by all institutions.
 * DATA FLOW: this page -> src/API/reportingPeriods.jsx -> axios.jsx -> Laravel.
 * DATA ENTRY: selected periods consumed via services/idoSubmissionService.jsx; NOT a second entry wizard.
 * IMPORTANT: deadline is authoritative; past-due rows fade here but remain for audit.
 * REMINDERS: global period reminder write API is missing, so never fake persistence.
 */
import {useCallback, useEffect, useMemo, useState} from 'react';
import {useOutletContext} from 'react-router-dom';
import Swal from "../../utils/portalAlerts";
import {CalendarClock, CalendarPlus, CheckCircle2, ChevronLeft, ChevronRight, Eye, Pencil, Plus, RefreshCw, Trash2, X, Info} from 'lucide-react';
import PageHeader from '../../components/Workspace/PageHeader';
import RowActionsMenu from '../../components/common/RowActionsMenu';
import {TableLoader} from '../../components/common/LoadingState';
import {reportingPeriodsAPI as periodsAPI} from '../../API/reportingPeriods';
import {apiError} from '../../API/resourceHelpers';
import {roleCodes} from '../../utils/datasetOwnership';
import {periodState,calculateDeadlineDays,dateFromDays,todayISO} from '../../utils/reportingPeriodRules';
import {annualPeriodPayload} from '../../utils/globalReportingPeriods';
import './SubmissionPeriods.css';
import {MuBadge, MuHeader, MuKpi, MuSelect, MuTabs} from '../../components/modern/ModernUI.jsx';
import {countText} from '../../utils/adminDisplay.js';
import {AlertTriangle, CalendarRange, Clock3} from 'lucide-react';
import '../../styles/admin-modern.css';
import PageSizeSelect from '../../components/common/PageSizeSelect.jsx';
import {usePageSize} from '../../components/common/usePageSize.js';
import {fetchUiPage} from '../../utils/pagedFetch.js';

const EMPTY_YEAR = {startDate:'',endDate:'',deadlineDays:'7'};
const label = item => item?.label || item?.periodCode || `#${item?.id}`;
const safe = value => value == null || value === '' ? '—' : String(value);

export default function SubmissionPeriods() {
  const {user} = useOutletContext();
  const moa = roleCodes(user).includes('MOA');
  const [years,setYears] = useState([]);
  const [periods,setPeriods] = useState([]);
  const [periodType,setPeriodType] = useState('all');
  const [status,setStatus] = useState('all');
  const [yearId,setYearId] = useState('');
  const [page,setPage] = useState(1);
  const [PAGE_SIZE,setPageSize] = usePageSize('submission-periods',20);
  const [total,setTotal] = useState(0);
  const [loading,setLoading] = useState(false);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useErrorDialogState('');
  const [modal,setModal] = useState(null);
  const [form,setForm] = useState(EMPTY_YEAR);
  const [generate,setGenerate] = useState('quarterly');
  const [deadlineDays,setDeadlineDays] = useState('7');
  const [editDays,setEditDays] = useState('0');
  const [editStatus,setEditStatus] = useState('open');
  const [reminderDays,setReminderDays] = useState('7, 1');
  const [remindersEnabled,setRemindersEnabled] = useState(false);

  const load=useCallback(async()=>{
    if(!moa)return;
    setLoading(true);setError('');
    try {
      // Only read real Laravel data; annual parent and child type queried separately.
      const [list,annual]=await Promise.all([
        fetchUiPage((serverPage,perPage)=>periodsAPI.list({...(periodType!=='all'?{periodType}:{}),...(status!=='all'?{status}:{}),...(yearId?{parentId:Number(yearId)}:{}),page:serverPage,perPage}),page,PAGE_SIZE),
        periodsAPI.list({periodType:'annual',perPage:100,page:1}),
      ]);
      setPeriods(list.items);setTotal(list.total);setYears(annual.items);
    }catch(e){setError(apiError(e));setPeriods([]);setTotal(0);}finally{setLoading(false);}
  },[moa,periodType,status,yearId,page,PAGE_SIZE]);
  useEffect(()=>{void load();},[load]);
  const selectedYear=years.find(y=>String(y.id)===String(yearId));
  const counts=useMemo(()=>periods.reduce((result,p)=>{
    const kind=periodState(p);result[kind]=(result[kind]||0)+1;return result;
  },{}),[periods]);
  const resetFilter=next=>{setPage(1);next();};
  // Tabs filter the loaded rows by their live state (deadline-aware); Laravel status stays the source of truth.
  const [stateFilter,setStateFilter]=useState('all');
  const shown=stateFilter==='all'?periods:periods.filter(p=>periodState(p)===stateFilter);
  const STATE_UI={available:{tone:'green',label:'Open'},upcoming:{tone:'blue',label:'Upcoming'},past_due:{tone:'red',label:'Past due'},closed:{tone:'grey',label:'Closed'},unavailable:{tone:'grey',label:'Unavailable'}};
  const partial=total>periods.length;
  const note=text=>partial?`${text} · this page`:text;
  /** "in 79 days" / "due today" / "due 13 days ago" from the deadline (YYYY-MM-DD). */
  const dueIn=deadline=>{
    const due=Date.parse(`${deadline}T00:00:00Z`),now=Date.parse(`${todayISO()}T00:00:00Z`);
    if(!Number.isFinite(due))return null;
    const days=Math.round((due-now)/86400000);
    return days===0?{text:'due today',tone:'soon'}:days>0?{text:`in ${days} day${days===1?'':'s'}`,tone:days<=7?'soon':''}:{text:`due ${-days} day${days===-1?'':'s'} ago`,tone:'late'};
  };
  const openYear=()=>{setForm({...EMPTY_YEAR});setModal({kind:'year'});};
  const openEdit=period=>{
    setEditDays(String(calculateDeadlineDays(period.endDate,period.deadline)??0));
    setEditStatus(period.status==='closed'?'closed':'open');
    setRemindersEnabled(false);setReminderDays('7, 1');
    setModal({kind:'edit',period});
  };
  async function handle(action,success){
    if(busy)return;
    setBusy(true);setError('');
    try {await action();setModal(null);await load();await Swal.fire({toast:true,position:'top-end',showConfirmButton:false,timer:2300,icon:'success',title:success});}
    catch(e){setError(apiError(e));}finally{setBusy(false);}
  }
  async function createYear(event){event.preventDefault();
    // Preflight validates strict YYYY-MM-DD, and the API service repeats it.
    try{annualPeriodPayload(form);}catch(e){setError(e.message);return;}
    await handle(()=>periodsAPI.createYear(form),'Financial year created.');
  }
  async function generatePeriods(event){event.preventDefault();
    if(!selectedYear){setError('Select the existing annual parent first.');return;}
    if(selectedYear.status==='closed'){setError('Closed financial year cannot generate child periods.');return;}
    const kind=generate;
    if(kind==='quarterly'){
      await handle(()=>periodsAPI.generateQuarters(selectedYear.id,Number(deadlineDays)),'Quarterly periods created.');return;
    }
    // Backend POST /reporting-periods for each monthly child; each write acknowledged individually.
    // Partial success must be shown honestly; do not silently roll back existing children.
    if(busy)return;setBusy(true);setError('');
    let created=0;
    try {
      // Respect both duplicate and overlap 409s. Only skip a period that
      // Laravel already returned with the same month number; other 409s stop.
      const existing=[];
      for(let p=1;p<=100;p++){
        const batch=await periodsAPI.list({parentId:Number(selectedYear.id),periodType:'monthly',perPage:100,page:p});
        existing.push(...batch.items);
        if(existing.length>=batch.total||!batch.items.length)break;
      }
      const numbers=new Set(existing.map(p=>Number(p.periodNumber)));
      for(let i=1;i<=12;i++){
        if(numbers.has(i))continue;
        await periodsAPI.createChild({parentId:selectedYear.id,periodType:'monthly',periodNumber:i,deadlineDays:Number(deadlineDays)});
        created++;
      }
      setModal(null);await load();
      await Swal.fire({toast:true,position:'top-end',showConfirmButton:false,timer:2800,icon:'success',title:`${created} monthly periods created; previously saved months preserved.`});
    }catch(e){setError(`Created ${created} month(s) before stopping: ${apiError(e)}. Refresh to see server state.`);await load();}
    finally{setBusy(false);}
  }
  async function updatePeriod(event){event.preventDefault();
    const p=modal?.period;if(!p)return;
    const deadline=dateFromDays(p.endDate,editDays);
    if(!deadline){setError('Deadline days must be between 0 and 365.');return;}
    // Reminders NOT in PATCH reporting-periods contract. Never pass them.
    await handle(()=>periodsAPI.update(p.id,{deadline,status:editStatus}),'Deadline/status updated.');
  }
  async function closePeriod(period){
    const confirm=await Swal.fire({title:'Close reporting period?',text:`${label(period)} will remain in history and no longer accept submissions.`,icon:'warning',showCancelButton:true,confirmButtonText:'Close period'});
    if(confirm.isConfirmed) await handle(()=>periodsAPI.close(period.id),'Period closed.');
  }
  if(!moa) return <div className="container-fluid px-0"><PageHeader title="Submission Periods"/><div className="alert alert-warning">Only Ministry Overall Admin (MOA) can manage reporting periods.</div></div>;
  return <div className="container-fluid px-0 viwanda-periods-page adm-modern">
    <MuHeader initials="🗓" title="Submission Periods" subtitle="Global reporting calendar managed by the Ministry Overall Admin: financial years, quarters, months and due dates for every institution">
      <button className="mu-btn" type="button" onClick={()=>{setGenerate('quarterly');setModal({kind:'generate'});}} disabled={!selectedYear} title={selectedYear?'Generate periods for the selected financial year':'Choose a Financial Year first'}><CalendarPlus size={16}/> Generate Periods</button>
      <button className="mu-btn mu-btn-primary" type="button" onClick={openYear} disabled={loading}><Plus size={16}/> Create Financial Year</button>
    </MuHeader>
    <div className="mu-kpis">
      <MuKpi tone="blue" icon={<CalendarRange size={18}/>} title="Financial years" value={countText(years.length,'year',loading&&!years.length)} note={years.slice(0,2).map(label).join(' · ')||'none yet'} arrow={false}/>
      <MuKpi tone="green" icon={<CheckCircle2 size={18}/>} title="Open now" value={countText(counts.available||0,'period',loading&&!periods.length)} note={note('accepting submissions')} arrow={false} onOpen={()=>setStateFilter('available')}/>
      <MuKpi tone="indigo" icon={<Clock3 size={18}/>} title="Upcoming" value={countText(counts.upcoming||0,'period',loading&&!periods.length)} note={note('not yet open')} arrow={false} onOpen={()=>setStateFilter('upcoming')}/>
      <MuKpi tone="red" icon={<AlertTriangle size={18}/>} title="Past due" value={countText(counts.past_due||0,'period',loading&&!periods.length)} note={note('deadline passed')} arrow={false} onOpen={()=>setStateFilter('past_due')}/>
    </div>
    <section className="viwanda-surface viwanda-periods-surface adm-card">
      <header className="adm-card-head"><span className="adm-dot" aria-hidden="true"/><h2>Reporting periods</h2><span className="mu-count">{loading?'…':total}</span></header>
      <div className="viwanda-periods-toolbar adm-toolbar">
        <MuTabs label="Period state" value={stateFilter} onChange={setStateFilter} items={[{key:'all',label:'All',count:periods.length},{key:'available',label:'Open',count:counts.available||0},{key:'upcoming',label:'Upcoming',count:counts.upcoming||0},{key:'past_due',label:'Past due',count:counts.past_due||0},{key:'closed',label:'Closed',count:counts.closed||0}]}/>
        <MuSelect label="Financial Year" value={yearId||'all'} allLabel="All years" options={years.map(item=>({value:String(item.id),label:label(item)}))} onChange={v=>resetFilter(()=>setYearId(v==='all'?'':v))}/>
        <MuSelect label="Frequency" value={periodType} allLabel="All" options={[{value:'annual',label:'Annual'},{value:'quarterly',label:'Quarterly'},{value:'monthly',label:'Monthly'}]} onChange={v=>resetFilter(()=>setPeriodType(v))}/>
        <MuSelect label="System status" value={status} allLabel="All" options={[{value:'open',label:'Open'},{value:'closed',label:'Closed'}]} onChange={v=>resetFilter(()=>setStatus(v))}/>
        <button className="mu-btn" type="button" onClick={load} disabled={loading} title="Refresh" aria-label="Refresh periods" style={{marginLeft:'auto'}}><RefreshCw size={16}/></button>
      </div>
      <div className="viwanda-periods-status-note"><CalendarClock size={17}/> Periods stay visible here after their deadline, but disappear from New Submission choices. Today: {todayISO()} (YYYY-MM-DD).</div>
      <div className="table-responsive viwanda-periods-table"><table className="table viwanda-table"><thead><tr><th>#</th><th>Reporting Period</th><th>Frequency</th><th>Start Date</th><th>End Date</th><th>Due Date</th><th>Deadline Days</th><th>Status</th><th aria-label="Actions"/></tr></thead><tbody>
        {shown.map((p,i)=>{const state=periodState(p);const due=dueIn(p.deadline);return <tr key={p.id} className={state==='past_due'||state==='closed'?'period-is-past':''}><td>{(page-1)*PAGE_SIZE+i+1}</td><td><strong>{label(p)}</strong><small className="d-block text-muted">{safe(p.periodCode)}</small></td><td><MuBadge tone="grey">{safe(p.periodType)}</MuBadge></td><td>{safe(p.startDate)}</td><td>{safe(p.endDate)}</td><td>{safe(p.deadline)}{due&&state!=='closed'&&<small className={`viwanda-periods-due ${due.tone}`}>{due.text}</small>}</td><td>{calculateDeadlineDays(p.endDate,p.deadline)??'—'}{calculateDeadlineDays(p.endDate,p.deadline)!=null&&' days'}</td><td><MuBadge tone={(STATE_UI[state]||STATE_UI.unavailable).tone}>{(STATE_UI[state]||STATE_UI.unavailable).label}</MuBadge></td><td className="mu-actions"><RowActionsMenu label={`Reporting period actions for ${label(p)}`}><button type="button" title="View period" aria-label={`View ${label(p)}`} onClick={()=>setModal({kind:'view',period:p})}><Eye size={16}/></button><button type="button" title="Edit deadline/status" aria-label={`Edit ${label(p)}`} onClick={()=>openEdit(p)}><Pencil size={16}/></button><button type="button" title="Close period (not hard-delete)" aria-label={`Close ${label(p)}`} disabled={p.status==='closed'} onClick={()=>void closePeriod(p)} className="danger"><Trash2 size={16}/></button></RowActionsMenu></td></tr>;})}
        {!loading&&!!periods.length&&!shown.length&&<tr><td colSpan={9} className="text-center py-4">No periods in this state on the loaded page.</td></tr>}
        {!loading&&!periods.length&&<tr><td colSpan={9} className="text-center py-4">{'No reporting periods found for these filters.'}</td></tr>}
      </tbody></table><TableLoader active={loading}/></div>
      <div className="viwanda-periods-pagination"><span>Showing {shown.length} of {total} · page {page}</span><div><PageSizeSelect value={PAGE_SIZE} onChange={v=>{setPageSize(v);setPage(1);}}/><button type="button" disabled={page<=1} onClick={()=>setPage(x=>Math.max(1,x-1))}><ChevronLeft size={17}/></button><button type="button" disabled={page*PAGE_SIZE>=total} onClick={()=>setPage(x=>x+1)}><ChevronRight size={17}/></button></div></div>
    </section>
    {modal&&<div className="viwanda-periods-modal-backdrop" onMouseDown={e=>{if(e.currentTarget===e.target&&!busy)setModal(null);}}><section className="viwanda-periods-modal" role="dialog" aria-modal="true" aria-label="Reporting period form"><header><h2>{modal.kind==='year'?'Create Financial Year':modal.kind==='generate'?'Generate Reporting Periods':modal.kind==='edit'?'Edit Reporting Period':'Reporting Period Details'}</h2><button type="button" aria-label="Close" disabled={busy} onClick={()=>setModal(null)}><X size={18}/></button></header>
      {modal.kind==='year'&&<form onSubmit={createYear}><p>Create the annual parent before generating quarters or months.</p><div className="viwanda-periods-global-note"><Info size={16}/> Global configuration: available to all institutions. No institution is required.</div><div className="viwanda-periods-input-row"><label>FY Start Date (YYYY-MM-DD)<input className="form-control" type="date" required value={form.startDate} onChange={e=>setForm({...form,startDate:e.target.value})}/></label><label>FY End Date (YYYY-MM-DD)<input className="form-control" type="date" required value={form.endDate} onChange={e=>setForm({...form,endDate:e.target.value})}/></label></div><label>Deadline Days (0–365)<input className="form-control" type="number" required min="0" max="365" value={form.deadlineDays} onChange={e=>setForm({...form,deadlineDays:e.target.value})}/></label><div className="viwanda-periods-modal-footer"><button className="btn btn-outline-secondary" type="button" onClick={()=>setModal(null)}>Cancel</button><button className="btn btn-primary" disabled={busy} type="submit">{busy?'Saving…':'Create Financial Year'}</button></div></form>}
      {modal.kind==='generate'&&<form onSubmit={generatePeriods}><p>Generate children for <strong>{label(selectedYear)}</strong>. The system calculates period dates, labels and deadlines.</p><label>Frequency<select className="form-select" value={generate} onChange={e=>setGenerate(e.target.value)}><option value="quarterly">Quarterly (Q1–Q4)</option><option value="monthly">Monthly (M1–M12)</option></select></label><label>Initial Deadline Days<input className="form-control" min="0" max="365" required type="number" value={deadlineDays} onChange={e=>setDeadlineDays(e.target.value)}/></label><div className="viwanda-periods-modal-footer"><button type="button" className="btn btn-outline-secondary" onClick={()=>setModal(null)}>Cancel</button><button disabled={busy} type="submit" className="btn btn-primary">{busy?'Generating…':'Generate Periods'}</button></div></form>}
      {modal.kind==='edit'&&<form onSubmit={updatePeriod}><p><strong>{label(modal.period)}</strong> • {safe(modal.period.startDate)} – {safe(modal.period.endDate)}</p><div className="viwanda-periods-input-row"><label>Deadline Days<input className="form-control" min="0" max="365" type="number" value={editDays} onChange={e=>setEditDays(e.target.value)} required/></label><label>Calculated Due Date<input className="form-control" readOnly value={dateFromDays(modal.period.endDate,editDays)}/></label></div><label>Period Status<select className="form-select" value={editStatus} onChange={e=>setEditStatus(e.target.value)}><option value="open">Open</option><option value="closed">Closed</option></select></label><div className="viwanda-periods-reminder"><strong>Reminder configuration</strong><label className="viwanda-periods-check"><input type="checkbox" disabled checked={remindersEnabled} onChange={e=>setRemindersEnabled(e.target.checked)}/> Enable reminders</label><label>Reminder days before due date<input className="form-control" disabled value={reminderDays} onChange={e=>setReminderDays(e.target.value)}/></label><small><Info size={15}/> Global reminders are currently unavailable.</small></div><div className="viwanda-periods-modal-footer"><button type="button" className="btn btn-outline-secondary" onClick={()=>setModal(null)}>Cancel</button><button disabled={busy} type="submit" className="btn btn-primary">{busy?'Saving…':'Save Deadline & Status'}</button></div></form>}
      {modal.kind==='view'&&<div className="viwanda-periods-details"><dl>{[['Period',label(modal.period)],['Scope','All institutions'],['Frequency',modal.period.periodType],['Start Date',modal.period.startDate],['End Date',modal.period.endDate],['Deadline',modal.period.deadline],['Status',periodState(modal.period)]].map(([k,v])=><div key={k}><dt>{k}</dt><dd>{safe(v)}</dd></div>)}</dl><button type="button" className="btn btn-outline-secondary" onClick={()=>setModal(null)}>Close</button></div>}
    </section></div>}
  </div>;
}
