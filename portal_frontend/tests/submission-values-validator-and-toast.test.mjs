import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { buildSubmissionValuesPayload } from '../src/utils/submissionValues.js';
const src = file => readFileSync(new URL(`../src/${file}`,import.meta.url),'utf8');

test('422 regression: Laravel values.*.indicatorId required / *.value present / *.array',()=>{
 const payload=buildSubmissionValuesPayload({expectedRevision:0,values:{'8':'20'},remarks:{'8':'OK'}});
 assert.equal(payload.expectedRevision,0);
 assert.equal(payload.values.length,1);
 const v=JSON.parse(JSON.stringify(payload)).values[0];
 assert.equal(Array.isArray(v),false,'a nested row array loses Laravel dot-key fields');
 assert.equal(typeof v,'object');
 assert.equal(v.indicatorId,8);
 assert.equal(v.value,'20');
 assert.equal(v.remarks,'OK');
});

test('a dimension-only/remark-only indicator keeps a value key even if no current value was entered',()=>{
 const payload=buildSubmissionValuesPayload({expectedRevision:6,remarks:{'9':'Pending validation'},dimensionValues:{'10:3:20':'5'}});
 assert.deepEqual(payload.values.map(v=>v.indicatorId),[9,10]);
 assert.deepEqual(payload.values.map(v=>v.value),[null,null]);
 assert.deepEqual(payload.values[1].breakdowns,[{dimensionId:3,optionId:20,value:'5'}]);
 assert.ok(payload.values.every(v=>Object.hasOwn(v,'value')));
});

test('global SweetAlert2 toast handles 4 severities and attention/details aliases',()=>{
 const adapter=src('utils/portalAlerts.js');
 const provider=src('components/Toast/ToastProvider.jsx');
 const css=src('components/Toast/Toast.css');
 for(const severity of ['success','error','warning','info']) assert.ok(adapter.includes(severity));
 for(const alias of ['attention','details'])assert.ok(adapter.includes(alias));
 assert.match(adapter,/position: 'top-end'/);
 assert.match(adapter,/showCloseButton: true/);
 assert.match(adapter,/showCancelButton \|\| options.showDenyButton/);
 assert.match(adapter,/if \(isInteractiveAlert\(options\)\) return Swal.fire/);
 assert.match(provider,/showPortalToast/);
 assert.doesNotMatch(provider,/from ["']toastr["']/);
 assert.match(css,/viwanda-swal-toast/);
});

test('all existing SweetAlert2 informational alerts use the shared wrapper',()=>{
 const dirs=['pages/ModulePage','pages/Admin','pages/DataEntry','pages/SubmissionPeriods'];
 let found=0;
 for(const dir of dirs)for(const file of readdirSync(new URL(`../src/${dir}/`,import.meta.url))){
  if(!file.endsWith('.jsx'))continue;
  const text=src(`${dir}/${file}`);
  if(text.includes('Swal.fire(')){
    found++;
    assert.match(text,/import Swal from ["'](?:\.\.?\/)+utils\/portalAlerts["']/);
    assert.doesNotMatch(text,/import Swal from ["']sweetalert2["']/);
  }
 }
 assert.ok(found>=10);
});

// Regression: notification must be a genuinely small popup, not a viewport-wide
// SweetAlert2 overlay or the old 430px notification panel.
test('toast is fixed to a compact top-right container without changing confirmation dialogs', () => {
  const js=src('utils/portalAlerts.js');
  const css=src('components/Toast/Toast.css');
  assert.match(js, /container: 'viwanda-swal-toast-container'/);
  assert.match(css, /\.swal2-container\.viwanda-swal-toast-container/);
  assert.match(css, /width: min\(326px, calc\(100vw - 28px\)\) !important/);
  assert.match(css, /height: auto !important/);
  assert.match(css, /left: auto !important/);
  assert.match(css, /bottom: auto !important/);
  assert.match(css, /background: transparent !important/);
  assert.match(css, /pointer-events: none/);
  assert.match(css, /max-height: 150px/);
  assert.doesNotMatch(css, /430px/);
  assert.doesNotMatch(css, /body \.swal2-container\.swal2-top-end\s*\{/);
  assert.match(js, /details\.textContent = 'View details'/);
  assert.match(js, /text: content/);
  assert.match(js, /text: preview/);
});
