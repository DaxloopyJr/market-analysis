import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PAGE_SW as pagesSw} from '../src/i18n/pages.sw.js';

test('report sector options read the reference-data name, not the id', () => {
  const src = readFileSync(new URL('../src/services/meReportService.js', import.meta.url), 'utf8');
  assert.match(src, /item\.data_value_name_en/);
});

test('sector names have Swahili labels', () => {
  assert.equal(pagesSw.Industry, 'Viwanda');
  assert.equal(pagesSw.Trade, 'Biashara');
});
