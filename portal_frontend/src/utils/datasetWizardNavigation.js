/** Pure wizard navigation rules. Visual step changes never imply a Laravel write. */
export function canNavigateDatasetStep(dataset, targetStep, busy=false){
  if(busy || !Number.isInteger(targetStep) || targetStep<0 || targetStep>2)return false;
  // An unsaved new dataset needs its server ID for indicators or review.
  return targetStep===0 || (dataset?.id!=null && dataset.id!=='');
}

/** Only a verified draft may be edited; active/inactive datasets must be reopened. */
export function isDatasetDraft(dataset){
  return String(dataset?.status??'').trim().toLowerCase()==='draft';
}
