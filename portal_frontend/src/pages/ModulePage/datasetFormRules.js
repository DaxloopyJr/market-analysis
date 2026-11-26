/**
 * FILE: src/pages/ModulePage/datasetFormRules.js
 * FLOW: Datasets.jsx (Basic Information / Save & Next) -> validateDatasetBasic()
 *       -> POST/PATCH via API/dataset.jsx -> remote Laravel.
 * ROUTE: /dashboard/datasets; permissions: Laravel dataset scope D (MOA/IA/IDO/DDO).
 * REFERENCE: SECTOR and UNIT IDs are resolved from live Reference Management values.
 * CONTRACT: POST requires institutionId, datasetName, frequencies and sectors.
 *   Ministry sends authenticated Ministry institutionId AND departmentId.
 * IMPORTANT: No Sections, Input/Output Type, client-supplied datasetCode or priority.
 */
export function validateDatasetBasic(form) {
  const errors = {};
  if (!String(form.datasetName || '').trim()) errors.datasetName = 'Data name is required.';
  if (!String(form.description || '').trim()) errors.description = 'Description is required.';
  if(!form.institutionId) errors.institutionId = 'An Institution ID from /me is required.';
  if(form.requiresMinistryDepartment && !form.departmentId) errors.departmentId='Ministry Department is required.';
  if (!String(form.sourceDescription || '').trim()) errors.sourceDescription = 'Data Source description is required.';
  if (!form.sectors?.length) errors.sectors = 'Select an active sector from Reference Data.';
  if (!form.frequencies?.length) errors.frequencies = 'Select a reporting frequency.';
  if (!form.consumers?.length) errors.consumers = 'Enter or select at least one consumer.';
  if (form.collectionMethod === 'system' && !String(form.sourceSystemName || '').trim()) {
    errors.sourceSystemName = 'System Name is required for System Method.';
  }
  return errors;
}

/** PATCH /datasets/{id} supports mutable details; no institution/sector updates. */
export function datasetUpdatePayload(form, responsibleUserFields = {}) {
  return {
    ...responsibleUserFields,
    datasetName: form.datasetName.trim(),
    description: form.description.trim(),
    sourceDescription: form.sourceDescription.trim(),
    collectionMethod: form.collectionMethod,
    sourceSystemName: form.collectionMethod === 'system' ? form.sourceSystemName.trim() : null,
    frequencies: [...form.frequencies],
    consumers: form.consumers.map(c => c.id
      ? { consumerId: Number(c.id) }
      : { name: c.name.trim(), shortName: c.shortName || null, description: null }),
  };
}

/**
 * Draft completion is NOT inferred from navigation. The revised wizard has
 * exactly THREE steps: saved dataset details, saved indicators, active snapshot.
 * Target and calendar completion still follow Laravel's own validation.
 */
export function datasetWizardCompletion({ dataset, indicators = [], basicSaved = true }) {
  return [Boolean(dataset?.id && basicSaved),
    indicators.some(x=>x?.indicatorId || x?.indicator?.id),dataset?.status === 'active'];
}

/** Backend target API supports integer/decimal ONLY, numeric STRING, 18+6 digits. */
export function validateNumericTarget(value,dataType){
  if(!['integer','decimal'].includes(dataType))return false;
  const text=String(value??'').trim();
  return dataType==='integer'?/^-?\d{1,18}$/.test(text):/^-?\d{1,18}(?:\.\d{1,6})?$/.test(text);
}

/**
 * Suggest the year AFTER the latest institution-wide financial annual period.
 * Example: FY 2026/27 (ends 2027-06-30) -> FY 2027/28.
 * It only prefills the form; nothing is written until POST /reporting-periods.
 */
export function suggestNextFinancialYear(periods = []) {
  const annual=periods.filter(p=>p?.periodType==='annual'&&p?.yearType==='financial'&&/^\d{4}-\d{2}-\d{2}$/.test(p?.endDate||''))
    .sort((a,b)=>String(b.endDate).localeCompare(String(a.endDate)));
  if(!annual.length)return null;
  const last=annual[0].endDate;
  const [y,m,d]=last.split('-').map(Number);
  const start=new Date(Date.UTC(y,m-1,d+1));
  const end=new Date(start);end.setUTCFullYear(end.getUTCFullYear()+1);end.setUTCDate(end.getUTCDate()-1);
  return {yearType:'financial',startDate:start.toISOString().slice(0,10),endDate:end.toISOString().slice(0,10)};
}
