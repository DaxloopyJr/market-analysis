/**
 * FILE: src/API/portalSettings.jsx
 * FLOW: PortalSettings -> this service -> axios.jsx -> Laravel /api/v1 -> PostgreSQL.
 * VERIFIED BACKEND CONTRACT 29–30: GET/PUT /portal-settings (portal_settings.manage).
 * Values in GET are {key,value} objects; PUT expects {settings:{key:value}}.
 * Logo must be submitted as multipart settings[portal_logo] on PUT /portal-settings.
 * Other UI-reference fields are not supported by the supplied contract.
 * TODO(BACKEND) — to enable Footer, Portal Status, Description and other tabs,
 * Laravel must first confirm new setting keys within the existing GET/PUT API:
 *   const res = await api.put('/portal-settings', {
 *     settings:{footer_text:'...',portal_status:'active'}
 *   });
 *   // proposed response: {status:'success',message:'Settings saved.'}
 * Do NOT send these proposed keys until the backend team approves the schema.

 */
import api from './axios';
import {operationResult, unwrap} from './resourceHelpers';

export const PORTAL_SETTINGS_CONTRACT_VERIFIED = true;
export const VERIFIED_PORTAL_FIELDS = Object.freeze([
  'portal_name','portal_tagline','contact_email','contact_phone','announcement',
]);

export async function getPortalSettings(){
  return unwrap(await api.get('/portal-settings'));
}

export async function savePortalSettings(_section, values){
  const settings=Object.fromEntries(VERIFIED_PORTAL_FIELDS
    .filter(key=>Object.prototype.hasOwnProperty.call(values,key))
    .map(key=>[key,values[key]]));
  if(!Object.keys(settings).length) throw new Error('No API-supported setting was changed.');
  return operationResult(await api.put('/portal-settings',{settings}));
}

export async function uploadPortalLogo(file){
  const body=new FormData();
  body.append('settings[portal_logo]',file);
  // Axios browser multipart boundary is generated automatically; do not force application/json.
  return operationResult(await api.put('/portal-settings',body,{headers:{'Content-Type':undefined}}));
}
