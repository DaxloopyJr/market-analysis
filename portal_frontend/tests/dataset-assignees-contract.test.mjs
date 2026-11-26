import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {normalizeAssignees,savedResponsibleUserID,responsibleUserWriteFields} from '../src/utils/datasetAssignees.js';
import {datasetUpdatePayload} from '../src/pages/ModulePage/datasetFormRules.js';
const path = new URL('../src/',import.meta.url);
const api = readFileSync(new URL('API/dataset.jsx',path),'utf8');
const ui = readFileSync(new URL('pages/ModulePage/Datasets.jsx',path),'utf8');

const staff = {id:15,name:'CAMARTEC Data Officer',email:'IOD@camartec.ac.tz',username:null};
test('GET /datasets/{id}/assignees accepts the exact standalone user response',()=>{
  assert.deepEqual(normalizeAssignees(staff),[staff]);
});
test('GET /assignees supports Laravel wrappers, arrays, and paginated data',()=>{
  assert.deepEqual(normalizeAssignees({data:staff}),[staff]);
  assert.deepEqual(normalizeAssignees({data:[staff]}),[staff]);
  assert.deepEqual(normalizeAssignees({data:{data:[staff],current_page:1}}),[staff]);
  assert.deepEqual(normalizeAssignees({data:{items:[staff]}}),[staff]);
  assert.deepEqual(normalizeAssignees({data:null}),[]);
});
test('Eligible assignees are not confused with saved dataset responsibleUserId',()=>{
  assert.equal(savedResponsibleUserID({responsibleUserID:null}),null);
  assert.equal(savedResponsibleUserID({responsibleUserId:15}),'15');
  assert.equal(savedResponsibleUserID({responsibleUserId:15,responsibleUserID:99}),'15');
  assert.equal(savedResponsibleUserID({responsibleUserID:{id:15,name:'Officer'}}),'15');
  assert.equal(savedResponsibleUserID({id:11}),null);
});
test('Proposed write uses numeric responsibleUserId; invalid IDs cannot reach backend',()=>{
  assert.deepEqual(responsibleUserWriteFields('15'),{responsibleUserId:15});
  assert.deepEqual(responsibleUserWriteFields(''),{});
  for(const invalid of ['not-a-user','15.5','0','-3','1e99'])assert.throws(()=>responsibleUserWriteFields(invalid));
});
test('PATCH field assembled alongside existing dataset metadata fields',()=>{
  const f={datasetName:' Staff ',description:' Overview ',sourceDescription:' HR ',collectionMethod:'manual',frequencies:['quarterly'],consumers:[]};
  const patch=datasetUpdatePayload(f,responsibleUserWriteFields(15));
  assert.equal(patch.responsibleUserId,15);
  assert.equal(Object.hasOwn(patch,'responsible_admin'),false);
  assert.equal(Object.hasOwn(patch,'responsibleUserID'),false);
  assert.equal(patch.datasetName,'Staff');
  assert.deepEqual(patch.frequencies,['quarterly']);
  assert.equal(patch.institutionId,undefined);
});
test('UI never claims success based only on GET /assignees; checks dataset readback',()=>{
  assert.match(api,/getAssignees: async id => normalizeAssignees\(unwrap\(await api.get/);
  assert.match(api,/\.\.\.form\.responsibleUserFields/);
  assert.match(api,/responsibleUserId \(exact case\)/);
  assert.doesNotMatch(api,/responsibleUserID/);
  assert.doesNotMatch(api,/responsible_admin|responsibleAdminFields/);
  assert.match(ui,/serverRecord=await api.get\(id\)/);
  assert.match(ui,/const persisted=savedResponsibleUserID\(serverRecord\)/);
  assert.match(ui,/if\(idString\(persisted\)!==idString\(selectedOfficer\)\)/);
  assert.match(ui,/showUserFacingError\('The saved responsible officer does not match the selected officer/);
  assert.doesNotMatch(ui,/api\.assignPeriod\(/);
});

test('UI validates under the correct case-sensitive Laravel field name',()=>{
  assert.match(ui,/errors\.responsibleUserId/);
  assert.match(ui,/errors\.responsibleUserId/);
  assert.match(ui,/showUserFacingError\('The saved responsible officer does not match the selected officer/);
  assert.doesNotMatch(ui,/responsibleUserID/);
});
