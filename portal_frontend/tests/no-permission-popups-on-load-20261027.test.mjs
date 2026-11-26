import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {safeActorLookup as lookupApprovalActorProfiles, embeddedProfilesOf} from '../src/utils/approvalActorLookup.js';
const read = f => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

test('a 403 from the user directory is silent (no throw, no dialog)', async () => {
  const denied = async () => { const e = new Error('Huna ruhusa ya kufanya kitendo hiki.'); e.response = {status:403}; throw e; };
  assert.deepEqual(await lookupApprovalActorProfiles(['11'], denied), {});
});
test('a 401 still propagates (session really expired)', async () => {
  const expired = async () => { const e = new Error('Unauthenticated'); e.response = {status:401}; throw e; };
  await assert.rejects(lookupApprovalActorProfiles(['11'], expired));
});
test('names embedded in the submission are used without GET /users', () => {
  const profiles = embeddedProfilesOf({raw:{submittedBy:{userId:12,name:'Neema Mushi',roles:[{code:'IDO',name:'Institutional Data Officer'}]}},
    history:[{actor:{userId:13,name:'Juma Said',roles:[{code:'IHOD',name:'Institution Head of Department'}]}}]});
  assert.equal(profiles['12']?.name, 'Neema Mushi');
  assert.equal(profiles['13']?.name, 'Juma Said');
});
test('MDD no longer pops "Reviewer names unavailable"; Datasets uses eligible-officers', () => {
  assert.doesNotMatch(read('src/pages/MDD/MddWorkspace.jsx'), /Reviewer names unavailable/);
  assert.match(read('src/API/dataset.jsx'), /'\/datasets\/eligible-officers'/);
  assert.match(read('src/pages/ModulePage/Datasets.jsx'), /api\.eligibleOfficers\(params\)/);
  assert.match(read('src/pages/ModulePage/Datasets.jsx'), /!\[401,403\]\.includes\(err\?\.response\?\.status\)/);
});
test('non-administrators never call the user directory', async () => {
  let called = false;
  const page = async () => { called = true; return {items:[]}; };
  assert.deepEqual(await lookupApprovalActorProfiles(['11'], page, {allowed:false}), {});
  assert.equal(called, false);
});
