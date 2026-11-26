/**
 * MOA / IA approved admin-first dashboard, Oct 26 2026.
 * SOURCE: VIWANDA_PROFILE_CHANGE_PASSWORD_FULL_20261026 + global clickable-insights patch.
 * MOA: Ministry-wide. IA: ONLY authenticated institution. Laravel is final scope authority.
 * Uses existing authorized listing APIs, no guessed dashboard analytics endpoints.
 * Global Topbar, Sidebar, Footer remain rendered by DashboardLayout.
 */
import {createContext,useCallback,useContext,useEffect,useMemo,useState} from 'react';
import useRemembered, {isRefreshing} from '../../hooks/useRemembered.js';
import {Link} from 'react-router-dom';
import {
  UsersRound,Building2,Database,FileText,Activity,
  UserCheck,Clock3,Network,GitBranch,RefreshCcw,CheckCircle2,Hourglass,
  Layers3,Landmark,Users,Settings2,ArrowUpRight,
  ScrollText,LayoutGrid,Workflow,AlertCircle,KeyRound
} from 'lucide-react';
import {ResponsiveContainer,LineChart,Line,BarChart,Bar,PieChart,Pie,Cell,
  CartesianGrid,XAxis,YAxis,Tooltip} from 'recharts';
import InsightModal from '../../components/insights/InsightModal.jsx';
import {MuKpi,MuRing,MuSkeleton,MuSkeletonRows} from '../../components/modern/ModernUI.jsx';
// While Laravel data loads every metric, chart, table and empty state shows a shimmer, never "No records".
const DashLoading=createContext(false);
import {ownOrg} from '../../utils/roleDisplay.js';
import {
  loadManagementOverview,field,institutionScoped,yearOf,displayName,
  displaySource,dateOf,formatDate,countGroup,trendRows,makeSourceResolver,
  published,returned,reviewing,draft,ministryQueue,statusOf
} from '../../services/adminOverviewService.js';
import './ManagementDashboard.css';

const COLORS=['#168fe7','#14aa76','#f5ae37','#8258e8','#ef5365','#18b8c6'];
const tones=['blue','mint','purple','orange','cyan','rose'];
const notNull=value=>value==null?'—':typeof value==='number'?value.toLocaleString('en-US'):String(value);
const optionCount=source=>source?.ok&&source.total!=null?source.total:null;
const itemCount=source=>source?.ok&&source.complete?source.items.length:null;
const sliceRecent=rows=>[...rows].sort((a,b)=>(Date.parse(dateOf(b))||0)-(Date.parse(dateOf(a))||0)).slice(0,5);
const countItems=(source,predicate)=>source?.ok&&source.complete?source.items.filter(predicate).length:null;
const roleCode=user=>String(field(user,'role_code','roleCode','role.code','roles.0.code','role')||'').toUpperCase();
const isActive=row=>row.is_active===true||row.isActive===true||String(row.status||'').toLowerCase()==='active';
const pendingUser=row=>row.is_active===false||row.isActive===false||/^(inactive|pending|invited|pending_activation)$/i.test(String(row.status||''));
const sourceId=user=>field(user,'institution_id','institutionId','institution.id','institution.id');
const metricDetails=(year,scope)=>[{label:'Financial Year',value:year==='all'?'All reporting years':year},{label:'Scope',value:scope}];

const MU_TONE={blue:'blue',mint:'green',purple:'indigo',orange:'orange',cyan:'blue',rose:'red'};
function Metric({name,value,icon:Icon,tone='blue',note='',ring}) {
  const loading=useContext(DashLoading);
  const percent=ring?Number.parseFloat(String(value)):NaN;
  return <span className={`vmi-kpi-wrap vmi-tint-${tone}`}>
    <MuKpi tone={MU_TONE[tone]||'blue'} title={name} value={notNull(value)} loading={loading&&value==null} note={note} arrow={false}
      icon={ring&&Number.isFinite(percent)?<MuRing percent={percent} color="#e0b400" text={`${Math.round(percent)}%`}/>:<Icon size={18}/>}/>
  </span>;
}
function Panel({title,children,open,className='',note=''}) {
  const accessible=typeof open==='function';
  return <section className={`vmi-panel ${accessible?'vmi-clickable':''} ${className}`}
    role={accessible?'button':undefined} tabIndex={accessible?0:undefined} aria-haspopup={accessible?'dialog':undefined}
    onClick={e=>{if(accessible&&!e.target.closest('a,button,select,input,tr[tabindex]'))open();}}
    onKeyDown={e=>{if(accessible&&e.target===e.currentTarget&&(e.key==='Enter'||e.key===' ')){e.preventDefault();open();}}}>
    <header className="vmi-panel-head"><h2><span className="vmi-dot" aria-hidden="true"/>{title}</h2>{accessible&&<ArrowUpRight size={15} className="vmi-open-icon" aria-hidden="true"/>}</header>
    <div className="vmi-panel-body">{children}</div>
    {note&&<footer className="vmi-panel-foot">{note}</footer>}
  </section>;
}
function LineVisual({data,fields=['submitted'],height=178,empty='No reporting values available'}) {
  const loading=useContext(DashLoading);
  if(!data.length)return loading?<MuSkeleton kind="line" height={height-30}/>:<Empty text={empty}/>;
  return <div style={{height}}><ResponsiveContainer width="100%" height="100%"><LineChart data={data} margin={{top:6,right:14,left:-23,bottom:2}}>
    <CartesianGrid stroke="#e6eef8" strokeDasharray="3 3" vertical={false}/>
    <XAxis dataKey="name" tick={{fontSize:10}} minTickGap={17}/><YAxis tick={{fontSize:10}} allowDecimals={false}/>
    <Tooltip/>{fields.map((field,index)=><Line key={field} dataKey={field} stroke={COLORS[index]} strokeWidth={2.1} dot={{r:2}} type="monotone"/>)}</LineChart></ResponsiveContainer></div>;
}
function DonutVisual({data,total,center='Total',height=182,empty='No submission status data'}) {
  const loading=useContext(DashLoading);
  if(!data.length||data.every(point=>point.value===0))return loading?<MuSkeleton kind="donut"/>:<Empty text={empty}/>;
  const sum=total??data.reduce((n,r)=>n+r.value,0);
  return <div className="vmi-donut-row"><div className="vmi-donut-chart" style={{height}}><ResponsiveContainer width="100%" height="100%"><PieChart>
    <Pie data={data} nameKey="name" dataKey="value" innerRadius="59%" outerRadius="88%" stroke="none">
      {data.map((point,index)=><Cell key={point.name} fill={point.color||COLORS[index%COLORS.length]}/>)}</Pie><Tooltip/>
  </PieChart></ResponsiveContainer><div className="vmi-donut-center"><b>{notNull(sum)}</b><small>{center}</small></div></div>
    <div className="vmi-donut-legend">{data.map((point,index)=><div key={point.name}><span style={{background:point.color||COLORS[index%COLORS.length]}}/>{point.name}<b>{notNull(point.value)}</b></div>)}</div>
  </div>;
}
function BarsVisual({data,percent=false,max=100}) {
  const loading=useContext(DashLoading);
  if(!data?.length)return loading?<MuSkeleton kind="list"/>:<Empty text="No verified breakdown available"/>;
  const maxValue=percent?max:Math.max(...data.map(row=>row.value||0),1);
  return <div className="vmi-progress-list">{data.slice(0,6).map((row,index)=><div className="vmi-progress-row" key={`${row.name}-${index}`}>
    <span title={row.name}>{row.name}</span><div className="vmi-track"><div style={{width:`${Math.min(100,Math.max(0,(Number(row.value)||0)*100/maxValue))}%`,background:COLORS[index%COLORS.length]}}/></div>
    <b>{row.value==null?'—':`${notNull(row.value)}${percent?'%':''}`}</b></div>)}</div>;
}
function Empty({text='No records returned'}) {
  const loading=useContext(DashLoading);
  if(loading)return <MuSkeleton kind="lines" rows={3}/>;
  return <div className="vmi-empty"><span className="vmi-empty-icon" aria-hidden="true">○</span>{text}</div>;
}
function MiniTable({columns,rows,onRow,empty}) {
  const loading=useContext(DashLoading);
  return <div className="vmi-table-scroll"><table className="vmi-table"><thead><tr>{columns.map(c=><th key={c.key}>{c.label}</th>)}</tr></thead><tbody>
    {rows.map((record,index)=><tr key={record.id??index} className={onRow?'vmi-select-row':''} tabIndex={onRow?0:undefined}
      onClick={()=>onRow?.(record)} onKeyDown={e=>{if((e.key==='Enter'||e.key===' ')&&onRow){e.preventDefault();onRow(record);}}}>
      {columns.map(col=><td key={col.key} title={String(col.get?col.get(record):record[col.key]??'')}>
        {col.status?<span className={`vmi-status ${col.status(record)}`}>{col.get?col.get(record):record[col.key]??'—'}</span>:col.get?col.get(record):record[col.key]??'—'}
      </td>)}</tr>)}
    {!rows.length&&(loading?<MuSkeletonRows cols={columns.length} rows={3}/>:<tr><td colSpan={columns.length}><Empty text={empty}/></td></tr>)}
  </tbody></table></div>;
}
const SERVICE_STATES={healthy:['Healthy','good'],available:['Healthy','good'],stale:['Not responding recently','warn'],unavailable:['Unavailable','bad'],
  unknown:['Not checked yet','muted'],not_applicable:['Not used','muted'],unsupported:['Not monitored','muted']};
const serviceState=status=>{const [text,tone]=SERVICE_STATES[String(status||'').toLowerCase()]||[status?String(status):'Not reported','muted'];return {text,tone};};
const checkedAt=time=>{if(!time)return '';const d=new Date(time);return Number.isNaN(d.getTime())?'':d.toLocaleString('en-GB',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});};
function GroupHead({title,subtitle}) {return <header className="vmi-group-title"><strong>{title}</strong>{subtitle&&<small>{subtitle}</small>}</header>;}
function MonthLine({rows,onClick}) {return <Panel title="Monthly Submissions Trend" open={onClick}><LineVisual data={rows} fields={['submitted','published']}/></Panel>;}
function SubmissionDonut({rows,open}) {return <Panel title="Submission Status Distribution" open={open}><DonutVisual data={rows}/></Panel>;}

export default function ManagementDashboard({role='MOA',user}) {
  const ministry=role==='MOA';
  const org=ownOrg(user);
  const ownId=sourceId(user);
  const scope=ministry?'All institutions and Ministry departments':String(field(user,'institution.name','institutionName','institution_name')||`Institution ${ownId||'not assigned'}`);
  // Loading style F: the last overview stays on screen while it refreshes.
  const [overview,setOverview]=useRemembered(`dashboard:${role}`,null);
  const [loading,setLoading]=useState(true);
  const [refresh,setRefresh]=useState(0);
  const [year,setYear]=useState('all');
  const [monitoringWindow,setMonitoringWindow]=useState('24h');
  const [insight,setInsight]=useState(null);
  const close=useCallback(()=>setInsight(null),[]);
  useEffect(()=>{
    let active=true;
    if(!ministry&&!ownId){setOverview(null);setLoading(false);return undefined;}
    setLoading(true);
    loadManagementOverview(role,monitoringWindow).then(result=>{if(active)setOverview(result);})
      .catch(()=>{if(active)setOverview(null);}).finally(()=>{if(active)setLoading(false);});
    return ()=>{active=false;};
  },[role,ownId,ministry,monitoringWindow,refresh]);
  const source=(name)=>{
    const result=overview?.[name];
    if(ministry||!['users','datasets','submissions'].includes(name))return result;
    return institutionScoped(result,ownId);
  };
  const users=source('users'),datasets=source('datasets'),submissions=source('submissions');
  const institutions=source('institutions'),departments=source('departments'),admins=source('institutionalAdmins');
  const circles=source('circles');
  const monitor=overview?.monitoring?.data||{};
  const years=useMemo(()=>[...new Set((submissions?.items||[]).map(yearOf).filter(Boolean))].sort().reverse(),[submissions]);
  const records=(submissions?.items||[]).filter(row=>year==='all'||yearOf(row)===year);
  const statsReady=Boolean(submissions?.ok&&submissions?.complete);
  const sum=predicate=>statsReady?records.filter(predicate).length:null;
  const publishedN=sum(published),returnedN=sum(returned),pendingN=sum(reviewing),waitingN=sum(ministryQueue);
  const acceptance=statsReady&&publishedN+returnedN>0?Math.round(publishedN*1000/(publishedN+returnedN))/10:null;
  const trend=trendRows(records);
  const statusData=[{name:'Published / Approved',value:records.filter(published).length,color:'#16a872'},
    {name:'Under Review',value:records.filter(reviewing).length,color:'#2d83f0'},
    {name:'Returned',value:records.filter(returned).length,color:'#f4ae36'},
    {name:'Draft',value:records.filter(draft).length,color:'#ec5360'}];
  const yearDetail=year==='all'?'All years':year;
  const details=(extra=[])=>[...metricDetails(yearDetail,scope),...extra];
  const metric=(name,value,icon,tone,note,extra=[])=>({name,value,icon,tone,note,extra});
  const openedMetric=m=>setInsight({title:m.name,kind:'metric',value:m.value,details:details(m.extra)});
  const cardsAdmin=ministry?[
    metric('Total Users',optionCount(users),UsersRound,'blue','Registered accounts'),
    metric('Institutions',optionCount(institutions),Building2,'mint','National registry'),
    metric('Submissions',statsReady?records.length:null,FileText,'cyan','Selected financial year'),
    metric('Datasets',optionCount(datasets),Database,'purple','Configured datasets'),
    metric('Roles',optionCount(source('roles')),KeyRound,'orange','Configured roles'),
    metric('System Uptime',field(monitor,'summary.uptime','counts.uptime','uptime'),Activity,'rose',overview&&!overview.monitoring?.ok?'Monitoring API not connected':'From monitoring service'),
  ]:[
    metric('Institution Users',optionCount(users),UsersRound,'blue','Registered within institution'),
    metric('Active Officers',countItems(users,row=>isActive(row)&&/^(IDO|IHOD|HOD)$/.test(roleCode(row))),UserCheck,'mint','Institution reporting staff'),
    metric('Active Datasets',countItems(datasets,row=>isActive(row)||String(row.status||'').toLowerCase()==='published'),Database,'cyan','Institution reporting scope'),
    metric('Submissions',statsReady?records.length:null,FileText,'purple','Selected financial year'),
    metric('Pending Actions',countItems(users,pendingUser),Clock3,'orange','User accounts awaiting activation'),
    metric('Approval Steps',circles?.ok&&circles.complete?circles.items.reduce((n,c)=>n+(Array.isArray(c.steps)?c.steps.length:0),0):null,Workflow,'rose','Configured institution workflow'),
  ];
  const cardsMOA=[
    metric('Institutional Admins',optionCount(admins),Users,'blue','Registered IAs'),
    metric('All Users',optionCount(users),UsersRound,'mint','Ministry-wide accounts'),
    metric('All Institutions',optionCount(institutions),Building2,'purple','National registry'),
    metric('Ministry Departments',optionCount(departments),Landmark,'rose','Under MIT'),
    metric('Using Direct Portal',countItems(institutions,r=>/direct|portal/i.test(String(r.reporting_channel||''))),Network,'cyan','Reporting channel'),
    metric('Using API Integration',countItems(institutions,r=>/api|integration|system/i.test(String(r.reporting_channel||''))),GitBranch,'orange','Reporting channel'),
  ];
  const cardsReports=[
    metric('Active Datasets',countItems(datasets,row=>isActive(row)||String(row.status||'').toLowerCase()==='published'),Layers3,'mint','Configured active datasets'),
    metric('Published / Approved',publishedN,CheckCircle2,'blue','Final decisions'),
    metric('Under Review / Pending',pendingN,Clock3,'orange','Pending workflow'),
    metric('Returned Submissions',returnedN,RefreshCcw,'rose','Sent for correction'),
    {...metric('Acceptance Rate',acceptance==null?null:`${acceptance}%`,Activity,'purple','Published ÷ (Published + Returned)',[{label:'Calculation',value:'Published / (Published + Returned)'}]),ring:true},
    metric('Awaiting Ministry Review',waitingN,Hourglass,'cyan','MDO workflow queue'),
  ];
  const lastUsers=sliceRecent(users?.items||[]);
  const lastSubs=sliceRecent(records);
  // Names via submission -> dataset -> institution/department when /submissions rows carry no names.
  const resolver=makeSourceResolver({datasets:datasets?.items||[],institutions:institutions?.items||[],departments:departments?.items||[],
    ownInstitutionName:ministry?'':String(field(user,'institution.name','institutionName','institution_name')||'')});
  const sourceName=row=>{const direct=displaySource(row);return direct!=='Not reported'?direct:resolver.sourceOf(row);};
  const allInstitutions=countGroup(statsReady?records:[],row=>resolver.institutionOf(row)||'Not reported');
  const allDepartments=countGroup(statsReady?records:[],row=>resolver.departmentOf(row)||'Not reported');
  const institutionSummary=institutions?.complete&&Array.isArray(institutions.items)?institutions.items:[];
  const byChannels=countGroup(institutionSummary,row=>/api|integration/i.test(String(row.reporting_channel||''))?'API Integration':/direct|portal/i.test(String(row.reporting_channel||''))?'Direct Portal':'Not specified');
  const byRoles=countGroup(users?.complete?users.items:[],row=>roleCode(row)||'Unassigned');
  const deptRows=(departments?.complete?departments.items:[]).filter(row=>row.users_count!=null&&Number.isFinite(Number(row.users_count))).map(row=>({name:row.name,value:Number(row.users_count)}));
  // Key Details follow the chart (InsightModal.chartDetails); only context that applies to it is added here.
  const windowLabel={'24h':'Last 24 hours','7d':'Last 7 days','30d':'Last 30 days'}[monitoringWindow]||monitoringWindow;
  const contextOf=topic=>topic==='system'?[{label:'Monitoring window',value:windowLabel}]
    :topic==='users'?[{label:'Scope',value:scope}]
    :topic==='registry'?[]
    :details();
  const breakdown=(kind,data,title,topic='submissions',options={})=>{
    const series=kind==='bar'?[{key:'value',label:'Count'}]
      :kind==='line'?(title==='System Performance'
        ?[{key:'cpu',label:'CPU'},{key:'memory',label:'Memory'},{key:'disk',label:'Disk'}]
        :[{key:'count',label:'Activity'}]):[];
    setInsight({title,kind,data,series,details:contextOf(topic),...options});
  };
  const periodDetails=details([{label:'Submission records loaded',value:records.length},{label:'Complete reporting data',value:statsReady?'Yes':'No'}]);
  const openTrend=()=>setInsight({title:'Monthly Submissions Trend',kind:'line',data:trend,series:[{key:'submitted',label:'Submitted',color:'#197be9'},{key:'published',label:'Published',color:'#f0a42c'}],details:periodDetails});
  const openStatus=()=>setInsight({title:'Submission Status Distribution',kind:'donut',data:statusData,colors:statusData.map(s=>s.color),details:periodDetails});
  const onRow=row=>setInsight({title:displayName(row),kind:'metric',value:field(row,'id')||'—',unit:'Record ID',details:details([
    {label:'Status',value:field(row,'status')||'—'},
    {label:'Reporting Period',value:field(row,'period','periodLabel','reportingCalendar.periodLabel')||'—'},
    {label:'Submitted On',value:formatDate(dateOf(row))},
  ])});
  // Monitoring panels: say plainly when the (optional) Laravel monitoring API is not connected.
  const monitoringOk=Boolean(overview?.monitoring?.ok);
  // GET /admin/dashboard "status": available | stale | not_collected | disabled (SystemMonitoringService).
  const monitorStatus=String(monitor.status||'');
  const notConnected=!monitoringOk?'Monitoring service could not be reached'
    :monitorStatus==='disabled'?'Monitoring is turned off on the server'
    :monitorStatus==='not_collected'?'No readings yet: the server has not collected monitoring data'
    :'No readings in this window';
  const monitorEmpty=notConnected;
  const hourLabel=time=>{const d=new Date(time);if(Number.isNaN(d.getTime()))return String(time||'');
    return monitoringWindow==='24h'?d.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'}):d.toLocaleString('en-GB',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});};
  const pointsOf=rows=>rows.map(r=>({...r,name:hourLabel(r.time||r.name)}));
  const systemPerf=Array.isArray(monitor.performance)?monitor.performance:[];
  const storage=monitor.storage||{};
  const storageTotal=Number(field(storage,'totalGB','total_gb'));
  const storageUsed=Number(field(storage,'usedGB','used_gb'));
  const storageReady=storageTotal>0 && Number.isFinite(storageUsed);
  const storageData=storageReady?[{name:'Used',value:storageUsed,color:'#188cf0'},
    {name:'Free',value:Math.max(0,storageTotal-storageUsed),color:'#12aa76'}]:[];
  const serverRows=Array.isArray(monitor.servers)?monitor.servers:[];
  const recentLogs=Array.isArray(monitor.logs)?monitor.logs:[];
  const systemActivity=Array.isArray(monitor.activity)?monitor.activity:[];
  const quick=ministry?[
    ['Manage Users','/dashboard/administration/users',UsersRound],
    ['Manage Institutions','/dashboard/administration/institutions',Building2],
    ['Ministry Departments','/dashboard/administration/departments',Landmark],
    ['Approval Circle','/dashboard/administration/approval-circle',Workflow],
    ['Portal Settings','/dashboard/administration/portal-settings',Settings2],
  ]:[
    ['Institution Users','/dashboard/administration/users',UsersRound],
    ['Approval Circle','/dashboard/administration/approval-circle',Workflow],
    ['Datasets & Assignments','/dashboard/datasets',Database],
    ['Delegations','/dashboard/administration/delegations',GitBranch],
  ];
  const columnsUsers=[{key:'name',label:'User'},{key:'role',label:'Role',get:r=>roleCode(r)||'—'},
    {key:'scope',label:'Scope',get:r=>displaySource(r)},{key:'status',label:'Status',get:r=>r.status|| (isActive(r)?'Active':'—')}];
  const columnsSub=[{key:'dataset',label:'Dataset',get:displayName},
    ...(ministry?[{key:'source',label:'Institution / Department',get:sourceName}]:[]),
    {key:'period',label:'Reporting Period',get:r=>field(r,'period','periodLabel','reportingCalendar.periodLabel')||yearOf(r)||'—'},
    {key:'date',label:'Submitted On',get:r=>formatDate(dateOf(r))},
    {key:'status',label:'Status',get:r=>r.status||'—',status:r=>published(r)?'good':returned(r)?'bad':'warn'}];
  return <DashLoading.Provider value={loading&&!overview}><div className={`vmi-dashboard${isRefreshing(loading,overview)?' mu-refreshing':''}`}>
    <div className="vmi-header"><span className="vmi-head-logo" aria-hidden="true">{org.logo?<img src={org.logo} alt=""/>:(org.initials||(ministry?'MIT':'IA'))}</span>
      <div className="vmi-head-text"><h1>{user?.name?`Welcome, ${user.name}`:(ministry?'Ministry Overall Admin':'Institution Admin')}</h1>
      <p><b>{ministry?'Ministry Overall Admin':'Institution Admin'}</b> · {ministry?'system administration, access and operational monitoring':`${scope} · users, reporting and institution workflows`}</p></div>
      <div className="vmi-filters">{!ministry&&<div className="vmi-fixed-filter"><small>Institution</small><strong>{scope}</strong></div>}
        <label><small>Financial Year</small><select value={year} onChange={e=>setYear(e.target.value)}><option value="all">All Years</option>{years.map(y=><option key={y}>{y}</option>)}</select></label>
        {ministry&&<label><small>Monitoring Window</small><select value={monitoringWindow} onChange={e=>setMonitoringWindow(e.target.value)}><option value="24h">Last 24 Hours</option><option value="7d">Last 7 Days</option><option value="30d">Last 30 Days</option></select></label>}
        <button type="button" className="vmi-refresh" onClick={()=>setRefresh(n=>n+1)} aria-label="Refresh dashboard"><RefreshCcw size={17}/></button>
      </div>
    </div>
    {!ministry&&!ownId&&<div className="vmi-warning" role="alert">Your profile has no institution, so institution dashboard data cannot be displayed.</div>}
    <div className="vmi-kpi-grid">{cardsAdmin.map((m,i)=><Metric key={m.name} {...m} tone={tones[i]}/>)}</div>
    {ministry? <>
      <div className="vmi-grid vmi-primary">
        <Panel title="System Performance" note={monitorStatus==='stale'?`Last reading ${checkedAt(monitor.collectedAt)}: readings are out of date`:''} open={()=>breakdown('line',pointsOf(systemPerf),'System Performance','system',{measure:'level',unit:'%'})}>
          <LineVisual data={pointsOf(systemPerf)} fields={['cpu','memory','disk']} empty={monitorEmpty}/>
        </Panel>
        <Panel title="Storage Usage" open={()=>breakdown('donut',storageData,'Storage Usage','system',{unit:'GB'})}>
          <DonutVisual data={storageData} total={storageReady?storageTotal:null} center="GB" empty={monitorEmpty}/>
        </Panel>
        <Panel title="Server Status" open={()=>setInsight({title:'Server Status',kind:'metric',value:`${serverRows.filter(s=>serviceState(s.status).tone==='good').length} of ${serverRows.length||0}`,unit:'services healthy',details:[...serverRows.map(s=>({label:s.name||'Service',value:serviceState(s.status).text})),{label:'Last checked',value:checkedAt(monitor.collectedAt||monitor.generatedAt)}]})}>
          {serverRows.length?<div className="vmi-server-status">{serverRows.slice(0,7).map((s,i)=>{const st=serviceState(s.status);return <div key={s.id||i}><span>{s.name||'Service'}</span><b className={`is-${st.tone}`}>{st.text}</b><small>{checkedAt(s.checkedAt)}</small></div>;})}</div>:<Empty text={notConnected}/>}
        </Panel>
      </div>
      <div className="vmi-grid vmi-double">
        <Panel title="System Activity Overview" open={()=>breakdown('line',pointsOf(systemActivity),'System Activity Overview','system')}>
          <LineVisual data={pointsOf(systemActivity)} fields={['count']} empty={monitorEmpty}/>
        </Panel>
        <Panel title="User Access Overview" open={()=>breakdown('bar',byRoles,'User Access Overview','users')}><BarsVisual data={byRoles}/></Panel>
      </div>
      <div className="vmi-grid vmi-double">
        <Panel title="Recently Created Users" open={()=>breakdown('bar',byRoles,'Recently Created Users','users')}>
          <MiniTable columns={columnsUsers} rows={lastUsers} onRow={onRow}/>
        </Panel>
        <Panel title="Recent System Logs" open={()=>setInsight({title:'Recent System Logs',kind:'metric',value:recentLogs.length||'—',details:recentLogs.slice(0,15).map(r=>({label:String(r.time||'Log'),value:String(r.message||r.event||'—')}))})}>
          <MiniTable columns={[{key:'time',label:'Time'},{key:'module',label:'Module'},{key:'message',label:'Event'},{key:'level',label:'Level'}]} rows={recentLogs.slice(0,5)} empty={monitoringOk?'The monitoring service does not send system logs yet':notConnected}/>
        </Panel>
      </div>
    </> : <>
      <div className="vmi-grid vmi-primary">
        <MonthLine rows={trend} onClick={openTrend}/><SubmissionDonut rows={statusData} open={openStatus}/>
        <Panel title="Institution Users by Role" open={()=>breakdown('bar',byRoles,'Institution Users by Role','users')}><BarsVisual data={byRoles}/></Panel>
      </div>
      <div className="vmi-grid vmi-double">
        <Panel title="Dataset Reporting Coverage" open={()=>breakdown('bar',countGroup(records,displayName),'Dataset Reporting Coverage')} note="Submission counts by dataset">
          <BarsVisual data={countGroup(records,displayName)}/>
        </Panel>
        <Panel title="Administrative Attention" open={()=>openedMetric(metric('Administrative Attention',countItems(users,pendingUser),AlertCircle,'orange','Inactive or pending user accounts'))}>
          <MiniTable columns={[{key:'name',label:'User'},{key:'role',label:'Role',get:roleCode},{key:'status',label:'Status'}]}
            rows={(users?.items||[]).filter(pendingUser).slice(0,5)} onRow={onRow}/>
        </Panel>
      </div>
      <div className="vmi-grid vmi-double">
        <Panel title="Recent Submissions" open={openStatus}><MiniTable columns={columnsSub} rows={lastSubs} onRow={onRow}/></Panel>
        <Panel title="Recent User Management" open={()=>breakdown('bar',byRoles,'Institution Users by Role','users')}><MiniTable columns={columnsUsers} rows={lastUsers} onRow={onRow}/></Panel>
      </div>
    </>}
    <Panel title={ministry?'Quick Administration':'Institution Management'} className="vmi-quick">
      <div className="vmi-quick-row">{quick.map(([text,path,Icon],i)=><Link to={path} key={text} className={`vmi-quick-link vmi-tint-${tones[i%tones.length]}`}><span className="vmi-quick-icon"><Icon size={18}/></span><span className="vmi-quick-text">{text}</span><span className="vmi-quick-arrow" aria-hidden="true">›</span></Link>)}</div>
    </Panel>

    <GroupHead title="Administration Overview" subtitle={ministry?'Institutional administrators, reporting channels and departments':'Institution-specific users, workflows and administration'}/>
    {ministry?<div className="vmi-kpi-grid">{cardsMOA.map((m,i)=><Metric key={m.name} {...m} tone={tones[i]}/>)}</div>:<div className="vmi-grid vmi-double">
      <Panel title="Institution Users by Role" open={()=>breakdown('bar',byRoles,'Institution Users by Role','users')}><BarsVisual data={byRoles}/></Panel>
      <Panel title="Institution Approval Circle" open={()=>openedMetric(metric('Approval Circles',itemCount(circles),Workflow,'purple','Institution workflows'))}>
        <MiniTable rows={(circles?.items||[]).slice(0,5)} columns={[{key:'name',label:'Circle'},{key:'status',label:'Status'},{key:'version',label:'Version'}]}/>
      </Panel>
    </div>}
    {ministry&&<>
      <div className="vmi-grid vmi-third">
        <Panel title="Users by Role" open={()=>breakdown('bar',byRoles,'Users by Role','users')}><BarsVisual data={byRoles}/></Panel>
        <Panel title="Institutions by Access Method" open={()=>breakdown('donut',byChannels,'Institutions by Access Method','registry')}>
          <DonutVisual data={byChannels} center="Institutions"/>
        </Panel>
        <Panel title="Ministry Departments Overview" open={()=>breakdown('bar',deptRows,'Ministry Departments Overview','registry',{series:[{key:'value',label:'Users'}]})}>
          <BarsVisual data={deptRows}/><Link to="/dashboard/administration/departments" className="vmi-panel-navigation">Manage departments</Link>
        </Panel>
      </div>
      <div className="vmi-grid vmi-double">
        <Panel title="Recent Administrative Activities" open={()=>openedMetric(metric('Recent User Management',optionCount(users),ScrollText,'blue','Users'))} note="User records">
          <MiniTable columns={columnsUsers} rows={lastUsers} onRow={onRow}/>
        </Panel>
        <Panel title="Recent Submissions" open={openStatus}><MiniTable columns={columnsSub} rows={lastSubs} onRow={onRow}/></Panel>
      </div>
    </>}
    <GroupHead title="Reporting Overview" subtitle={ministry?'All institutions and Ministry departments':'Reporting for the authenticated institution only'}/>
    <div className="vmi-kpi-grid">{cardsReports.map((m,i)=><Metric key={m.name} {...m} tone={tones[i]}/>)}</div>
    <div className="vmi-grid vmi-double"><MonthLine rows={trend} onClick={openTrend}/><SubmissionDonut rows={statusData} open={openStatus}/></div>
    {ministry?<div className="vmi-grid vmi-third">
      <Panel title="Submissions by Institution" open={()=>breakdown('bar',allInstitutions,'Submissions by Institution')}><BarsVisual data={allInstitutions}/></Panel>
      <Panel title="Submission Compliance (Institutions)" open={()=>breakdown('bar',allInstitutions,'Submission Overview by Institution')} note="Counts of submitted records"><BarsVisual data={allInstitutions}/></Panel>
      <Panel title="Submission Compliance (Departments)" open={()=>breakdown('bar',allDepartments,'Submission Overview by Department')} note="Counts of submitted records"><BarsVisual data={allDepartments}/></Panel>
    </div>:<div className="vmi-grid vmi-double">
      <Panel title="Submissions by Dataset" open={()=>breakdown('bar',countGroup(records,displayName),'Submissions by Dataset')}><BarsVisual data={countGroup(records,displayName)}/></Panel>
      <Panel title="Submission Compliance by Dataset" open={()=>breakdown('bar',countGroup(records,displayName),'Reporting Coverage by Dataset')} note="Submitted counts; overdue/compliance rates require complete reporting calendar deadlines"><BarsVisual data={countGroup(records,displayName)}/></Panel>
    </div>}
    <div className="vmi-grid vmi-double">
      <Panel title="Recent Submissions" open={openStatus}><MiniTable columns={columnsSub} rows={lastSubs} onRow={onRow}/></Panel>
      <Panel title="Submissions Awaiting Ministry Review" open={()=>openedMetric(metric('Awaiting Ministry Review',waitingN,Hourglass,'orange','MDO queue'))}>
        <MiniTable columns={columnsSub} rows={sliceRecent(records.filter(ministryQueue))} onRow={onRow}/>
      </Panel>
    </div>
    <div className="vmi-bottom-note">{!submissions?.ok?'Submission information is not available right now.':!statsReady?'Reporting analytics show only records loaded; totals are not asserted until pagination is complete.':'Figures come from the submitted records.'}</div>
    <InsightModal insight={insight} onClose={close}/>
  </div></DashLoading.Provider>;
}
