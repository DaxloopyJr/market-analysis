import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {humanize,eventTone,actorOf,changeRows} from '../src/utils/auditDisplay.js';
const read=p=>readFileSync(new URL(`../${p}`,import.meta.url),'utf8');
test('audit API uses the confirmed lowercase endpoints and query names',()=>{
  const api=read('src/API/audit.jsx');
  assert.match(api,/api\.get\('\/audit-events',/);
  assert.match(api,/api\.get\(`\/audit-events\/\$\{value\}`\)/);
  assert.doesNotMatch(api,/api\.get\(['`]\/(audit-logs|Audit)/);
  const page=read('src/pages/AuditLogs/AuditLogs.jsx');
  for(const q of ['startDate','endDate','eventType','entityType','actorType','requestId','entityId'])assert.ok(page.includes(q),q);
  assert.match(page,/<RowActionsMenu/);assert.match(page,/useErrorDialogState/);
  assert.match(read('src/App.jsx'),/moduleId === "audit" \? \(\s*<AuditLogs \/>/);
});
test('audit display helpers',()=>{
  assert.equal(humanize('hod_review_values_corrected'),'HOD review values corrected');
  assert.equal(eventTone('user_role_deleted'),'red');assert.equal(eventTone('submission_published'),'violet');
  assert.equal(actorOf({actorType:'system'}).name,'System');
  assert.equal(actorOf({actor:{name:'Juma Said',actingRole:'IHOD',roles:[{code:'IHOD'}]}}).role,'acting as IHOD');
  const rows=changeRows({oldValues:{total:338},newValues:{total:340,remarks:'x'}});
  assert.deepEqual(rows.map(r=>[r.field,r.before,r.after]),[['Total','338','340'],['Remarks','—','x']]);
});
