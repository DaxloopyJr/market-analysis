import {submissionFacts} from './serverFields.js';
import {approvalEventActorId,approvalUploaderId} from './approvalActorPresentation.js';
/**
 * MDD-only presentation of the server's recorded approval workflow.
 * Never invent a completed step, user, date, comment, or document.
 * Draft/save actions are not part of an approval workflow.
 */
const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const first = (...values) => values.find(v => v !== undefined && v !== null && v !== '');
const text = value => typeof value === 'string' ? value.trim() : '';
const role = value => text(value).toUpperCase();
const actorName = value => typeof value === 'string' ? value : text(first(
  object(value).name, object(value).fullName, object(value).full_name,
  object(value).displayName, object(value).username,
));
const eventAction = item => text(first(item.action,item.eventType,item.event_type,item.type)).toLowerCase();
const dateOf = item => first(item.createdAt,item.created_at,item.performedAt,item.performed_at,item.date,item.timestamp,'');
const acceptedActions = new Set(['submit','submitted','resubmit','resubmitted','review','reviewed','approve','approved','return','returned','publish','published']);
const eventRole = item => role(first(
  item.required_role_code,item.requiredRoleCode,item.role_code,item.roleCode,
  item.actorRoleCode,item.actor_role_code,item.role?.code,item.roles?.[0]?.code,item.user?.roles?.[0]?.code,
  item.actor?.roleCode,item.actor?.role_code,item.actor?.role?.code,item.performedByUser?.roles?.[0]?.code,item.performed_by_user?.roles?.[0]?.code,
  item.performedBy?.roleCode,item.performedBy?.role_code,
));
const eventPerson = item => {
  const candidates=[item.actor,item.user,item.reviewer,item.performedByUser,
    item.performed_by_user,item.actorUser,item.actor_user,item.userDetails,
    item.user_details,item.actionBy,item.action_by,item.performedBy,
    item.performed_by,item.by,item];
  // Prefer an embedded named user, not a numeric performedBy/actor ID.
  return candidates.find(person=>actorName(person) && !/^(?:user\s*#?|#)?\d+$/i.test(actorName(person).trim())) ||
    candidates.find(person=>person && typeof person==='object') || {};
};
const eventName = item => actorName(eventPerson(item));
const roleLabels = {IDO:'Institution Data Officer',DDO:'Department Data Officer',HOD:'Head of Department',AO:'Account Officer',MDO:'Ministry Data Officer',MDD:'Ministry Director'};
const roleTitles = {HOD:'Department Review',AO:'Institution Approval',MDO:'Ministry Review',MDD:'Director Decision'};
const actionNames = {submit:'Submission Received',submitted:'Submission Received',resubmit:'Resubmitted',resubmitted:'Resubmitted',review:'Reviewed',reviewed:'Reviewed',approve:'Approved',approved:'Approved',return:'Returned for Correction',returned:'Returned for Correction',publish:'Published',published:'Published'};
const stepRole = item => role(first(item.required_role_code,item.requiredRoleCode,item.role_code,item.roleCode));
const stepAction = item => text(first(item.action,item.required_action,item.requiredAction)).toLowerCase();
const stepSequence = item => first(item.sequence,item.stepSequence,item.step_sequence,item.displayOrder,item.order,null);
const eventSequence = item => first(item.stepSequence,item.step_sequence,item.approvalStepSequence,item.approval_step_sequence,item.step?.sequence,null);
const stepId = item => first(item.id,item.stepId,item.step_id,null);
const eventStepId = item => first(item.stepId,item.step_id,item.approvalStepId,item.approval_step_id,item.step?.id,null);
const sameStep = (entry, step) => {
  if (eventStepId(entry) != null && stepId(step) != null) return String(eventStepId(entry)) === String(stepId(step));
  if (eventSequence(entry) != null && stepSequence(step) != null) return String(eventSequence(entry)) === String(stepSequence(step));
  const r = eventRole(entry);
  const a = eventAction(entry);
  return Boolean(r && r === stepRole(step) &&
    (a === stepAction(step) || a === `${stepAction(step)}ed` || a === `${stepAction(step)}d`));
};
const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
const stableTimeOrder = (a,b) => {
  const da = Date.parse(String(dateOf(a)||'')), db = Date.parse(String(dateOf(b)||''));
  return Number.isFinite(da) && Number.isFinite(db) ? da-db : 0;
};
export function mddApprovalEvents(record) {
  return (Array.isArray(record?.history) ? record.history : [])
    .filter(entry => entry && acceptedActions.has(eventAction(entry)))
    .slice().sort(stableTimeOrder);
}
export function mddRemarks(record) {
  const raw = object(record?.raw);
  const note = first(raw.submissionRemarks,raw.submission_remarks,raw.generalRemarks,raw.general_remarks,
    typeof raw.remarks === 'string' ? raw.remarks : undefined,raw.note,raw.notes);
  const submissionRemark = typeof note === 'string' && note.trim() ? note.trim() : '';
  return {
    submissionRemark,
    indicators: Object.entries(object(record?.remarks)).filter(([,value]) => typeof value==='string' && value.trim()),
    comments: mddApprovalEvents(record).filter(item =>
      text(first(item.comments,item.comment,item.reason,item.feedback)) !== '').map(item=>({
        action: actionNames[eventAction(item)] ?? eventAction(item),
        actor: eventPerson(item), actorId:approvalEventActorId(item), role: eventRole(item),
        date: dateOf(item),
        comment: text(first(item.comments,item.comment,item.reason,item.feedback)),
      })),
  };
}
export function mddDocuments(record) {
  const raw = object(record?.raw);
  const items = first(raw.attachments,raw.documents,raw.supportingDocuments,raw.supporting_documents,raw.files,[]);
  const list = Array.isArray(items) ? items : Array.isArray(items?.data) ? items.data : [];
  return list.map((file,i)=>({
    key: first(file.id,i),
    name: text(first(file.originalName,file.original_name,file.fileName,file.filename,file.name)) || 'Document',
    uploaderId:approvalUploaderId(file),
    uploader: first(actorName(first(file.uploadedBy,file.uploaded_by,file.createdBy,file.created_by)),
      file.uploadedByName,file.uploaded_by_name,file.uploaderName,file.uploader_name,'') ?? '',
    date: first(file.uploadedAt,file.uploaded_at,file.createdAt,file.created_at,file.uploadDate,file.upload_date,''),
    url: safeDocumentUrl(first(file.downloadUrl,file.download_url,file.url,file.path,'')),
  }));
}
export function safeDocumentUrl(value) {
  if(typeof value!=='string') return '';
  const url=value.trim();
  return /^(https?:\/\/|\/(?!\/))/i.test(url)?url:'';
}
export function mddApprovalTimeline(record) {
  const raw = object(record?.raw);
  const circle = object(first(raw.approvalCircle,raw.approval_circle,raw.workflow,raw.workflowVersion,raw.workflow_version,{}));
  const configured = first(circle.steps,raw.approvalSteps,raw.approval_steps,raw.workflowSteps,raw.workflow_steps,[]);
  const steps = (Array.isArray(configured)?configured:[]).slice().sort((a,b)=>Number(stepSequence(a)??0)-Number(stepSequence(b)??0));
  const current = object(first(raw.currentStep,raw.current_step,raw.currentApprovalStep,raw.current_approval_step,{}));
  const currentStepAvailable = Object.keys(current).length>0;
  const isCurrent = step => Boolean(currentStepAvailable && (
    (stepId(step)!=null && stepId(current)!=null && String(stepId(step))===String(stepId(current))) ||
    (stepSequence(step)!=null && stepSequence(current)!=null && String(stepSequence(step))===String(stepSequence(current))) ||
    (stepRole(step) && stepRole(step)===stepRole(current) && stepAction(step)===stepAction(current))
  ));
  const events = mddApprovalEvents(record);
  const status = text(record?.status ?? raw.status).toLowerCase();
  if(status==='draft') return {steps:[],currentRole:'',missingWorkflow:!steps.length};
  const nodes=[];
  const consumed = new Set();
  const submit = events.find(item=>['submit','submitted'].includes(eventAction(item)));
  if(submit) consumed.add(submit);
  const submitAt = first(dateOf(submit??{}),raw.submittedAt,raw.submitted_at,'');
  nodes.push({id:'submitted',label:'Submission Received',role:eventRole(submit??{}) || '',actor:eventName(submit??{}) ? eventPerson(submit??{}) : first(raw.submittedBy,raw.submitted_by,''),
    actorId:approvalEventActorId(submit??{}) || String(first(raw.submittedById,raw.submitted_by_id,'')||''),
    date:submitAt,status:'completed'});
  // Include real review/approval events from an earlier institution circle if
  // the current pinned circle includes only the Ministry steps.
  for(const event of events){
    if(consumed.has(event))continue;
    if(steps.some(step=>sameStep(event,step)))continue;
    nodes.push({id:`event-${nodes.length}`,label:roleTitles[eventRole(event)] || actionNames[eventAction(event)] || 'Recorded Action',
      role:eventRole(event),actor:eventPerson(event),actorId:approvalEventActorId(event),date:dateOf(event),
      action:actionNames[eventAction(event)],status:'completed'});
    consumed.add(event);
  }
  for(const [index,step] of steps.entries()){
    const matched=events.find(item=>!consumed.has(item) && sameStep(item,step));
    if(matched)consumed.add(matched);
    const active=isCurrent(step);
    const isDone=Boolean(matched) || status==='published' || (currentStepAvailable &&
      stepSequence(step)!=null && stepSequence(current)!=null && Number(stepSequence(step))<Number(stepSequence(current)));
    nodes.push({id:`step-${stepId(step)??index}`,label:text(first(step.stepName,step.step_name,step.name,roleTitles[stepRole(step)],roleLabels[stepRole(step)])) || 'Approval Step',
      role:stepRole(step),actor:matched?eventPerson(matched):'',actorId:matched?approvalEventActorId(matched):'',date:matched?dateOf(matched):'',
      action:matched?actionNames[eventAction(matched)]:'',status:active?'current':isDone?'completed':'upcoming'});
  }
  if(currentStepAvailable && !nodes.some(node=>node.status==='current') && status!=='published' && status!=='returned'){
    nodes.push({id:'current',label:text(first(current.stepName,current.step_name,current.name,roleTitles[stepRole(current)],roleLabels[stepRole(current)])) || 'Current Approval Step',
      role:stepRole(current),actor:'',date:'',status:'current'});
  }
  return {steps:nodes,currentRole:stepRole(current),missingWorkflow:!steps.length};
}

/** MDD detail labels only. Resolve known Laravel aliases and their linked
 * dataset/source records. Missing values remain explicit; never fabricate a
 * submitted officer, method, period, name, or timestamp. */
function humanName(value) {
  if (typeof value === 'string') return value.trim();
  const entry = object(value);
  const full = first(entry.name,entry.fullName,entry.full_name,entry.displayName,
    entry.display_name,entry.username);
  if (typeof full === 'string' && full.trim()) return full.trim();
  return [entry.firstName,entry.first_name,entry.middleName,entry.middle_name,
    entry.lastName,entry.last_name].filter(item=>typeof item==='string'&&item.trim()).join(' ').trim();
}
function labelOf(value) {
  if(typeof value==='string' || typeof value==='number') return String(value).trim();
  const item=object(value);
  return text(first(item.datasetName,item.dataset_name,item.dataName,item.data_name,
    item.nameEn,item.name_en,item.label,item.name,item.title,item.description));
}
function matchedId(value) {
  const id=typeof value==='object'&&value!==null?value.id:value;
  return id==null?'':String(id);
}
export function mddDetailInfo(record,catalogue={}) {
  const facts=submissionFacts(record,catalogue);
  const raw=object(record?.raw);
  const calendar=object(first(raw.reportingCalendar,raw.reporting_calendar,{}));
  const period=object(first(raw.reportingPeriod,raw.reporting_period,
    calendar.reportingPeriod,calendar.reporting_period,{}));
  const linkedDataset=(catalogue.datasets??[]).find(item=>matchedId(item.id)===matchedId(record?.dataset_id))??{};
  const dataset=object(first(raw.dataset,calendar.dataset,linkedDataset,{}));
  const institution=object(first(raw.institution,dataset.institution,linkedDataset.institution,{}));
  const department=object(first(raw.department,dataset.department,linkedDataset.department,{}));
  const institutionId=first(raw.institutionId,raw.institution_id,dataset.institutionId,
    dataset.institution_id,linkedDataset.institutionId,linkedDataset.institution_id,institution.id);
  const departmentId=first(raw.departmentId,raw.department_id,dataset.departmentId,
    dataset.department_id,linkedDataset.departmentId,linkedDataset.department_id,department.id);
  const inst=(catalogue.institutions??[]).find(item=>matchedId(item.id)===matchedId(institutionId))??{};
  const dept=(catalogue.departments??[]).find(item=>matchedId(item.id)===matchedId(departmentId))??{};
  const submissionEvent=mddApprovalEvents(record).find(item=>['submit','submitted','resubmit','resubmitted'].includes(eventAction(item)));
  const submittedBy=first(raw.submittedBy,raw.submitted_by,raw.submittedUser,
    raw.submitted_user,raw.submittingOfficer,raw.submitting_officer,raw.officer,
    raw.createdBy,raw.created_by,calendar.submittedBy,calendar.submitted_by);
  const officer=first(humanName(submittedBy),raw.submittedByName,raw.submitted_by_name,
    raw.submittedByFullName,raw.submitted_by_full_name,raw.officerName,
    humanName(first(submissionEvent?.actor,submissionEvent?.user,submissionEvent?.performedBy)))??'';
  const year=first(record?.financialYear,raw.financialYear,raw.financial_year,
    calendar.financialYear,calendar.financial_year);
  const startYear=first(raw.startYear,raw.start_year,calendar.startYear,calendar.start_year,period.startYear);
  const displayYear=year || (Number.isSafeInteger(Number(startYear))&&String(startYear).length===4?
    `${startYear}/${Number(startYear)+1}`:'');
  const periodNumber=first(raw.periodNumber,raw.period_number,calendar.periodNumber,calendar.period_number,period.periodNumber,period.period_number);
  const frequency=text(first(raw.frequency,calendar.frequency,record?.frequency)).toLowerCase();
  const periodText=first(record?.period,labelOf(first(raw.reportingPeriod,raw.reporting_period,
    calendar.reportingPeriod,calendar.reporting_period)),raw.periodLabel,raw.period_label,
    period.label,period.name,frequency==='quarterly'&&periodNumber?`Q${periodNumber}`:'');
  const periodLabel=[displayYear,periodText].filter(Boolean).join(' ').trim();
  const method=first(raw.submissionMethod,raw.submission_method,raw.method,
    raw.dataCollectionMethod,raw.data_collection_method,calendar.submissionMethod);
  return {
    dataset:first(facts.dataset,labelOf(raw.dataset),record?.dataset,labelOf(calendar.dataset),labelOf(linkedDataset))??'',
    institution:first(facts.institution,labelOf(institution),raw.institutionName,raw.institution_name,
      labelOf(inst))??'',
    department:first(facts.department,labelOf(department),raw.departmentName,raw.department_name,
      labelOf(dept))??'',
    officer:facts.officer || (typeof officer==='string'?officer:humanName(officer)),
    method:facts.method || labelOf(method),period:facts.period || periodLabel,
    submittedAt:first(facts.submittedAt,raw.submittedAt,raw.submitted_at,submissionEvent?dateOf(submissionEvent):'',
      raw.submissionDate,raw.submission_date)??'',
    updatedAt:first(facts.updatedAt,raw.updatedAt,raw.updated_at,record?.updated_at)??'',
  };
}
