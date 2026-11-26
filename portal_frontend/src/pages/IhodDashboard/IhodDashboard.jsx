import { useEffect, useMemo, useState } from 'react';
import useRemembered, {isRefreshing} from '../../hooks/useRemembered.js';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { FileClock, CheckCircle2, RotateCcw, Layers3, Search, Eye, RefreshCcw, ListChecks } from 'lucide-react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from 'recharts';
import { getHodSubmissions } from '../../services/hodReviewService';
import { submissionFacts } from '../../utils/serverFields';
import './IhodDashboard.css';
import RowActionsMenu from '../../components/common/RowActionsMenu.jsx';
import {MuBadge,MuCard,MuDate,MuHeader,MuKpi,MuRing,MuSelect,MuSource,MuSkeletonRows,MuSkeleton} from '../../components/modern/ModernUI.jsx';
import {MuByList,MuDonutLegend} from '../../components/modern/RoleParts.jsx';
import {ownOrg,plural,userInitials} from '../../utils/roleDisplay.js';
import {cleanPeriod} from '../../utils/sourceIdentity.js';
import {frequencyLabel,reportingTime} from '../../utils/reportingTime.js';
import {useErrorDialogState} from '../../utils/userFacingErrors.js';
import InsightModal from '../../components/insights/InsightModal.jsx';

const asDate = value => { const date = new Date(value ?? ''); return Number.isNaN(date.getTime()) ? null : date; };
const findTime = record => {
  const raw=record.raw??record;
  const history=record.history??raw.history??raw.approvalHistory??[];
  const submitEvents=Array.isArray(history)?history.filter(x=>/^(submit|submitted|resubmit|resubmitted|submission received)$/i.test(String(x.action??x.eventType??'').trim())):[];
  const latest=submitEvents.sort((a,b)=>(asDate(b.created_at??b.createdAt)?.getTime()??0)-(asDate(a.created_at??a.createdAt)?.getTime()??0))[0];
  return latest?.created_at??latest?.createdAt??raw.submittedAt??raw.submitted_at??record.submitted_at??null;
};
const keyOf = row => String(row.id);
const frequencyOf = row => reportingTime(row).frequency;
const yearOf = row => reportingTime(row).year;
const periodOf = row => reportingTime(row).period;
const distinct = values => [...new Set(values.filter(Boolean))].sort((a,b)=>b.localeCompare(a,undefined,{numeric:true}));
const eventsOf = record => { const raw=record.raw??record;return record.history??raw.history??raw.approvalHistory??[]; };
const ownEvents = (row,user) => eventsOf(row).filter(e => {
 const actor=e.userId??e.user_id??e.actorId??e.actor_id??e.reviewerId??e.reviewer_id??e.actor?.id??e.user?.id;
 return actor!=null&&String(actor)===String(user?.id) && /review|return|forward|approve/i.test(String(e.action??e.eventType??e.event_type??''));
});
const datasetLabel=row=>row.dataset||row.raw?.dataset?.datasetName||row.raw?.dataset?.name||`Dataset ${row.dataset_id}`;
function totalsByMonth(rows){
 const map=new Map();
 for(const row of rows){ const date=asDate(findTime(row));if(!date)continue;const key=`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`;
  if(!map.has(key)) map.set(key,{key,month:date.toLocaleString('en-GB',{month:'short',year:'2-digit'}),submitted:0,reviewed:0,returned:0});
  map.get(key).submitted++;
 }
 return [...map.values()].sort((a,b)=>a.key.localeCompare(b.key)).slice(-6);
}
export default function IhodDashboard(){
 const {user}=useOutletContext(); const [pending,setPending]=useRemembered('dashboard:IHOD:pending',[]),[reviewed,setReviewed]=useRemembered('dashboard:IHOD:reviewed',[]),[seen,setSeen]=useRemembered('dashboard:IHOD:seen',false),[loading,setLoading]=useState(true),[error,setError]=useErrorDialogState('');
 const [insight,setInsight]=useState(null);
 const [refresh,setRefresh]=useState(0),[year,setYear]=useState('all'),[frequency,setFrequency]=useState('all'),[period,setPeriod]=useState('all');
 const [draft,setDraft]=useState({year:'all',frequency:'all',period:'all'}),[query,setQuery]=useState('');
 // Filters apply immediately (no separate Apply step).
 const pick=next=>{setDraft(next);setYear(next.year);setFrequency(next.frequency);setPeriod(next.period);};
 useEffect(()=>{let active=true;setLoading(true);setError('');Promise.allSettled([getHodSubmissions(user),getHodSubmissions(user,{history:true})]).then(([a,b])=>{
   if(!active)return;if(a.status==='rejected'&&b.status==='rejected')throw a.reason;
   setPending(a.status==='fulfilled'?a.value:[]);setReviewed(b.status==='fulfilled'?b.value:[]);
   if(a.status==='rejected'||b.status==='rejected')setError('Some records could not be loaded; counts may be incomplete.');
 }).catch(e=>{if(active){setError(e?.message??'Unable to load submissions');setPending([]);setReviewed([]);}}).finally(()=>{if(active){setLoading(false);setSeen(true);}});return()=>{active=false;};},[user?.id,refresh]);
 const all=useMemo(()=>[...new Map([...reviewed,...pending].map(r=>[keyOf(r),r])).values()],[pending,reviewed]);
 const years=useMemo(()=>distinct(all.map(yearOf)),[all]);
 const freqs=useMemo(()=>distinct(all.filter(r=>draft.year==='all'||yearOf(r)===draft.year).map(frequencyOf)),[all,draft.year]);
 const periods=useMemo(()=>distinct(all.filter(r=>(draft.year==='all'||yearOf(r)===draft.year)&&(draft.frequency==='all'||frequencyOf(r)===draft.frequency)).map(periodOf)),[all,draft.year,draft.frequency]);
 const match=r=>(year==='all'||yearOf(r)===year)&&(frequency==='all'||frequencyOf(r)===frequency)&&(period==='all'||periodOf(r)===period);
 const selected=all.filter(match), pendingRows=pending.filter(match), reviewedRows=reviewed.filter(match);
 const actions=reviewedRows.flatMap(r=>ownEvents(r,user).map(e=>({row:r,action:String(e.action??e.eventType??e.event_type??''),at:e.created_at??e.createdAt??e.performed_at??e.performedAt}))).sort((a,b)=>(asDate(b.at)?.getTime()??0)-(asDate(a.at)?.getTime()??0));
 const returnIds=new Set(actions.filter(a=>/return/i.test(a.action)).map(a=>keyOf(a.row)));
 const reviewedIds=new Set(actions.filter(a=>/review|forward/i.test(a.action)).map(a=>keyOf(a.row)));
 const counts=[{name:'Pending My Review',value:pendingRows.length,Icon:FileClock,tone:'blue',desc:'Submissions awaiting your action',href:'/dashboard/hod/inbox'},
 {name:'Reviewed / Forwarded',value:reviewedIds.size,Icon:CheckCircle2,tone:'green',desc:'Submissions processed by your office',href:'/dashboard/hod/history'},
 {name:'Returned for Correction',value:returnIds.size,Icon:RotateCcw,tone:'orange',desc:'Sent back for revision',href:'/dashboard/hod/history'},
 {name:'Total Submissions',value:selected.length,Icon:Layers3,tone:'indigo',desc:'Visible in the selected period',href:'/dashboard/hod/inbox'}];
 const pie=[{name:'Pending My Review',value:pendingRows.length},{name:'Reviewed / Forwarded',value:reviewedIds.size},{name:'Returned for Correction',value:returnIds.size}];
 const chartTotal=pie.reduce((sum,p)=>sum+p.value,0);
 const trend=totalsByMonth(selected).map(item=>({...item,reviewed:actions.filter(a=>/review|forward/i.test(a.action)&&asDate(a.at)?.getFullYear()===Number(item.key.slice(0,4))&&asDate(a.at)?.getMonth()+1===Number(item.key.slice(5))).length,returned:actions.filter(a=>/return/i.test(a.action)&&asDate(a.at)?.getFullYear()===Number(item.key.slice(0,4))&&asDate(a.at)?.getMonth()+1===Number(item.key.slice(5))).length}));
 const datasets=[...new Set(selected.map(datasetLabel))].map(name=>({name,pending:pendingRows.filter(r=>datasetLabel(r)===name).length,reviewed:reviewedRows.filter(r=>datasetLabel(r)===name&&reviewedIds.has(keyOf(r))).length,returned:reviewedRows.filter(r=>datasetLabel(r)===name&&returnIds.has(keyOf(r))).length})).slice(0,8);
 const pendingSearch=pendingRows.filter(r=>`${datasetLabel(r)} ${r.period} ${r.status}`.toLowerCase().includes(query.toLowerCase())).slice(0,5);
 const name=user?.name??user?.fullName??user?.full_name??'Reviewer';
 const org=user?.institution?.name??user?.institutionName??user?.institution_name??'';
 const roleTitle=user?.roles?.find(r=>r?.name)?.name??user?.role?.name??user?.role_name??user?.role_code??'Reviewer';
 const navigate=useNavigate();
 const own=ownOrg(user);
 const show=value=>loading&&!seen?'—':error==='Unable to load submissions'?'—':value;
 const refreshing=isRefreshing(loading,seen);
 const pieColors=['#0b5bd3','#0f7a2f','#e0620a'];
 const pieRows=pie.map((p,i)=>({...p,color:pieColors[i]}));
 const sourceCell=r=>{const name=submissionFacts(r).institution||org;return <MuSource logo={own.logo} initials={own.initials} code={name===org?own.code:name} name={name}/>;};
 const periodText=r=>periodOf(r)||cleanPeriod(r.period)||'—';
 const freqOptions=freqs.map(f=>({value:f,label:frequencyLabel(f)}));
 return <div className={`ihod-dash mu-page container-fluid px-0${refreshing?' mu-refreshing':''}`}>
  <MuHeader logo={own.logo} initials={own.initials||userInitials(user)} title={`Welcome, ${name}`} subtitle={[roleTitle,org].filter(Boolean).join(' · ')}>
   <MuSelect label="Reporting Year" value={draft.year} allLabel="All years" options={years} onChange={v=>pick({year:v,frequency:'all',period:'all'})}/>
   <MuSelect label="Frequency" value={draft.frequency} allLabel="All frequencies" options={freqOptions} onChange={v=>pick({...draft,frequency:v,period:'all'})}/>
   <MuSelect label="Reporting Period" value={draft.period} allLabel="All periods" options={periods} onChange={v=>pick({...draft,period:v})}/>
   <button type="button" className="mu-btn" onClick={()=>{setDraft({year:'all',frequency:'all',period:'all'});setYear('all');setFrequency('all');setPeriod('all');}}>Reset</button>
   <button type="button" className="mu-btn" aria-label="Refresh" title="Refresh" onClick={()=>setRefresh(v=>v+1)}><RefreshCcw size={15}/></button>
  </MuHeader>
  <div className="mu-kpis">
   <MuKpi tone="blue" icon={<MuRing percent={chartTotal?pendingRows.length/chartTotal*100:null} color="#0b5bd3" text={show(pendingRows.length)}/>} title={counts[0].name} value={show(plural(pendingRows.length,'submission'))} note="awaiting your action"/>
   <MuKpi tone="green" icon={<CheckCircle2 size={20}/>} title={counts[1].name} value={show(plural(reviewedIds.size,'submission'))} note="sent to the next step"/>
   <MuKpi tone="orange" icon={<RotateCcw size={19}/>} title={counts[2].name} value={show(plural(returnIds.size,'submission'))} note="sent back to IDO"/>
   <MuKpi tone="indigo" icon={<Layers3 size={19}/>} title={counts[3].name} value={show(plural(selected.length,'submission'))} note="in the selected period"/>
  </div>
  <div className="mu-grid-wide">
   <MuCard title="Pending My Review" count={loading&&!seen?'…':pendingRows.length} actionTo="/dashboard/hod/inbox">
    <div className="mu-toolbar"><label className="mu-search"><Search size={16}/><input aria-label="Search submissions" placeholder="Search by dataset…" value={query} onChange={e=>setQuery(e.target.value)}/></label></div>
    <div className="mu-table-wrap"><table className="mu-table"><thead><tr><th>#</th><th>Reporting Source</th><th>Dataset</th><th>Period</th><th>Submitted</th><th aria-label="Actions"/></tr></thead><tbody>
     {pendingSearch.map((r,i)=><tr key={r.id}><td>{i+1}</td><td>{sourceCell(r)}</td><td>{datasetLabel(r)}</td><td>{periodText(r)}</td><td><MuDate value={findTime(r)}/></td>
      <td className="mu-actions"><RowActionsMenu label={`Actions for submission ${r.id}`}>
       <button type="button" title="Review" onClick={()=>navigate(`/dashboard/hod/review/${r.id}`)}><ListChecks size={16}/></button>
      </RowActionsMenu></td></tr>)}
     {!pendingSearch.length&&(loading?<MuSkeletonRows cols={6}/>:<tr><td colSpan="6" className="mu-empty">{'No submissions pending for this selection.'}</td></tr>)}
    </tbody></table></div>
    <div className="mu-table-foot"><span>Showing {pendingSearch.length} of {pendingRows.length} pending submissions</span></div>
   </MuCard>
   <MuCard title="Submission Overview" tag="Pie" className="vi-insight-trigger">
    <MuDonutLegend data={pieRows} centerLabel="actions" loading={loading} onOpen={()=>setInsight({title:'Submission Overview',kind:'donut',data:pie,colors:pieColors,details:[{label:'Reporting year',value:year},{label:'Institution',value:org||'Current institution'}]})}/>
    <MuByList rows={datasets.map(d=>({name:d.name,value:d.pending+d.reviewed+d.returned}))}/>
   </MuCard>
  </div>
  <div className="mu-grid-wide">
   <MuCard title="Recent Decisions" actionTo="/dashboard/hod/history">
    <div className="mu-table-wrap"><table className="mu-table"><thead><tr><th>#</th><th>Dataset</th><th>Action</th><th>Action Date</th><th>Status</th><th aria-label="Actions"/></tr></thead><tbody>
     {actions.slice(0,5).map((a,i)=>{const back=/return/i.test(a.action);return <tr key={`${a.row.id}-${i}`}><td>{i+1}</td><td>{datasetLabel(a.row)}</td><td>{back?'Returned':'Reviewed & forwarded'}</td><td><MuDate value={a.at}/></td>
      <td><MuBadge tone={back?'red':'green'}>{back?'Returned':'Forwarded'}</MuBadge></td>
      <td className="mu-actions"><RowActionsMenu label={`Actions for submission ${a.row.id}`}><button type="button" title="View review history" onClick={()=>navigate(`/dashboard/hod/history/${a.row.id}`)}><Eye size={16}/></button></RowActionsMenu></td></tr>;})}
     {!actions.length&&(loading?<MuSkeletonRows cols={6}/>:<tr><td colSpan="6" className="mu-empty">{'No verified review actions in the selected period.'}</td></tr>)}
    </tbody></table></div>
   </MuCard>
   <MuCard title="Submission Trend" tag="Line" className="vi-insight-trigger" onClick={()=>setInsight({title:'Submission Trend',kind:'bar',data:trend,xKey:'month',series:[{key:'submitted',label:'Submitted',color:pieColors[0]},{key:'reviewed',label:'Reviewed',color:pieColors[1]},{key:'returned',label:'Returned',color:pieColors[2]}],details:[{label:'Institution',value:org||'Current institution'},{label:'Reporting year',value:year}]})}>
    {trend.length?<ResponsiveContainer width="100%" height={230}><LineChart data={trend} margin={{top:14,right:12,bottom:0,left:-18}}>
     <CartesianGrid stroke="#f1f4f9" vertical={false}/><XAxis dataKey="month" tick={{fontSize:11}}/><YAxis allowDecimals={false} tick={{fontSize:11}}/><Tooltip/><Legend iconType="circle" wrapperStyle={{fontSize:11.5}}/>
     <Line type="monotone" dataKey="submitted" name="Submitted" stroke={pieColors[0]} strokeWidth={2.5} dot={{r:3.5,fill:'#fff'}}/>
     <Line type="monotone" dataKey="reviewed" name="Reviewed" stroke={pieColors[1]} strokeWidth={2.5} dot={{r:3.5,fill:'#fff'}}/>
     <Line type="monotone" dataKey="returned" name="Returned" stroke={pieColors[2]} strokeWidth={2.5} dot={{r:3.5,fill:'#fff'}}/>
    </LineChart></ResponsiveContainer>:loading?<MuSkeleton kind="line"/>:<p className="mu-empty">{'No submission activity for this selection.'}</p>}
   </MuCard>
  </div>
  <InsightModal insight={insight} onClose={()=>setInsight(null)}/>
 </div>;
}
