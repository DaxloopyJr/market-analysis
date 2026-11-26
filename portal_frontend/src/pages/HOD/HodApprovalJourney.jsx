/** The same three-stage timeline on HOD Inbox AND Review Details. */
import {Check} from 'lucide-react';
import {reviewWorkflow,reviewDate} from '../../utils/hodApprovalPresentation';
export default function HodApprovalJourney({record,user}) {
  const workflow=reviewWorkflow(record||{});
  const next=workflow.next.role||workflow.next.actor||workflow.next.label||'Next approver not yet known';
  const current=workflow.current.role||workflow.current.label||'HOD Review';
  return <ol className="hod-journey" aria-label="Approval history - three stages">
    <li className="done"><span className="hod-journey-dot"><Check size={14}/></span>
      <strong>1. Submitted</strong><small>{reviewDate(workflow.submitted.at)}</small>
      <p>{workflow.submitted.actor||'Data Officer'}</p><div>Submission sent for approval.</div>
    </li>
    <li className="current"><span className="hod-journey-dot">2</span>
      <strong>2. Under Review (Current)</strong><small>{current}</small>
      <p>{workflow.current.actor||user?.name||'Current reviewer'}</p>
      <div>Indicator values and breakdowns under review.</div>
    </li>
    <li className="next"><span className="hod-journey-dot">3</span>
      <strong>3. Next Step</strong><small className="hod-next-reviewer">{next}</small>
      {workflow.next.label&&workflow.next.label!==next&&<p>{workflow.next.label}</p>}
      <div>{workflow.hasNext?'Pending next approval':'Awaiting Approval Circle routing details'}</div>
    </li>
  </ol>;
}
