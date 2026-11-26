import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fetchUiPage,PAGE_SIZES} from '../src/utils/pagedFetch.js';
import {toCsv} from '../src/utils/csvExport.js';
const read=p=>readFileSync(new URL(`../${p}`,import.meta.url),'utf8');
test('rows-per-page choices end at 500 (no All)',()=>{assert.deepEqual(PAGE_SIZES,[10,20,50,100,200,500]);});
test('200 / 500 rows are read as consecutive server pages of 100',async()=>{
  const calls=[];const data=Array.from({length:1234},(_,i)=>i+1);
  const fetchPage=async(p,per)=>{calls.push([p,per]);return {items:data.slice((p-1)*per,p*per),total:data.length,lastPage:Math.ceil(data.length/per)};};
  const r=await fetchUiPage(fetchPage,2,500);
  assert.deepEqual(calls,[[6,100],[7,100],[8,100],[9,100],[10,100]]);
  assert.equal(r.items[0],501);assert.equal(r.items.length,500);assert.equal(r.lastPage,3);
  calls.length=0;const small=await fetchUiPage(fetchPage,3,50);
  assert.deepEqual(calls,[[3,50]]);assert.equal(small.items[0],101);
});
test('every paginated table has the Rows per page control',()=>{
  for(const p of ['src/pages/AO/AoApprovals.jsx','src/pages/HOD/HodInbox.jsx','src/pages/HOD/HodReviewed.jsx','src/pages/Submissions/Submissions.jsx',
    'src/pages/MDO/MdoWorkspace.jsx','src/pages/Admin/ApprovalCircle.jsx','src/pages/Admin/Delegations.jsx',
    'src/pages/Admin/Users.jsx','src/pages/Admin/Institutions.jsx','src/pages/Admin/MinistryDepartments.jsx','src/pages/Admin/InstitutionalAdmins.jsx',
    'src/pages/ModulePage/Datasets.jsx','src/pages/ModulePage/ReferenceData.jsx','src/pages/Notifications/Notifications.jsx',
    'src/pages/SubmissionPeriods/SubmissionPeriods.jsx','src/pages/AuditLogs/AuditLogs.jsx'])
    assert.match(read(p),/<PageSizeSelect /,p);
  assert.match(read('src/pages/MDD/MddWorkspace.jsx'),/onPerPage=\{setPerPage\}/);
});
test('audit export: all filtered pages of 100, CSV with BOM-safe quoting',()=>{
  const page=read('src/pages/AuditLogs/AuditLogs.jsx');
  assert.match(page,/listAuditEvents\(\{\.\.\.filters,\.\.\.searchParams,page:serverPage,perPage:SERVER_MAX_PER_PAGE\}\)/);
  assert.match(page,/downloadCsv\(`audit-logs_/);
  assert.equal(toCsv(['A','B'],[['x,y','say "hi"']]),'A,B\r\n"x,y","say ""hi"""');
});
