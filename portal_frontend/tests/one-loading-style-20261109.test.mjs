import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read = p => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('one in-page loading style: calm by default (style F), skeleton still selectable by administrators', () => {
  assert.match(read('src/contexts/AppearanceContext.jsx'), /tableLoader: "calm" \}/);
  assert.match(read('src/contexts/AppearanceContext.jsx'), /tableLoader: \["none", "calm", "skeleton", "overlay", "progress", "logo"\]/);
  assert.match(read('src/components/common/LoadingState.jsx'), /SKELETON_ROWS\.map/);
  assert.match(read('src/styles/management.css'), /:has\(> \.vw-table-loading--skeleton\) > table > tbody,/);
  for (const page of ['Users', 'Institutions', 'InstitutionalAdmins', 'MinistryDepartments']) {
    assert.doesNotMatch(read(`src/pages/Admin/${page}.jsx`), /alert alert-info[^>]*>Loading/, page);
  }
});
