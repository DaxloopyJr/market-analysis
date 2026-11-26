import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read = path => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');

test('Dataset list uses the modern header, status KPIs, tabs and charts from real list data', () => {
  const ds = read('pages/ModulePage/Datasets.jsx');
  assert.match(ds, /<MuHeader logo=\{org\.logo\}/);
  assert.match(ds, /title="All datasets"/);
  assert.match(ds, /<MuTabs label="Filter by status"/);
  assert.match(ds, /allDatasetOptions\(p=>api\.list\(\{page:p,perPage:100\}\)\)/);
  assert.match(ds, /title="Datasets by status"/);
  assert.match(ds, /<RowActionsMenu label=\{`Dataset actions/);
});

test('Dataset dialog: split Basic step, indicator cards, live Performance direction, review indicators table', () => {
  const ds = read('pages/ModulePage/Datasets.jsx');
  assert.match(ds, /className="ds-basic-split"/);
  assert.match(ds, /Responsible Officer/);
  assert.match(ds, /className="ds-ind-list"/);
  assert.match(ds, /title="Performance direction"/);
  // v31: radios are live and saved as performanceDirection (disabled only when not editable).
  assert.match(ds, /name="ds-direction" disabled=\{!editable\}/);
  assert.match(ds, /performanceDirection:form.performanceDirection/);
  assert.match(ds, /className="ds-review-stats"/);
  assert.match(ds, /ds-review-indicators/);
  // Direction column only when Laravel supplies the field.
  assert.match(ds, /hasDirection=indicators\.some\(row=>row\.indicator\?\.performanceDirection\)/);
});

test('Toast icons are drawn as crisp SVGs instead of the shrunk SweetAlert icon', () => {
  const css = read('components/Toast/Toast.css');
  assert.match(css, /viwanda-swal-toast > \.swal2-icon > \*\{display:none!important\}/);
  for (const type of ['success', 'error', 'warning', 'info']) assert.match(css, new RegExp(`\\.swal2-icon\\.swal2-${type}\\{background-image:url`));
});
