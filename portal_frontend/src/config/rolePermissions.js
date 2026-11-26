/** Labels only; access must come from Laravel roles and permissions. */
export const ROLE_LABELS = Object.freeze({
  ME:"Ministry Executive",MOA:"Ministry Overall Admin",IA:"Institution Admin",
  IDO:"Institution Data Officer",DDO:"Departmental Data Officer",OMU:"Other Ministry User",
  IM:"Institutional User",HoD:"Head of Department",AO:"Accounting Officer",
  MDO:"Ministry Data Officer",DD:"Department Director",
});
export const userCan = (user,permissions=[]) => Boolean(
  user && Array.isArray(user.permissions) && permissions.some((p)=>user.permissions.includes(p))
);
