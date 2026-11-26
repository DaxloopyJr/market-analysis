import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { busyLabel } from '../src/utils/busyButtons.js';

test('busy label follows the action word (English and Kiswahili)', () => {
  assert.equal(busyLabel('Sign In'), 'Signing in...');
  assert.equal(busyLabel('Ingia'), 'Inaingia...');
  assert.equal(busyLabel(' Save Draft '), 'Saving...');
  assert.equal(busyLabel('Return for Correction'), 'Returning...');
  assert.equal(busyLabel('Approve'), 'Approving...');
  assert.equal(busyLabel('Something else'), 'Please wait...');
  assert.equal(busyLabel(''), '');
});

test('axios links write requests to the clicked button on success and on error', () => {
  const src = readFileSync(new URL('../src/API/axios.jsx', import.meta.url), 'utf8');
  assert.match(src, /installBusyButtons\(\)/);
  assert.match(src, /busyOnRequest\(config\)/);
  assert.match(src, /busyOnResponse\(response\.config\)/);
  assert.match(src, /busyOnResponse\(error\.config\)/);
  const util = readFileSync(new URL('../src/utils/busyButtons.js', import.meta.url), 'utf8');
  assert.match(util, /method === 'get'/);            // GET never changes a button
  assert.match(util, /swal2-container/);             // confirm dialog -> opener shows the spinner
  assert.match(util, /vw-actions-popup/);            // ⋮ menu -> its trigger shows the spinner
});

test('login button shows "Signing in..." and fields lock while signing in', () => {
  const src = readFileSync(new URL('../src/pages/Login/Login.jsx', import.meta.url), 'utf8');
  assert.match(src, /data-busy-text=\{lang === "SW" \? "Inaingia\.\.\." : "Signing in\.\.\."\}/);
  // email, password and the button
  assert.equal((src.match(/disabled=\{submitting \|\| transitioning\}/g) || []).length, 3);
});
