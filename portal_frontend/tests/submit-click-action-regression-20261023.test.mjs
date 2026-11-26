import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {hasEnteredSubmissionValues} from '../src/utils/submissionValues.js';

const component=readFileSync(new URL('../src/pages/DataEntry/DataEntry.jsx',import.meta.url),'utf8');
const read=path=>readFileSync(new URL(`../src/${path}`,import.meta.url),'utf8');

test('Submit imports the actual value-check helper used in the onClick handler',()=>{
  const expectedImport=/import\s*\{[^}]*\bhasEnteredSubmissionValues\b[^}]*\}\s*from\s*["']\.\.\/\.\.\/utils\/submissionValues["']/;
  assert.match(component,expectedImport,'Do not call an undefined helper at click time');
  assert.equal(hasEnteredSubmissionValues({values:{8:'123'},remarks:{},dimensionValues:{}}),true);
  assert.equal(hasEnteredSubmissionValues({values:{},remarks:{},dimensionValues:{}}),false);
});

test('Submit stays clickable to explain invalid period or method instead of failing silently',()=>{
  assert.match(component,/onClick=\{submitForReview\}/);
  const pos=component.indexOf('onClick={submitForReview}');
  assert.ok(pos>0);
  const button=component.slice(component.lastIndexOf('<button',pos),component.indexOf('</button>',pos));
  assert.match(button,/disabled=\{busy\}/);
  assert.doesNotMatch(button,/!periodEligible|method!==|!submissionWritesReady/);
  const handler=component.slice(component.indexOf('async function submitForReview()'),component.indexOf('\n  if (loading) return'));
  assert.match(handler,/const message='The dataset or reporting period is not eligible/);
  assert.match(handler,/const message='This submission method is not available yet/);
  assert.doesNotMatch(handler,/showToast\(\{type:'warning'/);
  assert.match(handler,/const confirmation=await Swal\.fire/);
  assert.match(handler,/const saved=await persistDraft\(\{quiet:true\}\)/);
  assert.match(handler,/const result=await submitDraft\(id\)/);
});

test('Final submit path and values contract stay unchanged',()=>{
  const api=read('API/submission.jsx');
  const service=read('services/idoSubmissionService.jsx');
  assert.match(api,/\/submissions\/\$\{[^\n]*\/submit/);
  assert.match(api,/\/submissions\/\$\{[^\n]*\/values/);
  assert.match(service,/await postSubmitSubmission\(id,\{expectedRevision\}\)/);
});
