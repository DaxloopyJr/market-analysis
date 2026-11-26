import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {listResult} from '../src/API/resourceHelpers.js';
const read = p => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('root Laravel paginators keep their paging, so every page of a list is read', () => {
  const r = listResult({data: {current_page: 1, data: [{id: 1}], total: 272, last_page: 3, per_page: 100}});
  assert.equal(r.lastPage, 3);
  assert.equal(r.total, 272);
  assert.equal(r.paginated, true);
  const plain = listResult({data: {status: 'success', data: [{id: 1}, {id: 2}]}});
  assert.equal(plain.total, 2);
  assert.equal(plain.lastPage, 1);
});

test('list rows with history need no GET /submissions/{id}; lists ask 100 per page; one filters request', () => {
  assert.match(read('src/services/submissionReadService.js'), /Array\.isArray\(row\?\.history \?\? row\?\.approvalHistory/);
  assert.match(read('src/services/adminOverviewService.js'), /perPage: size, per_page: size/);
  assert.match(read('src/services/institutionLogoService.js'), /reportFiltersRaw\(\)/);
});
