import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=(file)=>readFileSync(new URL(`../src/${file}`,import.meta.url),'utf8');
const sidebar=read('components/Sidebar.jsx');
const dataEntry=read('pages/DataEntry/DataEntry.jsx');
const css=read('pages/DataEntry/DataEntry.css');

test('Collapsed sidebar is a single-open accordion rather than an array of simultaneous flyouts',()=>{
 assert.match(sidebar,/const \[expandedGroup, setExpandedGroup\] = useState\(null\)/);
 assert.match(sidebar,/setExpandedGroup\(\(current\) => current === groupId \? null : groupId\)/);
 assert.match(sidebar,/const groupExpanded = expandedGroup === item.id/);
 assert.match(sidebar,/if \(collapsed\) \{\s*setExpandedGroup\(null\)/);
 assert.match(sidebar,/onKeyDown=\{\(event\) => \{ if \(event.key === "Escape"\)/);
});
test('New Submission review has value, annual target, performance and remarks columns',()=>{
 assert.match(dataEntry,/className="viwanda-table ido-review-table"/);
 assert.match(dataEntry,/<th scope="col">Indicator<\/th><th scope="col">Current value<\/th><th scope="col">Annual Target<\/th><th scope="col">Performance<\/th><th scope="col">Remarks<\/th>/);
 assert.doesNotMatch(dataEntry,/className="table-responsive ido-indicator-table-wrap"/);
 assert.match(dataEntry,/className="ido-review-dimension-options"/);
 assert.match(css,/\.ido-review-table\{width:100%;min-width:0;table-layout:fixed/);
 assert.match(css,/@media\(max-width:760px\)/);
});
