/**
 * FILE: src/utils/submissionMonitor.js
 * Rules of the admin Submission Monitoring page (10 Nov 2026): who holds a submission, working days at
 * its step, stuck / overdue flags. Pure functions over GET /submissions list rows (tested).
 */
/** Working days at one step before a submission counts as stuck (agreed 10 Nov 2026). */
export const STUCK_WORKING_DAYS = 5;
const MINISTRY_ROLES = new Set(['MDO', 'MDD', 'MOA']);
export const ROLE_NAMES = {IDO: ['Data Officer', 'Afisa Takwimu'], DDO: ['Data Officer', 'Afisa Takwimu'], IHOD: ['IHOD', 'IHOD'], HOD: ['IHOD', 'IHOD'],
  AO: ['Accounting Officer (AO)', 'Afisa Masuuli (AO)'], MDO: ['M&E Officer (MDO)', 'Afisa M&E (MDO)'], MDD: ['M&E Director (MDD)', 'Mkurugenzi M&E (MDD)']};
const DAY = 86_400_000;

const roleCodes = user => (user?.roles ?? []).map(role => String(typeof role === 'string' ? role : role?.code ?? '').toUpperCase());
export const isMinistryAdmin = user => String(user?.role_code ?? '').toUpperCase() === 'MOA' || roleCodes(user).includes('MOA');

const dateOnly = value => { const d = value ? new Date(value) : null; return d && !Number.isNaN(d.getTime()) ? new Date(d.getFullYear(), d.getMonth(), d.getDate()) : null; };

/** Monday–Friday days from `from` to today (the start day itself not counted). */
export function workingDaysSince(from, today = new Date()) {
  const start = dateOnly(from); const end = dateOnly(today);
  if (!start || !end || end <= start) return 0;
  let days = 0;
  for (let t = start.getTime() + DAY; t <= end.getTime(); t += DAY) { const wd = new Date(t).getDay(); if (wd !== 0 && wd !== 6) days += 1; }
  return days;
}
const calendarDays = (from, to) => Math.round((dateOnly(to) - dateOnly(from)) / DAY);

/** One monitor row from a GET /submissions list item (pure, tested). */
export function monitorRow(raw, {datasets = new Map(), institutions = new Map(), people = new Map()} = {}, today = new Date()) {
  const status = String(raw?.status ?? '').toLowerCase();
  const dataset = datasets.get(String(raw?.datasetId ?? raw?.dataset_id)) ?? {};
  const institutionId = String(dataset.institutionId ?? dataset.institution_id ?? '');
  const institution = institutions.get(institutionId) ?? {};
  const history = Array.isArray(raw?.history) ? raw.history : [];
  const lastAction = history.map(h => h.acted_at ?? h.actedAt).filter(Boolean).sort().pop();
  const step = raw?.currentStep ?? raw?.current_step ?? null;
  let stage; let role = '';
  if (status === 'published') stage = 'done';
  else if (status === 'draft') { stage = 'draft'; role = 'IDO'; }
  else if (status === 'returned') { stage = 'returned'; role = 'IDO'; }
  else if (step) { stage = 'review'; role = String(step.required_role_code ?? step.requiredRoleCode ?? '').toUpperCase(); }
  else stage = 'review';
  const since = lastAction ?? raw?.submittedAt ?? raw?.submitted_at ?? raw?.updatedAt ?? raw?.updated_at;
  const days = stage === 'done' ? null : workingDaysSince(since, today);
  // Who holds it: the officer for drafts/returns; everyone with the step's role in the right institution otherwise.
  let holders = [];
  const assigned = step?.assigned_user_id ?? step?.assignedUserId;
  if (stage === 'draft' || stage === 'returned') {
    const officer = people.get(String(dataset.responsibleUserId ?? dataset.responsible_user_id ?? ''));
    if (officer) holders = [officer.name];
  } else if (assigned && people.get(String(assigned))) holders = [people.get(String(assigned)).name];
  else if (role) {
    const ministryId = [...institutions.values()].find(i => String(i.code).toUpperCase() === 'MIT')?.id;
    const where = String(MINISTRY_ROLES.has(role) ? ministryId ?? '' : institutionId);
    holders = [...people.values()].filter(p => p.roles.includes(role) && String(p.institutionId) === where && p.active).map(p => p.name);
  }
  const due = status === 'returned' && raw?.correctionDeadline ? raw.correctionDeadline : raw?.deadline;
  const submittedAt = raw?.submittedAt ?? raw?.submitted_at;
  let deadline = {tone: 'gray', key: 'none', days: 0};
  if (due) {
    if (stage === 'draft' || stage === 'returned') {
      const left = calendarDays(today, due);
      deadline = left < 0 ? {tone: 'red', key: 'overdue', days: -left} : left <= 2 ? {tone: 'amber', key: 'soon', days: left} : {tone: 'green', key: 'ok', days: left};
    } else if (submittedAt) {
      deadline = dateOnly(submittedAt) > dateOnly(due) ? {tone: 'amber', key: 'late', days: calendarDays(due, submittedAt)} : {tone: 'green', key: 'ontime', days: 0};
    }
  }
  return {
    id: raw?.id, reference: raw?.reference || `SUB-${raw?.id}`, status, stage, role, holders, days,
    stuck: stage !== 'done' && days >= STUCK_WORKING_DAYS, late: deadline.key === 'overdue', deadline, due,
    period: raw?.periodLabel ?? raw?.period_label ?? '', periodId: Number(raw?.reportingPeriodId ?? raw?.reporting_period_id) || 0,
    dataset: dataset.datasetName ?? dataset.name ?? `Dataset #${raw?.datasetId ?? '—'}`,
    institutionId, institution: institution.code || institution.name || '—', institutionName: institution.name || '',
  };
}

