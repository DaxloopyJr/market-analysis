import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, readFileSync} from 'node:fs';
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('Login left brand panel stays original; only the form side has the faded building', () => {
  const css = read('src/pages/Login/Login.css');
  assert.match(css, /login-architecture-feathered\.png/);
  assert.doesNotMatch(css, /flag-ribbon\.svg|ministry-building-panel/);
  assert.match(css, /ministry-building-bg\.jpg/);
  assert.ok(existsSync(new URL('../public/reference/ministry-building-bg.jpg', import.meta.url)));
});

test('Login keeps its API flow and moves EN/SW into the card header', () => {
  const src = read('src/pages/Login/Login.jsx');
  // FR-058 (9 Nov 2026): the Privacy Notice acceptance travels with the credentials.
  assert.match(src, /submitLogin\(\{ email, password \}, lang\)/);
  assert.match(src, /className="auth-lang"/);
  assert.match(src, /auth-forgot-row/);
});

test('Recovery pages show stepper and shared password checklist', () => {
  assert.match(read('src/pages/Login/ForgotPassword.jsx'), /auth-steps/);
  for (const file of ['ForgotPassword', 'ActivateAccount', 'ResetPassword']) {
    assert.match(read(`src/pages/Login/${file}.jsx`), /<PasswordChecklist/, file);
  }
  assert.match(read('src/pages/Login/ActivateAccount.jsx'), /activateUserAccount\(\{ login, token, password, password_confirmation: confirm \}\)/);
});

test('Home page: approved public statistics page (5 Nov 2026) keeps the original hero photo', () => {
  const src = read('src/pages/Home/Home.jsx');
  for (const part of ['ph-ticker', 'ph-kpis', 'ph-prices', 'ph-band', 'ph-institutions', 'ph-cta', 'PUBLIC_API_READY', 'SAMPLE_DATA']) assert.ok(src.includes(part), part);
  assert.match(read('src/pages/Home/Home.css'), /pexels-photo-167676/);
  assert.doesNotMatch(read('src/pages/Home/Home.css'), /v24/);
});

test('My Profile shows one tab panel at a time and keeps the change-password contract', () => {
  const src = read('src/pages/Profile/AppearancePreferences.jsx');
  for (const marker of ['vw-pf-hero', 'role="tabpanel"', 'tab === "security"', 'changeOwnPassword', '<PasswordChecklist', 'Different from current password', 'Light', 'Dark', 'Auto (device)', 'Reset Theme']) {
    assert.ok(src.includes(marker), marker);
  }
});
