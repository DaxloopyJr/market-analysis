/** Pure helpers for the MOA / IA dashboard (no API calls, testable in Node). */
const field = (record,...keys) => {
  for (const key of keys) {
    const value = key.split('.').reduce((object,part)=>object?.[part],record);
    if(value !== undefined && value !== null && value !== '')return value;
  }
  return null;
};
export const currentRoleOf = row => String(field(row,'currentStep.required_role_code','currentStep.requiredRoleCode',
  'raw.currentStep.required_role_code','raw.currentStep.requiredRoleCode','current_step.required_role_code',
  'current_step.requiredRoleCode','currentStepRoleCode','current_step_role_code')||'').toUpperCase();

export const datasetIdOf = row => field(row,'dataset_id','datasetId','dataset.id','reportingCalendar.datasetId',
  'reportingCalendar.dataset_id','reporting_calendar.dataset_id','reportingCalendar.dataset.id','reporting_calendar.dataset.id');

/**
 * Institution / department of a submission when the /submissions row has no names:
 * submission.datasetId -> /datasets row (institutionId, departmentId) -> /institutions or /departments name.
 * Uses only lists already loaded for the dashboard; returns '' when Laravel gave no link.
 */
export function makeSourceResolver({datasets=[],institutions=[],departments=[],ownInstitutionName=''}={}){
  const byDataset=new Map(datasets.map(d=>[String(d.id),d]));
  const instName=new Map(institutions.map(i=>[String(i.id),i.name||i.institutionName||i.code]));
  const deptName=new Map(departments.map(d=>[String(d.id),d.name||d.code]));
  const linkOf=row=>byDataset.get(String(datasetIdOf(row)??''))??null;
  const departmentOf=row=>{
    const direct=field(row,'department.name','departmentName','department_name','dataset.department.name','dataset.departmentName');
    if(direct)return String(direct);
    const id=field(row,'department_id','departmentId','dataset.departmentId','dataset.department_id')??linkOf(row)?.departmentId??linkOf(row)?.department_id;
    return id==null?'':String(deptName.get(String(id))||'');
  };
  const institutionOf=row=>{
    const direct=field(row,'institution.name','institutionName','institution_name','dataset.institution.name','dataset.institutionName');
    if(direct)return String(direct);
    const id=field(row,'institution_id','institutionId','dataset.institutionId','dataset.institution_id')??linkOf(row)?.institutionId??linkOf(row)?.institution_id;
    return id==null?'':String(instName.get(String(id))||ownInstitutionName||'');
  };
  const sourceOf=row=>departmentOf(row)||institutionOf(row)||'Not reported';
  return {sourceOf,institutionOf,departmentOf};
}
