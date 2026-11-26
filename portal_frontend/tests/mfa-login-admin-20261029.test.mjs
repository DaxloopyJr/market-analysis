import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('MFA API uses the confirmed Laravel routes and payloads', () => {
  const api = read('src/API/mfa.js');
  assert.match(api, /api\.post\("\/mfa\/login\/verify", \{ challenge_id: challengeId, code, device: MFA_DEVICE \}\)/);
  assert.match(api, /api\.post\("\/mfa\/login\/resend", \{ challenge_id: challengeId \}\)/);
  assert.match(api, /data\.mfa_required !== true/);
  // Admin MFA (endpoints 26–29): PUT /users/{id} with JSON booleans; /profile/mfa is not used for admins.
  assert.match(api, /api\.put\(`\/users\/\$\{encodeURIComponent\(id\)\}`, adminMfaFields\(\{ enabled, method \}\)\)/);
  assert.match(api, /mfa_enabled: Boolean\(enabled\), mfa_method: enabled \? \(method === "sms" \? "sms" : "email"\) : null/);
  assert.doesNotMatch(api, /\/profile\/mfa"/);
});

test('Login: no MFA -> token as before; MFA on -> OTP step before any token is stored', () => {
  const login = read('src/API/login.jsx');
  assert.match(login, /const mfa = mfaChallengeFrom\(payload\);\n  if \(mfa\) return \{ mfa, message \};\n  const user = await startSession\(payload\);/);
  assert.match(login, /export async function submitMfaCode/);
  assert.match(login, /authorizeDashboard\(user, message, language\)/);
  const page = read('src/pages/Login/Login.jsx');
  assert.match(page, /<MfaVerify key=\{mfa\.challengeId\}/);
  assert.match(page, /onVerified=\{finishSignIn\}/);
});

test('MFA step: 6 boxes, timer, resend and error dialog', () => {
  const step = read('src/pages/Login/MfaVerify.jsx');
  for (const marker of ['OTP_LENGTH = 6', 'resendMfaCode', 'submitMfaCode', 'showUserFacingError', 'recovery-timer', 'Send a new code']) {
    assert.ok(step.includes(marker), marker);
  }
});

test('MOA and IA (own scope) manage MFA from the Users ⋮ menu and when adding a user', () => {
  const users = read('src/pages/Admin/Users.jsx');
  assert.match(users, /\{canManageMfa && <button type="button" title="Multi-factor authentication"/);
  assert.match(users, /const canManageMfa = roleCodes\(user\)\.some\(\(code\) => ADMIN_MFA_ROLES\.includes\(code\)\)/);
  assert.match(users, /<th>MFA<\/th>/);
  assert.match(users, /if \(canManageMfa && mfaChoice !== "off"\) Object\.assign\(payload, adminMfaFields/);
  assert.match(read('src/API/mfa.js'), /export const ADMIN_MFA_ROLES = \["IA", "MOA"\]/);
  assert.match(read('src/API/users.jsx'), /typeof form\.mfa_enabled === "boolean"/);
  const panel = read('src/pages/Admin/UserMfaPanel.jsx');
  assert.match(panel, /setUserMfa\(user\.id, \{ enabled, method: choice \}\)/);
  assert.match(panel, /next sign-in/);
  assert.doesNotMatch(panel, /adminPassword/);
});
