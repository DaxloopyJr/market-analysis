/**
 * Behavior tests: execute the actual JSX submit handler in a sandbox with
 * mocked Laravel calls. This catches ReferenceErrors, swallowed failures and
 * incorrect order without requiring the live backend or a browser.
 * Unlike old regex-only checks, this RUNS the handler after the click.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {hasEnteredSubmissionValues} from '../src/utils/submissionValues.js';

const source = readFileSync(new URL('../src/pages/DataEntry/DataEntry.jsx', import.meta.url), 'utf8');
const begin = source.indexOf('  async function submitForReview() {');
const end = source.indexOf('\n  if (loading) return', begin);
assert.ok(begin >= 0 && end > begin);
const handlerSource = source.slice(begin, end).trim();

function harness(overrides={}) {
  const events=[];
  let error='';
  let busy=false;
  let step=3;
  const state={
    busy:false,
    method:'manual',
    dataset:{id:6},
    period:{id:12},
    periodEligible:true,
    indicatorLoading:false,
    indicatorError:'',
    submissionWritesReady:true,
    values:{8:'123'},
    remarks:{8:'Idadi ya staff mwisho wa kipindi'},
    dimensionValues:{'8:2:3':'70'},
    datasetId:6,
    validateCurrent:()=>'',
    hasEnteredSubmissionValues,
    setError:value=>{error=value;events.push(`error:${value}`)},
    setTouched:value=>events.push(`touched:${value}`),
    setSubmitStage:value=>events.push(`stage:${value}`),
    setBusy:value=>{busy=value;events.push(`busy:${value}`)},
    showToast:data=>events.push(`toast:${data.type}:${data.title}`),
    setSavedSnapshot:data=>events.push('savedSnapshot'),
    setSavedVersion:id=>events.push(`savedVersion:${id}`),
    setDatasetWork:callback=>{callback({});events.push('setDatasetWork')},
    setStep:value=>{step=value;events.push(`step:${value}`)},
    Swal:{fire:async()=>{events.push('confirm');return {isConfirmed:true}}},
    ensureSubmissionInstance:async()=>{events.push('ensureSubmissionInstance');return 105},
    saveDraft:async payload=>{events.push('saveDraft');assert.equal(payload.id,105);return {id:105,draftOnly:false}},
    submitDraft:async id=>{events.push('submitDraft');assert.equal(id,105);return {status:'Submitted'}},
    apiError:error=>error.message,
    console:{error:()=>events.push('consoleError')},
    ...overrides
  };
  const submit=vm.runInNewContext(`${handlerSource}\nsubmitForReview`,state,{timeout:2000});
  return {events,submit,get error(){return error},get busy(){return busy},get step(){return step}};
}

test('click -> confirmation -> save + read-back service -> submit (correct order)',async()=>{
  const h=harness();
  await h.submit();
  const order=['confirm','ensureSubmissionInstance','saveDraft','submitDraft','step:4'];
  let last=-1;
  for(const stage of order){const current=h.events.indexOf(stage);assert.ok(current>last,`${stage}: ${JSON.stringify(h.events)}`);last=current}
  assert.equal(h.error,'');
  assert.equal(h.busy,false);
  assert.equal(h.step,4);
  assert.ok(h.events.some(e=>e.startsWith('stage:Saving indicator values')));
});

test('cancel is safe; it never touches Laravel',async()=>{
  const h=harness({Swal:{fire:async()=>({isConfirmed:false})}});
  await h.submit();
  assert.equal(h.events.includes('ensureSubmissionInstance'),false);
  assert.equal(h.events.includes('saveDraft'),false);
  assert.equal(h.busy,false);
});

test('invalid or unsupported form shows a visible page error and never submits',async()=>{
  const h=harness({method:'upload'});
  await h.submit();
  assert.match(h.error,/Manual data entry/);
  assert.equal(h.events.includes('confirm'),false);
  assert.equal(h.events.includes('submitDraft'),false);
  assert.equal(h.busy,false);
});

test('PUT/save failure remains visible on page and prevents POST',async()=>{
  const h=harness({saveDraft:async()=>{throw new Error('HTTP 422 values.0.value is required')}});
  await h.submit();
  assert.match(h.error,/Saving indicator values.*HTTP 422/);
  assert.equal(h.events.includes('submitDraft'),false);
  assert.equal(h.events.some(e=>e.startsWith('toast:error')),true);
  assert.equal(h.busy,false);
});

test('POST/submit failure remains visible after successful PUT',async()=>{
  const h=harness({submitDraft:async()=>{throw new Error('HTTP 409 revision conflict')}});
  await h.submit();
  assert.match(h.error,/Sending Submission.*HTTP 409/);
  assert.equal(h.events.includes('saveDraft'),true);
  assert.equal(h.step,3);
  assert.equal(h.busy,false);
});
