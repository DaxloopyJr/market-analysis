import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read = p => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('FR-051: idle guard warns 2 minutes before the limit, signs out, keeps an active user alive', () => {
  const guard = read('src/components/IdleSessionGuard.jsx');
  assert.match(guard, /const WARN_MS = 2 \* 60 \* 1000/);
  assert.match(guard, /rememberSignOutReason\('idle'\)/);
  assert.match(guard, /api\.get\('\/me'\)/);
  assert.match(read('src/layouts/DashboardLayout.jsx'), /<IdleSessionGuard minutes=\{user\?\.session_idle_minutes \?\? 15\}/);
  assert.match(read('src/API/axios.jsx'), /error\.response\?\.data\?\.code === "session_idle"/);
  assert.match(read('src/pages/Login/Login.jsx'), /signedOut === "idle"/);
});

test('FR-058: notice is read from the sign-in page and accepted once after sign-in; MOA manages versions', () => {
  const login = read('src/pages/Login/Login.jsx');
  assert.doesNotMatch(login, /auth-privacy"|privacyAccepted/);
  assert.match(login, /Read the Privacy Notice/);
  assert.match(read('src/utils/privacyGate.js'), /server \? Boolean\(server\.needs_acceptance\)/);
  assert.match(read('src/layouts/DashboardLayout.jsx'), /<PrivacyGate user=\{user\}/);
  assert.match(read('src/API/privacyNotice.js'), /api\.post\('\/privacy-notices', values\)/);
  const notice = read('src/components/PrivacyNotice.jsx');
  assert.match(notice, /Personal Data Protection Act, 2022/);
  assert.match(notice, /export function NoticeBody/);
});
