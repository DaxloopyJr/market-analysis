/**
 * MOA/IA dashboard read model; uses ONLY existing, documented Laravel list routes.
 * No synthetic numbers or fabricated analytics endpoints.
 * API -> /users, /institutions, /departments, /datasets, /submissions,
 *        /approval-circles and (MOA only) optional existing admin monitoring route.
 * For large paginated collections do NOT claim incomplete lists are complete.
 */
import {listUsers} from '../API/users';
import {listInstitutionalAdmins} from '../API/institutionAdmins';
import {listInstitutions} from '../API/institution';
import {normalizeYear,reportingTime} from '../utils/reportingTime.js';
import {listDepartments} from '../API/department';
import {datasetsAPI} from '../API/dataset';
import {cached,fetchAllPages} from './listCache.js';
import {allSubmissionRows} from './submissionReadService.js';
import {listApprovalCircles} from '../API/approvalCircle';
import {listRoles} from '../API/roles';
import {getAdminDashboard} from '../API/dashboard';
import {currentRoleOf} from '../utils/adminSourceResolver.js';
export {makeSourceResolver,datasetIdOf,currentRoleOf} from '../utils/adminSourceResolver.js';

const ROW_CAP = 2000;
const PAGE_CAP = 20;

/** Page 1, then the rest in parallel (services/listCache.js); same {items,total,complete,loaded} shape as before. */
async function fetchPages(request) {
  const result = await fetchAllPages(request, {maxPages: PAGE_CAP, pageParams: (page, size) => ({page, perPage: size, per_page: size})});
  const items = result.items.slice(0, ROW_CAP);
  return {items, total: result.total, complete: items.length >= result.total, loaded: items.length};
}
const shared = (key, load) => cached(key, load, 60_000);

const unwrapTask = (result) => result.status === 'fulfilled'
  ? {...(result.value || {}),ok:true}
  : {items:[],total:null,complete:false,ok:false,error:result.reason?.message || 'Data unavailable'};

export async function loadManagementOverview(role, monitoringWindow) {
  const ministry = role === 'MOA';
  const requests = {
    users: () => shared('users:overview', () => fetchPages(params=>listUsers(params))),
    datasets: () => shared('datasets:overview', () => fetchPages(params=>datasetsAPI.list(params))),
    submissions: () => allSubmissionRows().then(items => ({items: items.slice(0, ROW_CAP), total: items.length, complete: items.length <= ROW_CAP, loaded: Math.min(items.length, ROW_CAP)})),
    circles: () => listApprovalCircles().then(res=>({items:res.items,total:res.total,complete:res.items.length>=res.total})),
    // These lists are MOA-only. IA must never make unscoped organization requests.
    ...(ministry ? {
      institutions: () => shared('institutions:overview', () => fetchPages(params=>listInstitutions(params))),
      departments: () => shared('departments:overview', () => fetchPages(params=>listDepartments(params))),
      institutionalAdmins: () => shared('institution-admins:overview', () => fetchPages(params=>listInstitutionalAdmins(params))),
      roles: () => listRoles().then(res=>({items:res.items,total:res.total,complete:res.items.length>=res.total})),
      // Existing monitoring API path is unverified and OPTIONAL; a 404 must not blank the dashboard.
      monitoring: () => getAdminDashboard(monitoringWindow).then(data=>({data})),
    }:{}),
  };
  const names = Object.keys(requests);
  const results = await Promise.allSettled(names.map(name=>requests[name]()));
  return Object.fromEntries(names.map((name,index)=>[name,unwrapTask(results[index])]));
}

export const field = (record,...keys) => {
  for (const key of keys) {
    const value = key.split('.').reduce((object,part)=>object?.[part],record);
    if(value !== undefined && value !== null && value !== '')return value;
  }
  return null;
};

export function institutionId(record) {
  return field(record,'institution_id','institutionId','institution.id','source.institution_id',
    'source.institutionId','dataset.institution_id','dataset.institutionId',
    'reportingCalendar.dataset.institutionId','reporting_calendar.dataset.institution_id');
}

export function institutionScoped(source, ownId) {
  if (!source?.ok || ownId == null) return {...(source||{}),items:[],total:null,complete:false,ok:false};
  const records = (source.items || []).filter(row=>{
    const id=institutionId(row);
    // Laravel must enforce IA read scope for rows lacking affiliation fields.
    return id==null || String(id)===String(ownId);
  });
  return {...source,items:records,complete:source.complete && records.length === source.items.length,
    total:source.complete?records.length:null};
}

export const statusOf = row=>String(field(row,'status','submissionStatus','submission_status')||'').trim().toLowerCase().replace(/[_\s-]+/g,'');
export const published = row => /^(published|approved|finalapproved|finalpublished)$/.test(statusOf(row));
export const returned = row => /return|reject/.test(statusOf(row));
export const draft = row => /draft|notstarted/.test(statusOf(row));
export const reviewing = row => !published(row) && !returned(row) && !draft(row) && /review|pending|submitted|forward/.test(statusOf(row));
export const ministryQueue = row => reviewing(row) && currentRoleOf(row)==='MDO';
export const yearOf = row => {
  const year=field(row,'financialYear','financial_year','reportingCalendar.financialYear',
    'reporting_calendar.financial_year','reportingCalendar.reportingPeriod.financialYear.name',
    'reporting_calendar.reporting_period.financial_year.name','startYear','start_year');
  const text=year==null?'':typeof year==='object'?String(year.name??year.label??year.year??''):String(year);
  // Same reading as every other page: the year in periodLabel wins ("2026/2027 Q2").
  return reportingTime(row).year||normalizeYear(text)||text;
};
export const displayName = row => String(field(row,'datasetName','dataset.name','dataset.datasetName',
  'dataName','dataset_name','name','title','code') || 'Not reported');
export const displaySource = row => String(field(row,'institution.name','institutionName',
  'institution_name','department.name','departmentName','department_name','source.name',
  'dataset.institution.name','dataset.institutionName','dataset.department.name','dataset.departmentName',
  'reportingCalendar.dataset.institution.name','reporting_calendar.dataset.institution.name') || 'Not reported');

export const dateOf = row => field(row,'submitted_at','submittedAt','created_at','createdAt','date');
export const formatDate = value => {
  const date = value && Date.parse(value);
  return Number.isFinite(date)?new Date(date).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}):'—';
};
export function countGroup(rows,labeler) {
  const map=new Map();
  rows.forEach(row=>{const key=labeler(row);if(key && key!=='Not reported')map.set(key,(map.get(key)||0)+1);});
  return [...map].sort((a,b)=>b[1]-a[1]).map(([name,value])=>({name,value}));
}
export function trendRows(rows) {
  const dates=new Map();
  rows.forEach(row=>{
    const time=dateOf(row); if(!time || !Number.isFinite(Date.parse(time)))return;
    const key=new Date(time).toISOString().slice(0,7);
    const point=dates.get(key)||{name:key,submitted:0,published:0};
    point.submitted+=1; if(published(row))point.published+=1;
    dates.set(key,point);
  });
  return [...dates.values()].sort((a,b)=>a.name.localeCompare(b.name));
}
