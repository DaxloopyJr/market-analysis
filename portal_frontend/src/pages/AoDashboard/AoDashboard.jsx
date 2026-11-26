import { useEffect, useMemo, useState } from 'react';
import useRemembered, {isRefreshing} from '../../hooks/useRemembered.js';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { CheckCircle2, Clock3, RotateCcw, Layers3, Search, Eye, RefreshCcw, History, ListChecks } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from 'recharts';
import { getAoList } from '../../services/aoApprovalService';
import './AoDashboard.css';
import RowActionsMenu from '../../components/common/RowActionsMenu.jsx';
import {MuBadge,MuCard,MuDate,MuHeader,MuKpi,MuRing,MuSelect,MuSource,MuSkeletonRows,MuSkeleton} from '../../components/modern/ModernUI.jsx';
import {MuByList,MuDonutLegend} from '../../components/modern/RoleParts.jsx';
import {ownOrg,plural,userInitials} from '../../utils/roleDisplay.js';
import {cleanPeriod} from '../../utils/sourceIdentity.js';
import {frequencyLabel,reportingTime} from '../../utils/reportingTime.js';
import {useErrorDialogState} from '../../utils/userFacingErrors.js';
import InsightModal from '../../components/insights/InsightModal.jsx';

const COLORS=['#0b5bd3','#0f7a2f','#e0620a'];
const raw=row=>row?.raw??row??{};
const history=row=>{const r=raw(row);return row?.history??r.history??r.approvalHistory??r.approval_history??[]};
const eventDate=e=>e?.created_at??e?.createdAt??e?.performed_at??e?.performedAt??null;
const parseDate=v=>{const d=new Date(v??'');return Number.isNaN(d.getTime())?null:d};
const reportingYear=row=>reportingTime(row).year;
const frequency=row=>reportingTime(row).frequency;
const reportingPeriod=row=>reportingTime(row).period;
const title=row=>String(row.dataset??raw(row).dataset?.datasetName??raw(row).dataset?.name??(row.datasetId||raw(row).datasetId?`Dataset ${row.datasetId??raw(row).datasetId}`:'—'));
const source=row=>String(raw(row).dataset?.reportingSource?.name??raw(row).dataset?.institution?.name??raw(row).institution?.name??raw(row).institutionName??row.institution??'—');
const submitTime=row=>{const e=history(row).filter(e=>/submit|received/i.test(String(e.action??e.eventType??e.event_type??''))).sort((a,b)=>(parseDate(eventDate(b))?.getTime()??0)-(parseDate(eventDate(a))?.getTime()??0))[0];return eventDate(e)??raw(row).submitted_at??raw(row).submittedAt??row.submittedAt};
const uniq=list=>[...new Set(list.filter(Boolean))].sort((a,b)=>b.localeCompare(a,undefined,{numeric:true}));
const myActions=(row,user)=>history(row).filter(e=>{const actor=e.userId??e.user_id??e.actorId??e.actor_id??e.performedById??e.performed_by_id??e.user?.id??e.actor?.id;return actor!=null&&String(actor)===String(user?.id)&&/approve|forward|return/i.test(String(e.action??e.eventType??e.event_type??''))}).map(e=>({row,action:String(e.action??e.eventType??e.event_type??''),at:eventDate(e)}));
const id=row=>String(row.id??raw(row).id);
export default function AoDashboard(){
 const {user}=useOutletContext();
 const [insight,setInsight]=useState(null);
 const [pending,setPending]=useRemembered('dashboard:AO:pending',[]),[reviewed,setReviewed]=useRemembered('dashboard:AO:reviewed',[]),[seen,setSeen]=useRemembered('dashboard:AO:seen',false),[loading,setLoading]=useState(true),[error,setError]=useErrorDialogState(''),[reload,setReload]=useState(0);
 const [draft,setDraft]=useState({year:'all',frequency:'all',period:'all'}),[active,setActive]=useState({year:'all',frequency:'all',period:'all'}),[query,setQuery]=useState('');
 // Filters apply immediately (no separate Apply step).
 const pick=next=>{setDraft(next);setActive(next);};
 useEffect(()=>{let mounted=true;setLoading(true);setError('');Promise.allSettled([getAoList(user),getAoList(user,{reviewed:true})]).then(([p,r])=>{if(!mounted)return;if(p.status==='rejected'&&r.status==='rejected')throw p.reason;setPending(p.status==='fulfilled'?p.value:[]);setReviewed(r.status==='fulfilled'?r.value:[]);if(p.status==='rejected'||r.status==='rejected')setError('Some records could not be loaded; counts may be incomplete.');}).catch(e=>{if(mounted){setError(e?.message??'Unable to load AO submissions.');setPending([]);setReviewed([]);}}).finally(()=>{if(mounted){setLoading(false);setSeen(true);}});return()=>{mounted=false}},[user?.id,reload]);
 const all=useMemo(()=>[...new Map([...reviewed,...pending].map(r=>[id(r),r])).values()],[reviewed,pending]);
 const years=useMemo(()=>uniq(all.map(reportingYear)),[all]);
 const freqs=useMemo(()=>uniq(all.filter(r=>draft.year==='all'||reportingYear(r)===draft.year).map(frequency)),[all,draft.year]);
 const periods=useMemo(()=>uniq(all.filter(r=>(draft.year==='all'||reportingYear(r)===draft.year)&&(draft.frequency==='all'||frequency(r)===draft.frequency)).map(reportingPeriod)),[all,draft.year,draft.frequency]);
 const match=r=>(active.year==='all'||reportingYear(r)===active.year)&&(active.frequency==='all'||frequency(r)===active.frequency)&&(active.period==='all'||reportingPeriod(r)===active.period);
 const filteredPending=pending.filter(match),filteredReviewed=reviewed.filter(match),filteredAll=all.filter(match);
 const actions=filteredReviewed.flatMap(r=>myActions(r,user)).sort((a,b)=>(parseDate(b.at)?.getTime()??0)-(parseDate(a.at)?.getTime()??0));
 const approved=new Set(actions.filter(a=>/approve|forward/i.test(a.action)).map(a=>id(a.row))),returned=new Set(actions.filter(a=>/return/i.test(a.action)).map(a=>id(a.row)));
 const amounts=[filteredPending.length,approved.size,returned.size];
 const cards=[{name:'Pending My Approval',value:amounts[0],Icon:Clock3,tone:'blue',description:'Submissions awaiting your decision',link:'/dashboard/ao/pending'}, {name:'Approved / Forwarded',value:amounts[1],Icon:CheckCircle2,tone:'green',description:'Submissions sent to next level',link:'/dashboard/ao/reviewed'}, {name:'Returned for Correction',value:amounts[2],Icon:RotateCcw,tone:'orange',description:'Sent back for re-submission',link:'/dashboard/ao/reviewed'}, {name:'Total Processed',value:approved.size+returned.size,Icon:Layers3,tone:'indigo',description:'Submissions acted on by you',link:'/dashboard/ao/reviewed'}];
 const pie=[{name:'Pending My Approval',value:amounts[0]},{name:'Approved / Forwarded',value:amounts[1]},{name:'Returned for Correction',value:amounts[2]}];
 const chartTotal=pie.reduce((s,x)=>s+x.value,0);
 const byMonth=new Map();
 const countMonth=(date,field)=>{const d=parseDate(date);if(!d)return;const key=d.toLocaleDateString('en-CA',{timeZone:'Africa/Dar_es_Salaam',year:'numeric',month:'2-digit'});if(!byMonth.has(key))byMonth.set(key,{key,month:d.toLocaleDateString('en-GB',{month:'short',year:'2-digit',timeZone:'Africa/Dar_es_Salaam'}),pending:0,approved:0,returned:0});byMonth.get(key)[field]++};
 filteredPending.forEach(r=>countMonth(submitTime(r),'pending'));actions.forEach(a=>countMonth(a.at,/return/i.test(a.action)?'returned':'approved'));
 const trend=[...byMonth.values()].sort((a,b)=>a.key.localeCompare(b.key)).slice(-6);
 const recent=actions.slice(0,5),pendingRows=filteredPending.filter(r=>`${title(r)} ${source(r)} ${reportingPeriod(r)}`.toLowerCase().includes(query.toLowerCase())).slice(0,5);
 const username=user?.name??user?.full_name??user?.fullName??'Approving Officer',org=user?.institution?.name??user?.institutionName??user?.institution_name??'';
 const roleLabel=user?.role?.name??user?.role_name??user?.roles?.find(x=>x?.name)?.name??user?.role_code??'Approving Officer';
 const loadValue=value=>loading&&!seen?'—':error&&!all.length?'—':value;
 const refreshing=isRefreshing(loading,seen);
 const navigate=useNavigate();
 const own=ownOrg(user);
 const pieRows=pie.map((p,i)=>({...p,color:COLORS[i]}));
 const datasetRows=[...new Set(filteredAll.map(title))].map(name=>({name,value:filteredAll.filter(r=>title(r)===name).length})).slice(0,8);
 const freqOptions=freqs.map(f=>({value:f,label:frequencyLabel(f)}));
 const sourceCell=r=>{const name=source(r);const mine=name==='—'||name===org;return <MuSource logo={own.logo} initials={own.initials} code={mine?own.code:name} name={mine?org:name}/>;};
 return <div className={`ihod-dash ao-dash mu-page container-fluid px-0${refreshing?' mu-refreshing':''}`}>
  <MuHeader logo={own.logo} initials={own.initials||userInitials(user)} title={`Welcome, ${username}`} subtitle={[roleLabel,org].filter(Boolean).join(' · ')}>
   <MuSelect label="Reporting Year" value={draft.year} allLabel="All years" options={years} onChange={v=>pick({year:v,frequency:'all',period:'all'})}/>
   <MuSelect label="Frequency" value={draft.frequency} allLabel="All frequencies" options={freqOptions} onChange={v=>pick({...draft,frequency:v,period:'all'})}/>
   <MuSelect label="Reporting Period" value={draft.period} allLabel="All periods" options={periods} onChange={v=>pick({...draft,period:v})}/>
   <button type="button" className="mu-btn" onClick={()=>{const reset={year:'all',frequency:'all',period:'all'};setDraft(reset);setActive(reset)}}>Reset</button>
   <button type="button" className="mu-btn" aria-label="Refresh" title="Refresh" onClick={()=>setReload(v=>v+1)}><RefreshCcw size={15}/></button>
  </MuHeader>
  <div className="mu-kpis">
   <MuKpi tone="blue" icon={<MuRing percent={chartTotal?amounts[0]/chartTotal*100:null} color="#0b5bd3" text={loadValue(amounts[0])}/>} title={cards[0].name} value={loadValue(plural(amounts[0],'submission'))} note="awaiting your decision"/>
   <MuKpi tone="green" icon={<CheckCircle2 size={20}/>} title={cards[1].name} value={loadValue(plural(amounts[1],'submission'))} note="sent to the next level"/>
   <MuKpi tone="orange" icon={<RotateCcw size={19}/>} title={cards[2].name} value={loadValue(plural(amounts[2],'submission'))} note="sent back to IDO"/>
   <MuKpi tone="indigo" icon={<Layers3 size={19}/>} title={cards[3].name} value={loadValue(plural(approved.size+returned.size,'submission'))} note="acted on by you"/>
  </div>
  <div className="mu-grid-wide">
   <MuCard title="Pending My Approval" count={loadValue(filteredPending.length)} actionTo="/dashboard/ao/pending">
    <div className="mu-toolbar"><label className="mu-search"><Search size={16}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search pending submissions…" aria-label="Search pending submissions"/></label></div>
    <div className="mu-table-wrap"><table className="mu-table"><thead><tr><th>#</th><th>Reporting Source</th><th>Dataset</th><th>Period</th><th>Submitted</th><th aria-label="Actions"/></tr></thead><tbody>
     {pendingRows.map((r,i)=><tr key={id(r)}><td>{i+1}</td><td>{sourceCell(r)}</td><td>{title(r)}</td><td>{cleanPeriod(reportingPeriod(r))||'—'}</td><td><MuDate value={submitTime(r)}/></td>
      <td className="mu-actions"><RowActionsMenu label={`Actions for submission ${id(r)}`}>
       <button type="button" title="Review & Approve" onClick={()=>navigate(`/dashboard/ao/review/${id(r)}`)}><ListChecks size={16}/></button>
      </RowActionsMenu></td></tr>)}
     {!pendingRows.length&&(loading?<MuSkeletonRows cols={6}/>:<tr><td colSpan="6" className="mu-empty">{'No pending approvals for the selected period.'}</td></tr>)}
    </tbody></table></div>
   </MuCard>
   <MuCard title="Decision Mix" tag="Pie" className="vi-insight-trigger">
    <MuDonutLegend data={pieRows} centerLabel="total" loading={loading} onOpen={()=>setInsight({title:'Decision Mix',kind:'donut',data:pie,colors:COLORS,details:[{label:'Reporting year',value:active.year},{label:'Total',value:chartTotal}]})}/>
    <MuByList rows={datasetRows}/>
   </MuCard>
  </div>
  <div className="mu-grid-wide">
   <MuCard title="Recent Decisions" actionTo="/dashboard/ao/reviewed">
    <div className="mu-table-wrap"><table className="mu-table"><thead><tr><th>#</th><th>Dataset</th><th>Action</th><th>Action Date</th><th>Status</th><th aria-label="Actions"/></tr></thead><tbody>
     {recent.map((a,i)=>{const back=/return/i.test(a.action);return <tr key={`${id(a.row)}-${i}`}><td>{i+1}</td><td>{title(a.row)}</td><td>{back?'Returned':'Approved & forwarded'}</td><td><MuDate value={a.at}/></td>
      <td><MuBadge tone={back?'red':'green'}>{back?'Returned':'Approved'}</MuBadge></td>
      <td className="mu-actions"><RowActionsMenu label={`Actions for submission ${id(a.row)}`}><button type="button" title="View" onClick={()=>navigate(`/dashboard/ao/review/${id(a.row)}`)}><Eye size={16}/></button>
       <button type="button" title="Approval History" onClick={()=>navigate(`/dashboard/ao/review/${id(a.row)}`,{state:{tab:'history'}})}><History size={16}/></button></RowActionsMenu></td></tr>;})}
     {!recent.length&&(loading?<MuSkeletonRows cols={6}/>:<tr><td colSpan="6" className="mu-empty">{'No decisions recorded for this period.'}</td></tr>)}
    </tbody></table></div>
   </MuCard>
   <MuCard title="Approval Activity" tag="Bar" className="vi-insight-trigger" onClick={()=>setInsight({title:'Approval Activity Trend',kind:'bar',data:trend,xKey:'month',series:[{key:'pending',label:'Pending',color:COLORS[0]},{key:'approved',label:'Approved / Forwarded',color:COLORS[1]},{key:'returned',label:'Returned',color:COLORS[2]}],details:[{label:'Reporting year',value:active.year}]})}>
    {trend.length?<ResponsiveContainer width="100%" height={230}><BarChart data={trend} margin={{top:14,right:8,bottom:0,left:-18}}>
     <CartesianGrid stroke="#f1f4f9" vertical={false}/><XAxis dataKey="month" tick={{fontSize:11}}/><YAxis allowDecimals={false} tick={{fontSize:11}}/><Tooltip/><Legend iconType="circle" wrapperStyle={{fontSize:11.5}}/>
     <Bar dataKey="pending" name="Pending" fill={COLORS[0]} radius={[6,6,0,0]} maxBarSize={26}/><Bar dataKey="approved" name="Approved / Forwarded" fill={COLORS[1]} radius={[6,6,0,0]} maxBarSize={26}/><Bar dataKey="returned" name="Returned" fill={COLORS[2]} radius={[6,6,0,0]} maxBarSize={26}/>
    </BarChart></ResponsiveContainer>:loading?<MuSkeleton kind="bars"/>:<p className="mu-empty">{'No approval activity for this selection.'}</p>}
   </MuCard>
  </div>
  <InsightModal insight={insight} onClose={()=>setInsight(null)}/>
 </div>
}
