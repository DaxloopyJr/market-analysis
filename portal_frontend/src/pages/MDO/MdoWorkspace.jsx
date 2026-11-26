import {periodFacts,ytdForIndicator} from '../../utils/yearToDate.js';
import {useYearToDate} from '../../services/yearToDateService.jsx';
import {PerformanceBar} from '../../components/insights/TargetPerformance.jsx';
import ObjectiveCard from '../../components/insights/ObjectiveCard.jsx';
import PerformanceSummary from '../../components/insights/BudgetPerformance.jsx';
import {annualTargetContextOf,directionOf,formatTarget,missingTargetText,performanceOf} from '../../utils/annualTargets.js';
import {useErrorDialogState} from '../../utils/userFacingErrors.js';
/**
 * VIWANDA MDO — approved compact government UI reference (24 October 2026).
 * 1. Ministry Review Queue: Institution logo cards OR Ministry Departments/Units
 * 2. Dataset Overview: all configured datasets + submitted/returned states
 * 3. Review Submission: Submitted Data / Remarks & Documents / Approval History
 * 4. Reviewed/Returned: actions confirmed by Laravel /review and /return
 * No duplicated page header cards; persistent official Topbar/Sidebar unchanged.
 */
import {useEffect,useMemo,useState} from 'react';
import {useLocation,useNavigate,useOutletContext,useParams} from 'react-router-dom';
import {
  AlertCircle,ArrowLeft,ArrowRight,Building2,CalendarDays,Check,CheckCircle2,
  Clock3,Download,Eye,FileText,Flag,History,Info,ListChecks,
  RotateCcw,Search,ShieldCheck,X
} from 'lucide-react';
import Swal from 'sweetalert2';
import PageSizeSelect from '../../components/common/PageSizeSelect.jsx';
import {usePageSize} from '../../components/common/usePageSize.js';
import RowActionsMenu from '../../components/common/RowActionsMenu';
import {showPortalToast} from '../../utils/portalAlerts.js';
import {darDate} from '../../utils/submissionApprovalActions.js';
import {snapshotReviewDefinitions} from '../../services/hodReviewService.jsx';
import {categoriesForIndicator,indicatorNeedsVerification,validateHodIndicator,reviewValueIssues} from '../../utils/hodReviewRules.js';
import {apiError} from '../../API/resourceHelpers.js';
import {getMdoCatalogue,getMdoSubmission,sendMdoDecision} from '../../services/mdoReviewService.jsx';
import {
  canMdoReview,canMdoReturn,isMdoPending,datasetName,hasMdoHistory,
  institutionLogo,isMinistryInstitution,mdoHistoryEvents,ministryDepartments,
  ministryOf,ministryReturned,passedMdoStep,sourceOf,sourceOfDataset
} from '../../utils/mdoReviewRules.js';
import {reviewActorName,reviewDate,roleName} from '../../utils/hodApprovalPresentation.js';
import './MdoWorkspace.css';
import {OrgGrid,OrgPanel,ReviewOrgCard} from '../../components/orgCards/OrgCards.jsx';
import {MuBadge,MuDate,MuHeader,MuKpi,MuRing,MuSelect,MuSource,MuSteps,MuTabs,MuCard} from '../../components/modern/ModernUI.jsx';
import {cleanPeriod,sourceIdentity} from '../../utils/sourceIdentity.js';
import {orgHeading,orgInitials,orgMatches,queueYears,sameFinancialYear} from '../../utils/orgCards.js';
import {DATASET_PRIORITIES,PRIORITY_REASON_MAX,datasetPriorityOf,priorityChangeError,priorityLabel} from '../../utils/datasetPriority.js';
import {datasetsAPI} from '../../API/dataset.jsx';
import {useBreadcrumbContext} from '../../contexts/BreadcrumbContext.jsx';
import {TableLoader} from '../../components/common/LoadingState.jsx';
import {submissionFacts} from '../../utils/serverFields.js';
import {MddRemarksDocuments,MddApprovalHistory} from '../MDD/MddReviewSections.jsx';
import {approvalActorIds} from '../../utils/approvalActorPresentation.js';
import {lookupApprovalActorProfiles,embeddedProfilesOf} from '../../services/approvalActorLookupService.jsx';
import '../MDD/MddWorkspace.css';

const pick=(...values)=>values.find(v=>v!==undefined&&v!==null&&v!=='');
export const fmt=v=>v===undefined||v===null||v===''?'—':String(v);
export const statusLabel=value=>String(value||'Unknown Status').replaceAll('_',' ').replace(/\b\w/g,x=>x.toUpperCase());
const fields=value=>typeof value==='object'&&value&&!Array.isArray(value)?value:{};
export const flattenRecord=(record,catalogue={})=>{
  const facts=submissionFacts(record,catalogue);
  return {
    dataset:facts.dataset,
    institution:facts.institution,
    officer:facts.submittedByDisplay || facts.submittedBy,
    date:facts.submittedAt,
    updated:facts.updatedAt,
    method:facts.method,
    period:facts.period,
  };
};
const dateOrder=value=>{const n=Date.parse(value||'');return Number.isFinite(n)?n:0;};
export const sortedRows=rows=>[...rows].sort((a,b)=>dateOrder(flattenRecord(b).date)-dateOrder(flattenRecord(a).date)||Number(b.id)-Number(a.id));
export const periodRank=record=>{
  const r=record.raw??{};
  const cal=r.reportingCalendar??r.reporting_calendar??{};
  const year=Number(pick(r.startYear,r.start_year,cal.startYear,cal.start_year,String(record.financialYear||'').slice(0,4)));
  const num=Number(pick(r.periodNumber,r.period_number,cal.periodNumber,cal.period_number,String(record.period||'').match(/\d+/)?.[0],0));
  return Number.isFinite(year)?year*100+(Number.isFinite(num)?num:0):null;
};
const indicatorNumber=value=>{
  if(value===undefined||value===null||String(value).trim()==='')return null;
  const parsed=Number(value);
  return Number.isFinite(parsed)?parsed:null;
};
const valueChange=(current,previous)=>{
  const a=indicatorNumber(current),b=indicatorNumber(previous);
  if(a===null||b===null)return '—';
  const diff=a-b;
  return diff>0?`+${diff}`:String(diff);
};
export const officialName=org=>pick(org.short_name,org.shortName,org.code,org.name,'Institution');
const cleanUrl=url=>typeof url==='string'&&(/^(https?:\/\/|\/[^/])/i.test(url))?url:'';

export function InstitutionMark({item,department=false}){
  const [broken,setBroken]=useState(false);
  const logo=department?'':institutionLogo(item);
  return <span className="mdo-org-logo" aria-hidden="true">
    {!broken&&logo?<img src={logo} alt="" loading="lazy" onError={()=>setBroken(true)}/>:<Building2 size={25}/>}
  </span>;
}
export function Breadcrumb({segments}){
  const location=useLocation();
  const context=useBreadcrumbContext();
  const encoded=JSON.stringify(segments);
  useEffect(()=>{
    context?.setBreadcrumb({path:location.pathname,segments:JSON.parse(encoded)});
  },[location.pathname,encoded,context?.setBreadcrumb]);
  // DashboardLayout renders the single universal sticky breadcrumb.
  return null;
}
function ErrorNote(){return null;}
export function SmallPager({length,page,setPage,perPage=10,onPerPage}){
  const pages=Math.max(1,Math.ceil(length/perPage));
  const safe=Math.min(page,pages);
  return <footer className="mdo-pager"><small>{length?`Showing ${(safe-1)*perPage+1} to ${Math.min(safe*perPage,length)} of ${length} entries`:'No matching records'}</small>
    <div><button type="button" onClick={()=>setPage(Math.max(1,safe-1))} disabled={safe<=1}>‹</button>
      {Array.from({length:Math.min(pages,7)},(_,i)=>i+1).map(n=><button key={n} type="button" onClick={()=>setPage(n)} className={safe===n?'active':''}>{n}</button>)}
      <button type="button" disabled={safe>=pages} onClick={()=>setPage(safe+1)}>›</button>
      {onPerPage&&<PageSizeSelect value={perPage} onChange={value=>{onPerPage(value);setPage(1);}}/>}</div>
  </footer>;
}
export function Filters({value,onChange,placeholder='Search datasets or submissions…'}){
  return <label className="mdo-search"><Search size={16}/><input value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}/></label>;
}

/** Ministry Review Queue — approved card UI (27 Oct 2026): Datasets + Pending per source,
 * red when something awaits review, filtered by Financial Year. Logos come from the API. */
function Queue({catalogue,notes,onRefresh}){
  const navigate=useNavigate();
  const [type,setType]=useState('institution'),[search,setSearch]=useState(''),[year,setYear]=useState('all');
  const ministry=ministryOf(catalogue.institutions,catalogue.user);
  const departments=ministryDepartments(catalogue.departments,ministry);
  const years=queueYears(catalogue.submissions);
  const inYear=item=>year==='all'||sameFinancialYear(item.financialYear,year);
  const counts=(typeName,record)=>{
    const id=Number(record.id);
    const scoped=catalogue.submissions.filter(item=>{
      const ownership=sourceOf(item);
      return (typeName==='institution'?ownership.institutionId===id:
        ownership.departmentId===id&&ownership.institutionId===Number(ministry?.id))&&inYear(item);
    });
    return {datasets:new Set([
      ...catalogue.datasets.filter(ds=>{
        const s=sourceOfDataset(ds);
        return typeName==='institution'?s.institutionId===id:s.institutionId===Number(ministry?.id)&&s.departmentId===id;
      }).map(ds=>String(ds.id)),...scoped.map(r=>String(r.dataset_id))].filter(x=>x!=='null'&&x!=='undefined')).size,
      pending:scoped.filter(isMdoPending).length};
  };
  const sourceRecords=type==='institution'?catalogue.institutions:departments;
  const list=sourceRecords.filter(row=>orgMatches(row,search));
  const parentLabel=ministry?officialName(ministry):'';
  return <div className="mdo-page">
    <Breadcrumb segments={[{text:'Submissions'},{text:'Ministry Review Queue'}]}/>
    <OrgPanel title={`${type==='institution'?'Institutions':'Departments & Units'} · ${year==='all'?'All Years':`FY ${year}`}`}
      type={type} onType={next=>{setType(next);setSearch('');}}
      counts={{institution:catalogue.institutions.length,department:departments.length}}
      search={search} onSearch={setSearch} years={years} year={year} onYear={setYear} allYears onRefresh={onRefresh}
      legend={[['under','Has pending review'],['excellence','All reviewed']]}>
      {notes.length>0&&<div className="mdo-api-note"><Info size={16}/> {notes.join(' | ')}</div>}
      {type==='department'&&!ministry&&<div className="mdo-api-note">Ministry institution could not be identified from GET /institutions. Departments cannot be safely related without its ID.</div>}
      <OrgGrid empty={!list.length?(type==='institution'?'No institutions were returned for this search.':'No linked Ministry departments were returned.'):''}>
        {list.map(org=>{
          const count=counts(type,org),department=type==='department';
          const heading=orgHeading(org,{department,parentLabel});
          return <ReviewOrgCard key={`${type}-${org.id}`} logo={department?'':institutionLogo(org)} initials={orgInitials(org)}
            title={heading.title} subtitle={heading.subtitle} datasets={count.datasets} pending={count.pending}
            onOpen={()=>navigate(`/dashboard/mdo/source/${type}/${org.id}`)}/>;
        })}
      </OrgGrid>
    </OrgPanel>
  </div>;
}

const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
/** MDO: change an initialised dataset priority with an audit reason (PATCH /datasets/{id}/priority). */
async function changeDatasetPriority(row){
  // Read the CURRENT priority from GET /datasets/{id}: the list may omit it or be stale.
  let current=datasetPriorityOf(row.definition);
  try{current=datasetPriorityOf(await datasetsAPI.get(row.id))||current;}catch{/* keep the list value */}
  const options=DATASET_PRIORITIES.map(value=>`<option value="${value}"${value===current?' selected':''}>${priorityLabel(value)}</option>`).join('');
  const result=await Swal.fire({
    title:'Change Priority',
    html:`<div class="mdo-priority-form"><p><strong>${escapeHtml(row.name)}</strong><br><span>Current priority: ${priorityLabel(current)}</span></p>
      <label for="mdo-priority-select">New priority</label><select id="mdo-priority-select" class="form-select">${options}</select>
      <label for="mdo-priority-reason">Reason <b>*</b></label><textarea id="mdo-priority-reason" class="form-control" rows="4" maxlength="${PRIORITY_REASON_MAX}" placeholder="Why is the priority changing?"></textarea></div>`,
    showCancelButton:true,confirmButtonText:'Save Priority',cancelButtonText:'Cancel',confirmButtonColor:'#0b5bd3',focusConfirm:false,
    showLoaderOnConfirm:true,allowOutsideClick:()=>!Swal.isLoading(),
    preConfirm:async()=>{
      const next=document.getElementById('mdo-priority-select')?.value;
      const reason=document.getElementById('mdo-priority-reason')?.value??'';
      const problem=priorityChangeError({current,next,reason});
      if(problem){Swal.showValidationMessage(problem);return false;}
      try{return await datasetsAPI.updatePriority(row.id,{priority:next,reason:reason.trim()});}
      catch(error){Swal.showValidationMessage(apiError(error)||'Priority could not be changed.');return false;}
    },
  });
  if(!result.isConfirmed||!result.value)return null;
  const saved=String(result.value.data?.priority??'').toLowerCase();
  void showPortalToast({type:'success',title:'Priority updated',message:result.value.message||`${row.name}: ${priorityLabel(saved)}.`});
  return saved;
}

function Overview({catalogue,sourceType,sourceId,onRefresh}){
  const navigate=useNavigate();
  const [search,setSearch]=useState(''),[period,setPeriod]=useState('all'),[state,setState]=useState('all'),[page,setPage]=useState(1);
  const [perPage,setPerPage]=usePageSize('mdo-source',10);
  const [priorities,setPriorities]=useState({});
  const ministry=ministryOf(catalogue.institutions,catalogue.user);
  const entity=sourceType==='department'?ministryDepartments(catalogue.departments,ministry).find(r=>Number(r.id)===Number(sourceId)):
    catalogue.institutions.find(r=>Number(r.id)===Number(sourceId));
  const isDepartment=sourceType==='department';
  const matches=owner=>isDepartment?owner.departmentId===Number(sourceId)&&owner.institutionId===Number(ministry?.id):owner.institutionId===Number(sourceId);
  const definitions=catalogue.datasets.filter(ds=>matches(sourceOfDataset(ds)));
  const instances=catalogue.submissions.filter(row=>matches(sourceOf(row)));
  // Inventory from datasets first; rows with submissions remain visible even
  // where MDO cannot read dataset registry due to missing Laravel permission.
  const map=new Map();
  for(const dataset of definitions)map.set(Number(dataset.id),{id:Number(dataset.id),name:datasetName(dataset),definition:dataset,submissions:[]});
  for(const record of instances){
    const id=Number(record.dataset_id);
    if(!Number.isSafeInteger(id)||id<=0)continue;
    if(!map.has(id))map.set(id,{id,name:record.dataset||`Dataset ${id}`,definition:null,submissions:[]});
    map.get(id).submissions.push(record);
  }
  const years=[...new Set(instances.map(r=>r.financialYear).filter(Boolean))].sort().reverse();
  // The dataset list may omit priority; read it from GET /datasets/{id} for this source only.
  const missingPriority=[...map.values()].filter(row=>!datasetPriorityOf(row.definition)).map(row=>row.id).join(',');
  useEffect(()=>{
    if(!missingPriority)return undefined;
    let alive=true;
    Promise.allSettled(missingPriority.split(',').map(id=>datasetsAPI.get(id).then(ds=>[id,datasetPriorityOf(ds)])))
      .then(results=>{if(!alive)return;
        const found=Object.fromEntries(results.filter(r=>r.status==='fulfilled'&&r.value[1]).map(r=>r.value));
        if(Object.keys(found).length)setPriorities(current=>({...found,...current}));});
    return()=>{alive=false;};
  },[missingPriority]);
  const groups=[...map.values()].map(row=>{
    const submissions=sortedRows(row.submissions.filter(r=>period==='all'||r.financialYear===period));
    const latest=submissions[0]??null;
    // Show the MDO-assigned under_review instance, even when a newer record
    // exists for a different period or when allowedActions is unavailable.
    const pending=submissions.find(isMdoPending)??null;
    const actionable=pending&&canMdoReview(pending,catalogue.user)?pending:null;
    const displayed=pending??latest;
    return {...row,latest,displayed,pending,actionable,
      status:pending?'Pending Review':latest?(hasMdoHistory(latest,catalogue.user)?'Reviewed':statusLabel(latest.status)):'Not Submitted'};
  }).filter(row=>row.name.toLowerCase().includes(search.toLowerCase())&&(state==='all'||row.status===state));
  const allCount=map.size;
  const states=['all','Pending Review','Reviewed','Returned','Not Submitted'];
  const selectedCount=kind=>[...map.values()].filter(row=>{
    const submissions=sortedRows(row.submissions.filter(r=>period==='all'||r.financialYear===period));
    const latest=submissions[0];
    const pending=submissions.some(isMdoPending);
    return kind==='all'||(kind==='Not Submitted'&&!latest)||
      (kind==='Pending Review'&&pending)||
      (kind==='Reviewed'&&!pending&&latest&&hasMdoHistory(latest,catalogue.user))||
      (kind==='Returned'&&!pending&&latest&&String(latest.status).toLowerCase()==='returned');
  }).length;
  const pendingCount=selectedCount('Pending Review'),notSubmittedCount=selectedCount('Not Submitted');
  const processedCount=Math.max(0,allCount-pendingCount-notSubmittedCount);
  const headInst=isDepartment?null:entity;
  const plural=(n,word)=>`${n} ${word}${n===1?'':'s'}`;
  return <div className="mdo-page mu-page">
    <Breadcrumb segments={[{text:'Submissions'},{text:'Ministry Review Queue',to:'/dashboard/mdo/queue'},{text:entity?.name??'Source'}]}/>
    <MuHeader logo={headInst?institutionLogo(headInst):''} initials={orgInitials(entity??{})} title={isDepartment?fmt(entity?.name):officialName(entity??{})}
      subtitle={isDepartment?`Department / Unit · ${ministry?.name??'Ministry institution'}`:[entity?.name!==officialName(entity??{})?entity?.name:'','Institution datasets'].filter(Boolean).join(' · ')}>
      <button type="button" className="mu-btn" onClick={()=>navigate('/dashboard/mdo/queue')}><ArrowLeft size={15}/> Review Queue</button>
      <MuSelect label="Reporting Year" value={period} allLabel="All years" options={years} onChange={v=>{setPeriod(v);setPage(1);}}/>
    </MuHeader>
    <div className="mu-kpis">
      <MuKpi tone="blue" icon={allCount} title="Datasets" value={plural(allCount,'dataset')} note="configured for this source" arrow={false} onOpen={()=>{setState('all');setPage(1);}}/>
      <MuKpi tone="amber" icon={<MuRing percent={allCount?pendingCount/allCount*100:null} color="#e0b400" text={pendingCount}/>} title="Pending Review" value={plural(pendingCount,'submission')} note="awaiting your action" arrow={false} onOpen={()=>{setState('Pending Review');setPage(1);}}/>
      <MuKpi tone="green" icon={<CheckCircle2 size={20}/>} title="Submitted / Processed" value={plural(processedCount,'dataset')} note="latest submission" arrow={false} onOpen={()=>{setState('all');setPage(1);}}/>
      <MuKpi tone="grey" icon={notSubmittedCount} title="Not Submitted" value={plural(notSubmittedCount,'dataset')} note="no submission yet" arrow={false} onOpen={()=>{setState('Not Submitted');setPage(1);}}/>
    </div>
    <section className="mu-card mdo-overview">
      <div className="mu-toolbar"><label className="mu-search"><Search size={16}/><input value={search} onChange={e=>{setSearch(e.target.value);setPage(1);}} placeholder="Search datasets or submissions…"/></label></div>
      <MuTabs label="Dataset status filters" value={state} onChange={kind=>{setState(kind);setPage(1);}} items={states.map(kind=>({key:kind,label:kind==='all'?'All':kind,count:kind==='all'?allCount:selectedCount(kind)}))}/>
      <div className="mu-table-wrap"><table className="mu-table"><thead><tr><th>#</th><th>Dataset</th><th>Priority</th><th>Latest Submission</th><th>Status</th><th aria-label="Actions"/></tr></thead><tbody>
        {groups.slice((page-1)*perPage,page*perPage).map((row,index)=>{
          const record=row.displayed;
          const priority=priorities[row.id]??datasetPriorityOf(row.definition);
          const editPriority=async()=>{
            const saved=await changeDatasetPriority({...row,definition:{...(row.definition??{}),priority}});
            if(saved){setPriorities(current=>({...current,[row.id]:saved}));onRefresh?.();}
          };
          const facts=record?flattenRecord(record):null;
          const tone=row.status==='Pending Review'?'amber':row.status==='Returned'?'red':row.status==='Not Submitted'?'grey':row.status==='Draft'?'blue':'green';
          return <tr key={row.id}><td>{(page-1)*perPage+index+1}</td>
            <td><strong>{row.name}</strong>{facts?.period&&<small>{cleanPeriod(facts.period)}</small>}</td>
            <td><span className={`mdo-priority mdo-priority-${priority||'none'}`}>{priorityLabel(priority)}</span></td>
            <td>{record?<MuDate value={facts.date}/>:<span className="mu-muted">Not submitted</span>}</td>
            <td><MuBadge tone={tone}>{row.status}</MuBadge></td>
            <td className="mu-actions"><RowActionsMenu label={`Actions for ${row.name}`}>
                {row.pending&&<button type="button" title="Review" onClick={()=>navigate(`/dashboard/mdo/review/${row.pending.id}`)}><ListChecks size={17}/></button>}
                {record&&<button type="button" title="View submission" onClick={()=>navigate(`/dashboard/mdo/review/${record.id}`)}><Eye size={17}/></button>}
                {row.latest&&<button type="button" title="History" onClick={()=>navigate(`/dashboard/mdo/review/${row.latest.id}`,{state:{tab:'history'}})}><History size={17}/></button>}
                <button type="button" title="Change Priority" aria-label="Change Priority" onClick={editPriority}><Flag size={17}/></button>
              </RowActionsMenu></td></tr>;
        })}
        {!groups.length&&<tr><td colSpan="6" className="mu-empty">No datasets found. If the source should contain more datasets, check MDO's read access to GET /datasets.</td></tr>}
      </tbody></table></div>
      <SmallPager length={groups.length} page={page} setPage={setPage} perPage={perPage} onPerPage={setPerPage}/>
      {catalogue.notes.length>0&&<p className="mdo-inventory-note">{catalogue.notes.join(' | ')}</p>}
    </section>
  </div>;
}

export function SubmittedTable({record,prior}){
  const defs=snapshotReviewDefinitions(record);
  const rows=defs.indicators;
  const lastYear=prior?cleanPeriod([prior.financialYear,prior.period].filter(Boolean).join(' ')):'Previous period';
  const thisYear=cleanPeriod([record.financialYear,record.period].filter(Boolean).join(' '))||'Current period';
  const incomplete=[];
  const targets=annualTargetContextOf(record);
  const ytdFacts=useMemo(()=>periodFacts(record),[record]);
  const ytdState=useYearToDate(ytdFacts);
  return <div className="mdo-surface mdo-review-pane">
    <div className="mdo-table-wrap"><table className="mdo-table mdo-data-table"><thead><tr><th>Indicator</th><th>{lastYear}</th><th>{thisYear}</th><th>Annual Target &amp; Performance</th><th>Change</th><th>Status</th></tr></thead><tbody>
      {rows.map(indicator=>{
        const id=String(indicator.id),current=record.values[id],prev=prior?.values?.[id];
        const missing=current===undefined||current===null||String(current).trim()==='';
        if(missing)incomplete.push(indicator.label);
        const diff=valueChange(current,prev);
        const categories=categoriesForIndicator(defs.dimensions,indicator.id,record.dimensionValues);
        const validation=indicatorNeedsVerification(defs.dimensions,indicator.id,record.dimensionValues)?validateHodIndicator(indicator,categories,record.values,record.dimensionValues):[];
        const unit=pick(indicator.raw?.unitName,indicator.raw?.unit_name,indicator.raw?.indicator?.unitName,indicator.raw?.unit?.name,'');
        return <tr key={id}><td><strong>{indicator.label}</strong>{unit&&<small className="mdo-row-note">Unit: {unit}</small>}
          {record.remarks[id]&&<small className="mdo-row-note">{record.remarks[id]}</small>}
          {categories.length>0&&<details className="mdo-dimension-details"><summary>View breakdowns ({categories.length})</summary>
            {categories.map(category=>{
              const check=validation.find(item=>String(item.id)===String(category.id));
              return <div className="mdo-dimension-category" key={category.id}><strong>{category.name}</strong>
                {category.options.map(option=><span key={option.id}><span>{option.label}</span><b>{fmt(record.dimensionValues[`${id}:${category.id}:${option.id}`])}</b></span>)}
                {check?.enforced&&<small className={check.valid?'mdo-dim-good':'mdo-dim-bad'}>{check.valid?'Totals match':'Totals do not match'} · {fmt(check.total)} / {fmt(current)}</small>}
              </div>;
            })}
          </details>}
          </td><td>{fmt(prev)}</td><td className="mdo-current">{fmt(current)}</td><td className="mdo-target-cell">{targets?.byIndicator?.[id]?<><span className="tp-target-value">{formatTarget(targets.byIndicator[id])}</span>{(()=>{const y=ytdForIndicator({indicator,current,ytdState,facts:ytdFacts});return <PerformanceBar compact actual={y.ytd??current} target={targets.byIndicator[id]} basis={y.text} direction={directionOf(indicator)}/>;})()}</>:<span className="tp-none">{missingTargetText(targets)}</span>}</td><td>{diff}</td><td><span className={`mdo-validation ${missing?'missing':diff!=='—'&&diff!=='0'?'changed':'valid'}`}>{missing?'Missing':diff!=='—'&&diff!=='0'?'Changed':'Present'}</span></td></tr>;
      })}
    </tbody></table></div>
    {!rows.length&&<div className="mdo-empty">Indicator names are not available for this submission.</div>}
    {rows.length>0&&<p className="mdo-comparison-note">Only saved submission values are shown. Missing previous-period data is displayed as —; any change is informational, not a fabricated threshold violation.</p>}
    {incomplete.length>0&&<div className="mdo-attention"><AlertCircle size={17}/><div><strong>Review attention</strong><p>{incomplete.length} indicator(s) have no submitted value. {incomplete.slice(0,2).join(', ')}</p></div></div>}
    {rows.some(row=>String(record.values[String(row.id)]??'').trim()!==''&&prior?.values?.[String(row.id)]!==undefined)&&<div className="mdo-data-foot"><Info size={14}/> Compare values and remarks before forwarding.</div>}
  </div>;
}
export function Attachments({record}){
  const raw=record.raw??{};
  const docs=pick(raw.attachments,raw.documents,raw.supportingDocuments,raw.supporting_documents,raw.files,[]);
  const files=Array.isArray(docs)?docs:[];
  return <div className="mdo-surface mdo-review-pane"><h2>Remarks from Previous Reviewers</h2>
    {(record.history??[]).length?<div className="mdo-history-list">{[...record.history].reverse().map((event,index)=>{
      const actor=pick(event.actor,event.user,event.reviewer,event.performedBy,event.performed_by);
      return <div className="mdo-event" key={event.id??index}><CheckCircle2 size={18}/><div><strong>{statusLabel(pick(event.action,event.eventType,event.event_type,'Review'))}</strong><small>{reviewActorName(actor)||'Reviewer'} · {reviewDate(pick(event.createdAt,event.created_at,event.performedAt,event.performed_at))}</small><p>{pick(event.comments,event.comment,event.reason,'No written comment')}</p></div></div>;
    })}</div>:<p className="mdo-muted">No earlier reviewer comments.</p>}
    <h2 className="mdo-doc-heading">Supporting Documents</h2>
    {files.length?<div className="mdo-files">{files.map((file,index)=>{
      const url=cleanUrl(pick(file.downloadUrl,file.download_url,file.url,file.path,''));
      return <div key={file.id??index}><FileText size={19}/><span>{fmt(pick(file.originalName,file.original_name,file.fileName,file.filename,file.name))}</span>{url&&<a href={url} target="_blank" rel="noreferrer" title="Open supporting document"><Download size={17}/></a>}</div>;
    })}</div>:<p className="mdo-muted">No supporting documents were included in the submission response.</p>}
  </div>;
}
export function ApprovalHistory({record}){
  const raw=record.raw??{};
  const circle=fields(pick(raw.approvalCircle,raw.approval_circle,raw.workflow,raw.workflowVersion,{}));
  const steps=pick(circle.steps,raw.approvalSteps,raw.approval_steps,[]);
  const stepRows=Array.isArray(steps)?[...steps].sort((a,b)=>Number(a.sequence??0)-Number(b.sequence??0)):[];
  const current=pick(raw.currentStep,raw.current_step,{});
  return <div className="mdo-surface mdo-review-pane"><h2>Approval History</h2>
    {stepRows.length>0?<div className="mdo-approval-steps">{stepRows.map((step,index)=>{
      const isCurrent=String(step.sequence??step.id)===String(current.sequence??current.id);
      return <div key={step.id??index} className={`mdo-approval-step ${isCurrent?'current':''}`}><span>{index+1}</span><div><strong>{pick(step.stepName,step.step_name,step.name,roleName(step.required_role_code??step.requiredRoleCode),'Approval Step')}</strong><small>{isCurrent?'Current approval step':roleName(step.required_role_code??step.requiredRoleCode)}</small></div></div>;
    })}</div>:<p className="mdo-muted">Current step: {fmt(roleName(current.required_role_code??current.requiredRoleCode))}.</p>}
    <h2 className="mdo-doc-heading">Recorded Actions</h2>
    {(record.history??[]).length?<div className="mdo-history-list">{[...record.history].reverse().map((event,i)=><div className="mdo-event" key={event.id??i}><History size={17}/><div><strong>{statusLabel(pick(event.action,event.eventType,event.event_type,'Action'))}</strong><small>{reviewActorName(pick(event.actor,event.user,event.reviewer,event.performedBy))} · {reviewDate(pick(event.createdAt,event.created_at,event.performedAt))}</small><p>{pick(event.comments,event.comment,'')}</p></div></div>)}</div>:<p className="mdo-muted">No approval history entries were returned.</p>}
  </div>;
}

// Standard routes (5 Nov 2026): ministry departments skip the institution steps.
const INSTITUTION_STEPS=['IDO','IHOD','AO','MDO','MDD'];
const MINISTRY_STEPS=['DDO','MDO','MDD'];
/** Approval progress: the submission's own Approval Circle steps, else the standard route of its source. */
export function approvalSteps(record){
  const raw=record?.raw??{};
  const circle=fields(pick(raw.approvalCircle,raw.approval_circle,raw.workflow,raw.workflowVersion,{}));
  const listed=pick(circle.steps,raw.approvalSteps,raw.approval_steps,[]);
  const codes=Array.isArray(listed)&&listed.length?[...listed].sort((a,b)=>Number(a.sequence??0)-Number(b.sequence??0))
    .map(step=>String(step.required_role_code??step.requiredRoleCode??step.role??'').toUpperCase()).filter(Boolean):null;
  const ministry=!!sourceOf(record).departmentId;
  const officer=ministry?'DDO':'IDO';
  const steps=!codes?(ministry?MINISTRY_STEPS:INSTITUTION_STEPS):codes[0]==='IDO'||codes[0]==='DDO'?codes:[officer,...codes];
  const current=String(pick(raw.currentStep?.required_role_code,raw.currentStep?.requiredRoleCode,raw.current_step?.required_role_code,'')).toUpperCase();
  const status=String(record?.status??'').toLowerCase();
  const at=status==='published'?steps.length:steps.indexOf(current);
  return steps.map((label,index)=>({label,state:at<0?'todo':index<at?'done':index===at?'now':'todo'}));
}
/** Decision-card summary: stepper + indicators / with target / average achievement to date. */
export function ReviewSummary({record}){
  const defs=snapshotReviewDefinitions(record);
  const targets=annualTargetContextOf(record);
  const ytdFacts=useMemo(()=>periodFacts(record),[record]);
  const ytdState=useYearToDate(ytdFacts);
  const withTarget=defs.indicators.filter(ind=>targets?.byIndicator?.[String(ind.id)]);
  const percents=withTarget.map(ind=>{const current=record.values[String(ind.id)];const y=ytdForIndicator({indicator:ind,current,ytdState,facts:ytdFacts});
    return performanceOf(y.ytd??current,targets.byIndicator[String(ind.id)],directionOf(ind))?.percent;}).filter(v=>Number.isFinite(v));
  const avg=percents.length?Math.round(percents.reduce((a,b)=>a+b,0)/percents.length*10)/10:null;
  const band=avg===null?null:performanceOf(avg,100);
  return <>
    <MuSteps steps={approvalSteps(record)}/>
    <div className="mu-mini"><div><small>Indicators</small><b>{defs.indicators.length}</b></div><div><small>With target</small><b>{withTarget.length}</b></div>
      <div><small>Avg. achievement</small><b style={{color:band?.band==='excellence'?'#0f7a2f':band?.band==='good'?'#8a6a00':band?'#b42318':undefined}}>{avg===null?'No target':`${avg}%`}</b></div></div>
  </>;
}

function Review({catalogue,user,submissionId,onSuccess}){
  const navigate=useNavigate(),location=useLocation();
  const [record,setRecord]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useErrorDialogState('');
  const [tab,setTab]=useState(location.state?.tab==='history'?'history':'data');
  const [comments,setComments]=useState(''),[deadline,setDeadline]=useState(''),[returnMode,setReturnMode]=useState(false),[busy,setBusy]=useState(false);
  useEffect(()=>{
    let live=true;setLoading(true);setError('');
    getMdoSubmission(submissionId).then(row=>{if(live)setRecord(row);}).catch(e=>{if(live)setError(apiError(e));}).finally(()=>{if(live)setLoading(false);});
    return()=>{live=false;};
  },[submissionId]);
  const [actorProfiles,setActorProfiles]=useState({});
  useEffect(()=>{
    let live=true;
    const embedded=embeddedProfilesOf(record);
    setActorProfiles(embedded);
    const ids=approvalActorIds(record).filter(id=>!embedded[id]);
    if(ids.length)lookupApprovalActorProfiles(ids).then(profiles=>{if(live)setActorProfiles({...profiles,...embedded});}).catch(()=>{});
    return ()=>{live=false;};
  },[record]);
  const source=record?sourceOf(record):{};
  const info=record?flattenRecord(record,catalogue):{};
  const sourceType=source.departmentId?'department':'institution',sourceId=source.departmentId??source.institutionId;
  const back=sourceId?`/dashboard/mdo/source/${sourceType}/${sourceId}`:'/dashboard/mdo/queue';
  const selectedRank=record?periodRank(record):null;
  const prior=record&&selectedRank!==null?catalogue.submissions.filter(candidate=>candidate.id!==record.id&&candidate.dataset_id===record.dataset_id&&periodRank(candidate)!==null&&periodRank(candidate)<selectedRank).sort((a,b)=>periodRank(b)-periodRank(a))[0]:null;
  const canReview=record&&canMdoReview(record,user),canReturn=record&&canMdoReturn(record,user);
  const snapshot=record?snapshotReviewDefinitions(record):null;
  const issues=snapshot?reviewValueIssues(snapshot.indicators,snapshot.dimensions,record.values,record.dimensionValues):[];
  async function decision(action){
    if(busy||!record)return;
    if(action==='return'&&(!comments.trim()||!deadline||deadline<darDate())){
      setError('Return requires a correction reason and a valid deadline today or later.');return;
    }
    if(action==='review'&&!canReview)return;
    if(action==='return'&&!canReturn)return;
    const answer=await Swal.fire({icon:'question',title:action==='return'?'Return for Correction?':'Review & Forward submission?',
      text:action==='return'?'The submission goes back to its Data Officer for correction.':'The submission moves to the next approval step.',
      showCancelButton:true,confirmButtonText:action==='return'?'Return for Correction':'Review & Forward',confirmButtonColor:action==='return'?'#ca3030':'#1252b2'});
    if(!answer.isConfirmed)return;
    setBusy(true);setError('');
    try{
      const receipt=await sendMdoDecision({id:record.id,user,action,comments,correctionDeadline:action==='return'?deadline:undefined});
      onSuccess(receipt);
      navigate('/dashboard/mdo/reviewed',{state:{mdoReceipt:receipt}});
    }catch(e){setError(apiError(e)||e.message);}finally{setBusy(false);}
  }
  return <div className="mdo-page mu-page"><Breadcrumb segments={[{text:'Submissions'},{text:'Ministry Review Queue',to:'/dashboard/mdo/queue'},{text:source.institutionName||'Institution',to:back},{text:info.dataset||`Submission ${submissionId}`}]}/>
    {loading?<div className="mdo-surface"><TableLoader active label="Loading submission…"/></div>:error&&!record?<ErrorNote text={error}/>:record&&<>
      {(()=>{const src=sourceIdentity(record,catalogue);return <MuHeader logo={src.logo} initials={src.initials} title={fmt(info.dataset)}
        chips={[{label:'Source',value:src.code},{label:'Period',value:cleanPeriod(info.period)},{label:'Submitted',value:info.date?reviewDate(info.date):''},{label:'By',value:info.officer},{label:'Method',value:info.method},{label:'ID',value:`#${record.id}`}]}>
        <MuBadge tone={canReview?'amber':String(record.status).toLowerCase()==='returned'?'red':'green'}>{statusLabel(record.status)}</MuBadge></MuHeader>;})()}
      <ObjectiveCard record={record}/>
      <PerformanceSummary record={record}/>
      <MuTabs role="tablist" label="Review sections" value={tab} onChange={setTab} items={[{key:'data',label:'1 · Submitted Data'},{key:'remarks',label:'2 · Remarks & Documents'},{key:'history',label:'3 · Approval History',count:(record.history??[]).length||undefined}]}/>
      <div className="mdo-review-columns"><div className="mdo-review-body">
        {tab==='data'&&<SubmittedTable record={record} prior={prior}/>}
        {tab==='remarks'&&<div className="mdd-workspace"><MddRemarksDocuments record={record} actorProfiles={actorProfiles}/></div>}
        {tab==='history'&&<div className="mdd-workspace"><MddApprovalHistory record={record} actorProfiles={actorProfiles}/></div>}
      </div><aside className="mdo-surface mdo-decision mu-decision"><div className="mu-card-head"><span className="mu-dot" aria-hidden="true"/><h2>Review Decision</h2></div>
        <ReviewSummary record={record}/>
        {error&&<ErrorNote text={error}/>}
        {canReview?<>
          <label htmlFor="mdo-comments">Review comments / correction reason {returnMode?'(required)':'(optional)'}</label>
          <textarea id="mdo-comments" rows={5} maxLength={10000} value={comments} onChange={e=>{setComments(e.target.value);setError('');}} placeholder="Add review comments…" disabled={busy}/>
          <small className="mdo-charcount">{comments.length}/10000</small>
          {returnMode&&<label htmlFor="mdo-deadline" className="mdo-deadline">Correction deadline *<input type="date" id="mdo-deadline" min={darDate()} value={deadline} onChange={e=>setDeadline(e.target.value)} disabled={busy}/></label>}
          {issues.length>0&&<div className="mdo-attention" role="alert"><AlertCircle size={16}/><div><strong>Breakdown validation failed</strong><p>{issues.map(issue=>`${issue.indicator}: ${issue.reason}`).join(' | ')}</p></div></div>}
          <div className="mdo-decision-buttons"><button type="button" className="mdo-forward" disabled={busy||returnMode||issues.length>0} onClick={()=>decision('review')}><Check size={16}/> {busy?'Processing…':'Review & Forward'}</button>
            {canReturn&&<button className="mdo-return" type="button" disabled={busy} onClick={()=>returnMode?decision('return'):(setReturnMode(true),setError(''))}><RotateCcw size={16}/> Return for Correction</button>}
          </div>
          {returnMode&&<button className="mdo-cancel-return" type="button" onClick={()=>{setReturnMode(false);setDeadline('');setError('');}}>Cancel</button>}
        </>:<p className="mdo-muted">Read-only. This submission is not at your MDO review step.</p>}
        <div className="mdo-decision-foot"><ShieldCheck size={16}/> Approval routing is enforced.</div>
      </aside></div>
      <button type="button" className="mu-btn mdo-back" onClick={()=>navigate(back)}><ArrowLeft size={15}/> Back to Datasets</button>
    </>}
  </div>;
}

function Processed({catalogue,user,returned=false,receipt}){
  const navigate=useNavigate();
  const [query,setQuery]=useState(''),[year,setYear]=useState('all'),[page,setPage]=useState(1),[decisionTab,setDecisionTab]=useState('all');
  const [perPage,setPerPage]=usePageSize(returned?'mdo-returned':'mdo-reviewed',10);
  // Without history from the server (original backend) the lists are office-level, read from status (16 Nov 2026).
  const officeLevel=catalogue.historyAvailable===false;
  const history=catalogue.submissions.filter(row=>{
    if(officeLevel)return returned?ministryReturned(row):passedMdoStep(row);
    const events=mdoHistoryEvents(row,user);
    return returned?events.some(event=>/return/i.test(String(pick(event.action,event.eventType,event.event_type,'')))):events.length>0;
  });
  const lastAction=row=>{
    if(officeLevel){const raw=row.raw??row;return {event:{createdAt:pick(raw.updatedAt,raw.updated_at,raw.publishedAt,raw.published_at)},returned:ministryReturned(row)};}
    const event=mdoHistoryEvents(row,user).at(-1);return {event,returned:/return/.test(String(pick(event?.action,event?.eventType,event?.event_type,'')).toLowerCase())};};
  const years=[...new Set(history.map(r=>r.financialYear).filter(Boolean))].sort().reverse();
  const inYear=history.filter(row=>year==='all'||row.financialYear===year);
  const returnedCount=inYear.filter(row=>lastAction(row).returned).length,forwardedCount=inYear.length-returnedCount;
  const sources=new Set(inYear.map(row=>{const s=sourceOf(row);return s.departmentId?`d${s.departmentId}`:`i${s.institutionId}`;}));
  const rows=sortedRows(inYear).filter(row=>{
    const source=sourceOf(row),info=flattenRecord(row),last=lastAction(row);
    return (decisionTab==='all'||(decisionTab==='returned')===last.returned)&&[row.id,info.dataset,info.institution,source.departmentName].join(' ').toLowerCase().includes(query.toLowerCase());
  });
  const title=returned?'Returned to Institutions':'Reviewed Submissions';
  const plural=(n,word)=>`${n} ${word}${n===1?'':'s'}`;
  return <div className="mdo-page mu-page"><Breadcrumb segments={[{text:'Submissions'},{text:title}]}/>
    <div className="mu-kpis">
      <MuKpi tone="blue" icon={inYear.length} title={officeLevel?(returned?'Returned at ministry':'Past the MDO step'):(returned?'Returned by you':'Reviewed by you')} value={plural(inYear.length,'submission')} note={year==='all'?'all reporting years':`FY ${year}`} arrow={false} onOpen={()=>setDecisionTab('all')}/>
      <MuKpi tone="green" icon={<CheckCircle2 size={20}/>} title="Forwarded" value={plural(forwardedCount,'submission')} note="sent to the next step" arrow={false} onOpen={()=>!returned&&setDecisionTab('forwarded')}/>
      <MuKpi tone="red" icon={<RotateCcw size={19}/>} title="Returned" value={plural(returnedCount,'submission')} note="sent back for correction" arrow={false} onOpen={()=>!returned&&setDecisionTab('returned')}/>
      <MuKpi tone="violet" icon={sources.size} title="Reporting sources" value={plural(sources.size,'source')} note="institutions and departments" arrow={false}/>
    </div>
    <MuCard title={title} count={rows.length} className="mdo-processed">
      {officeLevel&&<div className="alert alert-info small" role="status">Office-level list: the server does not send who took each decision, so this shows every submission past the MDO step (dates are the last update).</div>}
      <div className="mu-toolbar"><MuSelect label="Reporting Year" value={year} allLabel="All years" options={years} onChange={v=>{setYear(v);setPage(1);}}/>
        <label className="mu-search"><Search size={16}/><input value={query} onChange={e=>{setQuery(e.target.value);setPage(1);}} placeholder={returned?'Search returned submissions…':'Search reviewed submissions…'}/></label></div>
      {!returned&&<MuTabs label="Decision filter" value={decisionTab} onChange={v=>{setDecisionTab(v);setPage(1);}} items={[{key:'all',label:'All',count:inYear.length},{key:'forwarded',label:'Forwarded',count:forwardedCount},{key:'returned',label:'Returned',count:returnedCount}]}/>}
      {receipt&&<div className="mdo-confirmation"><CheckCircle2 size={18}/><div><strong>{receipt.action==='return'?'Returned for correction':'Reviewed and forwarded'}</strong><small>Submission #{receipt.id}{receipt.revision!==null?` · Revision ${receipt.revision}`:''}{receipt.nextStep?.required_role_code?` · Next: ${roleName(receipt.nextStep.required_role_code)}`:''}.</small></div></div>}
      <div className="mu-table-wrap"><table className="mu-table"><thead><tr><th>#</th><th>Institution / Department</th><th>Dataset</th><th>Reporting Period</th><th>Decision</th><th>Decision Date</th><th aria-label="Actions"/></tr></thead><tbody>
        {rows.slice((page-1)*perPage,page*perPage).map((record,i)=>{
          const info=flattenRecord(record,catalogue),src=sourceIdentity(record,catalogue),last=lastAction(record);
          return <tr key={record.id}><td>{(page-1)*perPage+i+1}</td><td><MuSource logo={src.logo} initials={src.initials} code={src.code} name={src.name}/></td>
            <td><strong>{fmt(info.dataset)}</strong><small>Submission SUB-{record.id}</small></td><td>{fmt(cleanPeriod(info.period))}</td>
            <td><MuBadge tone={last.returned?'red':'green'}>{last.returned?'Returned':'Forwarded'}</MuBadge></td>
            <td><MuDate value={pick(last.event?.createdAt,last.event?.created_at,last.event?.performedAt,last.event?.performed_at)}/></td>
            <td className="mu-actions"><RowActionsMenu label={`Actions for SUB-${record.id}`}><button type="button" title="View" onClick={()=>navigate(`/dashboard/mdo/review/${record.id}`)}><Eye size={17}/></button><button type="button" title="Approval History" onClick={()=>navigate(`/dashboard/mdo/review/${record.id}`,{state:{tab:'history'}})}><History size={17}/></button></RowActionsMenu></td></tr>;
        })}
        {!rows.length&&<tr><td colSpan="7" className="mu-empty">No MDO actions found yet.</td></tr>}
      </tbody></table></div>
      <SmallPager length={rows.length} page={page} setPage={setPage} perPage={perPage} onPerPage={setPerPage}/>
    </MuCard>
  </div>;
}

const EMPTY_CATALOGUE={institutions:[],departments:[],datasets:[],submissions:[],notes:[]};

export default function MdoWorkspace({mode='queue'}){
  const {user}=useOutletContext();
  const {sourceType,sourceId,id}=useParams();
  const location=useLocation(),navigate=useNavigate();
  const [catalogue,setCatalogue]=useState(null),[error,setError]=useErrorDialogState(''),[reload,setReload]=useState(0),[receipt,setReceipt]=useState(location.state?.mdoReceipt??null);
  useEffect(()=>{
    let active=true;
    // Approval history (one detail read per submission) only for the Reviewed / Returned lists (5 Nov 2026).
    getMdoCatalogue({withHistory:['reviewed','returned'].includes(mode)}).then(result=>{if(active){setCatalogue({...result,user});setError('');}})
      .catch(e=>{if(active)setError(apiError(e)||e.message);});
    return()=>{active=false;};
  },[user?.id,reload,mode]);
  useEffect(()=>{
    if(!location.state?.mdoReceipt)return;
    const record=location.state.mdoReceipt;
    setReceipt(record);
    void showPortalToast({type:'success',title:record.action==='return'?'Submission returned':'Review forwarded',message:`Submission #${record.id} updated successfully.`});
    navigate(location.pathname,{replace:true,state:null});
  },[location.state?.mdoReceipt?.id,location.pathname,navigate]);
  return <div className="mdo-workspace">
    {error&&<ErrorNote text={error}/>}
    {/* 30 Oct 2026: the review page opens from its ONE submission (GET /submissions/{id}); the ministry list
        only adds names and the previous period, so it never blocks the page. */}
    {mode==='review'&&<Review catalogue={catalogue??{...EMPTY_CATALOGUE,user}} user={user} submissionId={id} onSuccess={setReceipt}/>}
    {!catalogue&&!error&&mode!=='review'&&<div className="mdo-surface"><TableLoader active label="Loading Ministry review data…"/></div>}
    {catalogue&&<>
      {mode==='queue'&&<Queue catalogue={catalogue} notes={catalogue.notes} onRefresh={()=>setReload(x=>x+1)}/>}
      {mode==='source'&&<Overview catalogue={catalogue} sourceType={sourceType} sourceId={sourceId} onRefresh={()=>setReload(x=>x+1)}/>}
      {mode==='reviewed'&&<Processed catalogue={catalogue} user={user} receipt={receipt}/>}
      {mode==='returned'&&<Processed catalogue={catalogue} user={user} returned receipt={receipt?.action==='return'?receipt:null}/>}
    </>}
    {error&&<button className="mdo-back" type="button" onClick={()=>{setError('');setReload(x=>x+1);}}><RotateCcw size={16}/> Retry</button>}
  </div>;
}
