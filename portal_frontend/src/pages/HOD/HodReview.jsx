import ObjectiveCard from '../../components/insights/ObjectiveCard.jsx';
import PerformanceSummary from '../../components/insights/BudgetPerformance.jsx';
import {periodFacts,ytdForIndicator} from '../../utils/yearToDate.js';
import {useYearToDate} from '../../services/yearToDateService.jsx';
import {hodHasRealChanges} from '../../utils/hodReviewPatch.js';
import TargetPerformance from '../../components/insights/TargetPerformance.jsx';
import {annualTargetContextOf,directionOf,isNumericIndicator} from '../../utils/annualTargets.js';
import {submissionFacts} from '../../utils/serverFields.js';
import {useErrorDialogState} from '../../utils/userFacingErrors.js';
/**
 * HOD submission review: approved two-column reference screen.
 * Indicators are editable when authorized, each dimension category is
 * validated separately, Return requires feedback, Forward follows workflow.
 * HOD saves edits with PATCH /submissions/{id}/values and a mandatory reason.
 * Approval History is exactly three visual stages (Submitted/Current/Next).
 */
import {useCallback,useEffect,useMemo,useState} from 'react';
import {Link,useNavigate,useOutletContext,useParams} from 'react-router-dom';
import {ArrowLeft,ArrowRight,CheckCircle2,ChevronDown,ChevronUp,RotateCcw,Save,ShieldAlert,BarChart3} from 'lucide-react';
import Swal from 'sweetalert2';
import {getHodSubmission,saveHodReview,actOnHodSubmission} from '../../services/hodReviewService';
import {categoriesForIndicator,indicatorNeedsVerification,validateHodIndicator,reviewValueIssues} from '../../utils/hodReviewRules';
import {reviewWorkflow,reviewDate,reviewActorName} from '../../utils/hodApprovalPresentation';
import HodApprovalJourney from './HodApprovalJourney';
import {apiError} from '../../API/resourceHelpers';
import {approvalAccess,darDate} from '../../utils/submissionApprovalActions.js';
import {showPortalToast} from '../../utils/portalAlerts';
import {confirmedHodActionReceipt,recordedReviewActions} from '../../utils/hodReviewActionDisplay';
import './HodReview.css';
import {MuBadge,MuHeader,MuSkeleton,MuTabs} from '../../components/modern/ModernUI.jsx';
import {ReviewSummary,approvalSteps} from '../MDO/MdoWorkspace.jsx';
import {MddRemarksDocuments} from '../MDD/MddReviewSections.jsx';
import '../MDD/MddWorkspace.css';
import {nextStepText,ownOrg,statusBadge} from '../../utils/roleDisplay.js';
import {cleanPeriod} from '../../utils/sourceIdentity.js';
const display=value=>value===null||value===undefined||value===''?'—':String(value);
const entry=(obj,...fields)=>fields.map(key=>obj?.[key]).find(v=>v!==undefined&&v!==null&&v!=='');
function percent(part,total){const p=Number(part),t=Number(total);return part!==''&&part!=null&&Number.isFinite(p)&&t>0?`${((p/t)*100).toFixed(1)}%`:'—';}
function friendlyHodError(error){
  const detail=apiError(error);
  return /correction cannot change the reporting format/i.test(detail)
    ? 'Changes were not saved. This submission cannot be corrected in its current reporting format. Please contact the system administrator.'
    : detail;
}

export default function HodReview({history=false}){
  const {user}=useOutletContext();const {id}=useParams();const navigate=useNavigate();
  const [record,setRecord]=useState(null),[indicators,setIndicators]=useState([]),[dimensions,setDimensions]=useState([]);
  const [values,setValues]=useState({}),[remarks,setRemarks]=useState({}),[dimensionValues,setDimensionValues]=useState({});
  const [comment,setComment]=useState(''),[expanded,setExpanded]=useState({});
  const [loading,setLoading]=useState(true),[working,setWorking]=useState(false);
  const [tab,setTab]=useState('data');
  const [dirty,setDirty]=useState(false),[error,setError]=useErrorDialogState(''),[step,setStep]=useState('');
  const read=useCallback(async()=>{
    const data=await getHodSubmission(id,user,{history});
    setRecord(data.record);setIndicators(data.indicators);setDimensions(data.dimensions);
    setValues({...data.record.values});setRemarks({...data.record.remarks});setDimensionValues({...data.record.dimensionValues});
    setDirty(false);setExpanded(old=>Object.keys(old).length?old:{[String(data.indicators[0]?.id)]:true});
    return data;
  },[id,user,history]);
  useEffect(()=>{let alive=true;setLoading(true);setError('');read().catch(e=>{if(alive)setError(apiError(e));}).finally(()=>{if(alive)setLoading(false);});return()=>{alive=false;};},[read]);
  const ytdFacts=useMemo(()=>record?periodFacts(record):null,[record]);
  const ytdState=useYearToDate(ytdFacts);
  const issues=useMemo(()=>reviewValueIssues(indicators,dimensions,values,dimensionValues),
    [indicators,dimensions,values,dimensionValues]);
  const change=(setter,key,value)=>{setter(previous=>({...previous,[key]:value}));setDirty(true);setError('');};
  // `dirty` only means a field was touched; Laravel PATCH is needed only for REAL value changes.
  const changed=useMemo(()=>dirty&&hodHasRealChanges({original:record,values,remarks,dimensionValues}),[dirty,record,values,remarks,dimensionValues]);
  async function save(){
    if(history||!changed){setDirty(false);return false;}
    if(issues.length){setError(issues.map(issue=>`${issue.indicator}: ${issue.reason}`).join(' | '));return false;}
    if(!comment.trim()){setError('Write a reason for the HOD correction before saving changed values.');return false;}
    setWorking(true);setStep('Saving review changes…');setError('');
    try{const after=await saveHodReview({id,user,values,remarks,dimensionValues,reason:comment});setRecord(after);setDirty(false);
      setStep('Changes saved');showPortalToast({type:'success',title:'Review values saved'});return true;
    }catch(e){setError(friendlyHodError(e));setStep('Save not confirmed');return false;}
    finally{setWorking(false);}
  }
  async function takeAction(action){
    if(history)return;
    const permitted=approvalAccess(record,action);
    if(!permitted.allowed){setError(permitted.reason);return;}
    if(action==='return' && !comment.trim()){setError('Return comment is required. Explain what the officer should correct.');return;}
    if(action==='review'&&issues.length){setError(issues.map(item=>`${item.indicator}: ${item.reason}`).join(' | '));return;}
    if(action==='review' && changed && !comment.trim()){setError('Write a reason for the HOD correction before forwarding changed values.');return;}
    if(action==='return'&&changed){setError('You have unsaved review values. Save or discard edits before returning.');return;}
    const isReturn=action==='return';
    // Return needs a correction deadline as well as the already-entered comment.
    // Backend compares the date in Africa/Dar_es_Salaam (not UTC).
    const decision=await Swal.fire(isReturn?{
      title:'Return for Correction?',
      text:'Choose the correction deadline; the comment above goes to the responsible Data Officer.',
      input:'date',inputLabel:'Correction deadline',
      inputAttributes:{min:darDate(),required:'required'},
      inputValidator:value=>!value?'Correction deadline is required.':value<darDate()?'Choose today or a future date.':undefined,
      icon:'warning',showCancelButton:true,confirmButtonText:'Return for Correction',confirmButtonColor:'#d92f43'
    }:{title:'Review & Forward?',
      text:'This submission will move to the next approver in the configured Approval Circle.',
      icon:'question',showCancelButton:true,confirmButtonText:'Forward Submission',confirmButtonColor:'#0863e2'});
    if(!decision.isConfirmed)return;
    const correctionDeadline=isReturn?decision.value:undefined;
    setWorking(true);setError('');
    try{
      if(changed){setStep('Saving values before review…');const saved=await saveHodReview({id,user,values,remarks,dimensionValues,reason:comment});setRecord(saved);setDirty(false);}
      setStep(isReturn?'Returning submission…':'Reviewing and routing to next approver…');
      const confirmation=await actOnHodSubmission({id,user,action,comment,correctionDeadline});
      // The original toast was fired immediately before navigate('/inbox'),
      // where the route change could dismiss it and the handled submission
      // would disappear from Pending Review. Transfer only the confirmed POST
      // receipt; Review History displays the toast after mounting and shows
      // the action while Laravel history GET catches up.
      const receipt=confirmedHodActionReceipt({id,action,comments:comment,confirmation});
      navigate('/dashboard/hod/history',{state:{hodReviewAction:receipt}});
    }catch(e){setError(friendlyHodError(e));setStep('Approval action not confirmed');}
    finally{setWorking(false);}
  }
  if(loading)return <div className="hod-workspace mu-page"><section className="mu-card"><MuSkeleton kind="list" rows={8} label="Loading submission and approval workflow…"/></section></div>;
  if(!record)return <div className="hod-workspace"><Link to="/dashboard/hod/inbox">← Pending Review</Link><p className="mt-3 text-muted">Submission details could not be loaded. Use Pending Review to try again.</p></div>;
  const raw=record.raw||{};const workflow=reviewWorkflow(record);
  const facts=submissionFacts(record, {institutions:user?.institution?[user.institution]:[]});
  const officer=facts.submittedByDisplay || facts.submittedBy;
  const institution=facts.institution;
  const period=facts.period;
  const method=facts.method;
  const submitted=facts.submittedAt;
  const readonly=history;
  const reviewAllowed=!readonly&&approvalAccess(record,'review').allowed;
  const returnAllowed=!readonly&&approvalAccess(record,'return').allowed;
  const own=ownOrg(user);
  const nextStep=nextStepText(workflow,approvalSteps(record));
  const backTo=history?'/dashboard/hod/history':'/dashboard/hod/inbox';
  const badge=statusBadge(record.status);
  return <div className="hod-workspace mu-page container-fluid px-0">
    <MuHeader logo={own.logo} initials={own.initials} title={display(record.dataset)}
      chips={[{label:'Submission',value:`SUB-${record.id}`},{label:'Period',value:cleanPeriod(period)},{label:'Source',value:institution===own.name?own.code:institution},{label:'Submitted by',value:officer},{label:'Submitted',value:submitted?reviewDate(submitted):''},{label:'Method',value:method}]}>
      <MuBadge tone={badge.tone}>{badge.label}</MuBadge>
      <Link className="mu-btn" to={backTo}><ArrowLeft size={15}/> Back</Link>
    </MuHeader>
    <ObjectiveCard record={record}/>
    <PerformanceSummary record={record}/>
    <section className="mu-card hod-summary-card"><ReviewSummary record={record}/></section>
    <MuTabs role="tablist" label="Review sections" value={tab} onChange={setTab} items={[{key:'data',label:'Indicator Values',count:indicators.length},{key:'remarks',label:'Remarks & Documents'}]}/>
    <div className="mu-review-grid">
      <div className="hod-review-primary">
        {tab==='remarks'&&<div className="mdd-workspace"><MddRemarksDocuments record={record}/></div>}
        {tab==='data'&&<section className="hod-surface"><div className="hod-surface-head"><div><h2><BarChart3 size={18}/> Indicator Values & Breakdown Review</h2><p>Review and edit indicator values and their breakdowns. Ensure all totals match.</p></div><span className={`hod-small-tag ${readonly?'':'good'}`}>{readonly?'Read only':'✎ Values editable'}</span></div>
          {indicators.length===0?<div className="hod-placeholder">No indicators found for this submission.</div>:<div className="hod-indicators">
            {indicators.map((indicator,index)=>{const key=String(indicator.id),opened=Boolean(expanded[key]);
              const categories=categoriesForIndicator(dimensions,indicator.id,dimensionValues);
              const validation=indicatorNeedsVerification(dimensions,indicator.id,dimensionValues)?validateHodIndicator(indicator,categories,values,dimensionValues):[];
              const checked=validation.filter(item=>item.enforced);
              const good=checked.length>0&&checked.every(item=>item.valid);
              return <article className="hod-indicator" key={key}>
                <button type="button" className="hod-indicator-heading" aria-expanded={opened} onClick={()=>setExpanded(old=>({...old,[key]:!old[key]}))}>
                  {opened?<ChevronDown size={17}/>:<ArrowRight size={17}/>}<span className="hod-index">{index+1}</span>
                  <span className="hod-indicator-label"><strong>{indicator.label}</strong><small>{indicator.description||indicator.unit||'Indicator values and breakdowns'}</small></span>
                  <span className="hod-small-tag">{indicator.type==='number'?'Numeric':'Indicator'}</span>
                  {checked.length>0&&<span className={`hod-small-tag ${good?'good':'bad'}`}>{good?'✓ Breakdown totals match':'Totals need correction'}</span>}
                  {opened?<ChevronUp size={16}/>:<ChevronDown size={16}/>}
                </button>
                {opened&&<div className="hod-indicator-body">
                  <div className="hod-total-row"><label htmlFor={`total-${key}`}>Total Value</label><input id={`total-${key}`} className="form-control" type={indicator.type==='number'?'number':'text'} min={indicator.type==='number'?'0':undefined} step={indicator.precision===0?'1':'any'} disabled={working||readonly} value={values[key]??''} aria-invalid={checked.some(item=>!item.valid)} onChange={e=>change(setValues,key,e.target.value)} placeholder="Total"/><span>{display(indicator.unit||'')}</span></div>
                  {isNumericIndicator(indicator)&&(()=>{const y=ytdForIndicator({indicator,current:values[key],ytdState,facts:ytdFacts});return <TargetPerformance actual={values[key]} ytd={y.ytd} basis={y.basis} target={annualTargetContextOf(record)?.byIndicator?.[key]} yearLabel={annualTargetContextOf(record)?.yearLabel} legacy={annualTargetContextOf(record)?.historicalSnapshotAvailable===false} unit={indicator.unit} direction={directionOf(indicator)}/>;})()}
                  {categories.length>0&&<div className="hod-category-grid">{categories.map(category=>{const result=validation.find(item=>item.id===category.id);return <div className="hod-category" key={category.id}>
                    <div className="hod-category-head"><strong>{category.name}</strong><span className={`hod-small-tag ${result?.valid?'good':'bad'}`}>Total {result?.total??'—'} / {values[key]??'—'} {result?.enforced?(result.valid?'Matched':'Mismatch'):''}</span></div>
                    <div className="hod-break-head"><span>Category</span><span>Value</span><span>% of Total</span></div>
                    {category.options.map(option=>{const path=`${key}:${category.id}:${option.id}`;return <label className="hod-break-row" key={path}><span>{option.label}</span><input type="number" min="0" step="1" className="form-control form-control-sm" value={dimensionValues[path]??''} disabled={working||readonly} onChange={e=>change(setDimensionValues,path,e.target.value)}/><span>{percent(dimensionValues[path],values[key])}</span></label>;})}
                    <div className="hod-break-foot"><span>Total ({category.name})</span><strong>{result?.total??'—'}</strong><span>{result?.enforced?(result.valid?'100%':'Mismatch'):'—'}</span></div>
                    {result?.reason&&<div className="hod-field-error" role="alert">{result.reason}</div>}
                  </div>})}</div>}
                  <label className="hod-remarks-label">Indicator Remarks<textarea className="form-control" rows="2" value={remarks[key]??''} disabled={working||readonly} onChange={e=>change(setRemarks,key,e.target.value)} placeholder="Indicator-level remarks…"/></label>
                </div>}
              </article>;})}</div>}
        </section>}
      </div>
      <aside>
        <section className="mu-card mu-decision"><div className="mu-card-head"><span className="mu-dot" aria-hidden="true"/><h2>Your Decision</h2></div>
          <div className="dl-mini"><span>Next step</span><b>{display(nextStep)}</b><span>Status</span><b>{badge.label}</b></div>
          {readonly?<p className="mu-muted small mb-0">Read-only. This submission is in your Reviewed list.</p>:<>
          <label htmlFor="hod-feedback">Comment {changed?'(required for changed values)':'(required when returning)'}</label>
          <textarea id="hod-feedback" rows="4" maxLength={10000} disabled={working} placeholder="Reason for HOD value corrections, or comment when returning…" value={comment} onChange={e=>{setComment(e.target.value);setError('');}}/>
          <small className="mu-counter">{comment.length}/10000</small>
          <p className={`hod-decision-state ${issues.length?'bad':changed?'warn':''}`}>{issues.length>0?`⚠ ${issues.length} dimension categor${issues.length===1?'y needs':'ies need'} correction before saving or forwarding`:changed?'● Unsaved changes — enter correction reason':'✓ Saved values loaded'}</p>
          <div className="mu-decision-buttons"><button className="mu-plain" type="button" disabled={working||!changed||issues.length>0} onClick={save}><Save size={15}/> Save changes</button>
            {returnAllowed&&<button className="mu-back-btn" type="button" disabled={working} onClick={()=>takeAction('return')}><RotateCcw size={15}/> Return for Correction</button>}
            {reviewAllowed&&<button className="mu-go" type="button" disabled={working||issues.length>0} onClick={()=>takeAction('review')}><CheckCircle2 size={15}/> Review & Forward</button>}</div>
          {step&&<p className="mu-muted small mt-2 mb-0" role="status">{step}</p>}
          </>}
          <div className="mu-foot"><ShieldAlert size={14}/> Approval routing is enforced.</div>
        </section>
        <section className="hod-surface hod-side-panel"><div className="hod-surface-head"><h2>Approval History</h2></div>
          <HodApprovalJourney record={record} user={user}/>
          {recordedReviewActions(record).length>0&&<details className="hod-audit-events"><summary>Review Actions ({recordedReviewActions(record).length})</summary>{recordedReviewActions(record).map((event,i)=><p key={event.id??i}>{display(event.action)} · {reviewDate(event.timestamp)}{event.actor?` · ${event.actor}`:''}{event.comments?` — ${event.comments}`:''}</p>)}</details>}
        </section>
      </aside>
    </div>
  </div>;
}
