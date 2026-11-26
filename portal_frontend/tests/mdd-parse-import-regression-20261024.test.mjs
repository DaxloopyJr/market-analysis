import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';

const serviceUrl=new URL('../src/services/mddApprovalService.jsx',import.meta.url);

test('MDD approval service parses as an ES module without duplicate import bindings',()=>{
  const code=readFileSync(serviceUrl,'utf8');
  const required="import {sourceOf,sourceOfDataset} from '../utils/mdoReviewRules.js';";
  assert.equal(code.split(required).length-1,1,'sourceOf and sourceOfDataset must only be imported once');
  const result=spawnSync(process.execPath,['--check','--input-type=module'],{input:code,encoding:'utf8'});
  assert.equal(result.status,0,result.stderr||'MDD service syntax check failed');
});
