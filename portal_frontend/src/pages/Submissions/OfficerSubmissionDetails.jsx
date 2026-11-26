import ObjectiveCard from '../../components/insights/ObjectiveCard.jsx';
import PerformanceSummary from '../../components/insights/BudgetPerformance.jsx';
import {periodFacts,ytdForIndicator} from '../../utils/yearToDate.js';
import {useYearToDate} from '../../services/yearToDateService.jsx';
import {PerformanceBar} from '../../components/insights/TargetPerformance.jsx';
import {annualTargetContextOf,formatTarget,missingTargetText} from '../../utils/annualTargets.js';
import {useEffect,useMemo,useState} from 'react';
import {ArrowLeft,Info} from 'lucide-react';
import {MuBadge,MuCard,MuHeader,MuSkeleton,MuTabs} from '../../components/modern/ModernUI.jsx';
import {MuDonutLegend} from '../../components/modern/RoleParts.jsx';
import {ReviewSummary,approvalSteps} from '../MDO/MdoWorkspace.jsx';
import {currentStepText,nextStepText,statusBadge} from '../../utils/roleDisplay.js';
import {directionOf,performanceOf} from '../../utils/annualTargets.js';
import {snapshotReviewDefinitions} from '../../services/hodReviewService.jsx';
import {MddRemarksDocuments,MddApprovalHistory} from '../MDD/MddReviewSections.jsx';
import {approvalActorIds,embeddedApprovalActorProfiles,profileOf} from '../../utils/approvalActorPresentation.js';
import {submissionFacts,readField,recordName} from '../../utils/serverFields.js';
import {lookupApprovalActorProfiles} from '../../services/approvalActorLookupService.jsx';
import '../MDO/MdoWorkspace.css';
import '../MDD/MddWorkspace.css';
import './OfficerSubmissionDetails.css';

const show = value => value === null || value === undefined || String(value).trim()==='' ? '—' : String(value);
const readableDate=value=>{if(!value)return '—';const d=new Date(value);return Number.isNaN(d.getTime())?show(value):new Intl.DateTimeFormat('en-GB',{dateStyle:'medium',timeStyle:'short',timeZone:'Africa/Dar_es_Salaam'}).format(d);};

/** Who submitted it and from which source (shared by the header chips and the info card). */
function submissionPeople(record,actorProfiles={}){
  const facts=submissionFacts(record);
  const raw=record.raw||{};
  const submitPerson=readField(raw,'submittedBy','submitted_by','submitter','submittedUser','submitted_user','createdBy','created_by') || readField(record,'submittedBy','submitted_by');
  const profile=profileOf(submitPerson);
  const submitId=String(readField(raw,'submittedById','submitted_by_id','submitted_by_user_id','createdById','created_by_id')||'');
  const source=record.institution_name||record.department_name||facts.institution||facts.department||readField(raw,'dataset.source.name','dataset.institution.name','dataset.department.name','institution.name','department.name')||'';
  return {facts,submitName:profile.name||actorProfiles[submitId]?.name||facts.submittedBy||'',
    submitRole:profile.role||actorProfiles[submitId]?.role||facts.submittedByRole||'',source:typeof source==='object'?recordName(source):source};
}

function SubmittedData({record}){
  const {indicators,dimensions}=snapshotReviewDefinitions(record);
  const map=new Map(indicators.map(i=>[String(i.id),i]));
  const targets=annualTargetContextOf(record);
  const ytdFacts=useMemo(()=>periodFacts(record),[record]);
  const ytdState=useYearToDate(ytdFacts);
  const keys=[...new Set([...indicators.map(i=>String(i.id)),...Object.keys(record.values||{}),...Object.keys(record.dimensionValues||{}).map(k=>k.split(':')[0])])];
  const dimLabels=new Map();
  const mapOption=(row)=>{
    const opts=row.options??row.dimensionOptions??row.dimension_options??row.categories??row.values??[];
    return Array.isArray(opts)?opts:[];
  };
  for(const dim of dimensions){
    const id=dim.id??dim.dimensionId??dim.dimension_id;
    for(const option of mapOption(dim))dimLabels.set(`${id}:${option.id??option.optionId}`,{dimension:dim.nameEn??dim.name??dim.label??`Dimension ${id}`,option:option.nameEn??option.name??option.label??`Option ${option.id}`});
  }
  return <section className="officer-detail-section mu-card">
    <header className="mu-card-head"><span className="mu-dot" aria-hidden="true"/><h2>Submitted Indicator Values</h2></header>
    <div className="table-responsive"><table className="table officer-indicator-table"><thead><tr><th>#</th><th>Indicator / Breakdown</th><th>Unit</th><th>Value</th><th>Annual Target</th><th>Performance</th><th>Remarks</th></tr></thead><tbody>
    {keys.map((key,index)=>{
      const ind=map.get(key),def=ind?.raw??{};
      const unit=def.unitName??def.unit_name??def.unitOfMeasure??def.unit_of_measure??def.indicator?.unitName??def.indicator?.unit?.name??def.unit?.name??ind?.unit??def.indicator?.unit??'—';
      const breakdowns=Object.entries(record.dimensionValues||{}).filter(([k])=>k.startsWith(`${key}:`));
      return <tr key={key}><td>{index+1}</td><td><strong>{show(ind?.label||`Indicator ${key}`)}</strong>
      {breakdowns.length>0&&<div className="officer-breakdown">{breakdowns.map(([k,v])=>{
        const [,dimensionId,optionId]=k.split(':');const lab=dimLabels.get(`${dimensionId}:${optionId}`);
        return <div key={k}><span>{lab?`${lab.dimension} — ${lab.option}`:`Dimension ${dimensionId} / Option ${optionId}`}</span><b>{show(v)}</b></div>;
      })}</div>}</td><td>{show(unit)}</td><td>{show(record.values?.[key])}</td><td><span className="tp-target-value">{show(targets?.byIndicator?.[key]?formatTarget(targets.byIndicator[key]):'')}</span></td><td>{targets?.byIndicator?.[key]?(()=>{const y=ytdForIndicator({indicator:ind??{id:key,key},current:record.values?.[key],ytdState,facts:ytdFacts});return <PerformanceBar compact actual={y.ytd??record.values?.[key]} target={targets.byIndicator[key]} basis={y.text} direction={directionOf(ind)}/>;})():<span className="tp-none">{missingTargetText(targets)}</span>}</td><td>{show(record.remarks?.[key])}</td></tr>;
    })}
    {!keys.length&&<tr><td colSpan="7" className="text-center text-muted py-4">No indicator values were included in the submission response.</td></tr>}
    </tbody></table></div>
    {!indicators.length&&<p className="officer-detail-note"><Info size={15}/> Indicator names are not available for this submission.</p>}
  </section>;
}

/** Performance mix for the side donut (same bands as everywhere: <50 · 50–80 · >80). */
function PerformanceMix({record}){
  const {indicators}=snapshotReviewDefinitions(record);
  const targets=annualTargetContextOf(record);
  const ytdFacts=useMemo(()=>periodFacts(record),[record]);
  const ytdState=useYearToDate(ytdFacts);
  const counts={excellence:0,good:0,under:0,none:0};
  for(const ind of indicators){
    const key=String(ind.id),target=targets?.byIndicator?.[key];
    const y=ytdForIndicator({indicator:ind,current:record.values?.[key],ytdState,facts:ytdFacts});
    const result=target?performanceOf(y.ytd??record.values?.[key],target,directionOf(ind)):null;
    counts[result?.band??'none']+=1;
  }
  if(!indicators.length)return null;
  return <MuCard title="Performance" tag="Pie"><MuDonutLegend centerLabel="indicators" data={[
    {name:'Excellence',value:counts.excellence,color:'#1eb53a'},{name:'Good',value:counts.good,color:'#e0b400'},
    {name:'Under',value:counts.under,color:'#d92d20'},{name:'No target',value:counts.none,color:'#cfd8e6'}]}/></MuCard>;
}

export function OfficerSubmissionDetails({record,loading,error,onClose,org={}}){
  const [tab,setTab]=useState('data');
  const [lookedUpActors,setLookedUpActors]=useState({});
  const embeddedActors=useMemo(()=>embeddedApprovalActorProfiles(record),[record]);
  const actorProfiles=useMemo(()=>({...lookedUpActors,...embeddedActors}),[lookedUpActors,embeddedActors]);
  const ids=useMemo(()=>approvalActorIds(record).filter(id=>!embeddedActors[id]),[record,embeddedActors]);
  useEffect(()=>{let active=true;setLookedUpActors({});if(ids.length)lookupApprovalActorProfiles(ids).then(p=>{if(active)setLookedUpActors(p);}).catch(()=>{});return()=>{active=false;};},[ids.join(',')]);
  const people=submissionPeople(record,actorProfiles);
  const badge=statusBadge(record.status);
  const submittedAt=record.submitted_at||people.facts.submittedAt;
  const indicatorCount=snapshotReviewDefinitions(record).indicators.length||Object.keys(record.values||{}).length;
  return <div className="officer-details-page" aria-label="Submission details">
    <MuHeader logo={org.logo} initials={org.initials||'IDO'} title={show(record.dataset)}
      chips={[{label:'Submission',value:`SUB-${record.id}`},{label:'Period',value:record.period},
        {label:'Submitted by',value:people.submitName},{label:'Submitted',value:submittedAt?readableDate(submittedAt):''}]}>
      <MuBadge tone={badge.tone}>{badge.label}</MuBadge>
      <button type="button" className="mu-btn" onClick={onClose} aria-label="Close details"><ArrowLeft size={15}/> Back</button>
    </MuHeader>
    {loading?<section className="mu-card"><MuSkeleton kind="list" rows={8} label="Loading submission details…"/></section>
    :error?<section className="mu-card"><p className="mu-empty" role="alert">{error}</p></section>:<>
      <ObjectiveCard record={record}/>
      <PerformanceSummary record={record}/>
    <section className="mu-card hod-summary-card"><ReviewSummary record={record}/></section>
      <MuTabs role="tablist" label="Submission details tabs" value={tab} onChange={setTab} items={[
        {key:'data',label:'Submitted Data',count:indicatorCount},{key:'remarks',label:'Remarks & Documents'},{key:'history',label:'Approval History'}]}/>
      <div className="mu-review-grid">
        <div className="mdd-workspace officer-details">{tab==='data'?<SubmittedData record={record}/>:tab==='remarks'?<MddRemarksDocuments record={record} actorProfiles={actorProfiles}/>:<MddApprovalHistory record={record} actorProfiles={actorProfiles}/>}</div>
        <aside>
          <MuCard title="Submission Info"><dl className="officer-info">
            <div><dt>Reference</dt><dd>{show(record.raw?.reference??record.raw?.submissionReference??record.id)}</dd></div>
            <div><dt>Reporting source</dt><dd>{show(people.source)}</dd></div>
            <div><dt>Submitted by</dt><dd>{people.submitName||'Name not supplied'}{people.submitRole&&<small>{people.submitRole}</small>}</dd></div>
            <div><dt>Status</dt><dd>{badge.label}</dd></div>
            <div><dt>Current step</dt><dd>{currentStepText(record)}</dd></div>
            {nextStepText(null,approvalSteps(record))&&<div><dt>Next step</dt><dd>{nextStepText(null,approvalSteps(record))}</dd></div>}
          </dl></MuCard>
          <PerformanceMix record={record}/>
        </aside>
      </div>
    </>}
  </div>;
}
