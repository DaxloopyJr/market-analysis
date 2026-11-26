import ObjectiveCard from '../../components/insights/ObjectiveCard.jsx';
import PerformanceSummary from '../../components/insights/BudgetPerformance.jsx';
import {periodFacts,ytdForIndicator} from '../../utils/yearToDate.js';
import {useYearToDate} from '../../services/yearToDateService.jsx';
import TargetPerformance from '../../components/insights/TargetPerformance.jsx';
import {annualTargetContextOf,directionOf,isNumericIndicator} from '../../utils/annualTargets.js';
import {useErrorDialogState} from '../../utils/userFacingErrors.js';
/**
 * APPROVED AO UI / UX REFERENCE #2 (23 Oct 2026):
 * Pending Approval list LEFT, read-only Review Submission panel RIGHT.
 * AO never edits indicator values. Only Approve or Return are enabled if
 * Laravel currentStep.action, assigned reviewer, and allowedActions permit.
 * Sidebar: Submissions -> Pending Approval / Reviewed.
 * API flow: getAoList + GET submission, POST /approve or POST /return.
 */
import {useEffect,useMemo,useState} from 'react';
import {useLocation,useNavigate,useOutletContext,useParams} from 'react-router-dom';
import {AlertCircle,ArrowLeft,Check,CheckCircle2,ChevronDown,Clock3,Eye,History,Layers3,
  RefreshCcw,RotateCcw,Search,ShieldCheck,X} from 'lucide-react';
import Swal from 'sweetalert2';
import {getAoList,completeAoAction} from '../../services/aoApprovalService';
import {canAoApprove,canAoReturn} from '../../utils/aoApprovalRules';
import {snapshotReviewDefinitions} from '../../services/hodReviewService';
import {categoriesForIndicator,indicatorNeedsVerification,validateHodIndicator} from '../../utils/hodReviewRules';
import {reviewActorName,reviewDate} from '../../utils/hodApprovalPresentation';
import {darDate} from '../../utils/submissionApprovalActions';
import {submissionFacts} from '../../utils/serverFields.js';
import {approvalActorIds,displayApprovalActor} from '../../utils/approvalActorPresentation.js';
import {lookupApprovalActorProfiles,embeddedProfilesOf} from '../../services/approvalActorLookupService.jsx';
import {showPortalToast} from '../../utils/portalAlerts';
import {apiError} from '../../API/resourceHelpers';
import RowActionsMenu from '../../components/common/RowActionsMenu';
import PageSizeSelect from '../../components/common/PageSizeSelect.jsx';
import {usePageSize} from '../../components/common/usePageSize.js';
import {TableLoader} from '../../components/common/LoadingState.jsx';
import {MddRemarksDocuments,MddApprovalHistory} from '../MDD/MddReviewSections.jsx';
import '../MDD/MddWorkspace.css';
import './AoApprovals.css';
import {MuBadge,MuCard,MuDate,MuHeader,MuKpi,MuRing,MuSelect,MuSource,MuTabs} from '../../components/modern/ModernUI.jsx';
import {ReviewSummary,approvalSteps} from '../MDO/MdoWorkspace.jsx';
import {nextStepText,ownOrg,plural,statusBadge} from '../../utils/roleDisplay.js';
import {cleanPeriod} from '../../utils/sourceIdentity.js';
import {reportingTime,reportingTimeOptions} from '../../utils/reportingTime.js';

const first=(...xs)=>xs.find(x=>x!==undefined&&x!==null&&x!=='');
const shown=value=>value===undefined||value===null||value===''?'—':String(value);
const rawValue=(raw,...keys)=>first(...keys.map(k=>raw?.[k]));
function detailsFor(record){
  const facts=submissionFacts(record);
  return {
    dataset:facts.dataset,
    institution:facts.institution,
    submittedBy:facts.submittedByDisplay || facts.submittedBy,
    submittedById:facts.submittedById,
    submittedByPerson:facts.submittedByPerson,
    period:facts.period,
    method:facts.method,
    submittedAt:facts.submittedAt,
    updatedAt:facts.updatedAt,
  };
}
const formattedError=e=>apiError(e)||e?.message||'The request could not be completed.';

export default function AoApprovals({reviewed=false,review=false}) {
  const {user}=useOutletContext();
  const navigate=useNavigate();const location=useLocation();const {id:routeId}=useParams();
  const [items,setItems]=useState([]),[selectedId,setSelectedId]=useState(null);
  const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false);
  const [error,setError]=useErrorDialogState(''),[query,setQuery]=useState('');
  const [year,setYear]=useState('all'),[period,setPeriod]=useState('all'),[dataset,setDataset]=useState('all');
  const [page,setPage]=useState(1);
  const [pageSize,setPageSize]=usePageSize(reviewed?'ao-reviewed':'ao-pending',10);
  const [comments,setComments]=useState(''),[correctionDeadline,setCorrectionDeadline]=useState('');
  const [returnMode,setReturnMode]=useState(Boolean(location.state?.returnMode)),[reload,setReload]=useState(0);
  const [detailTab,setDetailTab]=useState(location.state?.tab==='remarks'?'remarks':'data'),[historyId,setHistoryId]=useState(null);
  const [actorProfiles,setActorProfiles]=useState({});
  const [openedAt]=useState(()=>Date.now());
  const receipt=location.state?.aoReceipt;
  useEffect(()=>{
    if(!receipt?.id)return;
    // Successful POST receipt is rendered on the destination page, after navigation.
    void showPortalToast({type:'success',title:receipt.action==='approve'?'Submission approved':'Submission returned',
      message:`Submission #${receipt.id} updated.`});
    navigate(location.pathname,{replace:true,state:null});
  },[receipt?.id,location.pathname,navigate]);
  useEffect(()=>{
    let active=true;setLoading(true);setError('');
    // Review page: the record may be pending (actionable) or already in Reviewed (read-only).
    const load=review?Promise.all([getAoList(user),getAoList(user,{reviewed:true}).catch(()=>[])])
      .then(([pending,done])=>[...pending,...done.filter(item=>!pending.some(p=>String(p.id)===String(item.id)))]):getAoList(user,{reviewed});
    load.then(result=>{
      if(!active)return;
      setItems(result);
      if(review){setSelectedId(routeId);return;}
      // Notification / dashboard links open the full review page.
      const notified=location.state?.focusSubmissionId;
      if(notified && result.some(item=>String(item.id)===String(notified))){navigate(`/dashboard/ao/review/${notified}`,{replace:true});return;}
      setSelectedId(old=>result.some(item=>String(item.id)===String(old))?old:(result[0]?.id??null));
    }).catch(err=>{if(active){setError(formattedError(err));setItems([]);setSelectedId(null);}})
      .finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;};
  },[user?.id,reviewed,review,routeId,reload]);
  useEffect(()=>{
    let active=true;
    const ids=[...new Set(items.flatMap(item=>[...approvalActorIds(item),submissionFacts(item).submittedById]).filter(Boolean).map(String))];
    // Embedded Laravel names and roles work without GET /users; lookup fills legacy ID-only records.
    const embedded=embeddedProfilesOf(items);
    setActorProfiles(embedded);
    const missing=ids.filter(id=>!embedded[id]);
    if(missing.length)lookupApprovalActorProfiles(missing).then(rows=>{if(active)setActorProfiles({...rows,...embedded});})
      .catch(()=>{/* Preserve embedded identity if the user directory is restricted. */});
    return()=>{active=false;};
  },[items]);
  const shownSubmitter=item=>{
    const facts=submissionFacts(item);
    const actor=displayApprovalActor({actorId:facts.submittedById,actor:facts.submittedByPerson||facts.submittedBy},actorProfiles);
    return [actor.name,actor.role].filter(Boolean).join(' · ') || '—';
  };
  const selected=items.find(item=>String(item.id)===String(selectedId))??null;
  const selectedFacts=useMemo(()=>selected?periodFacts(selected):null,[selected]);
  const ytdState=useYearToDate(selectedFacts);
  const years=reportingTimeOptions(items).years;
  const periods=reportingTimeOptions(items,{year,frequency:'all'}).periods;
  const datasets=[...new Set(items.map(item=>detailsFor(item).dataset).filter(Boolean))];
  const filtered=useMemo(()=>items.filter(item=>{
    const info=detailsFor(item);
    const text=[item.id,info.dataset,info.submittedBy,info.period,item.status].join(' ').toLowerCase();
    return (!query.trim()||text.includes(query.trim().toLowerCase())) &&
      (year==='all'||reportingTime(item).year===year) && (period==='all'||reportingTime(item).period===period) &&
      (dataset==='all'||info.dataset===dataset);
  }),[items,query,year,period,dataset]);
  const pages=Math.max(1,Math.ceil(filtered.length/pageSize));
  const visible=filtered.slice((Math.min(page,pages)-1)*pageSize,Math.min(page,pages)*pageSize);
  const info=selected?detailsFor(selected):{};
  const snapshot=selected?snapshotReviewDefinitions(selected):{indicators:[],dimensions:[]};
  const canApprove=selected&&!reviewed&&canAoApprove(selected,user);
  const canReturn=canApprove&&canAoReturn(selected,user);
  const resetForm=()=>{setComments('');setCorrectionDeadline('');setReturnMode(false);};
  const resetFilter=()=>{setQuery('');setYear('all');setPeriod('all');setDataset('all');setPage(1);};
  async function performAction(action) {
    if(busy||!selected)return;
    if(!canAoApprove(selected,user)){
      setError('This submission is no longer assigned to your Account Officer step. Refresh the list.');return;
    }
    if(action==='return'){
      if(!canAoReturn(selected,user)){setError('Return is not allowed by this Approval Circle step.');return;}
      if(!comments.trim()){setError('Return requires a comment explaining the correction.');return;}
      if(!correctionDeadline||correctionDeadline<darDate()){
        setError('Choose a correction deadline of today or later (Tanzania time).');return;
      }
    }
    const ask=await Swal.fire({
      title:action==='approve'?'Approve Submission?':'Return for Correction?',
      text:action==='approve'?'The submission moves to the next approval step.':
        'The submission goes back to its Data Officer with your comment and correction deadline.',
      icon:action==='return'?'warning':'question',showCancelButton:true,
      confirmButtonText:action==='approve'?'Approve Submission':'Return for Correction',
      confirmButtonColor:action==='approve'?'#087f57':'#d63f46',
    });
    if(!ask.isConfirmed)return;
    setBusy(true);setError('');
    try {
      const result=await completeAoAction({id:selected.id,user,action,comments,correctionDeadline:action==='return'?correctionDeadline:undefined});
      const receipt={id:selected.id,action,revision:result.after.revision};
      // A successful POST moves assignment away from this AO; use Reviewed page.
      navigate('/dashboard/ao/reviewed',{state:{aoReceipt:receipt}});
    } catch(err) {
      setError(formattedError(err));
      void showPortalToast({type:'error',title:action==='approve'?'Approval failed':'Return failed',message:formattedError(err)});
    } finally {setBusy(false);}
  }
  const own=ownOrg(user);
  const plainShow=value=>loading?'…':value;
  const openReview=(item,state)=>navigate(`/dashboard/ao/review/${item.id}`,state?{state}:undefined);
  const datasetTotal=new Set(items.map(item=>detailsFor(item).dataset).filter(Boolean)).size;
  const waitDays=(()=>{const times=items.map(item=>Date.parse(detailsFor(item).submittedAt||'')).filter(Number.isFinite);if(!times.length)return null;return Math.max(0,Math.floor((openedAt-Math.min(...times))/864e5));})();
  const ready=items.filter(item=>canAoApprove(item,user)).length;
  const returnedCount=items.filter(item=>/return/i.test(String(item.history?.at(-1)?.action??item.status??''))).length;

  if(review){
    if(loading)return <div className="ao-workspace mu-page"><section className="mu-card vw-local-table-loading-host" style={{minHeight:220}}><TableLoader active label="Loading submission…"/></section></div>;
    if(!selected)return <div className="ao-workspace mu-page"><section className="mu-card"><p className="mu-empty">This submission is not in your Pending Approval or Reviewed list. </p>
      <button type="button" className="mu-btn" onClick={()=>navigate('/dashboard/ao/pending')}><ArrowLeft size={15}/> Pending Approval</button></section></div>;
    const badge=statusBadge(selected.status);
    const nextStep=nextStepText(null,approvalSteps(selected));
    return <div className="ao-workspace mu-page">
      <MuHeader logo={own.logo} initials={own.initials} title={shown(info.dataset)}
        chips={[{label:'Submission',value:`SUB-${selected.id}`},{label:'Period',value:cleanPeriod(info.period)},{label:'Source',value:info.institution&&info.institution!==own.name?info.institution:own.code},{label:'Submitted by',value:shownSubmitter(selected)},{label:'Submitted',value:info.submittedAt?reviewDate(info.submittedAt):''},{label:'Method',value:info.method}]}>
        <MuBadge tone={badge.tone}>{badge.label}</MuBadge>
        <button type="button" className="mu-btn" onClick={()=>navigate(canApprove?'/dashboard/ao/pending':'/dashboard/ao/reviewed')}><ArrowLeft size={15}/> Back</button>
      </MuHeader>
      <ObjectiveCard record={selected}/>
      <PerformanceSummary record={selected}/>
      <section className="mu-card hod-summary-card"><ReviewSummary record={selected}/></section>
      <MuTabs role="tablist" label="Submission review sections" value={detailTab==='history'?'data':detailTab} onChange={setDetailTab} items={[{key:'data',label:'Indicator Values',count:snapshot.indicators.length},{key:'remarks',label:'Remarks & Documents'}]}/>
      <div className="mu-review-grid">
        <div>
          {detailTab==='remarks'?<div className="mdd-workspace ao-shared-details"><MddRemarksDocuments record={selected} actorProfiles={actorProfiles}/></div>:<>
          <div className="ao-card ao-values"><div className="ao-values-title"><h3>Indicator Values & Breakdown Review</h3><span className="ao-readonly">Read only</span></div><p>Review totals, breakdowns and remarks before approving or returning.</p>
            {snapshot.indicators.length===0?<div className="ao-placeholder">Indicator names are not available for this submission.</div>:snapshot.indicators.map((indicator,idx)=>{
              const indicatorId=String(indicator.id);
              const categories=categoriesForIndicator(snapshot.dimensions,indicator.id,selected.dimensionValues);
              const validation=indicatorNeedsVerification(snapshot.dimensions,indicator.id,selected.dimensionValues)?validateHodIndicator(indicator,categories,selected.values,selected.dimensionValues):[];
              return <details key={indicatorId} className="ao-indicator" open={idx===0}>
                <summary><b>{shown(indicator.label)}</b><small>{shown(indicator.description||indicator.type)}</small><ChevronDown size={15}/></summary>
                <div className="ao-indicator-body"><div className="ao-total"><span>Total Value</span><strong>{shown(selected.values[indicatorId])}</strong></div>
                  {isNumericIndicator(indicator)&&(()=>{const y=ytdForIndicator({indicator,current:selected.values[indicatorId],ytdState,facts:selectedFacts});return <TargetPerformance actual={selected.values[indicatorId]} ytd={y.ytd} basis={y.basis} target={annualTargetContextOf(selected)?.byIndicator?.[indicatorId]} yearLabel={annualTargetContextOf(selected)?.yearLabel} legacy={annualTargetContextOf(selected)?.historicalSnapshotAvailable===false} direction={directionOf(indicator)}/>;})()}
                  <div className="ao-break-grid">{categories.map(category=>{const validationRow=validation.find(row=>String(row.id)===String(category.id));return <section key={category.id} className="ao-break"><h4>{category.name}</h4>
                    {category.options.map(option=><div className="ao-break-row" key={option.id}><span>{option.label}</span><b>{shown(selected.dimensionValues[`${indicatorId}:${category.id}:${option.id}`])}</b></div>)}
                    {validationRow?.enforced&&<div className={`ao-break-total ${validationRow.valid?'ok':'bad'}`}>{validationRow.valid?<CheckCircle2 size={14}/>:<AlertCircle size={14}/>}
                      Total {shown(validationRow.total)} / {shown(selected.values[indicatorId])}</div>}
                  </section>})}</div>
                  {selected.remarks[indicatorId]&&<div className="ao-indicator-remark"><b>Officer Remarks</b><p>{selected.remarks[indicatorId]}</p></div>}
                </div></details>;
            })}
          </div>
          </>}
        </div>
        <aside>
          <section className="mu-card mu-decision"><div className="mu-card-head"><span className="mu-dot" aria-hidden="true"/><h2>Your Decision</h2></div>
            <div className="dl-mini"><span>Next step</span><b>{shown(nextStep)}</b><span>Status</span><b>{badge.label}</b></div>
            {!canApprove?<p className="mu-muted small mb-0">Read-only. This submission is not at your Accounting Officer step.</p>:<>
              <label htmlFor="ao-comments">Your Comments {returnMode?'(required)':'(optional)'}</label>
              <textarea id="ao-comments" maxLength={10000} value={comments} onChange={e=>{setComments(e.target.value);setError('');}} placeholder="Enter your review comments…" rows={4} disabled={busy}/>
              <small className="mu-counter">{comments.length}/10000</small>
              {returnMode&&<label htmlFor="ao-deadline">Correction Deadline <span className="ao-required">*</span>
                <input id="ao-deadline" type="date" min={darDate()} value={correctionDeadline} onChange={e=>{setCorrectionDeadline(e.target.value);setError('');}} disabled={busy}/>
              </label>}
              <div className="mu-decision-buttons">
                <button type="button" className="mu-plain" onClick={()=>{resetForm();setError('');}} disabled={busy}>Cancel</button>
                <button type="button" className="mu-back-btn" disabled={busy||!canReturn} onClick={()=>returnMode?performAction('return'):(setReturnMode(true),setError(''))}><RotateCcw size={15}/> Return for Correction</button>
                <button type="button" className="mu-approve" onClick={()=>performAction('approve')} disabled={busy||returnMode}><Check size={15}/> {busy?'Processing…':'Approve'}</button>
              </div>
            </>}
            <div className="mu-foot"><ShieldCheck size={14}/> Approval routing is enforced.</div>
          </section>
          <section className="mu-card"><div className="mu-card-head"><span className="mu-dot" aria-hidden="true"/><h2>Approval History</h2></div>
            <div className="mdd-workspace ao-shared-details"><MddApprovalHistory record={selected} actorProfiles={actorProfiles}/></div></section>
        </aside>
      </div>
    </div>;
  }

  return <div className="ao-workspace mu-page">
    <MuHeader logo={own.logo} initials={own.initials} title={reviewed?'Reviewed Submissions':'Pending Approval'} subtitle={own.name}>
      <MuSelect label="Reporting Year" value={year} allLabel="All years" options={years} onChange={v=>{setYear(v);setPeriod('all');setPage(1);}}/>
      <MuSelect label="Reporting Period" value={period} allLabel="All periods" options={periods} onChange={v=>{setPeriod(v);setPage(1);}}/>
      <MuSelect label="Dataset" value={dataset} allLabel="All datasets" options={datasets} onChange={v=>{setDataset(v);setPage(1);}}/>
      <button type="button" className="mu-btn" onClick={resetFilter}>Reset</button>
      <button className="mu-btn" onClick={()=>setReload(n=>n+1)} type="button" aria-label="Refresh approvals" title="Refresh"><RefreshCcw size={15}/></button>
    </MuHeader>
    <div className="mu-kpis">
      {reviewed?<>
        <MuKpi tone="blue" icon={<History size={19}/>} title="Acted on by you" value={plainShow(plural(items.length,'submission'))} note="approved or returned" arrow={false}/>
        <MuKpi tone="green" icon={<CheckCircle2 size={20}/>} title="Approved / Forwarded" value={plainShow(plural(items.length-returnedCount,'submission'))} note="sent to the next level" arrow={false}/>
        <MuKpi tone="orange" icon={<RotateCcw size={19}/>} title="Returned" value={plainShow(plural(returnedCount,'submission'))} note="sent back for correction" arrow={false}/>
        <MuKpi tone="indigo" icon={<Layers3 size={19}/>} title="Datasets" value={plainShow(plural(datasetTotal,'dataset'))} note="in this list" arrow={false}/>
      </>:<>
        <MuKpi tone="blue" icon={<MuRing percent={items.length?100:null} color="#0b5bd3" text={plainShow(items.length)}/>} title="Pending" value={plainShow(plural(items.length,'submission'))} note="awaiting your decision" arrow={false}/>
        <MuKpi tone="indigo" icon={<Layers3 size={19}/>} title="Datasets" value={plainShow(plural(datasetTotal,'dataset'))} note="in this list" arrow={false}/>
        <MuKpi tone="amber" icon={<Clock3 size={19}/>} title="Oldest waiting" value={plainShow(waitDays===null?'—':plural(waitDays,'day'))} note="since submission" arrow={false}/>
        <MuKpi tone="green" icon={<CheckCircle2 size={20}/>} title="Ready for approval" value={plainShow(plural(ready,'submission'))} note="assigned to your step" arrow={false}/>
      </>}
    </div>
    <MuCard title={reviewed?'Your approval decisions':'Submissions awaiting approval'} count={loading?'…':filtered.length}>
      <div className="mu-toolbar"><label className="mu-search"><Search size={16}/><input type="search" aria-label="Search submissions" value={query} onChange={e=>{setQuery(e.target.value);setPage(1);}} placeholder="Search submission, dataset or officer…"/></label></div>
      <div className="mu-table-wrap vw-local-table-loading-host" aria-busy={loading}>
        <table className="mu-table"><thead><tr><th>#</th><th>Reporting Source</th><th>Dataset</th><th>Reporting Period</th><th>{reviewed?'Action Date':'Submitted'}</th><th>Submitted by</th><th>Status</th><th aria-label="Actions"/></tr></thead><tbody>
          {loading&&<tr><td colSpan={8} style={{height:130}}>&nbsp;</td></tr>}
          {!loading&&!filtered.length&&<tr><td colSpan={8} className="mu-empty">No {reviewed?'reviewed submissions':'submissions awaiting your approval'} were found.</td></tr>}
          {!loading&&visible.map((item,i)=>{const row=detailsFor(item);const source=row.institution||item.raw?.dataset?.reportingSource?.name||item.raw?.dataset?.institution?.name;const mine=!source||source===own.name;const badge=statusBadge(item.status);
            return <tr key={item.id}>
              <td>{(Math.min(page,pages)-1)*pageSize+i+1}</td>
              <td><MuSource logo={own.logo} initials={own.initials} code={mine?own.code:source} name={mine?own.name:source}/></td>
              <td><strong>{shown(row.dataset)}</strong><small>SUB-{item.id}</small></td><td>{shown(reportingTime(item).period||cleanPeriod(row.period))}</td>
              <td><MuDate value={reviewed?(item.history?.at(-1)?.created_at??item.history?.at(-1)?.createdAt??row.updatedAt):row.submittedAt}/></td>
              <td>{(()=>{const [person,...role]=shownSubmitter(item).split(' · ');return <>{person}{role.length>0&&<small>{role.join(' · ')}</small>}</>;})()}</td>
              <td><MuBadge tone={badge.tone}>{badge.label}</MuBadge></td>
              <td className="mu-actions"><RowActionsMenu label={`Actions for submission SUB-${item.id}`}>
                {!reviewed && <button type="button" title="Review & Approve" aria-label="Review & Approve" disabled={!canAoApprove(item,user)} onClick={()=>openReview(item)}><Check size={16}/></button>}
                <button type="button" title="View Submission" aria-label="View Submission" onClick={()=>openReview(item)}><Eye size={16}/></button>
                {!reviewed && <button type="button" title="Return for Correction" aria-label="Return for Correction" disabled={!canAoReturn(item,user)} onClick={()=>openReview(item,{returnMode:true})}><RotateCcw size={16}/></button>}
                {reviewed && <button type="button" title="View Approval History" aria-label="View Approval History" onClick={()=>setHistoryId(item.id)}><History size={16}/></button>}
              </RowActionsMenu></td>
            </tr>;})}
        </tbody></table>
        <TableLoader active={loading} label={reviewed?'Loading reviewed submissions…':'Loading pending approvals…'}/>
      </div>
      <div className="mu-table-foot"><span>Showing {filtered.length?(Math.min(page,pages)-1)*pageSize+1:0} to {Math.min(Math.min(page,pages)*pageSize,filtered.length)} of {filtered.length} entries</span>
        <span className="vw-table-footer-tools"><PageSizeSelect value={pageSize} onChange={v=>{setPageSize(v);setPage(1);}}/>
        {pages>1&&<div className="mu-pager"><button disabled={page<=1} onClick={()=>setPage(x=>Math.max(1,x-1))} type="button" aria-label="Previous page">‹</button><span>{Math.min(page,pages)} / {pages}</span>
          <button disabled={page>=pages} onClick={()=>setPage(x=>Math.min(pages,x+1))} type="button" aria-label="Next page">›</button></div>}</span></div>
    </MuCard>
    {reviewed&&historyId!==null&&<div className="ao-modal-backdrop" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)setHistoryId(null);}}>
      <section className="ao-history-modal" role="dialog" aria-modal="true" aria-label="Approval History">
        <header><h2>Approval History</h2><button className="ao-icon-btn" type="button" aria-label="Close history" onClick={()=>setHistoryId(null)}><X size={18}/></button></header>
        <div className="mdd-workspace"><MddApprovalHistory record={items.find(item=>String(item.id)===String(historyId))} actorProfiles={actorProfiles}/></div>
      </section>
    </div>}
  </div>;
}
