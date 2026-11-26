import ObjectiveCard from '../../components/insights/ObjectiveCard.jsx';
import PerformanceSummary from '../../components/insights/BudgetPerformance.jsx';
/** VIWANDA MDD — compact government UI matching the approved MDO layout.
 * Source (institution/logo OR Ministry department) -> datasets -> one submission.
 * Approval and publication are separate Laravel-controlled actions. No mock data.
 */
import {useEffect,useState} from 'react';
import {useLocation,useNavigate,useOutletContext,useParams} from 'react-router-dom';
import {AlertCircle,ArrowLeft,Eye,History,Landmark,ListChecks,Network,RotateCcw,Search,ShieldCheck} from 'lucide-react';
import {MuBadge,MuCard,MuDate,MuHeader,MuKpi,MuRing,MuSelect,MuSource,MuTabs} from '../../components/modern/ModernUI.jsx';
import {cleanPeriod,sourceIdentity} from '../../utils/sourceIdentity.js';
import Swal from 'sweetalert2';
import {usePageSize} from '../../components/common/usePageSize.js';
import RowActionsMenu from '../../components/common/RowActionsMenu.jsx';
import {showPortalToast} from '../../utils/portalAlerts.js';
import {apiError} from '../../API/resourceHelpers.js';
import {darDate} from '../../utils/submissionApprovalActions.js';
import {snapshotReviewDefinitions} from '../../services/hodReviewService.jsx';
import {reviewValueIssues} from '../../utils/hodReviewRules.js';
import {reviewDate} from '../../utils/hodApprovalPresentation.js';
import {getMddCatalogue,getMddSubmission,sendMddDecision} from '../../services/mddApprovalService.jsx';
import {mddGroup,mddOwnHistory,mddInQueue} from '../../utils/mddApprovalRules.js';
import {MddApprovalHistory,MddRemarksDocuments} from './MddReviewSections.jsx';
import {mddDetailInfo} from '../../utils/mddReviewPresentation.js';
import {approvalActorIds,displayApprovalActor} from '../../utils/approvalActorPresentation.js';
import {lookupApprovalActorProfiles,embeddedProfilesOf} from '../../services/approvalActorLookupService.jsx';
import {TableLoader} from '../../components/common/LoadingState.jsx';
import {datasetName,institutionLogo,ministryOf,ministryDepartments,ministryReturned,sourceOf,sourceOfDataset} from '../../utils/mdoReviewRules.js';
import {NATIONAL_EMBLEM} from '../../utils/institutionLogo.js';
import {OrgGrid,OrgPanel,ReviewOrgCard} from '../../components/orgCards/OrgCards.jsx';
import {orgHeading,orgInitials,orgMatches,queueYears,sameFinancialYear} from '../../utils/orgCards.js';
import {
  Breadcrumb,Filters,flattenRecord,fmt,
  InstitutionMark,officialName,periodRank,ReviewSummary,SmallPager,sortedRows,
  SubmittedTable
} from '../MDO/MdoWorkspace.jsx';
import '../MDO/MdoWorkspace.css';
import './MddWorkspace.css';

const cleanError=error=>{
  const server=error?.response?.data??error?.cause?.response?.data;
  if(typeof server?.message==='string'&&server.message.trim())return server.message.trim();
  if(server?.errors&&typeof server.errors==='object'){
    const first=Object.values(server.errors).flat().find(item=>typeof item==='string');
    if(first)return first;
  }
  const value=apiError(error)||error?.message||'Could not complete this action. Please try again.';
  return String(value).replace(/^.*?\|\s*HTTP\s*\d+\s*\|\s*/i,'').replace(/Approval \w+ rejected \(HTTP \d+.*?\):\s*/i,'');
};
const notifyError=error=>Swal.fire({icon:'error',title:'Action not completed',text:cleanError(error),confirmButtonText:'Close',confirmButtonColor:'#174f9b'});
const statusClass=label=>String(label).replace(/\W/g,'').toLowerCase();
const printed=value=>value!==undefined&&value!==null&&String(value).trim()?String(value):'Not provided';
const sameOwner=(sourceType,sourceId,ministry,owner)=>sourceType==='department'?
  owner.departmentId===Number(sourceId)&&owner.institutionId===Number(ministry?.id):
  owner.institutionId===Number(sourceId)&&!owner.departmentId;
const entityName=(catalogue,type,id)=>{
  const ministry=ministryOf(catalogue.institutions,catalogue.user);
  return type==='department'?ministryDepartments(catalogue.departments,ministry).find(r=>Number(r.id)===Number(id)):
    catalogue.institutions.find(r=>Number(r.id)===Number(id));
};
const relevantRows=(catalogue,type,id)=>{
  const ministry=ministryOf(catalogue.institutions,catalogue.user);
  return catalogue.submissions.filter(row=>sameOwner(type,id,ministry,sourceOf(row)));
};
const sourceUrl=(type,id)=>`/dashboard/mdd/source/${type}/${id}`;

/** Director Review Queue — same approved card UI as MDO (27 Oct 2026). */
function SourceSelection({catalogue,onRefresh}){
  const navigate=useNavigate();
  const [sourceType,setSourceType]=useState('institution');
  const [search,setSearch]=useState(''),[year,setYear]=useState('all');
  const ministry=ministryOf(catalogue.institutions,catalogue.user);
  const departments=ministryDepartments(catalogue.departments,ministry);
  const sources=sourceType==='department'?departments:catalogue.institutions;
  // Show EVERY reporting source from Laravel, even when it has no pending submission.
  const visible=sources.filter(item=>orgMatches(item,search));
  const years=queueYears(catalogue.submissions);
  const parentLabel=ministry?officialName(ministry):'';
  return <div className="mdo-page"><Breadcrumb segments={[{text:'Submissions'},{text:'Director Review Queue'}]}/>
    <OrgPanel title={`${sourceType==='institution'?'Institutions':'Departments & Units'} · ${year==='all'?'All Years':`FY ${year}`}`}
      type={sourceType} onType={next=>{setSourceType(next);setSearch('');}}
      counts={{institution:catalogue.institutions.length,department:departments.length}}
      search={search} onSearch={setSearch} years={years} year={year} onYear={setYear} allYears onRefresh={onRefresh}
      legend={[['under','Has pending review'],['excellence','All reviewed']]}>
      <OrgGrid empty={!visible.length?'No reporting sources match your search.':''}>
        {visible.map(org=>{
          const rows=relevantRows(catalogue,sourceType,org.id).filter(row=>year==='all'||sameFinancialYear(row.financialYear,year));
          const definitions=catalogue.datasets.filter(ds=>sameOwner(sourceType,org.id,ministry,sourceOfDataset(ds)));
          const datasetCount=new Set([...definitions.map(ds=>ds.id),...rows.map(row=>row.dataset_id)].filter(v=>v!==undefined&&v!==null&&v!=='').map(String)).size;
          const pending=rows.filter(row=>mddInQueue(row)).length;
          const department=sourceType==='department';
          const heading=orgHeading(org,{department,parentLabel});
          return <ReviewOrgCard key={`${sourceType}-${org.id}`} logo={department?NATIONAL_EMBLEM:institutionLogo(org)} initials={orgInitials(org)}
            title={heading.title} subtitle={heading.subtitle} datasets={datasetCount} pending={pending}
            onOpen={()=>navigate(sourceUrl(sourceType,org.id))}/>;
        })}
      </OrgGrid>
      {catalogue.notes?.length>0&&<p className="mdd-data-note">Some catalogue records are unavailable. Please contact the administrator if a reporting source is missing.</p>}
    </OrgPanel></div>;
}

function DatasetOverview({catalogue,type,id}){
  const navigate=useNavigate();
  const [search,setSearch]=useState(''),[year,setYear]=useState('all'),[filter,setFilter]=useState('All'),[page,setPage]=useState(1);
  const [perPage,setPerPage]=usePageSize('mdd-source',10);
  const ministry=ministryOf(catalogue.institutions,catalogue.user),entity=entityName(catalogue,type,id);
  const definitions=catalogue.datasets.filter(ds=>sameOwner(type,id,ministry,sourceOfDataset(ds)));
  const submissions=relevantRows(catalogue,type,id);
  const years=[...new Set(submissions.map(r=>r.financialYear).filter(Boolean))].sort().reverse();
  // The institution/department inventory MUST show all configured datasets.
  // A submission is authoritative for its real status. Only a dataset with no
  // submission in the selected year may be shown as "Not Submitted".
  const registry=new Map();
  for(const definition of definitions){
    if(definition.id==null)continue;
    registry.set(String(definition.id),{
      key:String(definition.id),name:datasetName(definition),submissions:[],
    });
  }
  for(const record of submissions){
    if(record.dataset_id==null)continue;
    const key=String(record.dataset_id);
    if(!registry.has(key))registry.set(key,{
      key,name:typeof record.dataset==='string'&&record.dataset?record.dataset:`Dataset ${key}`,submissions:[],
    });
    registry.get(key).submissions.push(record);
  }
  const all=[...registry.values()].map(item=>{
    const matches=sortedRows(item.submissions.filter(row=>year==='all'||row.financialYear===year));
    // Show the pending MDD submission if there is one; otherwise the most
    // recent actual submission, including draft, returned and published.
    const row=matches.find(mddInQueue)??matches[0]??null;
    return {...item,row,status:row?mddGroup(row,catalogue.user):'Not Submitted'};
  });
  const tabs=['All','Pending Review','Published','Returned','Draft','Not Submitted'];
  const matching=all.filter(item=>(filter==='All'||item.status===filter)&&item.name.toLowerCase().includes(search.toLowerCase()));
  const count=status=>all.filter(row=>row.status===status).length;
  const plural=(n,word)=>`${n} ${word}${n===1?'':'s'}`;
  const isDepartment=type==='department';
  const toneOf=status=>status==='Pending Review'?'amber':status==='Returned'?'red':status==='Not Submitted'?'grey':status==='Draft'?'blue':'green';
  return <div className="mdo-page mu-page">
    <Breadcrumb segments={[{text:'Submissions'},{text:'Director Review Queue',to:'/dashboard/mdd/queue'}, {text:entity?.name??'Source'}]}/>
    <MuHeader logo={isDepartment?NATIONAL_EMBLEM:institutionLogo(entity)} initials={orgInitials(entity??{})} title={isDepartment?fmt(entity?.name):officialName(entity??{})}
      subtitle={isDepartment?`Department / Unit · ${ministry?.name??'Ministry institution'}`:[entity?.name!==officialName(entity??{})?entity?.name:'','Institution datasets'].filter(Boolean).join(' · ')}>
      <button type="button" className="mu-btn" onClick={()=>navigate('/dashboard/mdd/queue')}><ArrowLeft size={15}/> Review Queue</button>
      <MuSelect label="Reporting Year" value={year} allLabel="All years" options={years} onChange={v=>{setYear(v);setPage(1);}}/>
    </MuHeader>
    <div className="mu-kpis">
      <MuKpi tone="blue" icon={all.length} title="Datasets" value={plural(all.length,'dataset')} note="configured for this source" arrow={false} onOpen={()=>{setFilter('All');setPage(1);}}/>
      <MuKpi tone="amber" icon={<MuRing percent={all.length?count('Pending Review')/all.length*100:null} color="#e0b400" text={count('Pending Review')}/>} title="Pending Review" value={plural(count('Pending Review'),'submission')} note="awaiting your decision" arrow={false} onOpen={()=>{setFilter('Pending Review');setPage(1);}}/>
      <MuKpi tone="green" icon={<ShieldCheck size={19}/>} title="Published" value={plural(count('Published'),'dataset')} note="latest submission published" arrow={false} onOpen={()=>{setFilter('Published');setPage(1);}}/>
      <MuKpi tone="grey" icon={count('Not Submitted')} title="Not Submitted" value={plural(count('Not Submitted'),'dataset')} note="no submission yet" arrow={false} onOpen={()=>{setFilter('Not Submitted');setPage(1);}}/>
    </div>
    <section className="mu-card mdo-overview">
      <div className="mu-toolbar"><label className="mu-search"><Search size={16}/><input value={search} onChange={e=>{setSearch(e.target.value);setPage(1);}} placeholder="Search datasets or submissions…"/></label></div>
      <MuTabs label="Dataset status" value={filter} onChange={tab=>{setFilter(tab);setPage(1);}} items={tabs.map(tab=>({key:tab,label:tab,count:tab==='All'?all.length:count(tab)}))}/>
      <div className="mu-table-wrap mdd-table-loading-host"><table className="mu-table"><thead><tr><th>#</th><th>Dataset</th><th>Reporting Period</th><th>Submitted On</th><th>Status</th><th aria-label="Actions"/></tr></thead><tbody>
        {matching.slice((page-1)*perPage,page*perPage).map((item,index)=>{
          const record=item.row,info=record?flattenRecord(record):{},detail=record?mddDetailInfo(record,catalogue):{};
          const canReview=mddInQueue(record);
          return <tr key={item.key}><td>{(page-1)*perPage+index+1}</td><td><strong>{fmt(item.name)}</strong></td><td>{record?printed(cleanPeriod(detail.period||info.period)):<span className="mu-muted">—</span>}</td>
            <td>{record?<MuDate value={detail.submittedAt||info.date}/>:<span className="mu-muted">Not submitted</span>}</td>
            <td><MuBadge tone={toneOf(item.status)}>{item.status}</MuBadge></td>
            <td className="mu-actions">{record&&<RowActionsMenu label={`Actions for ${item.name}`}>
              {canReview&&<button type="button" title="Review" onClick={()=>navigate(`/dashboard/mdd/review/${record.id}?mode=review`)}><ListChecks size={17}/></button>}
              <button type="button" title="View" onClick={()=>navigate(`/dashboard/mdd/review/${record.id}?mode=view`)}><Eye size={17}/></button>
              <button type="button" title="Approval History" onClick={()=>navigate(`/dashboard/mdd/review/${record.id}?mode=view`,{state:{tab:'history'}})}><History size={17}/></button>
            </RowActionsMenu>}</td></tr>;
        })}
        {!matching.length&&<tr><td colSpan="6" className="mu-empty">No datasets match the selected filters.</td></tr>}
      </tbody></table></div>
      <SmallPager length={matching.length} page={page} setPage={setPage} perPage={perPage} onPerPage={setPerPage}/>
    </section></div>;
}

function SubmissionReview({catalogue,user,id}){
  const navigate=useNavigate(),location=useLocation();
  const [record,setRecord]=useState(null),[loading,setLoading]=useState(true);
  const [tab,setTab]=useState(location.state?.tab==='history'?'history':'data');
  const reviewMode=new URLSearchParams(location.search).get('mode')==='review';
  const [comments,setComments]=useState(''),[returning,setReturning]=useState(false),[deadline,setDeadline]=useState(''),[busy,setBusy]=useState(false);
  useEffect(()=>{
    let alive=true;setLoading(true);setRecord(null);
    getMddSubmission(id).then(value=>{if(alive)setRecord(value);}).catch(error=>{if(alive)void notifyError(error);}).finally(()=>{if(alive)setLoading(false);});
    return()=>{alive=false;};
  },[id]);
  const [actorProfiles,setActorProfiles]=useState({});
  useEffect(()=>{
    let alive=true;
    // Names come from the submission's embedded actor snapshots first; GET /users
    // is admin-only and a denied lookup is silent (no permission popup on load).
    const embedded=embeddedProfilesOf(record);
    setActorProfiles(embedded);
    const ids=approvalActorIds(record).filter(id=>!embedded[id]);
    if(ids.length){
      lookupApprovalActorProfiles(ids).then(profiles=>{
        if(alive)setActorProfiles({...profiles,...embedded});
      }).catch(()=>{});
    }
    return()=>{alive=false;};
  },[record]);
  const owner=record?sourceOf(record):{},info=record?flattenRecord(record):{};
  const detail=record?mddDetailInfo(record,catalogue):{};
  const submittedEvent=record?.history?.find(item=>['submit','submitted','resubmit','resubmitted'].includes(String(item.action??item.eventType??item.event_type??'').toLowerCase()));
  const submitterId=record?.raw?.submittedById??record?.raw?.submitted_by_id??
    record?.raw?.submittedBy?.id??record?.raw?.submitted_by?.id??
    submittedEvent?.actor_id??submittedEvent?.actorId;
  const submitterName=displayApprovalActor({actorId:submitterId,actor:detail.officer||info.officer},actorProfiles).name;
  const type=owner.departmentId?'department':'institution',sourceId=owner.departmentId??owner.institutionId;
  const back=sourceId?sourceUrl(type,sourceId):'/dashboard/mdd/queue';
  const rank=record?periodRank(record):null;
  const previous=record&&rank!==null?catalogue.submissions.filter(candidate=>candidate.id!==record.id&&candidate.dataset_id===record.dataset_id&&periodRank(candidate)!==null&&periodRank(candidate)<rank).sort((a,b)=>periodRank(b)-periodRank(a))[0]:null;
  const snapshot=record?snapshotReviewDefinitions(record):null;
  const issues=snapshot?reviewValueIssues(snapshot.indicators,snapshot.dimensions,record.values,record.dimensionValues):[];
  const issuesText=issues.slice(0,4).map(issue=>`${issue.indicator}: ${issue.reason}`).join('; ');
  const finalStatus=['published','returned','rejected','cancelled','canceled'].includes(String(record?.status??'').toLowerCase());
  const showDecision=reviewMode&&!finalStatus;
  async function perform(action){
    if(busy||!record)return;
    if(action==='return'&&(!comments.trim()||!deadline||deadline<darDate())){
      await notifyError(new Error('Enter a correction reason and a valid deadline (today or later).'));return;
    }
    const label=action==='publish'?'Publish':'Return for Correction';
    const answer=await Swal.fire({icon:'question',title:`${label} this submission?`,
      text:action==='return'?'The submission will go back to its Data Officer for correction.':'The submission will be published to the portal.',
      showCancelButton:true,confirmButtonText:label,confirmButtonColor:action==='return'?'#ce2a32':action==='publish'?'#16824c':'#0b57be'});
    if(!answer.isConfirmed)return;
    setBusy(true);
    try{
      const receipt=await sendMddDecision({id:record.id,user,action,comments,correctionDeadline:action==='return'?deadline:undefined});
      if(receipt.partial||(action==='publish'&&receipt.published!==true)||(action==='return'&&receipt.status!=='returned')){
        await Swal.fire({icon:'warning',title:action==='return'?'Return not confirmed':'Publication not completed',text:receipt.message||'The final status is not confirmed yet. Please refresh the submission.',confirmButtonText:'Close'});
        try{setRecord(await getMddSubmission(id));}catch{/* Keep the last verified record; never claim publication. */}
        return;
      }
      const destination=action==='return'?'returned':'published';
      navigate(`/dashboard/mdd/${destination}`,{state:{mddReceipt:receipt}});
    }catch(error){await notifyError(error);}finally{setBusy(false);}
  }
  return <div className="mdo-page mu-page"><Breadcrumb segments={[{text:'Submissions'},{text:'Director Review Queue',to:'/dashboard/mdd/queue'},
      {text:detail.department||detail.institution||owner.departmentName||owner.institutionName||'Source',to:back},{text:detail.dataset||info.dataset||`Submission ${id}`}]}/>
    {loading&&<div className="mdo-surface mdd-detail-loading-host"><TableLoader active label="Loading submission…"/></div>}
    {!loading&&record&&<>
      {(()=>{const src=sourceIdentity(record,catalogue);const group=mddGroup(record,user);return <MuHeader logo={src.logo} initials={src.initials} title={printed(detail.dataset||info.dataset)}
        chips={[{label:'Source',value:src.code},{label:'Period',value:cleanPeriod(detail.period||info.period)},{label:'Submitted',value:detail.submittedAt?reviewDate(detail.submittedAt):''},{label:'By',value:submitterName},{label:'Method',value:detail.method||info.method},{label:'ID',value:`#${record.id}`},{label:'Updated',value:detail.updatedAt?reviewDate(detail.updatedAt):''}]}>
        <MuBadge tone={group==='Pending Review'?'amber':group==='Returned'?'red':group==='Published'?'green':'blue'}>{group}</MuBadge></MuHeader>;})()}
      <ObjectiveCard record={record}/>
      <PerformanceSummary record={record}/>
      <MuTabs role="tablist" label="Review tabs" value={tab} onChange={setTab} items={[{key:'data',label:'1 · Submitted Data'},{key:'remarks',label:'2 · Remarks & Documents'},{key:'history',label:'3 · Approval History',count:(record.history??[]).length||undefined}]}/>
      <div className={`mdo-review-columns ${showDecision?'':'mdd-view-mode'}`}>
        <div>{tab==='data'?<SubmittedTable record={record} prior={previous}/>:tab==='remarks'?<MddRemarksDocuments record={record} actorProfiles={actorProfiles}/>:<MddApprovalHistory record={record} actorProfiles={actorProfiles}/>}</div>
        {showDecision&&<aside className="mdo-surface mdo-decision mu-decision">
          <div className="mu-card-head"><span className="mu-dot" aria-hidden="true"/><h2>Director Decision</h2></div>
          <ReviewSummary record={record}/>
          <>
            <label htmlFor="mdd-comments">{returning?'Correction reason (required)':'Comments (optional)'}</label>
            <textarea id="mdd-comments" maxLength={10000} rows={5} value={comments} onChange={e=>setComments(e.target.value)} placeholder={returning?'Explain the correction required…':'Add your decision comments…'}/>
            <small className="mdo-charcount">{comments.length}/10000</small>
          </>
          {returning&&<label className="mdo-deadline">Correction deadline (required)<input type="date" min={darDate()} value={deadline} onChange={e=>setDeadline(e.target.value)}/></label>}
          {issues.length>0&&<div className="mdo-attention"><AlertCircle size={16}/><div><strong>Review attention</strong><p>{issuesText}</p></div></div>}
          <div className="mdo-decision-buttons">
            {!returning&&<button type="button" className="mdd-publish" disabled={busy} onClick={()=>perform('publish')}><ShieldCheck size={16}/> Publish</button>}
            {!returning&&<button type="button" className="mdo-return" disabled={busy} onClick={()=>setReturning(true)}><RotateCcw size={16}/> Return for Correction</button>}
            {returning&&<button type="button" className="mdo-return" disabled={busy} onClick={()=>perform('return')}><RotateCcw size={16}/> Return for Correction</button>}
          </div>
          {returning&&<button type="button" className="mdo-cancel-return" onClick={()=>setReturning(false)} disabled={busy}>Cancel</button>}
        </aside>}
      </div>
      <button type="button" className="mu-btn mdo-back" onClick={()=>navigate(back)}><ArrowLeft size={15}/> Back to Datasets</button>
    </>}
  </div>;
}

function ProcessedList({catalogue,user,mode}){
  const navigate=useNavigate();
  const [query,setQuery]=useState(''),[page,setPage]=useState(1),[year,setYear]=useState('all');
  const [perPage,setPerPage]=usePageSize('mdd-processed',10);
  const [type,setType]=useState('all'),[ownerId,setOwnerId]=useState('all');
  const ministry=ministryOf(catalogue.institutions,catalogue.user);
  const sources=type==='department'?ministryDepartments(catalogue.departments,ministry):catalogue.institutions;
  // Without history from the server (original backend): office-level lists from status (16 Nov 2026).
  const officeLevel=catalogue.historyAvailable===false&&mode!=='published';
  const statusOfRow=row=>String(row.status??row.raw?.status??'').toLowerCase();
  const all=catalogue.submissions.filter(row=>{
    if(officeLevel)return mode==='returned'?ministryReturned(row):mode==='reviewed'?['approved','published'].includes(statusOfRow(row))&&(String(row.raw?.workflowStage??row.raw?.workflow_stage??'').toLowerCase()==='ministry'||statusOfRow(row)==='published'):false;
    const actions=mddOwnHistory(row,user);
    if(mode==='reviewed')return actions.some(item=>['approve','approved'].includes(String(item.action??item.eventType??item.event_type??'').toLowerCase()));
    if(mode==='returned')return actions.some(item=>['return','returned'].includes(String(item.action??item.eventType??item.event_type??'').toLowerCase()));
    if(mode==='published')return String(row.status??'').toLowerCase()==='published';
    return false;
  });
  const years=[...new Set(all.map(row=>row.financialYear).filter(Boolean))].sort().reverse();
  const rows=sortedRows(all).filter(row=>{
    const source=sourceOf(row),info=flattenRecord(row);
    const ownerMatches=type==='all'||(ownerId==='all'?type==='department'?Boolean(source.departmentId):!source.departmentId:
      sameOwner(type,ownerId,ministry,source));
    return ownerMatches&&(year==='all'||row.financialYear===year)&&[row.id,info.dataset,info.institution,source.departmentName].join(' ').toLowerCase().includes(query.toLowerCase());
  });
  const heading={reviewed:'Approved Submissions',published:'Published Submissions',returned:'Returned Submissions'}[mode];
  const inYear=all.filter(row=>year==='all'||row.financialYear===year);
  const instCount=new Set(inYear.filter(r=>!sourceOf(r).departmentId).map(r=>sourceOf(r).institutionId)).size;
  const depCount=new Set(inYear.filter(r=>sourceOf(r).departmentId).map(r=>sourceOf(r).departmentId)).size;
  const plural=(n,word)=>`${n} ${word}${n===1?'':'s'}`;
  const tone=mode==='returned'?'red':mode==='published'?'green':'blue';
  const decisionEvent=row=>officeLevel?{createdAt:row.raw?.updatedAt??row.raw?.updated_at??row.raw?.publishedAt??row.raw?.published_at}:mddOwnHistory(row,user).filter(item=>(mode==='returned'?['return','returned']:mode==='reviewed'?['approve','approved']:['publish','published']).includes(String(item.action??item.eventType??item.event_type??'').toLowerCase())).at(-1);
  return <div className="mdo-page mu-page"><Breadcrumb segments={[{text:'Submissions'},{text:heading}]}/>
    <div className="mu-kpis">
      <MuKpi tone={tone} icon={inYear.length} title={heading} value={plural(inYear.length,'submission')} note={year==='all'?'all reporting years':`FY ${year}`} arrow={false} onOpen={()=>{setType('all');setOwnerId('all');}}/>
      <MuKpi tone="blue" icon={<Landmark size={18}/>} title="Institutions" value={plural(instCount,'institution')} note="with submissions in this list" arrow={false} onOpen={()=>{setType('institution');setOwnerId('all');setPage(1);}}/>
      <MuKpi tone="violet" icon={<Network size={18}/>} title="Ministry Departments" value={plural(depCount,'department')} note="with submissions in this list" arrow={false} onOpen={()=>{setType('department');setOwnerId('all');setPage(1);}}/>
      <MuKpi tone="grey" icon={rows.length} title="Shown" value={plural(rows.length,'row')} note="after filters" arrow={false}/>
    </div>
    <MuCard title={heading} count={rows.length} className="mdo-processed">
      {officeLevel&&<div className="alert alert-info small" role="status">Office-level list: the server does not send who took each decision, so this shows every ministry submission with this result (dates are the last update).</div>}
      <div className="mu-toolbar mdd-list-filters">
        <MuSelect label="Source Type" value={type} onChange={v=>{setType(v);setOwnerId('all');setPage(1);}} options={[{value:'all',label:'All Sources'},{value:'institution',label:'Institutions'},{value:'department',label:'Ministry Departments'}]}/>
        {type!=='all'&&<MuSelect label={type==='department'?'Department':'Institution'} value={ownerId} allLabel="All" options={sources.map(item=>({value:String(item.id),label:item.name}))} onChange={v=>{setOwnerId(v);setPage(1);}}/>}
        <MuSelect label="Year" value={year} allLabel="All years" options={years} onChange={v=>{setYear(v);setPage(1);}}/>
        <label className="mu-search"><Search size={16}/><input value={query} onChange={e=>{setQuery(e.target.value);setPage(1);}} placeholder="Search submissions…"/></label>
      </div>
      <div className="mu-table-wrap mdd-table-loading-host"><table className="mu-table"><thead><tr><th>#</th><th>Institution / Department</th><th>Dataset</th><th>Reporting Period</th><th>Status</th><th>Decision Date</th><th aria-label="Actions"/></tr></thead><tbody>
        {rows.slice((page-1)*perPage,page*perPage).map((record,i)=>{
          const info=flattenRecord(record),detail=mddDetailInfo(record,catalogue),src=sourceIdentity(record,catalogue),event=decisionEvent(record);
          return <tr key={record.id}><td>{(page-1)*perPage+i+1}</td><td><MuSource logo={src.logo} initials={src.initials} code={src.code} name={src.name}/></td>
            <td><strong>{printed(detail.dataset||info.dataset)}</strong><small>Submission SUB-{record.id}</small></td><td>{printed(cleanPeriod(detail.period||info.period))}</td>
            <td><MuBadge tone={tone==='blue'?'blue':tone}>{mode==='returned'?'Returned':mode==='published'?'Published':'Approved'}</MuBadge></td>
            <td><MuDate value={event?.createdAt??event?.created_at??event?.performedAt??event?.performed_at??(mode==='published'?record.raw?.publishedAt??record.raw?.published_at:undefined)}/></td>
            <td className="mu-actions"><RowActionsMenu label={`Actions for SUB-${record.id}`}><button type="button" title="View" onClick={()=>navigate(`/dashboard/mdd/review/${record.id}?mode=view`)}><Eye size={17}/></button>
              <button type="button" title="Approval History" onClick={()=>navigate(`/dashboard/mdd/review/${record.id}?mode=view`,{state:{tab:'history'}})}><History size={17}/></button></RowActionsMenu></td></tr>;
        })}
        {!rows.length&&<tr><td colSpan="7" className="mu-empty">No {heading.toLowerCase()} were found for these filters.</td></tr>}
      </tbody></table></div>
      <SmallPager length={rows.length} page={page} setPage={setPage} perPage={perPage} onPerPage={setPerPage}/>
    </MuCard></div>;
}

export default function MddWorkspace({mode='queue'}){
  const {user}=useOutletContext(),{sourceType,sourceId,id}=useParams(),location=useLocation(),navigate=useNavigate();
  const [catalogue,setCatalogue]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[reload,setReload]=useState(0);
  useEffect(()=>{
    let alive=true;setLoading(true);
    // Approval history only for Reviewed / Returned; Published is read from status (16 Nov 2026).
    getMddCatalogue({withHistory:['reviewed','returned'].includes(mode)}).then(data=>{if(alive){setCatalogue({...data,user});setError('');}})
      .catch(e=>{if(alive){setError(cleanError(e));void notifyError(e);}})
      .finally(()=>{if(alive)setLoading(false);});
    return()=>{alive=false;};
  },[user?.id,reload,mode]);
  useEffect(()=>{
    const receipt=location.state?.mddReceipt;
    if(!receipt)return;
    const label=receipt.action==='publish'?'Submission published':'Submission returned';
    void showPortalToast({type:'success',title:label,message:`Submission #${receipt.id} updated successfully.`});
    navigate(location.pathname,{replace:true,state:null});
  },[location.state?.mddReceipt?.id,location.pathname,navigate]);
  return <div className="mdo-workspace mdd-workspace">
    {/* 30 Oct 2026: a submission opens from its own GET /submissions/{id}; the list only adds names. */}
    {mode==='review'&&<SubmissionReview catalogue={catalogue??{institutions:[],departments:[],datasets:[],submissions:[],notes:[],user}} user={user} id={id}/>}
    {loading&&!catalogue&&mode!=='review'&&<div className="mdo-page"><section className="mdo-surface mdo-overview">
      <div className="mdo-table-wrap mdd-table-loading-host" aria-busy="true">
        <table className="mdo-table"><thead><tr><th>#</th><th>Dataset</th><th>Reporting Period</th><th>Status</th><th>Action</th></tr></thead>
          <tbody><tr><td colSpan={5} className="mdd-loader-space">&nbsp;</td></tr></tbody></table>
        <TableLoader active label="Loading Director submissions…"/>
      </div>
    </section></div>}
    {error&&!catalogue&&<div className="mdo-page"><button type="button" className="mdo-back" onClick={()=>{setError('');setReload(n=>n+1);}}><RotateCcw size={16}/> Retry</button></div>}
    {catalogue&&<>
      {mode==='queue'&&<SourceSelection catalogue={catalogue} onRefresh={()=>setReload(n=>n+1)}/>}
      {mode==='source'&&<DatasetOverview catalogue={catalogue} type={sourceType} id={sourceId}/>}
      {['reviewed','published','returned'].includes(mode)&&<ProcessedList catalogue={catalogue} user={user} mode={mode}/>}
    </>}
  </div>;
}
