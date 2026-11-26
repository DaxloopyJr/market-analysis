/**
 * FILE: src/pages/Login/MfaVerify.jsx
 * STEP 2 of sign-in, shown only when POST /login returns mfa_required:true.
 * FLOW: Login.jsx -> MfaVerify -> API/login.jsx (submitMfaCode / resendMfaCode)
 *   -> POST /mfa/login/verify | /mfa/login/resend -> token -> /me -> dashboard.
 * Laravel enforces expiry (10 min), 5 failed attempts and single use; the timer is informational.
 */
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Clock3, Mail, MessageSquare, RotateCcw, ShieldCheck } from 'lucide-react';
import { resendMfaCode, submitMfaCode } from '../../API/login';
import { showUserFacingError } from '../../utils/userFacingErrors.js';
import { showPortalToast } from '../../utils/portalAlerts';

const OTP_LENGTH = 6;
const secondsLeft = (iso) => Math.max(0, Math.ceil((Date.parse(iso) - Date.now()) / 1000));

export default function MfaVerify({ challenge: initial, lang = 'EN', onCancel, onVerified }) {
  const sw = lang === 'SW';
  const [challenge, setChallenge] = useState(initial);
  const [digits, setDigits] = useState(Array(OTP_LENGTH).fill(''));
  const [remaining, setRemaining] = useState(() => secondsLeft(initial.expiresAt));
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);
  const inputs = useRef([]);

  useEffect(() => {
    const tick = () => setRemaining(secondsLeft(challenge.expiresAt));
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [challenge.expiresAt]);
  useEffect(() => { inputs.current[0]?.focus(); }, [challenge.challengeId]);

  const code = digits.join('');
  const setDigit = (index, raw) => {
    const value = raw.replace(/\D/g, '');
    if (value.length > 1) {
      const all = value.slice(0, OTP_LENGTH).split('');
      setDigits((current) => current.map((digit, i) => all[i] ?? digit));
      inputs.current[Math.min(all.length, OTP_LENGTH - 1)]?.focus();
      return;
    }
    setDigits((current) => current.map((digit, i) => (i === index ? value : digit)));
    if (value && index < OTP_LENGTH - 1) inputs.current[index + 1]?.focus();
  };

  async function verify(event) {
    event.preventDefault();
    if (busy) return;
    if (code.length !== OTP_LENGTH || remaining === 0) {
      void showUserFacingError(sw ? 'Weka namba 6 za msimbo kabla muda haujaisha.' : 'Enter the complete 6-digit code before it expires.',
        sw ? 'Kagua msimbo' : 'Check the code');
      return;
    }
    setBusy(true);
    try {
      const result = await submitMfaCode(challenge.challengeId, code, lang);
      if (!result.ok) {
        setDigits(Array(OTP_LENGTH).fill(''));
        inputs.current[0]?.focus();
        void showUserFacingError(result.message, result.title || (sw ? 'Uthibitisho umeshindikana' : 'Verification failed'));
        return;
      }
      onVerified(result);
    } finally { setBusy(false); }
  }

  async function resend() {
    if (resending) return;
    setResending(true);
    try {
      const result = await resendMfaCode(challenge.challengeId, lang);
      if (!result.ok) { void showUserFacingError(result.message, result.title || (sw ? 'Imeshindikana kutuma' : 'Could not resend')); return; }
      setChallenge(result.challenge);
      setRemaining(secondsLeft(result.challenge.expiresAt));
      setDigits(Array(OTP_LENGTH).fill(''));
      showPortalToast({ type: 'success', title: sw ? 'Msimbo umetumwa' : 'Code sent', message: result.message });
    } finally { setResending(false); }
  }

  const via = challenge.method === 'sms' ? 'SMS' : 'email';
  const mm = String(Math.floor(remaining / 60)).padStart(2, '0');
  const ss = String(remaining % 60).padStart(2, '0');
  return (
    <div className="form-card shadow-sm recovery-card mfa-card">
      <button type="button" className="auth-back-link mfa-back" onClick={onCancel} disabled={busy}>
        <ArrowLeft size={16} /> {sw ? 'Rudi Login' : 'Back to Sign In'}
      </button>
      <div className="auth-steps" aria-label="Sign-in steps">
        <div className="done"><i>✓</i><span>{sw ? 'Password' : 'Password'}</span></div><hr />
        <div className="on" aria-current="step"><i>2</i><span>{sw ? 'Msimbo' : 'Verification code'}</span></div>
      </div>
      <div className="recovery-head">
        <span className="recovery-head-icon"><ShieldCheck /></span>
        <h1>{sw ? 'Thibitisha kuingia' : 'Verify sign-in'}</h1>
        <p>{sw ? `Weka msimbo wa tarakimu 6 uliotumwa kwa ${via}` : `Enter the 6-digit code sent by ${via}`}
          {challenge.maskedDestination && <> {sw ? 'kwenda' : 'to'} <b>{challenge.maskedDestination}</b></>}.</p>
      </div>
      <form className="viwanda-auth-form" onSubmit={verify} noValidate>
        <div className="mfa-method">{challenge.method === 'sms' ? <MessageSquare size={15} /> : <Mail size={15} />}
          {challenge.method === 'sms' ? 'SMS' : 'Email'}</div>
        <div className="recovery-otp-row" onPaste={(e) => { const text = e.clipboardData.getData('text').trim(); if (/^\d{6}$/.test(text)) { e.preventDefault(); setDigits(text.split('')); inputs.current[5]?.focus(); } }}>
          {digits.map((digit, index) => (
            <input key={index} ref={(node) => { inputs.current[index] = node; }} value={digit} inputMode="numeric" pattern="[0-9]*"
              autoComplete={index === 0 ? 'one-time-code' : 'off'} maxLength={OTP_LENGTH} aria-label={`Code digit ${index + 1}`} disabled={busy}
              onChange={(e) => setDigit(index, e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Backspace' && !digit && index) inputs.current[index - 1]?.focus(); }} />
          ))}
        </div>
        <div className={`recovery-timer ${remaining === 0 ? 'expired' : ''}`}><Clock3 size={17} />
          {remaining === 0 ? <span>{sw ? 'Msimbo umeisha muda. Omba mpya.' : 'Code expired. Send a new code.'}</span>
            : <><strong>{mm}:{ss}</strong> {sw ? 'zimebaki' : 'remaining'}</>}
        </div>
        {challenge.devCode && <p className="mfa-dev-code">Test code (non-production): <b>{challenge.devCode}</b></p>}
        <button className="form-submit btn btn-success" type="submit" disabled={busy || remaining === 0 || code.length !== OTP_LENGTH}>
          {busy ? (sw ? 'Inathibitisha...' : 'Verifying...') : (sw ? 'Thibitisha na uingie' : 'Verify & Sign In')}
        </button>
        <button type="button" className="recovery-text-button mfa-resend" onClick={resend} disabled={resending || busy}>
          <RotateCcw size={14} /> {resending ? (sw ? 'Inatuma...' : 'Sending...') : (sw ? 'Tuma msimbo mpya' : 'Send a new code')}
        </button>
        <p className="recovery-help">{sw ? 'Msimbo unaisha baada ya dakika 10 na unaruhusu majaribio 5.' : 'The code expires after 10 minutes and allows 5 attempts.'}</p>
      </form>
    </div>
  );
}
