/** Display helpers for the IDO / IHOD / AO modern pages (no API calls). */
import {institutionLogoUrl,NATIONAL_EMBLEM} from './institutionLogo.js';
import {orgInitials} from './orgCards.js';
import {draftEditable,submissionStatus} from './submissionValues.js';

export const plural=(n,word)=>`${n} ${word}${Number(n)===1?'':'s'}`;

/** The signed-in user's own institution: name, picture (API) and initials. */
export function ownOrg(user){
  const institution=user?.institution??{};
  const name=institution.name??user?.institutionName??user?.institution_name??'';
  return {name,logo:institutionLogoUrl(institution)||(user&&!user.institution?NATIONAL_EMBLEM:''),initials:orgInitials(institution.name?institution:{name})||'',
    code:institution.short_name??institution.code??institution.acronym??name};
}

/** First role name of the user as shown in the header ("Data Officer (IDO) · Institution"). */
export function roleText(user,fallback){
  const roles=Array.isArray(user?.roles)?user.roles:[];
  const named=roles.map(r=>typeof r==='string'?r:r?.name).find(Boolean);
  return named??user?.role?.name??user?.role_name??user?.role_code??fallback;
}

export function userInitials(user){
  const name=String(user?.name??user?.fullName??user?.full_name??'').trim();
  return name.split(/\s+/).filter(Boolean).map(w=>w[0]).join('').slice(0,2).toUpperCase();
}

/** Readable status + soft badge tone. */
export function statusBadge(status){
  const key=String(status??'').toLowerCase().replace(/[\s_-]+/g,'');
  const label=String(status||'Pending').replaceAll('_',' ').replace(/\b\w/g,ch=>ch.toUpperCase());
  if(['published','approved','completed'].includes(key))return {tone:'green',label};
  if(['returned','rejected','returnedforcorrection'].includes(key))return {tone:'red',label:'Returned'};
  if(key==='draft')return {tone:'amber',label:'Draft'};
  return {tone:'amber',label};
}


/** IDO status groups (Laravel sends lowercase codes such as "under_review"). */
export function idoStatusGroup(status){
  const key=submissionStatus(status);
  if(draftEditable(status)&&key!=='draft')return 'Returned';
  if(key==='draft')return 'Draft';
  if(['approved','completed','published'].includes(key))return 'Published';
  return 'Submitted';
}

const STEP_NAMES={IDO:'Data Officer',DDO:'Data Officer',IHOD:'IHOD review',HOD:'IHOD review',AO:'AO approval',MDO:'MDO review',MDD:'MDD publish'};
/** Where the submission is now, from Laravel's currentStep (never guessed from the role list). */
export function currentStepText(item){
  const group=idoStatusGroup(item?.status);
  if(group==='Draft')return 'Not submitted';
  if(group==='Returned')return 'Back to you';
  if(group==='Published')return 'Completed';
  const raw=item?.raw??item??{};
  const step=raw.currentStep??raw.current_step??item?.currentStep;
  const code=String(step?.required_role_code??step?.requiredRoleCode??'').toUpperCase();
  return STEP_NAMES[code]??(code||'In approval');
}
export const stepName=code=>STEP_NAMES[String(code??'').toUpperCase()]??String(code??'');
/** Next approver label from Laravel's nextStep, else the next entry of the approval steps list. */
export function nextStepText(workflow,steps){
  const named=workflow?.next?.role||workflow?.next?.label;
  if(named)return named;
  const at=(steps??[]).findIndex(step=>step.state==='now');
  return at>=0&&steps[at+1]?stepName(steps[at+1].label):'';
}
