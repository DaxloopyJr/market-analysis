/**
 * FILE: src/pages/AuditLogs/AuditLogs.jsx
 * ROUTE: /dashboard/audit-logs (RouteAccess: audit_logs.view.ministry | audit_logs.view.institution)
 * API: src/API/audit.jsx -> GET /audit-events (list), GET /audit-events/{id} (details). Read-only.
 * Approved UI: 28 Oct 2026 — header filters, KPI, activity table with ⋮, details side panel.
 */
import {useEffect,useMemo,useState} from 'react';
import {createPortal} from 'react-dom';
import {useOutletContext,useSearchParams} from 'react-router-dom';
import {Download,Eye,ListChecks,PencilLine,RefreshCcw,ScrollText,Search,Settings2,UsersRound,X} from 'lucide-react';
import Swal from 'sweetalert2';
import {MuBadge,MuCard,MuDate,MuHeader,MuKpi,MuLogo,MuSelect} from '../../components/modern/ModernUI.jsx';
import {institutionLogoUrl,NATIONAL_EMBLEM} from '../../utils/institutionLogo.js';
import {orgInitials} from '../../utils/orgCards.js';
import {ownOrg} from '../../utils/roleDisplay.js';
import RowActionsMenu from '../../components/common/RowActionsMenu.jsx';
import {TableLoader} from '../../components/common/LoadingState.jsx';
import {getAuditEvent,listAuditEvents,UUID_PATTERN} from '../../API/audit.jsx';
import {actorOf,changeRows,darDateOffset,eventTone,humanize,isSystemEvent} from '../../utils/auditDisplay.js';
import {useErrorDialogState} from '../../utils/userFacingErrors.js';
import {apiError} from '../../API/resourceHelpers';
import {plural} from '../../utils/roleDisplay.js';
import {useAnalyticsBreadcrumb} from '../Analytics/analyticsParts.jsx';
import PageSizeSelect from '../../components/common/PageSizeSelect.jsx';
import {usePageSize} from '../../components/common/usePageSize.js';
import {fetchUiPage,SERVER_MAX_PER_PAGE} from '../../utils/pagedFetch.js';
import {downloadCsv} from '../../utils/csvExport.js';
import {showPortalToast} from '../../utils/portalAlerts';
import './AuditLogs.css';

const initialFilters=()=>({startDate:darDateOffset(-30),endDate:darDateOffset(0),eventType:'all',entityType:'all',actorType:'all'});
const hasPermission=(user,code)=>(user?.permissions??[]).some(p=>(typeof p==='string'?p:p?.code)===code);

function DateBox({label,value,onChange,min,max}){
  return <label className="mu-select au-date"><small>{label}</small><input type="date" value={value} min={min} max={max} onChange={e=>onChange(e.target.value)}/></label>;
}

function AuditDetails({event,loading,onClose}){
  useEffect(()=>{const onKey=e=>{if(e.key==='Escape')onClose();};document.addEventListener('keydown',onKey);return()=>document.removeEventListener('keydown',onKey);},[onClose]);
  const actor=actorOf(event);
  const rows=changeRows(event);
  const [raw,setRaw]=useState(false);
  return createPortal(<div className="au-overlay" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}>
    <aside className="au-drawer" role="dialog" aria-modal="true" aria-label="Audit event details">
      <header className="au-drawer-head"><div><h2>{humanize(event.eventType)||'Audit event'}</h2>
        <p>Audit event #{event.id} · <MuDate value={event.createdAt??event.created_at}/> · read-only</p></div>
        <button type="button" className="au-close" onClick={onClose} aria-label="Close details"><X size={18}/></button></header>
      {loading&&<p className="mu-muted small">Loading full record…</p>}
      <section className="au-block"><h3>Actor</h3>
        <div className="au-who"><span className={`au-av${actor.system?' sys':''}`}>{actor.initials}</span><div><b>{actor.name}</b><small>{actor.roles.map(r=>r.name||r.code).filter(Boolean).join(', ')||actor.role}</small></div></div>
        {!actor.system&&<div className="au-chips">{actor.acting&&<span className="au-chip">Acting role: {actor.acting}</span>}
          {actor.roles.length>0&&<span className="au-chip">Roles: {actor.roles.map(r=>r.code).join(', ')}</span>}
          <span className="au-chip">{actor.delegations.length?`Delegation: ${actor.delegations.length}`:'No delegation'}</span></div>}
        {!event.actor&&!actor.system&&<p className="mu-muted small mb-0 mt-2">Older record: no actor details were saved.</p>}
      </section>
      <section className="au-block"><h3>Record</h3><dl className="au-dl">
        <dt>Entity</dt><dd><b>{humanize(event.entityType)||'—'}{event.entityId?` #${event.entityId}`:''}</b></dd>
        <dt>Event type</dt><dd className="au-mono">{event.eventType||'—'}</dd>
        {event.requestId&&<><dt>Request ID</dt><dd className="au-mono">{event.requestId}</dd></>}
        {event.ipAddress&&<><dt>IP address</dt><dd className="au-mono">{event.ipAddress}</dd></>}
        {(event.institution?.name||event.institutionId)&&<><dt>Institution</dt><dd className="au-org"><MuLogo src={institutionLogoUrl(event.institution)} initials={orgInitials(event.institution??{name:'Institution'})} size={22}/><b>{event.institution?.name??`#${event.institutionId}`}</b></dd></>}
      </dl></section>
      {event.reason&&<section className="au-block"><h3>Reason</h3><div className="au-reason">{event.reason}</div></section>}
      <section className="au-block"><h3>Changes</h3>
        {rows.length?<table className="au-diff"><thead><tr><th>Field</th><th>Before</th><th>After</th></tr></thead><tbody>
          {rows.map(row=><tr key={row.field}><td>{row.field}</td><td className={row.changed?'au-old':''}>{row.before}</td><td className={row.changed?'au-new':''}>{row.after}</td></tr>)}
        </tbody></table>:<p className="mu-muted small mb-0">No field values were recorded for this event.</p>}
        <button type="button" className="au-raw-toggle" onClick={()=>setRaw(v=>!v)}>{raw?'▾ Hide raw JSON':'▸ Show raw JSON'}</button>
        {raw&&<pre className="au-raw">{JSON.stringify(event,null,2)}</pre>}
      </section>
    </aside>
  </div>,document.body);
}

export default function AuditLogs(){
  const {user}=useOutletContext();
  useAnalyticsBreadcrumb([{text:'Audit Logs'}]);
  const ministry=hasPermission(user,'audit_logs.view.ministry')||hasPermission(user,'audit.readAll');
  // Audit Workspace "Open record" links here with ?entityType=&entityId= (9 Nov 2026): the record's whole history.
  const [linkParams]=useSearchParams();
  const linked=/^\d+$/.test(linkParams.get('entityId')??'')?{entityType:linkParams.get('entityType')||'all',entityId:linkParams.get('entityId')}:null;
  const startFilters=()=>linked?{...initialFilters(),startDate:darDateOffset(-1095),entityType:linked.entityType}:initialFilters();
  const [draft,setDraft]=useState(startFilters);
  const [filters,setFilters]=useState(startFilters);
  const [search,setSearch]=useState(linked?.entityId??''),[searchApplied,setSearchApplied]=useState(linked?.entityId??'');
  const [page,setPage]=useState(1),[reload,setReload]=useState(0);
  const [pageSize,setPageSize]=usePageSize('audit-logs',20);
  const [exporting,setExporting]=useState(null);
  const [result,setResult]=useState({items:[],meta:{total:0,last_page:1,current_page:1}});
  const [loading,setLoading]=useState(true);
  const [,setError]=useErrorDialogState('');
  const [known,setKnown]=useState({eventTypes:[],entityTypes:[]});
  const [selected,setSelected]=useState(null),[detailLoading,setDetailLoading]=useState(false);

  const searchParams=useMemo(()=>{
    const text=searchApplied.trim();
    if(!text)return {};
    if(UUID_PATTERN.test(text))return {requestId:text};
    if(/^\d+$/.test(text))return {entityId:text};
    return null;
  },[searchApplied]);

  useEffect(()=>{
    let live=true;
    if(searchParams===null){setResult({items:[],meta:{total:0,last_page:1,current_page:1}});setLoading(false);return undefined;}
    setLoading(true);
    fetchUiPage((serverPage,perPage)=>listAuditEvents({...filters,...searchParams,page:serverPage,perPage})
      .then(r=>({items:r.items,total:r.meta.total,lastPage:r.meta.last_page})),page,pageSize).then(data=>{
      if(!live)return;
      setResult({items:data.items,meta:{current_page:page,per_page:pageSize,total:data.total,last_page:data.lastPage}});
      // Event / entity options come from the records Laravel returned (no list endpoint exists).
      setKnown(old=>({eventTypes:[...new Set([...old.eventTypes,...data.items.map(e=>e.eventType).filter(Boolean)])].sort(),
        entityTypes:[...new Set([...old.entityTypes,...data.items.map(e=>e.entityType).filter(Boolean)])].sort()}));
    }).catch(e=>{if(live){setError(apiError(e)||e.message);setResult({items:[],meta:{total:0,last_page:1,current_page:1}});}})
      .finally(()=>{if(live)setLoading(false);});
    return()=>{live=false;};
  },[filters,searchParams,page,pageSize,reload,setError]);

  const items=result.items;
  const users=new Set(items.filter(e=>!isSystemEvent(e)).map(e=>e.actor?.userId??e.userId)).size;
  const withReason=items.filter(e=>e.reason).length;
  const system=items.filter(isSystemEvent).length;
  const topEvents=Object.entries(items.reduce((acc,e)=>{const k=e.eventType||'unknown';acc[k]=(acc[k]??0)+1;return acc;},{})).sort((a,b)=>b[1]-a[1]).slice(0,6);
  const topMax=Math.max(1,...topEvents.map(([,n])=>n));
  const dateError=draft.startDate&&draft.endDate&&draft.endDate<draft.startDate;
  const apply=()=>{if(dateError){setError('End date must be on or after the start date.');return;}setFilters({...draft});setSearchApplied(search);setPage(1);};
  const reset=()=>{const fresh=initialFilters();setDraft(fresh);setFilters(fresh);setSearch('');setSearchApplied('');setPage(1);};
  const openDetails=async event=>{
    setSelected(event);setDetailLoading(true);
    try{const full=await getAuditEvent(event.id);if(full)setSelected(full);}
    catch(e){setError(apiError(e)||e.message);}
    finally{setDetailLoading(false);}
  };
  /** Export every event that matches the APPLIED filters (all pages of 100), as CSV for Excel. */
  async function exportCsv(){
    if(exporting||searchParams===null)return;
    const total=Number(result.meta.total)||0;
    if(!total){void showPortalToast({type:'info',title:'Nothing to export',message:'No audit events match these filters.'});return;}
    if(total>10000){
      const answer=await Swal.fire({icon:'question',title:'Export a large audit file?',text:`${total.toLocaleString('en-US')} events match these filters. The download may take a while.`,showCancelButton:true,confirmButtonText:'Export',confirmButtonColor:'#0b5bd3'});
      if(!answer.isConfirmed)return;
    }
    const rows=[];
    setExporting({done:0,total});
    try{
      for(let serverPage=1;;serverPage+=1){
        const chunk=await listAuditEvents({...filters,...searchParams,page:serverPage,perPage:SERVER_MAX_PER_PAGE});
        rows.push(...chunk.items);
        setExporting({done:rows.length,total});
        if(!chunk.items.length||serverPage>=chunk.meta.last_page)break;
      }
      const headers=['Event ID','Date & time','Actor','Acting role','Actor roles','Actor type','Event type','Event','Entity type','Entity ID','IP address','Request ID','Reason','Before','After'];
      const lines=rows.map(event=>{const actor=actorOf(event);return [event.id,event.createdAt??event.created_at??'',actor.name,actor.acting??'',actor.roles.map(r=>r.code).join(' '),
        event.actorType??'',event.eventType??'',humanize(event.eventType),event.entityType??'',event.entityId??'',event.ipAddress??'',event.requestId??'',event.reason??'',event.oldValues??'',event.newValues??''];});
      downloadCsv(`audit-logs_${filters.startDate||'start'}_${filters.endDate||'end'}.csv`,headers,lines);
      void showPortalToast({type:'success',title:'Audit export ready',message:`${rows.length.toLocaleString('en-US')} events exported.`});
    }catch(e){setError(apiError(e)||e.message);}
    finally{setExporting(null);}
  }
  const show=value=>loading?'…':value;
  const scopeText=ministry?'Ministry-wide':(user?.institution?.name?`${user.institution.name} only`:'Your institution only');
  const range=`${filters.startDate||'…'} – ${filters.endDate||'…'}`;
  const toneOf=e=>eventTone(e.eventType);

  return <div className="audit-page mu-page container-fluid px-0">
    <MuHeader logo={ministry?NATIONAL_EMBLEM:ownOrg(user).logo} initials="LOG" title="Audit Logs" subtitle={`Immutable activity history · ${scopeText}`}>
      <DateBox label="From" value={draft.startDate} max={draft.endDate||undefined} onChange={v=>setDraft({...draft,startDate:v})}/>
      <DateBox label="To" value={draft.endDate} min={draft.startDate||undefined} onChange={v=>setDraft({...draft,endDate:v})}/>
      <MuSelect label="Event" value={draft.eventType} allLabel="All events" options={known.eventTypes.map(v=>({value:v,label:humanize(v)}))} onChange={v=>setDraft({...draft,eventType:v})}/>
      <MuSelect label="Entity" value={draft.entityType} allLabel="All entities" options={known.entityTypes.map(v=>({value:v,label:humanize(v)}))} onChange={v=>setDraft({...draft,entityType:v})}/>
      <MuSelect label="Actor" value={draft.actorType} allLabel="Users & system" options={[{value:'user',label:'Users'},{value:'system',label:'System'}]} onChange={v=>setDraft({...draft,actorType:v})}/>
      <button type="button" className="mu-btn" onClick={reset}>Reset</button>
      <button type="button" className="mu-btn mu-btn-primary" onClick={apply}><Search size={15}/> Apply</button>
    </MuHeader>
    <div className="mu-kpis">
      <MuKpi tone="blue" icon={<ScrollText size={19}/>} title="Events in range" value={show(`${Number(result.meta.total).toLocaleString('en-US')} event${result.meta.total===1?'':'s'}`)} note={range} arrow={false}/>
      <MuKpi tone="green" icon={<UsersRound size={19}/>} title="Actors" value={show(plural(users,'user'))} note="on this page" arrow={false}/>
      <MuKpi tone="amber" icon={<PencilLine size={18}/>} title="With a reason" value={show(plural(withReason,'event'))} note="on this page · corrections, returns" arrow={false}/>
      <MuKpi tone="indigo" icon={<Settings2 size={19}/>} title="System events" value={show(plural(system,'event'))} note="on this page · reminders, schedulers" arrow={false}/>
    </div>
    <div className="mu-grid">
      <MuCard title="Activity" count={loading?'…':Number(result.meta.total).toLocaleString('en-US')}>
        <div className="mu-toolbar">
          <label className="mu-search"><Search size={16}/><input value={search} onChange={e=>setSearch(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')apply();}}
            placeholder="Search entity ID or request ID…" aria-label="Search entity ID or request ID"/></label>
          <button type="button" className="mu-btn" onClick={()=>setReload(n=>n+1)} aria-label="Refresh" title="Refresh"><RefreshCcw size={15}/></button>
          <button type="button" className="mu-btn au-export" onClick={exportCsv} disabled={Boolean(exporting)||loading||!result.meta.total}
            title="Download all events that match the applied filters (CSV for Excel)"><Download size={15}/> {exporting?`Exporting ${exporting.done.toLocaleString('en-US')} / ${exporting.total.toLocaleString('en-US')}…`:'Export (CSV)'}</button>
        </div>
        {searchParams===null&&<p className="au-hint">Search accepts an entity ID (numbers) or a request ID (UUID).</p>}
        <div className="mu-table-wrap vw-local-table-loading-host" aria-busy={loading}>
          <table className="mu-table"><thead><tr><th>#</th><th>Date &amp; time</th><th>Actor</th><th>Event</th><th>Entity</th><th>IP address</th><th aria-label="Actions"/></tr></thead><tbody>
            {loading&&<tr><td colSpan={7} style={{height:150}}>&nbsp;</td></tr>}
            {!loading&&!items.length&&<tr><td colSpan={7} className="mu-empty">No audit events match these filters.</td></tr>}
            {!loading&&items.map((event,i)=>{const actor=actorOf(event);return <tr key={event.id}>
              <td>{(result.meta.current_page-1)*result.meta.per_page+i+1}</td>
              <td><MuDate value={event.createdAt??event.created_at}/></td>
              <td><div className="au-who"><span className={`au-av${actor.system?' sys':''}`}>{actor.initials}</span><div><b>{actor.name}</b><small>{actor.role}</small></div></div></td>
              <td><MuBadge tone={toneOf(event)}>{humanize(event.eventType)||'Event'}</MuBadge></td>
              <td>{humanize(event.entityType)||'—'}{event.entityId&&<span className="au-mono"> #{event.entityId}</span>}</td>
              <td className="au-mono">{event.ipAddress||'—'}</td>
              <td className="mu-actions"><RowActionsMenu label={`Actions for audit event ${event.id}`}>
                <button type="button" title="View details" onClick={()=>openDetails(event)}><Eye size={16}/></button>
              </RowActionsMenu></td></tr>;})}
          </tbody></table>
          <TableLoader active={loading} label="Loading audit events…"/>
        </div>
        <div className="mu-table-foot"><span>{result.meta.total?`Showing ${(result.meta.current_page-1)*result.meta.per_page+1}–${(result.meta.current_page-1)*result.meta.per_page+items.length} of ${Number(result.meta.total).toLocaleString('en-US')} events`:'No events'}</span>
          <span className="vw-table-footer-tools"><PageSizeSelect value={pageSize} disabled={loading} onChange={v=>{setPageSize(v);setPage(1);}}/>
          {result.meta.last_page>1&&<div className="mu-pager"><button type="button" disabled={page<=1||loading} onClick={()=>setPage(p=>p-1)} aria-label="Previous page">‹</button>
            <span>{result.meta.current_page} / {result.meta.last_page}</span>
            <button type="button" disabled={page>=result.meta.last_page||loading} onClick={()=>setPage(p=>p+1)} aria-label="Next page">›</button></div>}</span></div>
      </MuCard>
      <MuCard title="Top events" tag="this page">
        {topEvents.length?<div className="au-bars">{topEvents.map(([type,n])=><div key={type}><span>{humanize(type)}</span>
          <em><u className={`au-tone-${eventTone(type)}`} style={{width:`${n/topMax*100}%`}}/></em><b>{n}</b></div>)}</div>
          :<p className="mu-muted small mb-0">{loading?'Loading…':'No events on this page.'}</p>}
        <p className="mu-muted small mt-3 mb-0"><ListChecks size={13}/> Scope: IAU / IA see their own institution; MAU / MOA see the whole ministry.</p>
      </MuCard>
    </div>
    {selected&&<AuditDetails event={selected} loading={detailLoading} onClose={()=>setSelected(null)}/>}
  </div>;
}
