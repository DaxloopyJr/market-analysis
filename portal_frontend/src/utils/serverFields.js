/**
 * Laravel response read-only presentation helpers.
 * These helpers do not create submission state, permissions or workflow facts.
 * They preserve meaningful zero/false values and resolve documented camelCase,
 * snake_case and nested response relations before showing a missing-value label.
 */
import {normalizeYear} from './reportingTime.js';

export const hasValue = value => value !== null && value !== undefined &&
  !(typeof value === 'string' && value.trim() === '');

export const firstValue = (...values) => values.find(hasValue);

export function atPath(source, path) {
  if (!source || typeof source !== 'object') return undefined;
  return String(path).split('.').reduce((part, key) => part?.[key], source);
}

export function readField(source, ...paths) {
  for (const path of paths.flat()) {
    const value = atPath(source, path);
    if (hasValue(value)) return value;
  }
  return undefined;
}

export function personName(person) {
  if (typeof person === 'string') return person.trim();
  if (!person || typeof person !== 'object') return '';
  const named = readField(person, 'fullName', 'full_name', 'displayName',
    'display_name', 'name', 'username');
  if (hasValue(named) && typeof named !== 'object') return String(named).trim();
  const first = readField(person, 'firstName', 'first_name');
  const middle = readField(person, 'middleName', 'middle_name');
  const last = readField(person, 'lastName', 'last_name', 'surname');
  return [first, middle, last].filter(hasValue).map(String).join(' ').trim();
}

export function recordName(record) {
  if (typeof record === 'string' || typeof record === 'number') return String(record);
  if (!record || typeof record !== 'object') return '';
  const value = readField(record,'datasetName','dataset_name','dataName','data_name',
    'nameEn','name_en','institutionName','institution_name','departmentName',
    'department_name','fullName','full_name','name','label','title','code');
  return hasValue(value) && typeof value !== 'object' ? String(value) : '';
}

export function formattedValue(value, missing = 'Not provided') {
  if (!hasValue(value)) return missing;
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'object') return recordName(value) || missing;
  return String(value);
}

export function findById(rows = [], id) {
  if (!hasValue(id) || !Array.isArray(rows)) return null;
  return rows.find(row => String(row?.id) === String(id)) ?? null;
}

/**
 * Presentation only. Use the exact submitted instance + related dataset
 * catalogue where available, and never infer the submitter, date, or method.
 */
export function submissionFacts(record, catalogue = {}) {
  const root = record?.raw ?? record ?? {};
  const raw = root?.data?.submission ?? root?.submission ?? root;
  const calendar = readField(raw, 'reportingCalendar','reporting_calendar') ?? {};
  const period = readField(raw, 'reportingPeriod','reporting_period',
    'reportingCalendar.reportingPeriod','reporting_calendar.reporting_period') ?? {};
  const datasetId = firstValue(record?.dataset_id, readField(raw,'datasetId','dataset_id',
    'dataset.id','reportingCalendar.datasetId','reporting_calendar.dataset_id'));
  const linkedDataset = findById(catalogue.datasets, datasetId) ?? {};
  const dataset = readField(raw,'dataset','datasetDefinition','dataset_definition',
    'reportingCalendar.dataset','reporting_calendar.dataset') ?? linkedDataset;
  const institutionId = firstValue(readField(raw,'institutionId','institution_id',
    'institution.id','dataset.institutionId','dataset.institution_id',
    'reportingCalendar.dataset.institutionId'),readField(linkedDataset,'institutionId','institution_id'));
  const departmentId = firstValue(readField(raw,'departmentId','department_id',
    'department.id','dataset.departmentId','dataset.department_id',
    'reportingCalendar.dataset.departmentId'),readField(linkedDataset,'departmentId','department_id'));
  const institution = readField(raw,'institution','dataset.institution',
    'reportingCalendar.dataset.institution') ?? readField(linkedDataset,'institution') ?? findById(catalogue.institutions,institutionId);
  const department = readField(raw,'department','dataset.department',
    'reportingCalendar.dataset.department') ?? readField(linkedDataset,'department') ?? findById(catalogue.departments,departmentId);
  const eventRows = record?.history ?? readField(raw,'history','approvalHistory','approval_history') ?? [];
  const submittedEvent = Array.isArray(eventRows) ? eventRows.find(event =>
    ['submit','submitted','resubmit','resubmitted'].includes(String(readField(event,'action','eventType','event_type')??'').toLowerCase())) : null;
  const submittedPerson = firstValue(readField(raw,'submittedBy','submitted_by','submittedUser',
      'submitted_user','submitter','submittingOfficer','submitting_officer','createdBy',
      'created_by','officer','responsibleOfficer','responsible_officer'),
    readField(submittedEvent,'actor','user','performedBy','performed_by'),
    submittedEvent && (submittedEvent.name || submittedEvent.fullName || submittedEvent.roles) ? submittedEvent : undefined);
  const who = firstValue(personName(submittedPerson),readField(raw,
    'submittedByName','submitted_by_name','officerName','officer_name',
    'submittedByFullName','submitted_by_full_name'));
  const submitterRole = submittedPerson && typeof submittedPerson === 'object'
    ? (Array.isArray(submittedPerson.roles) ? submittedPerson.roles.map(role => typeof role === 'string' ? role : (role?.name ?? role?.code ?? '')).filter(Boolean).join(' / ') : '')
      || readField(submittedPerson,'role.name','roleName','role_name','position','jobTitle','job_title') || '' : '';
  const startYear = firstValue(readField(raw,'startYear','start_year'),
    readField(calendar,'startYear','start_year'),readField(period,'startYear','start_year'));
  // The year written in periodLabel ("2026/2027 Q2") is what Laravel snapshots always carry.
  const year = firstValue(record?.financialYear,readField(raw,'financialYear','financial_year'),
    normalizeYear(readField(raw,'periodLabel','period_label')) || undefined,
    readField(calendar,'financialYear','financial_year'),
    Number.isInteger(Number(startYear)) && String(startYear).length===4 ? `${startYear}/${Number(startYear)+1}` : undefined);
  const frequency = firstValue(readField(raw,'frequency'),readField(calendar,'frequency'),
    readField(period,'frequency'),record?.frequency);
  const periodNumber = firstValue(readField(raw,'periodNumber','period_number'),
    readField(calendar,'periodNumber','period_number'),readField(period,'periodNumber','period_number'));
  const periodName = firstValue(record?.period,readField(raw,'periodLabel','period_label',
    'reportingPeriodLabel','reporting_period_label'),recordName(period),
    String(frequency??'').toLowerCase()==='quarterly'&&periodNumber ? `Q${periodNumber}` : undefined);
  const periodLabel = [year,periodName].filter(hasValue).map(String).join(' ').trim();
  // A configured dataset collection method is NOT necessarily the method
  // actually used to submit a particular report, so do not invent one.
  const method = firstValue(readField(raw,'submissionMethod','submission_method','method',
    'dataMethod','data_method','entryMethod','entry_method'),
    readField(calendar,'submissionMethod','submission_method'));
  return {
    dataset: firstValue(recordName(dataset),record?.dataset,readField(raw,'datasetName','dataset_name'),recordName(linkedDataset)) ?? '',
    institution: firstValue(recordName(institution),readField(raw,'institutionName','institution_name'),
      recordName(findById(catalogue.institutions,institutionId))) ?? '',
    department: firstValue(recordName(department),readField(raw,'departmentName','department_name'),
      recordName(findById(catalogue.departments,departmentId))) ?? '',
    institutionId,departmentId,datasetId,
    submittedBy: who ?? '', officer: who ?? '',
    submittedByRole: String(submitterRole || ''),
    submittedByDisplay: [who,submitterRole].filter(Boolean).join(' · '),
    submittedByPerson: submittedPerson && typeof submittedPerson === 'object' ? submittedPerson : null,
    submittedById: firstValue(readField(raw,'submittedById','submitted_by_id','submittedUserId','submitted_user_id','submittedBy.id','submitted_by.id'),
      readField(submittedEvent,'userId','user_id','actorId','actor_id','actor.id','user.id')) ?? null,
    method: hasValue(method) && typeof method!=='object' ? String(method) : recordName(method),
    financialYear:year ?? '',period:periodLabel,
    submittedAt: firstValue(readField(raw,'submittedAt','submitted_at','submittedOn',
      'submitted_on','submissionDate','submission_date'),
      readField(submittedEvent,'createdAt','created_at','performedAt','performed_at','date','timestamp')) ?? '',
    updatedAt: firstValue(readField(raw,'updatedAt','updated_at','lastUpdated','last_updated'),record?.updated_at) ?? '',
  };
}
