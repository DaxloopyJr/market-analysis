/** MDO / MDD dashboard.
 * 16 Nov 2026: ONE request, GET /api/v1/dashboard (original backend, DashboardService), instead of reading every
 * submission (and its detail) through the ministry catalogue. Laravel scopes and counts; the page only displays.
 */
import useRemembered, {isRefreshing} from '../../hooks/useRemembered.js';
import {useEffect,useMemo,useState} from 'react';
import {useNavigate,useOutletContext} from 'react-router-dom';
import {CheckCircle2,RotateCcw,Landmark,Network,Eye,ListChecks,History} from 'lucide-react';
import {Bar,BarChart,CartesianGrid,Cell,Pie,PieChart,ResponsiveContainer,Tooltip,XAxis,YAxis} from 'recharts';
import RowActionsMenu from '../../components/common/RowActionsMenu.jsx';
import {MuBadge,MuCard,MuDate,MuHeader,MuKpi,MuLinkCard,MuRing,MuSelect,MuSource,MuSkeletonRows} from '../../components/modern/ModernUI.jsx';
import {cleanPeriod,sourceIdentity} from '../../utils/sourceIdentity.js';
import {sourceOf} from '../../utils/mdoReviewRules.js';
import {fetchDashboard} from '../../API/dashboard.jsx';
import './MinistryDashboard.css';
import InsightModal from '../../components/insights/InsightModal.jsx';

const val=(...items)=>items.find(v=>v!==null&&v!==undefined&&String(v).trim()!=='');
const label=value=>String(value??'').replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase());
const num=v=>Number.isFinite(Number(v))?Number(v):0;
/** Financial years offered by the filter: the current one back to 2021/2022 (same labels the backend accepts). */
const financialYears=()=>{const now=new Date();const first=now.getMonth()>=6?now.getFullYear():now.getFullYear()-1;
  return Array.from({length:Math.max(1,first-2020)},(_,i)=>`${first-i}/${first-i+1}`);};
// recent_activity is the 20 latest approval steps in scope (not per user); show the ministry decisions among them.
const DECISION=/review|approve|publish|return/i;

export default function MinistryDashboard({role='MDO'}){
  const {user}=useOutletContext();
  const [insight,setInsight]=useState(null);
  const [year,setYear]=useState('all');
  // Loading style F: a dashboard seen before opens with its last data while fresh data loads.
  const [data,setData]=useRemembered(`dashboard:${role}:${year}`,null);
  const [error,setError]=useState('');
  const [loading,setLoading]=useState(true);
  const [revision,setRevision]=useState(0);
  useEffect(()=>{
    let active=true;setLoading(true);setError('');
    fetchDashboard({fy:year}).then(result=>{if(active)setData(result);})
      .catch(err=>{if(active)setError(err?.response?.data?.message||err?.message||'Could not load dashboard data.');})
      .finally(()=>{if(active)setLoading(false);});
    return ()=>{active=false;};
  },[role,year,revision]); // eslint-disable-line react-hooks/exhaustive-deps
  const hasLoaded=Boolean(data);
  const cards=data?.cards??{};
  const catalogue=useMemo(()=>({institutions:data?.filters?.institutions??[],departments:data?.filters?.departments??[],datasets:[]}),[data]);
  const pendingRows=data?.pending_approvals??[];
  const pendingTotal=num(cards.pending_approvals);
  const published=num(cards.published);
  const returned=num(cards.returned);
  // 'approved' is the institution AO approval (still waiting for MDO), so it is NOT counted as forwarded.
  // MDO forwarded = published + ministry-stage items no longer waiting for this MDO (awaiting_ministry − pending).
  const processed=role==='MDD'?published:published+Math.max(0,num(cards.awaiting_ministry)-pendingTotal);
  const knownRows=useMemo(()=>{const map=new Map();
    for(const row of [...pendingRows,...(data?.published_data??[]),...(data?.recent_grouped??[]).flatMap(g=>g.items??[])])if(row?.id!=null&&!map.has(String(row.id)))map.set(String(row.id),row);
    return map;},[data]); // eslint-disable-line react-hooks/exhaustive-deps
  const decisions=(data?.recent_activity??[]).filter(a=>DECISION.test(String(a.action??'')))
    .map(a=>({id:a.submission_id,action:label(a.action),date:a.acted_at,row:knownRows.get(String(a.submission_id))}));
  const institutionPending=pendingRows.filter(r=>!sourceOf(r).departmentId).length;
  const departmentPending=pendingRows.filter(r=>Boolean(sourceOf(r).departmentId)).length;
  const institutionCount=num(cards.institutions),departmentCount=num(cards.departments);
  const queuePath=`/dashboard/${role.toLowerCase()}/queue`;
  const names=String(val(user?.name,user?.fullName,user?.full_name,'')).trim();
  const displayName=names || (role==='MDD'?'Ministry Data Director':'Ministry Data Officer');
  const navigate=useNavigate();
  // MDD review/view is chosen by ?mode= (as in the MDD workspace); MDO uses the same review URL.
  const detailsPath=id=>role==='MDD'?`/dashboard/mdd/review/${id}?mode=view`:`/dashboard/mdo/review/${id}`;
  const reviewPath=id=>role==='MDD'?`/dashboard/mdd/review/${id}?mode=review`:`/dashboard/mdo/review/${id}`;
  const show=value=>hasLoaded?value:'—';
  const refreshing=isRefreshing(loading,hasLoaded);
  const pieData=[{name:'Institutions',value:institutionPending,color:'#0b5bd3'},{name:'Ministry Departments',value:departmentPending,color:'#5b4bd6'}];
  const barData=[{name:'Pending',value:pendingTotal,color:'#e0b400'},{name:role==='MDD'?'Published':'Forwarded',value:processed,color:'#1eb53a'},{name:'Returned',value:returned,color:'#d92d20'}];
  const plural=(n,word)=>`${n} ${word}${n===1?'':'s'}`;
  const initials=displayName.split(/\s+/).filter(Boolean).map(w=>w[0]).join('').slice(0,2).toUpperCase();
  const limited=pendingTotal>pendingRows.length;
  return <div className={`ministry-dashboard mu-page container-fluid px-0${refreshing?' mu-refreshing':''}`}>
    <MuHeader initials={initials} title={`Welcome, ${displayName}`} subtitle={`${role==='MDD'?'Director (MDD)':'Data Officer (MDO)'} · Ministry of Industry and Trade`}>
      <MuSelect label="Financial Year" value={year} allLabel="All years" options={financialYears()} onChange={v=>setYear(v||'all')}/>
    </MuHeader>
    {error&&<div className="alert alert-danger" role="alert">Unable to load dashboard data: {error} <button className="btn btn-sm btn-outline-danger" onClick={()=>setRevision(r=>r+1)}>Retry</button></div>}
    {hasLoaded&&num(cards.total_submissions)===0&&<div className="alert alert-warning small" role="status">No submissions are visible to your account for this financial year.</div>}
    <div className="mu-kpis">
      <MuKpi tone="amber" icon={<MuRing percent={hasLoaded&&(pendingTotal+processed+returned)?pendingTotal/(pendingTotal+processed+returned)*100:null} color="#e0b400" text={show(pendingTotal)}/>}
        title={role==='MDD'?'Pending My Decision':'Pending My Review'} value={hasLoaded?plural(pendingTotal,'submission'):show('')} note="awaiting your action"/>
      <MuKpi tone="green" icon={<CheckCircle2 size={20}/>} title={role==='MDD'?'Published':'Reviewed / Forwarded'} value={hasLoaded?plural(processed,'submission'):show('')}
        note={role==='MDD'?'approved for publication':'processed by your office'}/>
      <MuKpi tone="red" icon={<RotateCcw size={19}/>} title="Returned for Correction" value={hasLoaded?plural(returned,'submission'):show('')} note="sent for re-submission"/>
      <MuKpi tone="violet" icon={show(institutionCount+departmentCount)} title="Reporting Sources" value={hasLoaded?`${institutionCount} · ${departmentCount}`:show('')} note="Institutions · Departments"/>
    </div>
    <div className="mu-grid">
      <MuCard title={role==='MDD'?'Pending Decisions':'Pending Reviews'} count={loading&&!hasLoaded?'…':pendingTotal} actionTo={queuePath}>
        <div className="mu-table-wrap"><table className="mu-table"><thead><tr><th>#</th><th>Reporting Source</th><th>Dataset</th><th>Period</th><th>Submitted</th><th>Status</th><th aria-label="Actions"/></tr></thead><tbody>
          {pendingRows.slice(0,5).map((r,i)=>{const src=sourceIdentity(r,catalogue);return <tr key={r.id}><td>{i+1}</td>
            <td><MuSource logo={src.logo} initials={src.initials} code={src.code} name={src.name}/></td>
            <td>{r.dataset||`Dataset ${r.dataset_id}`}</td><td>{cleanPeriod(r.period)||'—'}</td>
            <td><MuDate value={r.submitted_at}/></td><td><MuBadge tone="amber">Under Review</MuBadge></td>
            <td className="mu-actions"><RowActionsMenu label={`Actions for submission ${r.id}`}>
              <button type="button" title="Review" onClick={()=>navigate(reviewPath(r.id))}><ListChecks size={16}/></button>
              <button type="button" title="View" onClick={()=>navigate(detailsPath(r.id))}><Eye size={16}/></button>
            </RowActionsMenu></td></tr>;})}
          {!pendingRows.length&&(loading?<MuSkeletonRows cols={7}/>:<tr><td colSpan="7" className="mu-empty">{'No pending submissions for this reporting selection.'}</td></tr>)}
        </tbody></table></div>
      </MuCard>
      <MuCard title="Pending by Reporting Source" tag="Pie">
        <div className="mu-donut-wrap" role="button" tabIndex={0} style={{cursor:'pointer'}} onClick={()=>setInsight({title:'Pending by Reporting Source',kind:'donut',data:pieData.filter(p=>p.value).map(p=>({name:p.name,value:p.value})),colors:pieData.filter(p=>p.value).map(p=>p.color)})}>
          <div className="mu-donut">{pendingRows.length?<ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={pieData.filter(p=>p.value)} dataKey="value" nameKey="name" innerRadius={42} outerRadius={68} stroke="#fff" strokeWidth={2}>
            {pieData.filter(p=>p.value).map(p=><Cell key={p.name} fill={p.color}/>)}</Pie><Tooltip/></PieChart></ResponsiveContainer>:<MuRing percent={0} size={136} stroke={18}/>}
            <div className="mu-donut-center"><strong>{show(pendingTotal)}</strong><span>pending</span></div></div>
          <div className="mu-legend">{pieData.map(p=><div key={p.name}><i style={{background:p.color}}/>{p.name}<b>{show(p.value)}</b></div>)}</div>
          {limited&&<small className="mu-muted">Split of the {pendingRows.length} most recent of {pendingTotal} pending.</small>}
        </div>
        <MuLinkCard to={queuePath} tone="blue" icon={<Landmark size={18}/>} title="Institutions" note={`${show(institutionPending)} pending · view submissions`}/>
        <MuLinkCard to={queuePath} tone="violet" icon={<Network size={18}/>} title="Ministry Departments & Units" note={`${show(departmentPending)} pending · view submissions`}/>
      </MuCard>
    </div>
    <div className="mu-grid">
      <MuCard title="Recent Decisions" actionTo={queuePath}>
        <div className="mu-table-wrap"><table className="mu-table"><thead><tr><th>#</th><th>Reporting Source</th><th>Dataset</th><th>Action</th><th>Action Date</th><th>Status</th><th aria-label="Actions"/></tr></thead><tbody>
          {decisions.slice(0,5).map((h,i)=>{const src=h.row?sourceIdentity(h.row,catalogue):null;const back=/return/i.test(h.action);
            return <tr key={`${h.id}-${i}`}><td>{i+1}</td><td>{src?<MuSource logo={src.logo} initials={src.initials} code={src.code} name={src.name}/>:'—'}</td><td>{h.row?.dataset??`Submission #${h.id}`}</td><td>{h.action}</td>
              <td><MuDate value={h.date}/></td><td><MuBadge tone={back?'red':'green'}>{back?'Returned':'Completed'}</MuBadge></td>
              <td className="mu-actions"><RowActionsMenu label={`Actions for submission ${h.id}`}>
                <button type="button" title="View" onClick={()=>navigate(detailsPath(h.id))}><Eye size={16}/></button>
                <button type="button" title="Approval History" onClick={()=>navigate(detailsPath(h.id),{state:{tab:'history'}})}><History size={16}/></button>
              </RowActionsMenu></td></tr>;})}
          {!decisions.length&&(loading?<MuSkeletonRows cols={7}/>:<tr><td colSpan="7" className="mu-empty">{'No ministry decisions for the selected year.'}</td></tr>)}
        </tbody></table></div>
      </MuCard>
      <MuCard title="Decisions this period" tag="Bar" className="vi-insight-trigger" onClick={()=>setInsight({title:'Decisions this period',kind:'bar',xKey:'name',data:barData.map(b=>({name:b.name,count:b.value})),series:[{key:'count',label:'Submissions',color:'#0b5bd3'}]})}>
        <ResponsiveContainer width="100%" height={220}><BarChart data={barData} margin={{top:18,right:8,bottom:0,left:-18}}>
          <CartesianGrid stroke="#f1f4f9" vertical={false}/><XAxis dataKey="name" tick={{fontSize:11.5}}/><YAxis allowDecimals={false} tick={{fontSize:11}}/><Tooltip/>
          <Bar dataKey="value" name="Submissions" radius={[7,7,0,0]} maxBarSize={46} label={{position:'top',fontSize:11.5,fill:'#0a2a5c'}}>{barData.map(b=><Cell key={b.name} fill={b.color}/>)}</Bar>
        </BarChart></ResponsiveContainer>
        <small className="mu-muted">Ministry · selected financial year</small>
      </MuCard>
    </div>
    <InsightModal insight={insight} onClose={()=>setInsight(null)}/>
  </div>;
}
