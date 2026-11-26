import {normalizeReadAliases,normalizeReadRows} from "../utils/recordAliases.js";
/**
 * FILE: src/API/dataset.jsx
 * ROUTE: /dashboard/datasets -> pages/ModulePage/Datasets.jsx
 * API FLOW: Datasets.jsx -> this service -> src/API/axios.jsx -> remote Laravel /api/v1 -> PostgreSQL.
 * VERIFIED: dataset definitions (19-24), consumers (24), periods (25-30), calendars (31-32),
 * indicators (34-37), catalogue (38-42), dimensions (43-50), activation/versions (56-61).
 * Do not send datasetCode, createdBy, initial priority or a made-up Input/Output/Sections field.
 * Do not confuse indicator targets with actual data-entry values.
 * SOURCE IDs: authenticated /me institutionId; Ministry -> same institutionId PLUS
 * departmentId (MOA selects ministry department, DDO uses own department).
 * TODO(BACKEND) Calendar officer assignment relies on Submission Periods contract.
 */
import api from './axios';
import { datasetSourceIds } from '../utils/datasetSource';
import { reportingPeriodsAPI } from './reportingPeriods';
import { listResult, operationResult, unwrap } from './resourceHelpers';
import { normalizeAssignees } from '../utils/datasetAssignees';
const ds = id => `/datasets/${encodeURIComponent(String(id))}`;
const item = id => encodeURIComponent(String(id));
// Keep Axios calls centralized; helpers preserve Laravel success messages and validation errors.
const requestList = async (path,params={}) => {
  const result=listResult(await api.get(path,{params}));
  return path==='/datasets' ? {...result,items:normalizeReadRows(result.items,'dataset')} : result;
};
export const datasetsAPI = {
  list: (params={}) => requestList('/datasets',params),
  get: async id => normalizeReadAliases(unwrap(await api.get(ds(id))),'dataset'),
  // Confirmed GET only. Eligible candidates, not proof of persisted ownership.
  // GET /datasets/eligible-officers?institutionId=&departmentId= -> {data:[{id,name,institutionId,departmentId}]}
  // Accessible to MOA/IA/IDO/DDO; replaces the privileged GET /users for officer choices.
  eligibleOfficers: async (params={}) => {
    const body=unwrap(await api.get('/datasets/eligible-officers',{params}));
    const rows=Array.isArray(body)?body:Array.isArray(body?.data)?body.data:[];
    return rows.filter(r=>r&&r.id!=null).map(r=>({id:r.id,name:r.name??r.email??`User ${r.id}`,email:r.email??'',
      institution_id:r.institutionId??r.institution_id??null,department_id:r.departmentId??r.department_id??null,eligible:true}));
  },
  // API reference #100: PATCH /datasets/{datasetId}/priority  {priority:'low'|'medium'|'high', reason}
  // MDO only (same department for department datasets). Changes an ALREADY initialised priority (422 otherwise).
  // Response: {data:{datasetId,priority,priorityUpdatedBy,priorityUpdatedAt}}
  updatePriority: async (id,{priority,reason}) => operationResult(await api.patch(`${ds(id)}/priority`,{priority,reason})),
  getAssignees: async id => normalizeAssignees(unwrap(await api.get(`${ds(id)}/assignees`))),
  create: async form => operationResult(await api.post('/datasets',{
    ...datasetSourceIds(form),
    // Laravel dataset officer field: responsibleUserId (exact case).
    ...form.responsibleUserFields,
    datasetName:form.datasetName.trim(),description:form.description.trim(),
    collectionMethod:form.collectionMethod,
    sourceSystemName:form.collectionMethod==='system'?form.sourceSystemName.trim():null,
    sourceDescription:form.sourceDescription.trim(), frequencies:form.frequencies,
    sectors:form.sectors.map(s=>({sectorId:Number(s.sectorId),subsectorIds:s.subsectorIds.map(Number)})),
    consumers:form.consumers.map(c=>c.id?{consumerId:Number(c.id)}:{name:c.name.trim(),shortName:c.shortName?.trim()||null,description:null}),
  })),
  update: async (id,fields) => operationResult(await api.patch(ds(id),fields)),
  deactivate: async id => operationResult(await api.delete(ds(id))),
  listConsumers: (params={}) => requestList('/data-consumers',params),
  // Global periods are common to all entities; central service strips prohibited institution filters.
  listPeriods: (params={}) => reportingPeriodsAPI.list(params),
  createYear: fields => reportingPeriodsAPI.createYear(fields),
  generateQuarters: (yearId,fields={deadlineDays:0}) => reportingPeriodsAPI.generateQuarters(yearId,fields.deadlineDays),
  periodsOfDataset: (id,params={}) => requestList(`${ds(id)}/reporting-calendar`,params),
  assignPeriod: async (id,fields) => operationResult(await api.put(`${ds(id)}/reporting-calendar`,fields)),
  indicators: (id,params={}) => requestList(`${ds(id)}/indicators`,params),
  addIndicator: async (id,payload) => operationResult(await api.post(`${ds(id)}/indicators`,payload)),
  changeIndicatorAttachment: async (id,indicatorId,fields) => operationResult(await api.patch(`${ds(id)}/indicators/${item(indicatorId)}`,fields)),
  detachIndicator: async (id,indicatorId) => operationResult(await api.delete(`${ds(id)}/indicators/${item(indicatorId)}`)),
  catalogueIndicator: async id => unwrap(await api.get(`/indicators/${item(id)}`)),
  updateCatalogueIndicator: async (id,fields) => operationResult(await api.patch(`/indicators/${item(id)}`,fields)),
  dimensions: (id,params={}) => requestList(`${ds(id)}/dimensions`,params),
  addDimension: async (id,fields) => operationResult(await api.post(`${ds(id)}/dimensions`,fields)),
  updateDimensionAttachment: async (id,dimId,fields) => operationResult(await api.patch(`${ds(id)}/dimensions/${item(dimId)}`,fields)),
  // Catalogue dimension name/type changes only; options are immutable in this API contract.
  updateCatalogueDimension: async (dimId,fields) => operationResult(await api.patch(`/dimensions/${item(dimId)}`,fields)),
  detachDimension: async (id,dimId) => operationResult(await api.delete(`${ds(id)}/dimensions/${item(dimId)}`)),
  targets: (id,params={}) => requestList(`${ds(id)}/targets`,params),
  addTarget: async (id,fields) => operationResult(await api.post(`${ds(id)}/targets`,fields)),
  updateTarget: async (id,targetId,fields) => operationResult(await api.patch(`${ds(id)}/targets/${item(targetId)}`,fields)),
  progress: async id => unwrap(await api.get(`${ds(id)}/configuration-progress`)),
  activate: async id => operationResult(await api.post(`${ds(id)}/activate`)),
  reopen: async id => operationResult(await api.post(`${ds(id)}/draft`)),
  versions: (id,params={}) => requestList(`${ds(id)}/template-versions`,params),
  version: async (id,versionId) => unwrap(await api.get(`${ds(id)}/template-versions/${item(versionId)}`)),
  sectors: async id => unwrap(await api.get(`${ds(id)}/sectors`)),
};
/** Download all options only up to a safe cap; the contract does not promise lookup endpoints. */
export async function allDatasetOptions(fetchPage,limit=1500){
  const first=await fetchPage(1);
  const total=Number(first.total??first.items.length);
  if(total>limit) throw new Error(`Too many options to list. Please narrow your search.`);
  const result=[...first.items];
  const fetchedCount=Math.max(first.items.length,1);
  const pages=Math.max(1,first.lastPage||0,Math.ceil(total/Math.max(first.perPage||fetchedCount,1)));
  if(pages>100)throw new Error('Too many options to list. Please narrow your search.');
  for(let p=2;p<=pages;p++) result.push(...(await fetchPage(p)).items);
  return result;
}
