/**
 * Dataset analytics (approved UI 27 Oct 2026). Charts adapt to the dataset:
 *  numeric series -> line / bar, complete breakdowns -> donut (else bar), non-numeric -> table only.
 * Data: /analytics/datasets/{id}/options, /{id}?reportingYearId&frequency, /comparison, /trends (published only).
 * Route: /dashboard/analytics/:type/:id/dataset/:datasetId?year=&freq=&compare=
 */
import {useEffect,useMemo,useRef,useState} from 'react';
import {useLocation,useNavigate,useOutletContext,useParams,useSearchParams} from 'react-router-dom';
import {Bar,BarChart,CartesianGrid,Cell,Legend,Line,LineChart,Pie,PieChart,ResponsiveContainer,Tooltip,XAxis,YAxis} from 'recharts';
import {Eye,LineChart as LineIcon} from 'lucide-react';
import {TableLoader} from '../../components/common/LoadingState.jsx';
import InsightModal from '../../components/insights/InsightModal.jsx';
import RowActionsMenu from '../../components/common/RowActionsMenu.jsx';
import {showUserFacingError} from '../../utils/userFacingErrors.js';
import {
  bandOf,breakdownChartOf,comparisonSummary,datasetSummary,datasetTitle,defaultFrequency,frequencyLabel,
  indicatorAchievement,indicatorActual,indicatorKey,indicatorName,indicatorTarget,indicatorsOf,isNumericSeries,
  lastTwoValues,num,optionYears,pointValue,pointsOf,previousYear,yearByLabel,
} from '../../utils/analyticsSummary.js';
import {chooseYear,datasetComparison,datasetDetail,datasetOptions,datasetTrends,orgDatasets} from '../../services/institutionAnalyticsService.jsx';
import {BAND_COLORS,BAND_INK,KpiCard,OrgHeader,Ring,SelectBox,fmtChange,fmtNumber,useAnalyticsBreadcrumb,useOrganisation} from './analyticsParts.jsx';
import DatasetSwitcher from './DatasetSwitcher.jsx';
import {analyticsTrail} from '../../utils/orgScope.js';
import './AnalyticsPages.css';

const BREAKDOWN_COLORS=['#0a2a5c','#0b5bd3','#00a3dd','#1eb53a','#e0b400','#c2410c','#5b4bd6','#0e7490'];
const RULE={sum:'Sum',average:'Average',min:'Minimum',max:'Maximum',latest:'Latest',none:'No total'};

export default function DatasetAnalytics(){
  const {user}=useOutletContext()??{};
  const {type='institution',id,datasetId}=useParams();
  const navigate=useNavigate(),location=useLocation();
  const [search,setSearch]=useSearchParams();
  const identity=useOrganisation(type,id,location.state?.org);
  const [siblings,setSiblings]=useState([]);
  const [options,setOptions]=useState(null);
  const [state,setState]=useState({loading:true,detail:null,comparison:null,trends:null});
  const [selected,setSelected]=useState('');
  const [insight,setInsight]=useState(null);
  const chartsRef=useRef(null);

  useEffect(()=>{let alive=true;orgDatasets(type,id).then(rows=>{if(alive)setSiblings(rows);}).catch(()=>{});return()=>{alive=false;};},[type,id]);
  useEffect(()=>{
    let alive=true;setOptions(null);
    datasetOptions(datasetId).then(value=>{if(alive)setOptions(value);})
      .catch(error=>{if(alive){setOptions({years:[]});void showUserFacingError(error,'Dataset analytics not loaded');}});
    return()=>{alive=false;};
  },[datasetId]);

  const years=useMemo(()=>optionYears(options),[options]);
  const yearLabel=options?chooseYear(years.map(y=>y.label),search.get('year')):'';
  const year=options?yearByLabel(options,yearLabel):null;
  const frequency=year?(year.frequencies.includes(search.get('freq'))?search.get('freq'):defaultFrequency(year)):'';
  const compareYear=year?(search.get('compare')?yearByLabel(options,search.get('compare')):previousYear(options,year)):null;
  const validCompare=compareYear&&(compareYear.startYear??0)<(year?.startYear??0)&&compareYear.yearType===year?.yearType?compareYear:null;

  useEffect(()=>{
    if(!year||!frequency)return undefined;
    let alive=true;setState(current=>({...current,loading:true}));
    const start=year.startYear??null;
    Promise.allSettled([
      datasetDetail(datasetId,year.id,frequency),
      validCompare?datasetComparison(datasetId,year.id,validCompare.id,frequency):Promise.resolve(null),
      start?datasetTrends(datasetId,{startYear:start-4,endYear:start,yearType:year.yearType||'financial',frequency}):Promise.resolve(null),
    ]).then(([detail,comparison,trends])=>{
      if(!alive)return;
      if(detail.status==='rejected')void showUserFacingError(detail.reason,'Dataset analytics not loaded');
      setState({loading:false,detail:detail.status==='fulfilled'?detail.value:null,
        comparison:comparison.status==='fulfilled'?comparison.value:null,trends:trends.status==='fulfilled'?trends.value:null});
    });
    return()=>{alive=false;};
  },[datasetId,year?.id,frequency,validCompare?.id]);

  const detail=state.detail;
  const indicators=indicatorsOf(detail);
  const numeric=indicators.filter(isNumericSeries);
  const summary=useMemo(()=>datasetSummary(detail),[detail]);
  const change=useMemo(()=>comparisonSummary(state.comparison),[state.comparison]);
  const active=numeric.find(ind=>indicatorKey(ind)===selected)??numeric[0]??null;
  const title=detail?.datasetName??datasetTitle(siblings.find(ds=>String(ds.id)===String(datasetId)))??'Dataset';
  useAnalyticsBreadcrumb([...analyticsTrail(user),
    {text:identity.heading.title||'Organisation',to:`/dashboard/analytics/${type}/${id}`},{text:title}]);

  const setParam=(key,value)=>{const next=new URLSearchParams(search);if(value)next.set(key,value);else next.delete(key);if(key==='year'){next.delete('compare');next.delete('freq');}setSearch(next,{replace:true});};

  // Actual vs target (numeric indicators with a target).
  const targetBars=numeric.filter(ind=>indicatorAchievement(ind)!==null).map(ind=>{const p=indicatorAchievement(ind);
    return {name:indicatorName(ind),short:indicatorName(ind).length>24?indicatorName(ind).slice(0,23)+'…':indicatorName(ind),value:Math.round(p*10)/10,shown:Math.min(p,100),band:bandOf(p).band,actual:indicatorActual(ind),target:indicatorTarget(ind)};});
  // Period line for the selected indicator: this year vs comparison year (matched period numbers).
  const periodRows=useMemo(()=>{
    if(!active)return [];
    const points=pointsOf(active);
    const cmp=(state.comparison?.indicators??[]).find(item=>String(item.seriesKey??item.indicatorId)===indicatorKey(active)||String(item.indicatorId)===String(active.indicatorId));
    const pairs=Array.isArray(cmp?.periods)?cmp.periods:[];
    return points.map((point,index)=>{
      const pair=pairs.find(p=>Number(p.periodNumber)===index+1);
      return {label:point.label??`P${index+1}`,current:pointValue(point),previous:pair?num(pair.previousValue):null};
    });
  },[active,state.comparison]);
  // 5-year trend for the selected indicator.
  const trendRows=useMemo(()=>{
    if(!active)return [];
    const series=(state.trends?.indicators??[]).find(item=>String(item.seriesKey??item.indicatorId)===indicatorKey(active)||String(item.indicatorId)===String(active.indicatorId));
    const rows=(series?.points??[]).map(point=>({year:point.label,complete:num(point.value),partial:point.status==='partial'?num(point.availableActual):null,status:point.status}));
    // Join the dashed part-year segment to the last complete year.
    rows.forEach((row,index)=>{if(row.partial!==null&&index>0&&rows[index-1].complete!==null)rows[index-1].partial=rows[index-1].complete;});
    return rows;
  },[active,state.trends]);
  const breakdown=active?breakdownChartOf(active):null;
  const band=summary.band;
  const compareChoices=years.filter(y=>y.yearType===year?.yearType&&(y.startYear??0)<(year?.startYear??0)).map(y=>y.label);

  return <div className="ia-page">
    <OrgHeader identity={identity} backLabel="Back" subtitle={`${title}${frequency?` · ${frequencyLabel(frequency)}`:''}`}
      onBack={()=>navigate(`/dashboard/analytics/${type}/${id}${yearLabel?`?year=${encodeURIComponent(yearLabel)}`:''}`,{state:{org:identity.org}})}>
      {years.length>0&&<SelectBox label="Financial Year" value={yearLabel} onChange={value=>setParam('year',value)} options={years.map(y=>y.label)}/>}
      {year&&year.frequencies.length>0&&<SelectBox label="Frequency" value={frequency} onChange={value=>setParam('freq',value)} options={year.frequencies.map(f=>({value:f,label:frequencyLabel(f)}))}/>}
      {compareChoices.length>0&&<SelectBox label="Compare with" value={validCompare?.label??compareChoices[0]} onChange={value=>setParam('compare',value)} options={compareChoices}/>}
    </OrgHeader>
    <DatasetSwitcher datasets={siblings} currentId={datasetId} titleOf={datasetTitle}
      onOpen={ds=>navigate(`/dashboard/analytics/${type}/${id}/dataset/${ds.id}${yearLabel?`?year=${encodeURIComponent(yearLabel)}`:''}`,{state:{org:identity.org}})}/>
    {(!options||(state.loading&&!detail))&&<div className="ia-surface ia-loader-host"><TableLoader active label="Loading dataset analytics…"/></div>}
    {options&&!years.length&&<div className="ia-surface ia-empty">This dataset has no published data yet.</div>}
    {detail&&<div style={{position:'relative'}}>
      {state.loading&&<TableLoader active label="Updating…"/>}
      <div className="ia-kpis ia-five">
        <KpiCard icon={<span className="ia-kpi-icon" style={{background:'#e8f1fd',color:'#0b5bd3'}}>{summary.indicatorCount}</span>} title="Indicators" value={`${numeric.length} numeric`} note={`${summary.withTargets} with annual targets`}
          onOpen={()=>setInsight({title:'Indicators',kind:'metric',value:summary.indicatorCount,unit:'indicators',details:[{label:'Numeric',value:numeric.length},{label:'With targets',value:summary.withTargets}]})}/>
        <KpiCard icon={<Ring percent={summary.expectedPeriods?summary.publishedPeriods/summary.expectedPeriods*100:null} color="#00a3dd"/>} title="Periods published" value={`${summary.publishedPeriods} of ${summary.expectedPeriods}`} note={`${frequencyLabel(frequency)} · FY ${yearLabel}`}
          onOpen={()=>setInsight({title:'Periods published',kind:'donut',data:[{name:'Published',value:summary.publishedPeriods},{name:'Not yet published',value:Math.max(0,summary.expectedPeriods-summary.publishedPeriods)}],colors:['#0b5bd3','#c5cbd6']})}/>
        <KpiCard icon={<Ring percent={summary.achievement} color={BAND_COLORS[band.band]}/>} title="Average achievement" value={summary.achievement===null?'No targets':`${summary.achievement}%`} valueColor={BAND_INK[band.band]} note={summary.achievement===null?'No indicator has a target':`${band.label} · to date`}
          onOpen={()=>setInsight({title:'Actual vs annual target',kind:'bar',xKey:'name',data:targetBars.map(b=>({name:b.short,achievement:b.value})),series:[{key:'achievement',label:'Achievement %',color:'#0b5bd3'}]})}/>
        <KpiCard icon={<span className="ia-kpi-icon" style={{background:'#e5f6ea',color:'#0f7a2f'}}>{summary.bands.excellence}</span>} title="Performance bands" value={`${summary.bands.excellence} · ${summary.bands.good} · ${summary.bands.under}`} note="Excellence · Good · Under"
          onOpen={()=>setInsight({title:'Performance bands',kind:'donut',data:[{name:'Excellence',value:summary.bands.excellence},{name:'Good',value:summary.bands.good},{name:'Under',value:summary.bands.under},{name:'No target',value:summary.bands.noTarget}].filter(x=>x.value),colors:[BAND_COLORS.excellence,BAND_COLORS.good,BAND_COLORS.under,BAND_COLORS.none]})}/>
        <KpiCard icon={<span className="ia-kpi-icon" style={{background:change.change<0?'#fdeceb':'#e5f6ea',color:change.change<0?'#b42318':'#0f7a2f'}}>{change.change<0?'▼':'▲'}</span>}
          title={`Change vs ${validCompare?.label??'last year'}`} value={fmtChange(change.change)} valueColor={change.change<0?'#b42318':change.change>0?'#0f7a2f':undefined}
          note={change.matched?`matched periods · ${change.up} up · ${change.down} down`:'No comparable periods'}
          onOpen={()=>setInsight({title:'Change vs last year',kind:'bar',xKey:'name',data:numeric.map(ind=>({name:indicatorName(ind).slice(0,18),change:change.byIndicator[indicatorKey(ind)]??0})),series:[{key:'change',label:'Change %',color:'#0f7a2f'}]})}/>
      </div>
      <div className="ia-grid2" ref={chartsRef}>
        <section className="ia-surface ia-card" onClick={()=>setInsight({title:'Actual vs annual target',kind:'bar',xKey:'name',data:targetBars.map(b=>({name:b.short,achievement:b.value})),series:[{key:'achievement',label:'Achievement %',color:'#0b5bd3'}]})}>
          <h3>Actual vs Annual Target <span className="ia-tag">Bar</span></h3>
          <p className="ia-note">Actual to date (indicator aggregation rule) as % of the annual target</p>
          {targetBars.length?<ResponsiveContainer width="100%" height={Math.max(160,targetBars.length*40+30)}>
            <BarChart data={targetBars} layout="vertical" margin={{top:4,right:44,bottom:4,left:8}}>
              <CartesianGrid stroke="#eef1f6" horizontal={false}/><XAxis type="number" domain={[0,100]} unit="%" tick={{fontSize:11}}/>
              <YAxis type="category" dataKey="short" width={190} tick={{fontSize:11}}/>
              <Tooltip formatter={(v,n,item)=>[`${item.payload.value}% (${fmtNumber(item.payload.actual)} of ${fmtNumber(item.payload.target)})`,'Achievement']} labelFormatter={(l,p)=>p?.[0]?.payload?.name??l}/>
              <Bar dataKey="shown" radius={[0,8,8,0]} barSize={16} label={{position:'right',fontSize:11,formatter:(v)=>`${Math.round(v)}%`}}>
                {targetBars.map(b=><Cell key={b.name} fill={BAND_COLORS[b.band]}/>)}</Bar>
            </BarChart></ResponsiveContainer>:<div className="ia-empty">No annual targets recorded for these indicators.</div>}
        </section>
        <section className="ia-surface ia-card" onClick={event=>{if(event.target.closest('.ia-chips'))return;setInsight({title:`${active?indicatorName(active):'Period values'}`,kind:'line',xKey:'label',data:periodRows,series:[{key:'current',label:yearLabel,color:'#0b5bd3'},...(validCompare?[{key:'previous',label:validCompare.label,color:'#9fb3cf'}]:[])]});}}>
          <h3>{frequencyLabel(frequency)} values · {yearLabel}{validCompare?` vs ${validCompare.label}`:''} <span className="ia-tag">Line</span></h3>
          {numeric.length>1&&<div className="ia-chips">{numeric.map(ind=><button type="button" key={indicatorKey(ind)} title={indicatorName(ind)}
            className={`ia-chip-btn${active&&indicatorKey(active)===indicatorKey(ind)?' active':''}`} onClick={()=>setSelected(indicatorKey(ind))}>{indicatorName(ind)}</button>)}</div>}
          {active&&periodRows.some(row=>row.current!==null||row.previous!==null)?<ResponsiveContainer width="100%" height={220}>
            <LineChart data={periodRows} margin={{top:14,right:14,bottom:0,left:-12}}>
              <CartesianGrid stroke="#eef1f6" vertical={false}/><XAxis dataKey="label" tick={{fontSize:11}}/><YAxis tick={{fontSize:11}}/>
              <Tooltip formatter={v=>(v===null||v===undefined?'Not published':fmtNumber(v))}/><Legend wrapperStyle={{fontSize:11}}/>
              {validCompare&&<Line type="monotone" dataKey="previous" name={validCompare.label} stroke="#9fb3cf" strokeWidth={2.4} dot={{r:3}} connectNulls/>}
              <Line type="monotone" dataKey="current" name={yearLabel} stroke="#0b5bd3" strokeWidth={3} dot={{r:4}} label={{position:'top',fontSize:11,fill:'#0a2a5c',formatter:v=>(v===null||v===undefined?'':fmtNumber(v))}}/>
            </LineChart></ResponsiveContainer>:<div className="ia-empty">{numeric.length?'No published values for this indicator yet.':'This dataset has no numeric indicators — see the table below.'}</div>}
        </section>
      </div>
      {active&&<div className="ia-grid2">
        <section className="ia-surface ia-card" onClick={()=>setInsight({title:`Trend · ${indicatorName(active)}`,kind:'line',xKey:'year',data:trendRows.map(r=>({year:r.year,value:r.complete??r.partial})),series:[{key:'value',label:indicatorName(active),color:'#1eb53a'}]})}>
          <h3>{trendRows.length||5}-year trend · {indicatorName(active)} <span className="ia-tag">Line</span></h3>
          <p className="ia-note">Yearly totals by the indicator rule; dashed = partial year (to date)</p>
          {trendRows.some(r=>r.complete!==null||r.partial!==null)?<ResponsiveContainer width="100%" height={210}>
            <LineChart data={trendRows} margin={{top:14,right:14,bottom:0,left:-12}}>
              <CartesianGrid stroke="#eef1f6" vertical={false}/><XAxis dataKey="year" tick={{fontSize:11}}/><YAxis tick={{fontSize:11}}/>
              <Tooltip formatter={(v,n)=>(v===null||v===undefined?'No data':[fmtNumber(v),n])}/><Legend wrapperStyle={{fontSize:11}}/>
              <Line type="monotone" dataKey="complete" name="Complete year" stroke="#1eb53a" strokeWidth={3} dot={{r:4}} connectNulls/>
              <Line type="monotone" dataKey="partial" name="Partial year (to date)" stroke="#1eb53a" strokeDasharray="5 5" strokeWidth={2.4} dot={{r:4,fill:'#fff'}}/>
            </LineChart></ResponsiveContainer>:<div className="ia-empty">No published values in the last five years.</div>}
        </section>
        <section className="ia-surface ia-card" onClick={()=>breakdown&&setInsight({title:`${breakdown.title} · ${indicatorName(active)}`,kind:breakdown.kind==='donut'?'donut':'bar',xKey:'name',data:breakdown.kind==='donut'?breakdown.categories:breakdown.categories.map(c=>({name:c.name,value:c.value})),series:[{key:'value',label:'Value',color:'#0b5bd3'}],colors:BREAKDOWN_COLORS})}>
          <h3>Breakdown{breakdown?` · ${breakdown.title}`:''}{breakdown?.period?` (${breakdown.period})`:''} <span className="ia-tag">{breakdown?.kind==='donut'?'Pie':'Bar'}</span></h3>
          <p className="ia-note">{indicatorName(active)}{breakdown?` · total ${fmtNumber(breakdown.categories.reduce((s,c)=>s+c.value,0))}`:''}</p>
          {breakdown?(breakdown.kind==='donut'?<div className="ia-donut-wrap"><div className="ia-donut"><ResponsiveContainer width="100%" height="100%"><PieChart>
              <Pie data={breakdown.categories} dataKey="value" nameKey="name" innerRadius={48} outerRadius={78} stroke="#fff" strokeWidth={2}>
                {breakdown.categories.map((c,i)=><Cell key={c.name} fill={BREAKDOWN_COLORS[i%BREAKDOWN_COLORS.length]}/>)}</Pie><Tooltip/></PieChart></ResponsiveContainer>
              <div className="ia-donut-center"><strong>{fmtNumber(breakdown.categories.reduce((s,c)=>s+c.value,0))}</strong><span>total</span></div></div>
              <div className="ia-legend" style={{flex:1}}>{breakdown.categories.map((c,i)=>{const total=breakdown.categories.reduce((s,x)=>s+x.value,0);
                return <div key={c.name}><i style={{background:BREAKDOWN_COLORS[i%BREAKDOWN_COLORS.length]}}/>{c.name}<b>{fmtNumber(c.value)} · {total?Math.round(c.value/total*100):0}%</b></div>;})}</div></div>
            :<ResponsiveContainer width="100%" height={210}><BarChart data={breakdown.categories} margin={{top:14,right:8,bottom:0,left:-12}}>
              <CartesianGrid stroke="#eef1f6" vertical={false}/><XAxis dataKey="name" tick={{fontSize:10.5}} interval={0}/><YAxis tick={{fontSize:11}}/><Tooltip/>
              <Bar dataKey="value" radius={[6,6,0,0]} maxBarSize={36}>{breakdown.categories.map((c,i)=><Cell key={c.name} fill={BREAKDOWN_COLORS[i%BREAKDOWN_COLORS.length]}/>)}</Bar>
            </BarChart></ResponsiveContainer>)
            :<div className="ia-empty">This indicator has no published breakdown.</div>}
        </section>
      </div>}
      <section className="ia-surface ia-card" style={{cursor:'default'}}>
        <h3>Indicators · {title}</h3>
        <div className="ia-table-wrap"><table className="ia-table"><thead><tr><th>#</th><th>Indicator</th><th>Previous value</th><th>Value (to date)</th><th>Annual target</th><th style={{width:'22%'}}>Performance</th><th>vs {validCompare?.label??'last year'}</th><th aria-label="Actions"/></tr></thead>
          <tbody>{indicators.map((ind,index)=>{
            const numericRow=isNumericSeries(ind),values=lastTwoValues(ind),p=indicatorAchievement(ind),b=bandOf(p);
            const rule=String(ind.aggregationRule??ind.summary?.aggregationRule??'none').toLowerCase();
            const periods=pointsOf(ind).filter(pt=>pointValue(pt)!==null).map(pt=>`${pt.label??''} ${fmtNumber(pointValue(pt))}`).join(' · ');
            const actual=indicatorActual(ind)??values.latest;
            const delta=change.byIndicator[indicatorKey(ind)];
            const latestText=pointsOf(ind).map(pt=>pt.value).filter(v=>v!==null&&v!==undefined&&v!=='').pop();
            return <tr key={indicatorKey(ind)}>
              <td>{index+1}</td>
              <td><strong>{indicatorName(ind)}</strong><small>{numericRow?`${RULE[rule]??rule}${ind.unit?` · ${typeof ind.unit==='object'?(ind.unit.name??ind.unit.code??''):ind.unit}`:''}${periods?` · ${periods}`:''}`:'Text / table indicator'}</small></td>
              <td>{numericRow?(values.previous===null?'—':fmtNumber(values.previous)):'—'}</td>
              <td><strong>{numericRow?(actual===null?'—':fmtNumber(actual)):String(latestText??'—')}</strong>{numericRow&&ind.summary&&ind.summary.complete===false&&<small>{ind.summary.reportedPeriods} of {summary.expectedPeriods} periods</small>}</td>
              <td>{indicatorTarget(ind)===null?'—':fmtNumber(indicatorTarget(ind))}</td>
              <td>{p===null?<small>{numericRow?'No target':'Not numeric'}</small>:<div className={`ia-band-${b.band}`}><div className="ia-perf"><div className="ia-perf-track"><i style={{width:`${Math.min(p,100)}%`,background:'var(--b)'}}/></div><b style={{color:'var(--bi)'}}>{Math.round(p*10)/10}%</b></div>
                <span className="ia-badge" style={{background:'var(--bs)',color:'var(--bi)'}}>{b.label}</span></div>}</td>
              <td className={delta>0?'ia-up':delta<0?'ia-down':''}><b>{delta===undefined||delta===null?'—':`${delta>0?'▲':delta<0?'▼':''} ${Math.round(Math.abs(delta)*10)/10}%`}</b></td>
              <td><RowActionsMenu label={`Actions for ${indicatorName(ind)}`}>
                {numericRow&&<button type="button" title="Show in charts" onClick={()=>{setSelected(indicatorKey(ind));chartsRef.current?.scrollIntoView({behavior:'smooth',block:'start'});}}><LineIcon size={16}/></button>}
                <button type="button" title="Period values" onClick={()=>setInsight({title:indicatorName(ind),kind:numericRow?'line':'metric',value:latestText,xKey:'label',
                  data:pointsOf(ind).map(pt=>({label:pt.label,value:pointValue(pt)})),series:[{key:'value',label:yearLabel,color:'#0b5bd3'}],
                  details:[{label:'Aggregation rule',value:RULE[rule]??rule},{label:'Value (to date)',value:actual??'—'},{label:'Annual target',value:indicatorTarget(ind)??'—'}]})}><Eye size={16}/></button>
              </RowActionsMenu></td>
            </tr>;})}</tbody></table></div>
        {!indicators.length&&<div className="ia-empty">No published observations for FY {yearLabel} ({frequencyLabel(frequency)}).</div>}
      </section>
    </div>}
    <InsightModal insight={insight} onClose={()=>setInsight(null)}/>
  </div>;
}
