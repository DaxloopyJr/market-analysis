/** Reporting source (institution or ministry department) of a submission: code, name and picture for tables. */
import {sourceOf,sourceOfDataset} from './mdoReviewRules.js';
import {institutionLogoUrl,NATIONAL_EMBLEM} from './institutionLogo.js';
import {orgInitials} from './orgCards.js';

const first=(...values)=>values.find(v=>v!==undefined&&v!==null&&String(v).trim()!=='');
export function sourceIdentity(row,catalogue){
  const owner=sourceOf(row);
  const registry=(catalogue?.datasets??[]).find(item=>String(item.id)===String(row?.dataset_id??row?.raw?.datasetId??row?.raw?.dataset_id));
  const definition=registry?sourceOfDataset(registry):{};
  const depId=owner.departmentId??definition.departmentId;
  const instId=owner.institutionId??definition.institutionId;
  const department=depId?(catalogue?.departments??[]).find(item=>String(item.id)===String(depId)):null;
  const institution=(catalogue?.institutions??[]).find(item=>String(item.id)===String(instId));
  if(depId){
    const name=first(department?.name,owner.departmentName,'Ministry department');
    return {code:first(department?.code,department?.short_name,name),name,logo:NATIONAL_EMBLEM,initials:orgInitials(department??{name}),department:true};
  }
  const name=first(institution?.name,owner.institutionName,row?.institution,'Institution');
  const code=first(institution?.short_name,institution?.code,name);
  return {code,name,logo:institutionLogoUrl(institution),initials:orgInitials(institution??{name}),department:false};
}

/** "2026/2027 2026/2027 Q1" -> "2026/2027 Q1" (year repeated by label + financial year). */
export function cleanPeriod(text){
  if(text===undefined||text===null)return '';
  const seen=new Set();
  return String(text).split(/\s+/).filter(token=>{const key=token.toLowerCase();if(!token||seen.has(key))return false;seen.add(key);return true;}).join(' ');
}
