/**
 * FILE: src/components/IdleSessionGuard.jsx
 * FR-051 Session Timeout (9 Nov 2026, approved mockup). Mounted once in the signed-in layout.
 * - Activity = key press, click, touch, scroll or mouse movement.
 * - 2 minutes before the limit (default 15 min, from /me "session_idle_minutes") a dialog counts down.
 * - At the limit the user is signed out; the sign-in page explains why.
 * - While the user is active but the page makes no requests (e.g. typing a long form), GET /me is called every
 *   few minutes so Laravel does not end the session underneath an active user.
 * Clocks use Date.now(), so a laptop that slept past the limit signs out as soon as it wakes.
 */
import {useCallback, useEffect, useRef, useState} from 'react';
import api from '../API/axios';
import {useLanguage} from '../i18n/LanguageContext.jsx';
import {lastApiUseAt, rememberSignOutReason} from '../utils/sessionClock.js';
import './PrivacyNotice.css';

const WARN_MS = 2 * 60 * 1000;
const KEEP_ALIVE_MS = 4 * 60 * 1000;

export default function IdleSessionGuard({minutes = 15, onSignOut}) {
  const {pick} = useLanguage();
  const limit = Math.max(3, Number(minutes) || 15) * 60 * 1000;
  const lastActivity = useRef(0);
  const ended = useRef(false);
  const [left, setLeft] = useState(null); // ms left while the warning is open

  const signOut = useCallback(() => {
    if (ended.current) return;
    ended.current = true;
    rememberSignOutReason('idle');
    onSignOut?.();
  }, [onSignOut]);

  useEffect(() => {
    lastActivity.current = Date.now();
    let lastMove = 0;
    const touch = event => {
      if (ended.current) return;
      if (event.type === 'mousemove') { const now = Date.now(); if (now - lastMove < 1000) return; lastMove = now; }
      lastActivity.current = Date.now();
      setLeft(current => (current === null ? current : null));
    };
    const events = ['keydown', 'mousedown', 'touchstart', 'wheel', 'scroll', 'mousemove'];
    events.forEach(name => window.addEventListener(name, touch, {passive: true, capture: true}));
    const tick = window.setInterval(() => {
      if (ended.current) return;
      const now = Date.now();
      const idle = now - lastActivity.current;
      if (idle >= limit) { signOut(); return; }
      setLeft(idle >= limit - WARN_MS ? limit - idle : null);
      // Active user, quiet page: keep the Laravel token alive.
      if (idle < KEEP_ALIVE_MS && now - lastApiUseAt() > KEEP_ALIVE_MS) void api.get('/me').catch(() => { /* 401 handled by axios */ });
    }, 1000);
    return () => { events.forEach(name => window.removeEventListener(name, touch, {capture: true})); window.clearInterval(tick); };
  }, [limit, signOut]);

  if (left === null) return null;
  const seconds = Math.max(0, Math.ceil(left / 1000));
  const clock = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  const share = Math.max(0, Math.min(100, (left / WARN_MS) * 100));
  const total = Math.round(limit / 60000);
  const spoken = pick(`${Math.floor(seconds / 60) ? `${Math.floor(seconds / 60)} minute${Math.floor(seconds / 60) > 1 ? 's' : ''} ` : ''}${seconds % 60} seconds`,
    `${Math.floor(seconds / 60) ? `dakika ${Math.floor(seconds / 60)} ` : ''}sekunde ${seconds % 60}`);
  return <div className="vw-idle-overlay" role="presentation">
    <section className="vw-idle" role="alertdialog" aria-modal="true" aria-labelledby="vw-idle-title" aria-describedby="vw-idle-text">
      <div className="vw-idle-ring" style={{background: `conic-gradient(#e0a100 0 ${share}%, #f1f4f9 0)`}}><b>{clock}</b></div>
      <h2 id="vw-idle-title">{pick('Are you still there?', 'Bado upo?')}</h2>
      <p id="vw-idle-text">{pick(`For security, the portal signs you out after ${total} minutes without activity. You will be signed out in `,
        `Kwa usalama, portal inakutoa baada ya dakika ${total} bila shughuli. Utatolewa baada ya `)}<b>{spoken}</b>.</p>
      <div className="vw-idle-btns">
        <button type="button" className="vw-idle-stay" autoFocus onClick={() => { lastActivity.current = Date.now(); setLeft(null); void api.get('/me').catch(() => {}); }}>
          {pick('Stay signed in', 'Endelea kuwepo')}</button>
        <button type="button" className="vw-idle-out" onClick={signOut}>{pick('Sign out now', 'Toka sasa')}</button>
      </div>
      <p className="vw-idle-note">{pick('Any key, click or scroll on the page also keeps you signed in.', 'Kubofya, kuandika au kusogeza ukurasa pia kunakuweka ndani.')}</p>
    </section>
  </div>;
}
