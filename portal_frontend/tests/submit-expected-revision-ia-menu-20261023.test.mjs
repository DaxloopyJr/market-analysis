import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const get=name=>readFileSync(new URL(name,import.meta.url),'utf8');
const api=get('../src/API/submission.jsx');
const service=get('../src/services/idoSubmissionService.jsx');
const sidebar=get('../src/config/sidebarMenu.js');
const jsx=get('../src/pages/Admin/ApprovalCircle.jsx');
test('submit sends expectedRevision using verified plural lowercase URL',()=>{
 assert.match(api,/api\.post\(path, \{expectedRevision:Number\(expectedRevision\)\}\)/);
 assert.match(api,/const path = \`\/submissions\/\$\{checkedId\(id\)\}\/submit\`/);
 assert.doesNotMatch(api,/api\.post\(\`\/submission\//);
});
test('submit reads latest revision from GET before POST and rejects missing revision',()=>{
 assert.match(service,/const before=await getSubmissionById\(null,id\)/);
 assert.match(service,/const expectedRevision = submissionExpectedRevision\(before\)/);
 assert.match(service,/if \(expectedRevision === null\)/);
 assert.match(service,/postSubmitSubmission\(id,\{expectedRevision\}\)/);
});
test('IA scoped Approval Circle shows even if /me omits menu or permission',()=>{
 assert.match(sidebar,/const isIA = user\.role_code === 'IA' \|\| user\.roles\?\.some/);
 assert.match(sidebar,/p\.has\('approval_circle\.manage\.institution'\)/);
 assert.match(jsx,/const scope=user\?\.permissions\?\.includes\('approval_circle\.manage\.ministry'\)\?'ministry':'institution'/);
});
