/** MDD-only read-only review tabs. Facts and workflow order come from Laravel. */
import {Check,Clock3,Download,FileText,History,MessageSquareText,Paperclip} from 'lucide-react';
import {reviewDate} from '../../utils/hodApprovalPresentation.js';
import {snapshotReviewDefinitions} from '../../services/hodReviewService.jsx';
import {mddApprovalTimeline,mddDocuments,mddRemarks} from '../../utils/mddReviewPresentation.js';
import {displayApprovalActor} from '../../utils/approvalActorPresentation.js';

function displayedDate(value){return value?reviewDate(value):'';}

export function MddRemarksDocuments({record,actorProfiles={}}){
  const {submissionRemark,indicators,comments}=mddRemarks(record);
  const documents=mddDocuments(record);
  const indicatorsById=new Map(snapshotReviewDefinitions(record).indicators.map(item=>[String(item.id),item.label]));
  return <section className="mdo-surface mdo-review-pane mdd-remarks-tab" aria-label="Remarks and supporting documents">
    <div className="mdd-section-title"><MessageSquareText size={17}/><h2>Remarks &amp; Documents</h2></div>
    {submissionRemark&&<div className="mdd-origin-note"><strong>Submission Remarks</strong><p>{submissionRemark}</p></div>}
    {indicators.length>0&&<div className="mdd-indicator-remarks">
      <h3>Indicator Remarks</h3>
      <div className="mdd-indicator-remarks-list">{indicators.map(([id,value])=><div key={id}><small>{indicatorsById.get(String(id))||`Indicator #${id}`}</small><p>{value}</p></div>)}</div>
    </div>}
    <div className="mdd-section-subtitle"><h3>Previous Review Comments</h3><span>{comments.length} comments</span></div>
    {comments.length?<div className="mdd-comment-list">{comments.map((item,i)=><article className="mdd-comment" key={`comment-${i}`}>
      <div className="mdd-comment-symbol"><MessageSquareText size={16}/></div>
      <div className="mdd-comment-body">
        <div className="mdd-comment-heading"><strong>{displayApprovalActor(item,actorProfiles).name || item.action}</strong><span className="mdd-comment-tag">{item.action}</span></div>
        <div className="mdd-comment-meta">{[displayApprovalActor(item,actorProfiles).role,item.date?displayedDate(item.date):''].filter(Boolean).join(' · ')}</div>
        <p>{item.comment}</p>
      </div>
    </article>)}</div>:<p className="mdd-empty-inline">No previous review comments were returned.</p>}
    <div className="mdd-section-subtitle mdd-attachment-heading"><h3><Paperclip size={16}/> Supporting Documents</h3><span>{documents.length} documents</span></div>
    {documents.length?<div className="mdd-attachments-wrap"><table className="mdd-docs-table"><thead><tr><th>Document</th><th>Uploaded By</th><th>Uploaded On</th><th>Action</th></tr></thead><tbody>
      {documents.map(file=><tr key={file.key}><td><div className="mdd-file-name"><FileText size={16}/><span>{file.name}</span></div></td>
        <td>{displayApprovalActor({actorId:file.uploaderId,actor:file.uploader},actorProfiles).name||'Not provided'}</td><td>{displayedDate(file.date)||'—'}</td>
        <td>{file.url?<a href={file.url} target="_blank" rel="noopener noreferrer" className="mdd-file-open" aria-label={`Open ${file.name}`}><Download size={15}/> View</a>:<span className="mdd-file-unavailable">—</span>}</td></tr>)}
    </tbody></table></div>:<p className="mdd-empty-inline">No supporting documents were included in the submission response.</p>}
  </section>;
}

export function MddApprovalHistory({record,actorProfiles={}}){
  const timeline=mddApprovalTimeline(record);
  return <section className="mdo-surface mdo-review-pane mdd-timeline-tab" aria-label="Approval workflow timeline">
    <div className="mdd-section-title"><History size={18}/><h2>Approval Workflow</h2>
      {timeline.currentRole&&<span className="mdd-current-role">Current: {timeline.currentRole}</span>}
    </div>
    {timeline.steps.length?<ol className="mdd-workflow-line">{timeline.steps.map(item=><li className={`mdd-workflow-item ${item.status}`} key={item.id}>
      <span className="mdd-workflow-marker" aria-hidden="true">{item.status==='completed'?<Check size={14}/>:<Clock3 size={13}/>}</span>
      <div className="mdd-workflow-content">
        <div className="mdd-workflow-head"><strong>{item.label}</strong><span className={`mdd-step-status ${item.status}`}>{item.status==='completed'?'Completed':item.status==='current'?'Current':'Upcoming'}</span></div>
        <div className="mdd-workflow-role">{(()=>{
          // A pending/upcoming step has no actor yet: say it is awaiting action
          // instead of showing a "name unavailable" placeholder.
          const actor=displayApprovalActor(item,actorProfiles);
          const name=/^Name unavailable/i.test(actor.name||'')?'':actor.name;
          const parts=[item.role,name,actor.role].filter((part,index,items)=>part && items.indexOf(part)===index);
          if(!name&&item.status!=='completed')parts.push('Awaiting action');
          return parts.join(' · ');
        })()}</div>
        {item.action&&<div className="mdd-workflow-action">{item.action}</div>}
        {item.date&&<time className="mdd-workflow-date">{displayedDate(item.date)}</time>}
      </div>
    </li>)}</ol>:<p className="mdd-empty-inline">No approval workflow is available for this submission.</p>}
    {timeline.missingWorkflow&&<p className="mdd-workflow-limited">Only recorded actions and the current step are shown.</p>}
  </section>;
}
