import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=(path)=>fs.readFileSync(new URL('../src/'+path,import.meta.url),'utf8');
const ds=read('pages/ModulePage/Datasets.jsx');
const css=read('pages/ModulePage/datasets.css');
const data=read('pages/DataEntry/DataEntry.jsx');
test('Dataset Builder only three steps and no target/period/configuration-progress UI',()=>{
 assert.match(ds,/const steps=\['Basic Information','Indicators & Dimensions','Review & Submit'\]/);
 assert.doesNotMatch(ds,/Available Submission Periods|Add Target|targetValue|Configuration Progress \(Laravel\)|<div className="ds-progress-row"/);
 assert.match(ds,/Version History/);
});
test('Basic information is compact, two columns, correct method and read-only institution',()=>{
 for(const v of ['ds-basic-grid','ds-institution-card','ds-method-frequency','Source System Name','Reporting Frequency','Responsible IDO/DDO','Assign Myself','textarea rows={3}'])assert.ok(ds.includes(v),v);
 assert.match(ds,/\{value:'manual',label:'Manual'\},\{value:'system',label:'System'\}/);
 assert.match(css,/ds-basic-grid\{display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
 assert.match(ds,/form\.collectionMethod==='system'&&<Field/);
 assert.doesNotMatch(ds,/label:'Portal'/);
 assert.match(ds,/readOnly=\{existingDatasetLocked\}/);
 assert.match(ds,/name="ds-method" disabled=\{readOnly\}/);
});
test('Indicator screen preserves name, type, unit, required, aggregation, dimension options and actions',()=>{
 for(const v of ['Dataset Indicators','Add Indicator','Indicator Name (English)','Data Type','Unit (numeric only)','Required','Aggregation','Display Order','Dimension Categories','Category Options','Edit Indicator & Dimensions','RowActionsMenu'])assert.ok(ds.includes(v),v);
});
test('Dataset action menu and New Submission five-step structure are unchanged',()=>{
 for(const v of ['View Details','Edit Dataset','View Reporting Calendar','Indicators & Dimensions','Deactivate Dataset'])assert.ok(ds.includes(v),v);
 assert.match(ds,/<RowActionsMenu label=\{`Dataset actions/);
 assert.match(data,/const STEPS = \["Dataset", "Submission Method", "Data Entry", "Review", "Submit"\]/);
});
