import {useEffect,useMemo,useState} from 'react';
import useRemembered, {isRefreshing} from '../../hooks/useRemembered.js';
import {useNavigate,useOutletContext} from 'react-router-dom';
import {Database,Clock3,CheckCircle2,RotateCcw,Plus,Eye,Pencil} from 'lucide-react';
import {ResponsiveContainer,BarChart,Bar,XAxis,YAxis,CartesianGrid,Tooltip,Legend} from 'recharts';
import {getMySubmissions,getAssignedDatasets} from '../../services/idoSubmissionService';
import {draftEditable,submissionStatus} from '../../utils/submissionValues';
import RowActionsMenu from '../../components/common/RowActionsMenu.jsx';
import {MuBadge,MuCard,MuDate,MuHeader,MuKpi,MuLinkCard,MuRing,MuSelect,MuSkeletonRows,MuSkeleton} from '../../components/modern/ModernUI.jsx';
import {MuDonutLegend} from '../../components/modern/RoleParts.jsx';
import {ownOrg,plural,roleText,statusBadge,userInitials} from '../../utils/roleDisplay.js';
import {cleanPeriod} from '../../utils/sourceIdentity.js';
import {frequencyLabel,matchesReportingTime,reportingTime,reportingTimeOptions} from '../../utils/reportingTime.js';
import './IdoOfficerDashboard.css';
import {useErrorDialogState} from '../../utils/userFacingErrors.js';
import InsightModal from '../../components/insights/InsightModal.jsx';

const statusGroup=(item)=>{const s=submissionStatus(item.status);if(draftEditable(item.status)&&s!=='draft')return 'Returned';if(s==='draft')return 'Draft';if(['submitted','pending','pendingreview','underreview','inreview'].includes(s))return 'Submitted';if(['approved','completed','published'].includes(s))return 'Completed';return 'Other';};
export default function Dashboard(){
 const {user}=useOutletContext();
 const [rows,setRows]=useRemembered('dashboard:IDO:rows',[]);const [datasets,setDatasets]=useRemembered('dashboard:IDO:datasets',[]);const [seen,setSeen]=useRemembered('dashboard:IDO:seen',false);const [datasetError,setDatasetError]=useState(false);const [loading,setLoading]=useState(true);const [error,setError]=useErrorDialogState('');
 const [insight,setInsight]=useState(null);
 const [year,setYear]=useState('all');const [frequency,setFrequency]=useState('all');const [period,setPeriod]=useState('all');
 useEffect(()=>{let active=true;setLoading(true);setError('');Promise.allSettled([getMySubmissions(user),getAssignedDatasets(user)]).then(([sub,dset])=>{if(!active)return;if(sub.status==='rejected'){setError(sub.reason?.message||'Could not load submissions');setRows([]);}else setRows(sub.value);if(dset.status==='fulfilled'){setDatasets(dset.value);setDatasetError(false);}else{setDatasets([]);setDatasetError(true);}}).finally(()=>{if(active){setLoading(false);setSeen(true);}});return()=>{active=false;};},[user]);
 const {years}=useMemo(()=>reportingTimeOptions(rows),[rows]);
 const filtered=useMemo(()=>rows.filter(x=>matchesReportingTime(x,{year,frequency,period})),[rows,year,frequency,period]);
 const counted=useMemo(()=>{const by={Draft:0,Returned:0,Submitted:0,Completed:0,Other:0};filtered.forEach(x=>{by[statusGroup(x)]+=1;});return by;},[filtered]);
 const uid=String(user?.id??user?.userId??'');
 const assigned=datasetError?null:datasets.filter(x=>String(x.responsibleUserId??x.responsible_user_id??'')===uid).length;
 const hasAssignmentFields=datasets.some(x=>x.responsibleUserId!=null||x.responsible_user_id!=null);
 const assignedValue=datasetError||!hasAssignmentFields?'—':assigned;
 const kpis=[{name:'Assigned Datasets',value:assignedValue,color:'blue',Icon:Database,note:assignedValue==='—'?'Assignment data not confirmed':'Datasets assigned to you'}, {name:'Pending Submissions',value:counted.Draft,color:'amber',Icon:Clock3,note:'Drafts awaiting submission'}, {name:'Submitted',value:counted.Submitted+counted.Completed,color:'green',Icon:CheckCircle2,note:'Submitted or completed'}, {name:'Returned for Correction',value:counted.Returned,color:'red',Icon:RotateCcw,note:'Requires your attention'}];
 const chartData=useMemo(()=>[...new Set(filtered.map(x=>reportingTime(x).period||'Unspecified'))].sort().map(label=>{const list=filtered.filter(x=>(reportingTime(x).period||'Unspecified')===label);return {period:label,Pending:list.filter(x=>statusGroup(x)==='Draft').length,Submitted:list.filter(x=>['Submitted','Completed'].includes(statusGroup(x))).length,Returned:list.filter(x=>statusGroup(x)==='Returned').length};}),[filtered]);
 const actions=filtered.filter(x=>draftEditable(x.status)).sort((a,b)=>new Date(b.updated_at||0)-new Date(a.updated_at||0)).slice(0,5);
 const recent=[...filtered].sort((a,b)=>new Date(b.updated_at||b.submitted_at||0)-new Date(a.updated_at||a.submitted_at||0)).slice(0,5);
 const navigate=useNavigate();
 const org=ownOrg(user);
 const [draft,setDraft]=useState({year:'all',frequency:'all',period:'all'});
 const show=value=>loading&&!seen?'—':error?'—':value;
 const refreshing=isRefreshing(loading,seen);
 const submittedDatasets=new Set(filtered.filter(x=>['Submitted','Completed'].includes(statusGroup(x))).map(x=>String(x.dataset_id??x.dataset))).size;
 const pie=[{name:'Draft',value:counted.Draft,color:'#e0b400'},{name:'In approval',value:counted.Submitted,color:'#0b5bd3'},{name:'Published',value:counted.Completed,color:'#1eb53a'},{name:'Returned',value:counted.Returned,color:'#d92d20'}];
 const draftOptions=reportingTimeOptions(rows,draft);
 // Filters apply immediately (no separate Apply step).
 const pick=next=>{setDraft(next);setYear(next.year);setFrequency(next.frequency);setPeriod(next.period);};
 const periodText=x=>reportingTime(x).period||cleanPeriod(x.period)||'—';
 const actionsMenu=x=><RowActionsMenu label={`Actions for submission ${x.id}`}>
   {draftEditable(x.status)&&<button type="button" title="Edit" onClick={()=>navigate(`/dashboard/submissions/new?edit=${x.id}`)}><Pencil size={16}/></button>}
   <button type="button" title="View" onClick={()=>navigate(`/dashboard/submissions/my?detail=${x.id}`)}><Eye size={16}/></button>
 </RowActionsMenu>;
 const badge=x=>{const b=statusBadge(x.status);return <MuBadge tone={b.tone}>{b.label}</MuBadge>;};
 return <div className={`ido-approved-dashboard mu-page container-fluid px-0${refreshing?' mu-refreshing':''}`}>
  <MuHeader logo={org.logo} initials={org.initials||userInitials(user)} title={`Welcome, ${user?.name||user?.fullName||'Data Officer'}`} subtitle={[roleText(user,'Data Officer'),org.name].filter(Boolean).join(' · ')}>
   <MuSelect label="Reporting Year" value={draft.year} allLabel="All years" options={years} onChange={v=>pick({year:v,frequency:'all',period:'all'})}/>
   <MuSelect label="Frequency" value={draft.frequency} allLabel="All frequencies" options={draftOptions.frequencies.map(f=>({value:f,label:frequencyLabel(f)}))} onChange={v=>pick({...draft,frequency:v,period:'all'})}/>
   <MuSelect label="Reporting Period" value={draft.period} allLabel="All periods" options={draftOptions.periods} onChange={v=>pick({...draft,period:v})}/>
   <button type="button" className="mu-btn" onClick={()=>{const reset={year:'all',frequency:'all',period:'all'};setDraft(reset);setYear('all');setFrequency('all');setPeriod('all');}}>Reset</button>
  </MuHeader>
  <div className="mu-kpis">
   <MuKpi tone="blue" icon={<MuRing percent={typeof assignedValue==='number'&&assignedValue?Math.min(100,submittedDatasets/assignedValue*100):null} color="#0b5bd3" text={show(assignedValue)}/>} title="Assigned Datasets"
    value={assignedValue==='—'?'—':show(plural(assignedValue,'dataset'))} note={kpis[0].note}/>
   <MuKpi tone="amber" icon={<Pencil size={18}/>} title="Drafts" value={show(plural(counted.Draft,'draft'))} note="not yet submitted"/>
   <MuKpi tone="green" icon={<CheckCircle2 size={20}/>} title="Submitted" value={show(plural(counted.Submitted+counted.Completed,'submission'))} note="in approval or published"/>
   <MuKpi tone="red" icon={<RotateCcw size={19}/>} title="Returned for Correction" value={show(plural(counted.Returned,'submission'))} note="needs your attention"/>
  </div>
  <div className="mu-grid-wide">
   <MuCard title="Action Required" count={loading&&!seen?'…':actions.length} actionTo="/dashboard/submissions/my">
    <div className="mu-table-wrap"><table className="mu-table"><thead><tr><th>#</th><th>Dataset</th><th>Period</th><th>Updated</th><th>Status</th><th aria-label="Actions"/></tr></thead><tbody>
     {actions.map((x,i)=><tr key={x.id}><td>{i+1}</td><td><strong>{x.dataset||`Dataset ${x.dataset_id}`}</strong>{statusGroup(x)==='Returned'?<small className="mu-note-red">Returned for correction</small>:<small>Draft saved</small>}</td>
      <td>{periodText(x)}</td><td><MuDate value={x.updated_at||x.submitted_at}/></td><td>{badge(x)}</td><td className="mu-actions">{actionsMenu(x)}</td></tr>)}
     {!actions.length&&(loading?<MuSkeletonRows cols={6}/>:<tr><td colSpan={6} className="mu-empty">{'No submissions require correction or draft completion.'}</td></tr>)}
    </tbody></table></div>
   </MuCard>
   <MuCard title="Submission Status" tag="Pie" className="vi-insight-trigger">
    <MuDonutLegend data={pie} centerLabel="submissions" loading={loading} onOpen={()=>setInsight({title:'Submission Status',kind:'donut',data:pie.filter(p=>p.value).map(({name,value})=>({name,value})),colors:pie.filter(p=>p.value).map(p=>p.color),details:[{label:'Reporting year',value:year},{label:'Records',value:filtered.length}]})}/>
    <MuLinkCard to="/dashboard/submissions/new" tone="blue" icon={<Plus size={18}/>} title="New Submission" note="start data entry for a period"/>
   </MuCard>
  </div>
  <div className="mu-grid-wide">
   <MuCard title="Recent Submissions" actionTo="/dashboard/submissions/my">
    <div className="mu-table-wrap"><table className="mu-table"><thead><tr><th>#</th><th>Dataset</th><th>Period</th><th>Updated</th><th>Status</th><th aria-label="Actions"/></tr></thead><tbody>
     {recent.map((x,i)=><tr key={x.id}><td>{i+1}</td><td>{x.dataset||`Dataset ${x.dataset_id}`}</td><td>{periodText(x)}</td><td><MuDate value={x.updated_at||x.submitted_at}/></td><td>{badge(x)}</td><td className="mu-actions">{actionsMenu(x)}</td></tr>)}
     {!recent.length&&(loading?<MuSkeletonRows cols={6}/>:<tr><td colSpan={6} className="mu-empty">{'No submission records found.'}</td></tr>)}
    </tbody></table></div>
   </MuCard>
   <MuCard title="Submission Progress" tag="Bar" className="vi-insight-trigger" onClick={()=>setInsight({title:'Submission Progress',kind:'bar',data:chartData,xKey:'period',series:[{key:'Submitted',color:'#1eb53a'},{key:'Returned',color:'#d92d20'},{key:'Pending',label:'Draft',color:'#e0b400'}],details:[{label:'Reporting year',value:year},{label:'Records',value:filtered.length}]})}>
    {chartData.length?<ResponsiveContainer width="100%" height={230}><BarChart data={chartData.map(d=>({...d,period:cleanPeriod(d.period)}))} margin={{top:14,right:8,bottom:0,left:-18}}>
     <CartesianGrid stroke="#f1f4f9" vertical={false}/><XAxis dataKey="period" tick={{fontSize:11}}/><YAxis allowDecimals={false} tick={{fontSize:11}}/><Tooltip/><Legend iconType="circle" wrapperStyle={{fontSize:11.5}}/>
     <Bar dataKey="Submitted" fill="#1eb53a" radius={[6,6,0,0]} maxBarSize={26}/><Bar dataKey="Returned" fill="#d92d20" radius={[6,6,0,0]} maxBarSize={26}/><Bar dataKey="Pending" name="Draft" fill="#e0b400" radius={[6,6,0,0]} maxBarSize={26}/>
    </BarChart></ResponsiveContainer>:loading?<MuSkeleton kind="bars"/>:<p className="mu-empty">{'No submissions for selected reporting period.'}</p>}
   </MuCard>
  </div>
  <InsightModal insight={insight} onClose={()=>setInsight(null)}/>
 </div>;
}
