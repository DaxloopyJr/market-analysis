/**
 * Institution / Department analytics dashboard (approved UI 27 Oct 2026).
 * Dynamic: one card per PUBLISHED dataset of the selected organisation. All figures are calculated
 * in the frontend (utils/analyticsSummary.js) from the published-only /analytics endpoints.
 * Route: /dashboard/analytics/:type/:id   (type = institution | department)
 */
import useRemembered, {isRefreshing} from '../../hooks/useRemembered.js';
import {useCallback,useEffect,useMemo,useState} from 'react';
import {useLocation,useNavigate,useOutletContext,useParams,useSearchParams} from 'react-router-dom';
import {Bar,BarChart,CartesianGrid,Cell,Legend,Line,LineChart,Pie,PieChart,ResponsiveContainer,Tooltip,XAxis,YAxis} from 'recharts';
import {TableLoader} from '../../components/common/LoadingState.jsx';
import InsightModal from '../../components/insights/InsightModal.jsx';
import {showUserFacingError} from '../../utils/userFacingErrors.js';
import {bandOf,datasetTitle,frequencyLabel,yearlyAchievementRows} from '../../utils/analyticsSummary.js';
import {institutionSummary} from '../../utils/analyticsSummary.js';
import {loadInstitutionOverview,loadInstitutionHistory} from '../../services/institutionAnalyticsService.jsx';
import {BAND_COLORS,BAND_INK,KpiCard,OrgHeader,Ring,SelectBox,fmtChange,useAnalyticsBreadcrumb,useOrganisation} from './analyticsParts.jsx';
import {FileText} from 'lucide-react';
import {MuKpi,MuSkeleton} from '../../components/modern/ModernUI.jsx';
import {loadMeBundle,loadMeFilters,periodsForYear,reportYearValue} from '../../services/meReportService.js';
import {ME_TABS} from './meTheme.js';
import {bundleFromAnalytics} from '../../utils/meReport.js';
import {analyticsTrail,orgWord,userOrgScope} from '../../utils/orgScope.js';
import {MeBudget,MeDepartments,MeKpis,MeObjectives,MeOverview,MeTabs,MeVariance} from './MePerformance.jsx';
import './AnalyticsPages.css';

const shortName=name=>{const word=String(name).split(/[\s'’&]+/).filter(Boolean)[0]??'';return word.length>10?word.slice(0,9)+'…':word;};

function DatasetCard({row,onOpen}){
  const s=row.summary,band=s?bandOf(s.achievement):bandOf(null);
  const spark=Object.entries(row.history??{}).filter(([,v])=>v!==null&&v!==undefined)
    .map(([year,value])=>({year,value})).sort((a,b)=>a.year.localeCompare(b.year));
  const id=`spark-${row.dataset.id}`;
  return <button type="button" className="ia-ds" onClick={onOpen} style={{'--h1':row.color[0],'--h2':row.color[1]}} aria-label={`Open ${datasetTitle(row.dataset)} analytics`}>
    <span className="ia-ds-hd"><h4>{datasetTitle(row.dataset)}</h4>
      <small>{[frequencyLabel(row.frequency),s?`${s.indicatorCount} indicator${s.indicatorCount===1?'':'s'}`:''].filter(Boolean).join(' · ')||'Published dataset'}</small>
      {s&&<span className="ia-chip">{s.publishedPeriods}/{s.expectedPeriods} periods</span>}</span>
    <span className="ia-ds-body">
      <Ring percent={s?.achievement??null} color={BAND_COLORS[band.band]} size={68} stroke={8}/>
      <span className="ia-ds-stats">
        <span style={{display:'flex',justifyContent:'space-between'}}><span>Status</span><b style={{color:BAND_INK[band.band]}}>{s?(s.withTargets?band.label:'No targets'):'No data'}</b></span>
        <span style={{display:'flex',justifyContent:'space-between'}}><span>Published</span><b>{s?`${s.publishedPeriods}/${s.expectedPeriods}`:'0'}</b></span>
        <span style={{display:'flex',justifyContent:'space-between'}}><span>vs last year</span>
          <b className={row.comparison?.change>0?'ia-up':row.comparison?.change<0?'ia-down':''}>{fmtChange(row.comparison?.change??null)}</b></span>
      </span>
    </span>
    {spark.length>1?<span className="ia-ds-spark"><ResponsiveContainer width="100%" height={60}>
      <LineChart data={spark} margin={{top:8,right:6,bottom:4,left:6}}>
        <defs><linearGradient id={id} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor={row.color[0]} stopOpacity=".3"/><stop offset="1" stopColor={row.color[0]} stopOpacity="0"/></linearGradient></defs>
        <YAxis hide domain={['dataMin - 5','dataMax + 5']}/><XAxis dataKey="year" hide/>
        <Tooltip formatter={v=>`${v}%`} labelFormatter={l=>`FY ${l}`}/>
        <Line type="monotone" dataKey="value" stroke={row.color[0]} strokeWidth={2.4} dot={false} isAnimationActive/>
      </LineChart></ResponsiveContainer></span>
      :<span className="ia-ds-nodata">{s?'Trend appears after two complete years':`No published data for FY ${row.yearLabel}`}</span>}
    <span className="ia-ds-foot"><span>Achievement · {spark.length>1?`${spark.length} complete years`:'this year'}</span><b>Open analytics ›</b></span>
  </button>;
}

export default function InstitutionDashboard(){
  const {type='institution',id}=useParams();
  const navigate=useNavigate(),location=useLocation();
  const [search,setSearch]=useSearchParams();
  const identity=useOrganisation(type,id,location.state?.org);
  const {user}=useOutletContext()??{};
  // Institution users never read "Department": their internal departments are called units (30 Oct 2026).
  const unitWord=userOrgScope(user)==='institution'?'Unit':'Department';
  // Loading style F: an organisation seen before opens with its last analytics while fresh data loads.
  const [state,setState]=useRemembered(`analytics:org:${type}:${id}`,{loading:true,data:null});
  const [insight,setInsight]=useState(null);
  const year=search.get('year')||'';
  const compare=search.get('compare')||'';
  useAnalyticsBreadcrumb([...analyticsTrail(user),{text:identity.heading.title||'Organisation'}]);

  useEffect(()=>{
    let alive=true;
    setState(current=>({...current,loading:true}));
    loadInstitutionOverview({type,id,year,compareYear:compare})
      .then(data=>{
        if(!alive)return;setState({loading:false,data});
        // Phase 2: 5-year sparkline history after the page is visible (30 Oct 2026 performance pass).
        const pending=data.datasets.filter(row=>!row.historyReady&&!row.error);
        if(pending.length)loadInstitutionHistory(pending).then(map=>{if(alive)setState(current=>current.data!==data?current:{...current,data:{...data,datasets:data.datasets.map(row=>(map[row.key]?{...row,history:map[row.key],historyReady:true}:row))}});}).catch(()=>{});
      })
      .catch(error=>{if(alive){setState({loading:false,data:null});void showUserFacingError(error,'Analytics not loaded');}});
    return()=>{alive=false;};
  },[type,id,year,compare]);

  const data=state.data;
  const rows=useMemo(()=>(data?.datasets??[]).map(row=>({...row,yearLabel:data.year})),[data]);
  const summary=useMemo(()=>institutionSummary(rows),[rows]);
  const years=data?.years??[];
  const historyYears=useMemo(()=>{
    const set=new Set();rows.forEach(row=>Object.keys(row.history??{}).forEach(label=>set.add(label)));
    return [...set].sort().slice(-5);
  },[rows]);
  const lineRows=useMemo(()=>yearlyAchievementRows(rows.map(row=>({key:row.key,history:row.history})),historyYears),[rows,historyYears]);
  const pie=[{name:'Excellence',value:summary.bands.excellence,color:BAND_COLORS.excellence},{name:'Good',value:summary.bands.good,color:BAND_COLORS.good},
    {name:'Under',value:summary.bands.under,color:BAND_COLORS.under},{name:'No target',value:summary.bands.noTarget,color:BAND_COLORS.none}];
  const pieTotal=pie.reduce((sum,item)=>sum+item.value,0);
  const bars=rows.map(row=>({name:shortName(datasetTitle(row.dataset)),full:datasetTitle(row.dataset),value:row.summary?.achievement??null,
    band:bandOf(row.summary?.achievement??null).band,id:row.dataset.id}));
  const setParam=(key,value)=>{const next=new URLSearchParams(search);if(value)next.set(key,value);else next.delete(key);if(key==='year'){next.delete('compare');next.delete('period');}setSearch(next,{replace:true});};
  const openDataset=useCallback(datasetId=>navigate(`/dashboard/analytics/${type}/${id}/dataset/${datasetId}?${new URLSearchParams({...(data?.year?{year:data.year}:{})})}`,{state:{org:identity.org}}),[navigate,type,id,data?.year,identity.org]);
  const compareOptions=years.filter(label=>label<(data?.year??''));
  const band=summary.band;
  // M&E performance (Laravel /reports/*): Overview, Objectives, KPIs, Variance, Budget, Departments + PDF.
  const tab=ME_TABS.some(t=>t.id===search.get('view'))?search.get('view'):'overview';
  const periodId=search.get('period')||'';
  const departmentId=search.get('department')||'';
  const [filters,setFilters]=useState(null);
  const [me,setMe]=useRemembered(`analytics:me:${type}:${id}`,{loading:false,data:null,error:''});
  useEffect(()=>{let alive=true;loadMeFilters().then(f=>{if(alive)setFilters(f);}).catch(()=>{if(alive)setFilters({financialYears:[],periods:[],departments:[]});});return()=>{alive=false;};},[]);
  const reportYear=data?.year?reportYearValue(filters,data.year):'';
  useEffect(()=>{
    if(!filters||!reportYear)return;
    let alive=true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMe(current=>({...current,loading:true,error:''}));
    loadMeBundle({type,id,financialYear:reportYear,reportingPeriodId:periodId,departmentId:type==='institution'?departmentId:''})
      .then(result=>{if(alive)setMe({loading:false,data:result,error:''});})
      .catch(error=>{if(alive)setMe({loading:false,data:null,error:error?.response?.data?.message||error?.message||'Request failed.'});});
    return()=>{alive=false;};
  },[filters,reportYear,type,id,periodId,departmentId]);
  const yearLabel=data?.year??'';
  const periodOptions=useMemo(()=>(filters&&yearLabel?periodsForYear(filters,yearLabel):[]).map(p=>({value:p.value,label:p.label})),[filters,yearLabel]);
  const deptOptions=useMemo(()=>(filters?.departments??[]).filter(d=>{const inst=d.raw?.institutionId??d.raw?.institution_id;return inst===undefined||inst===null||String(inst)===String(id);}).map(d=>({value:d.value,label:d.label})),[filters,id]);
  const periodLabel=periodOptions.find(p=>p.value===periodId)?.label||'';
  // Reports are still on their way (filters first, then the bundle): show skeletons, never the old view.
  const meLoading=(me.loading&&!me.data)||(!!data&&rows.length>0&&!!reportYear&&!me.data&&!me.error)||(!!data&&rows.length>0&&!filters);
  const meReady=!!me.data&&!me.data.forbidden&&me.data.bundle.hasData;
  // No reports.view.* (IDO, IHOD, AO, MDO, DDO, MDD …) or nothing published in the reports: the SAME overview,
  // calculated from the published analytics already loaded for this page (utils/meReport.js bundleFromAnalytics).
  const fallbackBundle=useMemo(()=>bundleFromAnalytics(rows),[rows]);
  const fromAnalytics=!meLoading&&!meReady&&fallbackBundle.hasData;
  const view=meReady?{...me.data,source:'reports'}:fromAnalytics?{bundle:fallbackBundle,errors:{},source:'analytics'}:null;
  const viewTabs=view?.source==='analytics'?['overview','kpis','variance']:null;
  const meUnavailable=!meLoading&&!view;
  const openReport=()=>navigate(`/dashboard/analytics/${type}/${id}/report?${new URLSearchParams(Object.fromEntries(Object.entries({year:data?.year??'',period:periodId,department:departmentId}).filter(([,v])=>v)))}`,{state:{org:identity.org}});

  return <div className={`ia-page${isRefreshing(state.loading,data)?' mu-refreshing':''}`}>
    <OrgHeader identity={identity} backLabel="Back" onBack={()=>navigate('/dashboard/analytics')}>
      {years.length>0&&<SelectBox label="Financial Year" value={data?.year??''} onChange={value=>setParam('year',value)} options={years}/>}
      {tab==='overview'&&compareOptions.length>0&&<SelectBox label="Compare with" value={compare||compareOptions[0]} onChange={value=>setParam('compare',value)} options={compareOptions}/>}
      {periodOptions.length>1&&<SelectBox label="Period" value={periodId} onChange={value=>setParam('period',value)} options={[{value:'',label:'Year to date'},...periodOptions]}/>}
      {type==='institution'&&deptOptions.length>0&&<SelectBox label={unitWord} value={departmentId} onChange={value=>setParam('department',value)} options={[{value:'',label:`All ${unitWord.toLowerCase()}s`},...deptOptions]}/>}
      <button type="button" className="ia-back me-pdf-btn" onClick={openReport} disabled={!me.data||me.data.forbidden||!me.data.bundle.hasData}
        title={me.data?.bundle?.hasData?'Open the M&E report as a printable PDF':'Available when published M&E data exists'}><FileText size={15}/> Open PDF report</button>
    </OrgHeader>
    {/* Tabs are hidden when Laravel refuses every M&E report for this role: the page stays the dataset overview. */}
    {(view||meLoading)&&<MeTabs tab={tab} onTab={value=>setParam('view',value==='overview'?'':value)} showDepartments={type==='institution'} only={viewTabs} unitWord={unitWord}/>}
    {tab==='overview'&&<>
      {meLoading&&<div className="ia-kpis ia-five">{[0,1,2,3,4].map(i=><MuKpi key={i} title="Loading…" value="…" loading/>)}</div>}
      {meLoading&&<div className="ia-grid2"><section className="ia-surface ia-card"><MuSkeleton kind="list" rows={6}/></section><section className="ia-surface ia-card"><MuSkeleton kind="line"/></section></div>}
      {view&&<MeOverview bundle={view.bundle} errors={view.errors} name={identity.heading.title||`The ${orgWord(type).toLowerCase()}`} year={data?.year??''} periodLabel={view.source==='analytics'?'':periodLabel} orgWord={orgWord(type)}/>}
      {view?.source==='analytics'&&<p className="me-fallback-note">Calculated from the published datasets{me.data?.forbidden?'':' (M&E figures are not published for this selection yet)'}.</p>}
      {meUnavailable&&data&&rows.length>0&&<div style={{position:'relative'}}>
        <p className="me-fallback-note">{me.data?.forbidden?'M&E reports are not available for your role, so this overview is calculated from the published datasets.':'M&E figures are not published for this selection yet, so this overview is calculated from the published datasets.'}</p>
      <div className="ia-kpis">
        <KpiCard icon={<span className="ia-kpi-icon" style={{background:'#e8f1fd',color:'#0b5bd3'}}>{summary.datasets}</span>}
          title="Published datasets" value={`${summary.indicators} indicators`} note={`${summary.datasetsWithData} of ${summary.datasets} with FY ${data.year} data`}
          onOpen={()=>setInsight({title:'Published datasets',kind:'bar',xKey:'name',data:rows.map(r=>({name:shortName(datasetTitle(r.dataset)),indicators:r.summary?.indicatorCount??0})),series:[{key:'indicators',label:'Indicators',color:'#0b5bd3'}],details:[{label:'Financial year',value:data.year}]})}/>
        <KpiCard icon={<Ring percent={summary.progress} color="#00a3dd"/>} title="Reporting progress" value={`${summary.published} of ${summary.expected} periods`} note={`FY ${data.year}`}
          onOpen={()=>setInsight({title:'Reporting progress',kind:'bar',xKey:'name',data:rows.map(r=>({name:shortName(datasetTitle(r.dataset)),published:r.summary?.publishedPeriods??0,pending:Math.max(0,(r.summary?.expectedPeriods??0)-(r.summary?.publishedPeriods??0))})),series:[{key:'published',label:'Published',color:'#0b5bd3'},{key:'pending',label:'Not yet published',color:'#c5cbd6'}],details:[{label:'Progress',value:summary.progress===null?'No data':`${summary.progress}%`}]})}/>
        <KpiCard icon={<Ring percent={summary.achievement} color={BAND_COLORS[band.band]}/>} title="Overall achievement" value={summary.achievement===null?'No targets':band.label} valueColor={BAND_INK[band.band]}
          note="vs annual targets, to date"
          onOpen={()=>setInsight({title:'Overall achievement',kind:'donut',data:pie.filter(p=>p.value).map(p=>({name:p.name,value:p.value})),colors:pie.filter(p=>p.value).map(p=>p.color),details:[{label:'Average achievement',value:summary.achievement===null?'No data':`${summary.achievement}%`}]})}/>
        <KpiCard icon={<span className="ia-kpi-icon" style={{background:summary.change<0?'#fdeceb':'#e5f6ea',color:summary.change<0?'#b42318':'#0f7a2f'}}>{summary.change<0?'▼':'▲'}</span>}
          title={`Change vs ${compare||compareOptions[0]||'last year'}`} value={fmtChange(summary.change)} valueColor={summary.change<0?'#b42318':summary.change>0?'#0f7a2f':undefined}
          note={summary.change===null?'No comparable periods':`${summary.up} indicators up · ${summary.down} down`}
          onOpen={()=>setInsight({title:'Change vs last year',kind:'bar',xKey:'name',data:rows.filter(r=>r.comparison).map(r=>({name:shortName(datasetTitle(r.dataset)),change:r.comparison.change??0})),series:[{key:'change',label:'Change %',color:'#0f7a2f'}],details:[{label:'Up',value:summary.up},{label:'Down',value:summary.down}]})}/>
      </div>
      <div className="ia-grid3">
        <section className="ia-surface ia-card" onClick={()=>setInsight({title:'Achievement trend',kind:'line',xKey:'year',data:lineRows,series:rows.map(r=>({key:r.key,label:datasetTitle(r.dataset),color:r.color[0]}))})}>
          <h3>Achievement trend · {historyYears.length} year{historyYears.length===1?'':'s'} <span className="ia-tag">Line</span></h3>
          <p className="ia-note">Average achievement per dataset, complete years only</p>
          {historyYears.length?<ResponsiveContainer width="100%" height={230}>
            <LineChart data={lineRows} margin={{top:8,right:12,bottom:0,left:-14}}>
              <CartesianGrid stroke="#eef1f6" vertical={false}/><XAxis dataKey="year" tick={{fontSize:11}}/><YAxis tick={{fontSize:11}} unit="%" tickCount={5} domain={[0,dataMax=>Math.max(100,Math.ceil(dataMax/50)*50)]}/>
              <Tooltip formatter={v=>(v===null||v===undefined?'No data':`${v}%`)}/><Legend wrapperStyle={{fontSize:11}}/>
              {rows.map(r=><Line key={r.key} type="monotone" dataKey={r.key} name={datasetTitle(r.dataset)} stroke={r.color[0]} strokeWidth={2.5} dot={{r:3}} connectNulls/>)}
            </LineChart></ResponsiveContainer>:<div className="ia-empty">No yearly targets published yet.</div>}
        </section>
        <section className="ia-surface ia-card" onClick={()=>setInsight({title:'Indicator performance',kind:'donut',data:pie.filter(p=>p.value).map(p=>({name:p.name,value:p.value})),colors:pie.filter(p=>p.value).map(p=>p.color)})}>
          <h3>Indicator performance <span className="ia-tag">Pie</span></h3>
          <p className="ia-note">{summary.bands.excellence+summary.bands.good+summary.bands.under} indicators with annual targets</p>
          {pieTotal?<div className="ia-donut-wrap"><div className="ia-donut"><ResponsiveContainer width="100%" height="100%"><PieChart>
            <Pie data={pie.filter(p=>p.value)} dataKey="value" nameKey="name" innerRadius={48} outerRadius={78} stroke="#fff" strokeWidth={2}>
              {pie.filter(p=>p.value).map(p=><Cell key={p.name} fill={p.color}/>)}</Pie><Tooltip/></PieChart></ResponsiveContainer>
            <div className="ia-donut-center"><strong>{pieTotal}</strong><span>indicators</span></div></div>
            <div className="ia-legend" style={{flex:1}}>{pie.map(p=><div key={p.name}><i style={{background:p.color}}/>{p.name}<b>{p.value}</b></div>)}</div></div>
            :<div className="ia-empty">No indicators published for FY {data.year}.</div>}
        </section>
        <section className="ia-surface ia-card" onClick={event=>{if(event.target.closest('.recharts-bar-rectangle'))return;setInsight({title:'Achievement by dataset',kind:'bar',xKey:'name',data:bars.map(b=>({name:b.name,achievement:b.value??0})),series:[{key:'achievement',label:'Achievement %',color:'#0b5bd3'}]});}}>
          <h3>Achievement by dataset <span className="ia-tag">Bar</span></h3>
          <p className="ia-note">Click a bar to open the dataset</p>
          <ResponsiveContainer width="100%" height={230}>
            <BarChart data={bars} margin={{top:16,right:6,bottom:0,left:-20}}>
              <CartesianGrid stroke="#eef1f6" vertical={false}/><XAxis dataKey="name" tick={{fontSize:10}} interval={0} angle={-25} textAnchor="end" height={46}/><YAxis tick={{fontSize:11}} domain={[0,dataMax=>Math.max(100,Math.ceil((dataMax||0)/10)*10)]}/>
              <Tooltip formatter={v=>(v===null||v===undefined?'No data':`${v}%`)} labelFormatter={(label,payload)=>payload?.[0]?.payload?.full??label}/>
              <Bar dataKey="value" name="Achievement" radius={[6,6,0,0]} maxBarSize={34} label={{position:'top',fontSize:10.5,fill:'#0a2a5c',formatter:v=>(v===null||v===undefined?'':`${Math.round(v)}%`)}}
                onClick={entry=>openDataset(entry?.payload?.id??entry?.id)} style={{cursor:'pointer'}}>
                {bars.map(b=><Cell key={b.id} fill={BAND_COLORS[b.band]}/>)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </section>
      </div>
      </div>}
      {state.loading&&!data&&<div className="ia-surface ia-loader-host"><TableLoader active label="Loading institution analytics…"/></div>}
      {!state.loading&&data&&!rows.length&&<div className="ia-surface ia-empty">This organisation has no published datasets yet.</div>}
      {data&&rows.length>0&&<div style={{position:'relative'}}>
        {state.loading&&<TableLoader active label="Updating…"/>}
      <div className="ia-section"><h3>Datasets</h3><small>Open a dataset for its detailed analytics</small></div>
      <div className="ia-ds-grid">{rows.map(row=><DatasetCard key={row.key} row={row} onOpen={()=>openDataset(row.dataset.id)}/>)}</div>
      </div>}
    </>}
    {tab!=='overview'&&<>
      {meLoading&&<section className="ia-surface ia-card me-block"><MuSkeleton kind="lines" rows={8}/></section>}
      {me.error&&<div className="ia-surface ia-empty">M&amp;E reports could not be loaded. {me.error}</div>}
      {view&&viewTabs&&!viewTabs.includes(tab)&&<div className="ia-surface ia-empty">This view needs the M&amp;E reports, which are not available for your role.</div>}
      {view&&!viewTabs&&tab==='objectives'&&<MeObjectives bundle={view.bundle} errors={view.errors}/>}
      {view&&tab==='kpis'&&<MeKpis bundle={view.bundle} errors={view.errors} unitWord={unitWord} fileName={`${identity.heading.title||type}-kpis-${data?.year??''}`.replace(/[^A-Za-z0-9-]+/g,'-')}/>}
      {view&&tab==='variance'&&<MeVariance bundle={view.bundle} errors={view.errors}/>}
      {view&&!viewTabs&&tab==='budget'&&<MeBudget bundle={view.bundle} errors={view.errors}/>}
      {view&&!viewTabs&&tab==='departments'&&<MeDepartments bundle={view.bundle} errors={view.errors} unitWord={unitWord}/>}
      {!view&&!meLoading&&!me.error&&<div className="ia-surface ia-empty">No published M&amp;E data for this selection yet.</div>}
    </>}
    <InsightModal insight={insight} onClose={()=>setInsight(null)}/>
  </div>;
}
