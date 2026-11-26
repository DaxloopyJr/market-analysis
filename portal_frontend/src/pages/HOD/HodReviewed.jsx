import {TableLoader} from '../../components/common/LoadingState.jsx';
import {useErrorDialogState} from '../../utils/userFacingErrors.js';
/**
 * HOD → Submissions → Reviewed (table-only screen).
 *
 * Backend flow:
 *   GET /submissions (own scope) → GET /submissions/{id} when the summary
 *   omits approval history → retain only records with an action by THIS HOD.
 *   View → existing read-only HOD history details page.
 *   Review/Edit → available only if Laravel explicitly returns a new
 *   actionable assignment for this user; a returned submission normally goes
 *   to its responsible Data Officer, so HOD editing must NOT be fabricated.
 *   History icon → view the confirmed review actions in the current page.
 *
 * The ⋮ menu reuses RowActionsMenu from Management tables. No new actions or
 * approval writes originate here. No fake rows, dates, or reviewer names.
 */
import {useEffect,useMemo,useRef,useState} from 'react';
import {Link,useLocation,useOutletContext} from 'react-router-dom';
import {CheckCircle2,Eye,FileCheck2,History,Layers3,Pencil,RefreshCcw,RotateCcw,Search,X} from 'lucide-react';
import RowActionsMenu from '../../components/common/RowActionsMenu';
import PageSizeSelect from '../../components/common/PageSizeSelect.jsx';
import {usePageSize} from '../../components/common/usePageSize.js';
import {getHodSubmissions} from '../../services/hodReviewService';
import HodApprovalJourney from './HodApprovalJourney';
import {ownHodReviewEvents,reviewedSubmissionStatus,reviewedSubmissionAt} from '../../utils/hodReviewedModel';
import {reviewActorName,reviewDate} from '../../utils/hodApprovalPresentation';
import {submissionFacts} from '../../utils/serverFields.js';
import {canHodReopenReturned} from '../../utils/hodReviewRules';
import {showPortalToast} from '../../utils/portalAlerts';
import './HodReviewed.css';
import {MuBadge,MuCard,MuDate,MuHeader,MuKpi,MuSelect} from '../../components/modern/ModernUI.jsx';
import {ownOrg,plural} from '../../utils/roleDisplay.js';
import {reportingTime} from '../../utils/reportingTime.js';

const label=value=>value===undefined||value===null||value===''?'—':String(value);
const attr=(record,...fields)=>{
  const source=record.raw||{};
  for(const field of fields){
    if(source[field]!==undefined&&source[field]!==null&&source[field]!=='')return source[field];
  }
  return null;
};
const yearOf=record=>reportingTime(record).year;
const periodOf=record=>reportingTime(record).period;
const actorOf=record=>(submissionFacts(record).submittedByDisplay || submissionFacts(record).submittedBy);
const methodOf=record=>label(submissionFacts(record).method);
const eventDate=event=>event?.timestamp??null;
export default function HodReviewed(){
  const {user}=useOutletContext();
  const location=useLocation();
  const receipt=location.state?.hodReviewAction;
  const receiptShown=useRef('');
  const [rows,setRows]=useState([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useErrorDialogState('');
  const [reload,setReload]=useState(0);
  const [query,setQuery]=useState('');
  const [year,setYear]=useState('all');
  const [period,setPeriod]=useState('all');
  const [dataset,setDataset]=useState('all');
  const [status,setStatus]=useState('all');
  const [applied,setApplied]=useState({query:'',year:'all',period:'all',dataset:'all',status:'all'});
  const [page,setPage]=useState(1);
  const [historyRecord,setHistoryRecord]=useState(null);
  const [perPage,setPerPage]=usePageSize('hod-reviewed',10);

  useEffect(()=>{
    if(!receipt?.submissionId)return;
    const key=`${receipt.submissionId}:${receipt.revision}:${receipt.action}`;
    if(receiptShown.current===key)return;
    receiptShown.current=key;
    void showPortalToast({type:'success',title:receipt.label||'Review action confirmed',
      message:`Submission #${receipt.submissionId} updated.`});
  },[receipt?.submissionId,receipt?.revision,receipt?.action,receipt?.label]);

  useEffect(()=>{
    let active=true;
    setLoading(true);setError('');
    getHodSubmissions(user,{history:true}).then(data=>{
      if(active)setRows(data);
    }).catch(err=>{
      if(active)setError(err?.message||'Unable to load reviewed submissions.');
    }).finally(()=>{
      if(active)setLoading(false);
    });
    return()=>{active=false;};
  },[user?.id,reload]);

  const years=useMemo(()=>[...new Set(rows.map(yearOf).filter(Boolean))].sort().reverse(),[rows]);
  const periods=useMemo(()=>[...new Set(rows.map(periodOf).filter(Boolean))].sort(),[rows]);
  const datasets=useMemo(()=>[...new Set(rows.map(item=>String(item.dataset||'')).filter(Boolean))].sort(),[rows]);
  const statuses=useMemo(()=>[...new Set(rows.map(item=>reviewedSubmissionStatus(item,user)))].sort(),[rows,user?.id]);
  const filtered=useMemo(()=>rows.filter(item=>{
    const searchable=[item.id,item.dataset,item.period,item.financialYear,actorOf(item),methodOf(item),reviewedSubmissionStatus(item,user)]
      .join(' ').toLowerCase();
    return (!applied.query||searchable.includes(applied.query.toLowerCase())) &&
      (applied.year==='all'||yearOf(item)===applied.year) &&
      (applied.period==='all'||periodOf(item)===applied.period) &&
      (applied.dataset==='all'||String(item.dataset||'')===applied.dataset) &&
      (applied.status==='all'||reviewedSubmissionStatus(item,user)===applied.status);
  }).sort((a,b)=>{
    const ta=Date.parse(reviewedSubmissionAt(a,user)||'')||0;
    const tb=Date.parse(reviewedSubmissionAt(b,user)||'')||0;
    return tb-ta||Number(b.id)-Number(a.id);
  }),[rows,applied,user?.id]);
  const lastPage=Math.max(1,Math.ceil(filtered.length/perPage));
  const safePage=Math.min(page,lastPage);
  const visible=filtered.slice((safePage-1)*perPage,safePage*perPage);
  const reset=()=>{
    setQuery('');setYear('all');setPeriod('all');setDataset('all');setStatus('all');
    setApplied({query:'',year:'all',period:'all',dataset:'all',status:'all'});
    setPage(1);
  };
  const search=()=>{setApplied({query:query.trim(),year,period,dataset,status});setPage(1);};

  const own=ownOrg(user);
  const returnedCount=rows.filter(item=>/return/i.test(reviewedSubmissionStatus(item,user))).length;
  const forwardedCount=rows.length-returnedCount;
  const datasetCount=datasets.length;
  const show=value=>loading?'…':value;
  const quick=key=>{setStatus(key);setApplied(old=>({...old,status:key}));setPage(1);};
  return <div className="hod-workspace hod-reviewed-workspace mu-page container-fluid px-0">
    <MuHeader logo={own.logo} initials={own.initials} title="Reviewed Submissions" subtitle={own.name}>
      {/* Filters apply immediately; Search only applies the typed text. */}
      <MuSelect label="Reporting Year" value={year} allLabel="All years" options={years} onChange={v=>{setYear(v);setPeriod('all');setApplied(old=>({...old,year:v,period:'all'}));setPage(1);}}/>
      <MuSelect label="Reporting Period" value={period} allLabel="All periods" options={periods} onChange={v=>{setPeriod(v);setApplied(old=>({...old,period:v}));setPage(1);}}/>
      <MuSelect label="Dataset" value={dataset} allLabel="All datasets" options={datasets} onChange={v=>{setDataset(v);setApplied(old=>({...old,dataset:v}));setPage(1);}}/>
      <button type="button" className="mu-btn" onClick={reset}>Reset</button>
      <button type="button" className="mu-btn mu-btn-primary" onClick={search}><Search size={15}/> Search</button>
      <button className="mu-btn" type="button" aria-label="Refresh" title="Refresh" onClick={()=>setReload(n=>n+1)}><RefreshCcw size={15}/></button>
    </MuHeader>
    <div className="mu-kpis">
      <MuKpi tone="blue" icon={<FileCheck2 size={19}/>} title="Reviewed by you" value={show(plural(rows.length,'submission'))} note="all decisions" arrow={false} onOpen={()=>quick('all')}/>
      <MuKpi tone="green" icon={<CheckCircle2 size={20}/>} title="Forwarded" value={show(plural(forwardedCount,'submission'))} note="sent to the next step" arrow={false}/>
      <MuKpi tone="orange" icon={<RotateCcw size={19}/>} title="Returned" value={show(plural(returnedCount,'submission'))} note="sent back to IDO" arrow={false}/>
      <MuKpi tone="indigo" icon={<Layers3 size={19}/>} title="Datasets" value={show(plural(datasetCount,'dataset'))} note="in your decisions" arrow={false}/>
    </div>
    <MuCard title="Your review decisions" count={loading?'…':filtered.length}>
      <div className="mu-toolbar">
        <MuSelect label="Status" value={status} allLabel="All statuses" options={statuses} onChange={value=>{setStatus(value);setApplied(old=>({...old,status:value}));setPage(1);}}/>
        <label className="mu-search"><Search size={16}/><input id="hod-reviewed-search" aria-label="Find submission" placeholder="Search by ID, dataset or officer..." value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();search();}}}/></label>
      </div>
      <div className="mu-table-wrap vw-local-table-loading-host">
        <table className="mu-table hod-reviewed-table">
          <thead><tr><th>#</th><th>Submission ID</th><th>Dataset</th><th>Reporting Period</th><th>Submitted By</th><th>Method</th><th>Reviewed On</th><th>Status</th><th aria-label="Actions"/></tr></thead>
          <tbody>
            {loading&&<tr><td colSpan={9} style={{height:130}}>&nbsp;</td></tr>}
            {!loading&&visible.length===0&&<tr><td colSpan={9} className="mu-empty">No reviewed submissions match your filters.</td></tr>}
            {!loading&&visible.map((item,index)=>{
              const reviewStatus=reviewedSubmissionStatus(item,user);
              // Returned submissions go to the responsible officer according
              // to Laravel contract #76. Enable HOD Review only if the actual
              // server has reassigned this submission to the HOD.
              const canEdit=/return/i.test(reviewStatus)&&canHodReopenReturned(item,user);
              const back=/return/i.test(reviewStatus);
              return <tr key={item.id}>
                <td>{(safePage-1)*perPage+index+1}</td>
                <td><strong>SUB-{item.id}</strong></td>
                <td>{label(item.dataset)}</td>
                <td>{label(periodOf(item))}</td>
                <td>{label(actorOf(item))}</td>
                <td>{methodOf(item)}</td>
                <td><MuDate value={reviewedSubmissionAt(item,user)}/></td>
                <td><MuBadge tone={back?'red':/approv|review|forward/i.test(reviewStatus)?'green':'grey'}>{reviewStatus}</MuBadge></td>
                <td className="mu-actions"><RowActionsMenu label={`Actions for submission SUB-${item.id}`}>
                  <Link to={`/dashboard/hod/history/${item.id}`} title="View Submission" aria-label="View Submission"><Eye size={16}/></Link>
                  {canEdit ? <Link to={`/dashboard/hod/review/${item.id}`} title="Review / Edit" aria-label="Review / Edit"><Pencil size={16}/></Link>
                    : <button type="button" disabled title="Review / Edit is available once this submission is assigned to you" aria-label="Review / Edit unavailable"><Pencil size={16}/></button>}
                  <button type="button" title="View Review History" aria-label="View Review History" onClick={()=>setHistoryRecord(item)}><History size={16}/></button>
                </RowActionsMenu></td>
              </tr>;
            })}
          </tbody>
        </table>
        <TableLoader active={loading} label="Loading reviewed submissions…"/>
      </div>
      <div className="mu-table-foot">
        <span>Showing {filtered.length?(safePage-1)*perPage+1:0} to {Math.min(safePage*perPage,filtered.length)} of {filtered.length} entries</span>
        <span className="vw-table-footer-tools"><PageSizeSelect value={perPage} onChange={v=>{setPerPage(v);setPage(1);}}/>
        {lastPage>1&&<div className="mu-pager"><button type="button" disabled={safePage===1} onClick={()=>setPage(p=>Math.max(1,p-1))} aria-label="Previous page">‹</button><span>{safePage} / {lastPage}</span>
          <button type="button" disabled={safePage>=lastPage} onClick={()=>setPage(p=>Math.min(lastPage,p+1))} aria-label="Next page">›</button></div>}</span>
      </div>
    </MuCard>
    {historyRecord&&<div className="hod-reviewed-modal-overlay" onClick={()=>setHistoryRecord(null)}>
      <section className="hod-reviewed-modal" role="dialog" aria-modal="true" aria-label={`Review history for SUB-${historyRecord.id}`} onClick={event=>event.stopPropagation()}>
        <div className="hod-reviewed-modal-title"><h2>Approval History · SUB-{historyRecord.id}</h2><button type="button" onClick={()=>setHistoryRecord(null)} aria-label="Close Review History"><X size={19}/></button></div>
        <HodApprovalJourney record={historyRecord.raw||historyRecord} user={user}/>
        {ownHodReviewEvents(historyRecord,user).length ? <div className="hod-reviewed-event-list">
          {ownHodReviewEvents(historyRecord,user).map((event,index)=><div key={event.id??index}>
            <strong>{label(event.action)}</strong> <span>{reviewDate(eventDate(event))}</span>
            {event.actor&&<small>By {event.actor}</small>}
            {event.comments&&<p>{event.comments}</p>}
          </div>)}
        </div>:<p className="hod-reviewed-no-events">No review actions recorded for this submission yet.</p>}
        <div className="hod-reviewed-modal-foot"><button type="button" className="btn btn-outline-secondary btn-sm" onClick={()=>setHistoryRecord(null)}>Close</button></div>
      </section>
    </div>}
  </div>;
}
