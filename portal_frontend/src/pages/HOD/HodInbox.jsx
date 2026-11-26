import {useEffect,useMemo,useState} from 'react';
import {useNavigate,useOutletContext} from 'react-router-dom';
import {ListChecks,RefreshCcw,Search} from 'lucide-react';
import {getHodSubmissions} from '../../services/hodReviewService';
import {submissionFacts} from '../../utils/serverFields.js';
import {TableLoader} from '../../components/common/LoadingState.jsx';
import './HodReview.css';
import './HodPendingApproved.css';
import {useErrorDialogState} from '../../utils/userFacingErrors.js';
import InsightModal from '../../components/insights/InsightModal.jsx';
import RowActionsMenu from '../../components/common/RowActionsMenu.jsx';
import PageSizeSelect from '../../components/common/PageSizeSelect.jsx';
import {usePageSize} from '../../components/common/usePageSize.js';
import {MuBadge,MuCard,MuDate,MuHeader,MuSelect,MuSource} from '../../components/modern/ModernUI.jsx';
import {MuDonutLegend} from '../../components/modern/RoleParts.jsx';
import {ownOrg,statusBadge} from '../../utils/roleDisplay.js';
import {reportingTime} from '../../utils/reportingTime.js';

const label=x=>x===undefined||x===null||x===''?'—':String(x);
const reportingSource=row=>{
  const raw=row.raw||{};
  const dataset=raw.dataset||raw.datasetDetails||{};
  const source=dataset.reportingSource||dataset.reporting_source||{};
  const inst=source.institution||raw.institution||dataset.institution||{};
  return label(source.name||source.institutionName||inst.name||raw.institutionName||row.institutionName||raw.reportingSourceName);
};
const periodOf=row=>reportingTime(row).period;
const lastSubmitted=row=>{
  const facts=submissionFacts(row);
  const raw=row.raw||{};
  const events=Array.isArray(raw.history)?raw.history:[];
  const submissions=events.filter(e=>/submit|resubmit|received/i.test(String(e.action||e.event||e.type||'')))
    .map(e=>e.created_at||e.timestamp||e.action_at).filter(Boolean).sort((a,b)=>Date.parse(b)-Date.parse(a));
  return submissions[0]||facts.submittedAt||raw.submitted_at||row.submittedAt;
};
export default function HodInbox(){
  const {user}=useOutletContext();
  const [insight,setInsight]=useState(null);
  const [pending,setPending]=useState([]),[reviewed,setReviewed]=useState([]);
  const [loading,setLoading]=useState(true),[,setError]=useErrorDialogState(''),[reload,setReload]=useState(0);
  const [search,setSearch]=useState(''),[period,setPeriod]=useState('all'),[status,setStatus]=useState('all'),[page,setPage]=useState(1);
  const [pageSize,setPageSize]=usePageSize('hod-inbox',10);
  useEffect(()=>{
    let live=true;setLoading(true);setError('');
    Promise.allSettled([getHodSubmissions(user),getHodSubmissions(user,{history:true})]).then(results=>{
      if(!live)return;
      setPending(results[0].status==='fulfilled'?results[0].value:[]);
      setReviewed(results[1].status==='fulfilled'?results[1].value:[]);
      const failures=results.filter(x=>x.status==='rejected');
      if(failures.length)setError(failures.map(x=>x.reason?.message||'Request failed').join('; '));
    }).finally(()=>{if(live)setLoading(false);});
    return()=>{live=false;};
  },[user?.id,reload]);
  const records=useMemo(()=>[...new Map(pending.map(r=>[String(r.id),r])).values()].sort((a,b)=>Number(b.id)-Number(a.id)),[pending]);
  const periods=useMemo(()=>[...new Set(records.map(periodOf).filter(Boolean))],[records]);
  const statuses=useMemo(()=>[...new Set(records.map(r=>r.status).filter(Boolean))],[records]);
  const filtered=useMemo(()=>records.filter(r=>{
    const value=[r.id,r.dataset,periodOf(r),reportingSource(r),r.status].join(' ').toLowerCase();
    return (!search||value.includes(search.toLowerCase()))&&(period==='all'||periodOf(r)===period)&&(status==='all'||r.status===status);
  }),[records,search,period,status]);
  const visible=filtered.slice((page-1)*pageSize,page*pageSize);
  const totalPages=Math.max(1,Math.ceil(filtered.length/pageSize));
  const pendingCount=records.length;
  const reviewedCount=reviewed.length;
  const returnedCount=reviewed.filter(r=>(r.history||r.raw?.history||[]).some(e=>/return/i.test(String(e.action||'')))).length;
  const mix=[{name:'Pending Review',count:pendingCount,color:'#0b5bd3'},{name:'Reviewed',count:Math.max(0,reviewedCount-returnedCount),color:'#0f7a2f'},{name:'Returned',count:returnedCount,color:'#e0620a'}];
  const own=ownOrg(user);
  const navigate=useNavigate();
  const mixRows=mix.map(item=>({name:item.name,value:item.count,color:item.color}));
  return <div className="hod-workspace mu-page container-fluid px-0">
    <MuHeader logo={own.logo} initials={own.initials} title="Pending Review" subtitle={own.name}>
      <MuSelect label="Reporting Period" value={period} allLabel="All periods" options={periods} onChange={v=>{setPeriod(v);setPage(1);}}/>
      <MuSelect label="Status" value={status} allLabel="All statuses" options={statuses.map(x=>({value:x,label:statusBadge(x).label}))} onChange={v=>{setStatus(v);setPage(1);}}/>
      <button className="mu-btn" type="button" onClick={()=>setReload(x=>x+1)}><RefreshCcw size={15}/> Refresh</button>
    </MuHeader>
    <div className="mu-grid">
      <MuCard title="Submissions awaiting your review" count={loading?'…':filtered.length}>
        <div className="mu-toolbar"><label className="mu-search"><Search size={16}/><input value={search} onChange={e=>{setSearch(e.target.value);setPage(1);}} placeholder="Search by reporting source, dataset or reference..." aria-label="Search pending submissions"/></label></div>
        <div className="mu-table-wrap vw-local-table-loading-host"><table className="mu-table"><thead><tr><th>#</th><th>Reporting Source</th><th>Dataset</th><th>Reporting Period</th><th>Submitted</th><th>Status</th><th aria-label="Actions"/></tr></thead><tbody>
        {loading?<tr><td colSpan={7} style={{height:130}}>&nbsp;</td></tr>:visible.length===0?<tr><td colSpan={7} className="mu-empty">No submissions awaiting your review for this selection.</td></tr>:visible.map((r,i)=>{const source=reportingSource(r);const mine=source==='—'||source===own.name;const badge=statusBadge(r.status);
          return <tr key={r.id}><td>{(page-1)*pageSize+i+1}</td><td><MuSource logo={own.logo} initials={own.initials} code={mine?own.code:source} name={mine?own.name:source}/></td><td><strong>{label(r.dataset)}</strong><small>SUB-{r.id}</small></td><td>{label(periodOf(r))}</td><td><MuDate value={lastSubmitted(r)}/></td><td><MuBadge tone={badge.tone}>{badge.label}</MuBadge></td>
          <td className="mu-actions"><RowActionsMenu label={`Actions for submission ${r.id}`}><button type="button" title="Review" onClick={()=>navigate(`/dashboard/hod/review/${r.id}`)}><ListChecks size={16}/></button></RowActionsMenu></td></tr>;})}
        </tbody></table><TableLoader active={loading} label="Loading pending reviews…"/></div>
        <div className="mu-table-foot"><span>Showing {filtered.length?(page-1)*pageSize+1:0} to {Math.min(page*pageSize,filtered.length)} of {filtered.length} submissions</span>
          <span className="vw-table-footer-tools"><PageSizeSelect value={pageSize} onChange={v=>{setPageSize(v);setPage(1);}}/>{totalPages>1&&<div className="mu-pager"><button type="button" disabled={page===1} onClick={()=>setPage(p=>p-1)} aria-label="Previous page">‹</button><span>{page} / {totalPages}</span><button type="button" disabled={page>=totalPages} onClick={()=>setPage(p=>p+1)} aria-label="Next page">›</button></div>}</span></div>
      </MuCard>
      <MuCard title="Submission Mix" tag="Pie" className="vi-insight-trigger">
        <MuDonutLegend data={mixRows} centerLabel="total" loading={loading} onOpen={()=>setInsight({title:"Submission Mix",kind:"donut",data:mix.map(item=>({name:item.name,value:item.count})),colors:mix.map(item=>item.color),details:[{label:"Reporting period",value:period},{label:"Pending review",value:pendingCount},{label:"Reviewed",value:reviewedCount}]})}/>
        <p className="mu-muted small mt-2 mb-0">Counts submissions visible to your account.</p>
      </MuCard>
    </div>
    <InsightModal insight={insight} onClose={()=>setInsight(null)}/>
  </div>;
}
