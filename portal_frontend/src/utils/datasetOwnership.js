/**
 * FILE: src/utils/datasetOwnership.js
 * FLOW: Login GET /me -> normalized Dashboard user -> Dataset Basic Information.
 * Scope is derived from authenticated identity, NEVER a user-selectable institution.
 * TODO(BACKEND): /me must include the registered Ministry institution ID for MOA/DDO.
 * DO NOT infer ministry ID from an institution name or fabricate a fallback.
 */
export const roleCodes = (user) => {
  const today=new Date().toISOString().slice(0,10);
  const roles=(Array.isArray(user?.roles)?user.roles:[]).filter(r=>!r?.pivot || (
    (!r.pivot.status || r.pivot.status==='active') &&
    (!r.pivot.effective_from || r.pivot.effective_from<=today) &&
    (!r.pivot.effective_to || r.pivot.effective_to>=today)));
  return [...new Set([...roles.map(x=>typeof x==='string'?x:x?.code),user?.role_code]
    .filter(Boolean).map(x=>String(x).toUpperCase()))];
};
export const userInstitutionId = u => u?.institutionId??u?.institution_id??u?.institution?.id??null;
export const userDepartmentId = u => u?.departmentId??u?.department_id??u?.department?.id??null;
export function getDatasetOwnership(user){
  const roles=roleCodes(user);
  const ministry=roles.includes('MOA')||roles.includes('DDO');
  const institutionId=userInstitutionId(user);
  const departmentId=roles.includes('DDO')?userDepartmentId(user):null;
  const error= !institutionId?'Your profile has no institution. Contact your administrator.'
    : ministry&&roles.includes('DDO')&&!departmentId?'Your /me profile has no ministry department ID.'
    : !roles.some(r=>['MOA','DDO','IA','IDO'].includes(r))?'The account does not have a Dataset creator role.':'';
  return {kind:ministry?'ministry':'institution',institutionId,departmentId,
    canChooseDepartment:roles.includes('MOA'),error};
}
