import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {canNavigateDatasetStep,isDatasetDraft} from '../src/utils/datasetWizardNavigation.js';
const code=readFileSync(new URL('../src/pages/ModulePage/Datasets.jsx',import.meta.url),'utf8');
const css=readFileSync(new URL('../src/pages/ModulePage/datasets.css',import.meta.url),'utf8');

test('Saved dataset tabs are freely navigable despite incomplete assignment or active status',()=>{
  for(const status of ['draft','active','inactive']){
    for(const step of [0,1,2])assert.equal(canNavigateDatasetStep({id:44,status,responsibleUserId:null},step),true,`${status}:${step}`);
  }
});
test('New dataset cannot bypass initial create; saving blocks tab transitions',()=>{
  assert.equal(canNavigateDatasetStep(null,0),true);
  assert.equal(canNavigateDatasetStep(null,1),false);
  assert.equal(canNavigateDatasetStep(null,2),false);
  assert.equal(canNavigateDatasetStep({id:5},1,true),false);
  for(const step of [-1,3,NaN,1.4])assert.equal(canNavigateDatasetStep({id:5},step),false);
});
test('Editing permission follows draft status, not stepper completion',()=>{
  assert.equal(isDatasetDraft({status:'draft'}),true);
  assert.equal(isDatasetDraft({status:'Draft'}),true);
  assert.equal(isDatasetDraft({status:'active'}),false);
  assert.equal(isDatasetDraft({status:'inactive'}),false);
});
test('Step header uses independent navigation and no longer gates against completedSteps[step]',()=>{
  assert.match(code,/onClick=\{\(\)=>goToWizardStep\(i\)\}/);
  assert.match(code,/canNavigateDatasetStep\(dataset,target,saving\|\|saveGate\.current\)/);
  assert.doesNotMatch(code,/if\(i>step&&!completedSteps\[step\]\)/);
  assert.doesNotMatch(code,/Use Save & Next to persist the current step before advancing/);
});
test('Edit mode shows actionable Reopen as Draft and keeps indicator drafts mounted during tab changes',()=>{
  assert.match(code,/className="ds-edit-lock-notice"/);
  assert.match(code,/onClick=\{reopenCurrentForEditing\}/);
  assert.match(code,/await api\.reopen\(dataset\.id\)/);
  assert.match(code,/if\(!isDatasetDraft\(loaded\)\)/);
  assert.match(code,/dataset\?\.id&&!relatedLoading&&<div hidden=\{step!==1\}>/);
  assert.match(css,/\.ds-edit-lock-notice\{/);
});
test('Opening existing editor does not block on unrelated user/reference lookups',()=>{
  assert.match(code,/void loadOptions\(\);\s*try\{await loadDataset\(record.id\);\}/);
  assert.match(code,/void Promise\.allSettled\(\[/);
  assert.match(code,/Loading saved indicators and dimensions/);
  assert.match(code,/setRelatedLoading\(false\)/);
});
test('Officer assignment still writes confirmed responsibleUserId (not responsible_admin)',()=>{
  assert.match(code,/const persisted=savedResponsibleUserID\(serverRecord\)/);
  assert.match(code,/responsibleUserWriteFields\(selectedOfficer\)/);
});
