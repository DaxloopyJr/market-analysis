import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source = readFileSync(new URL('../src/pages/ModulePage/Datasets.jsx',import.meta.url),'utf8');

// This particular runtime error used to crash the entire portal when Next
// mounted Review & Submit after an Indicator/Dimension edit.
test('Review uses the imported persisted-officer selector, not an undefined helper',()=>{
  assert.match(source,/import \{ savedResponsibleUserID, responsibleUserWriteFields \} from/);
  assert.match(source,/\['Responsible IDO\/DDO \(saved\)',savedResponsibleUserID\(dataset\)/);
  assert.doesNotMatch(source,/savedResponsibleAdmin\s*\(/);
});
test('review crashes cannot blank the whole portal; fallback permits going back',()=>{
  assert.match(source,/class DatasetReviewErrorBoundary extends Component/);
  assert.match(source,/static getDerivedStateFromError/);
  assert.match(source,/Back to Indicators & Dimensions/);
  assert.match(source,/<DatasetReviewErrorBoundary key=\{dataset\?\.id\?\?'new'\} onBack=\{\(\)=>goToWizardStep\(1\)\}>/);
});
test('indicator editor remains mounted across step clicks to retain unsaved changes',()=>{
  assert.match(source,/dataset\?\.id&&!relatedLoading&&<div hidden=\{step!==1\}>/);
  assert.ok(source.indexOf('dataset?.id&&!relatedLoading&&<div hidden={step!==1}>') < source.indexOf('<DatasetReviewErrorBoundary key='));
});
test('a failed dimension save retains the pending dirty flag, so Next cannot bypass it',()=>{
  assert.match(source,/showUserFacingError\(err,'Dimension configuration not completed'\)/);
  assert.match(source,/setEditId\(savedIndicatorId\);setDirty\(true\)/);
  assert.match(source,/if\(dirty\)return save\(\)/);
});
test('missing server option arrays do not trigger delete-and-recreate',()=>{
  assert.match(source,/function returnedDimensionOptions\(dim\)/);
  assert.match(source,/optionsAvailable:returnedDimensionOptions\(dim\)!==null/);
  assert.match(source,/d\.optionsAvailable && JSON\.stringify\(oldOpts\)/);
  assert.match(source,/Name, Required and Order can still be edited; the options stay as they are/);
  assert.match(source,/if\(!d\.original \|\| d\.optionsAvailable\)/);
});
test('remarks-only preview caveat displays only if the Remarks control was modified',()=>{
  assert.match(source,/const remarksPreviewOnly=remarksEdited/);
  assert.match(source,/icon:remarksPreviewOnly\?'warning':'success'/);
  assert.match(source,/The Remarks setting is not saved yet/);
  assert.doesNotMatch(source,/Remarks setting is preview-only until backend support\./);
});
