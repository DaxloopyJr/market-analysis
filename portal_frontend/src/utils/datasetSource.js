/**
 * FILE: src/utils/datasetSource.js
 * FLOW: /me -> datasetOwnership.js -> BasicStep -> datasetSourceIds ->
 *       POST /datasets, with Laravel scope D authorization enforced server-side.
 * Ministry itself is an institution. Always send its REAL institutionId.
 * IA/IDO institution-only; MOA/DDO can use ministry departments.
 */
export function datasetSourceIds(form) {
  return {institutionId:form.institutionId?Number(form.institutionId):null,
    departmentId:form.departmentId?Number(form.departmentId):null};
}
export function datasetSourceLevel(dataset) {return dataset?.departmentId!=null?'ministry':'institution';}
