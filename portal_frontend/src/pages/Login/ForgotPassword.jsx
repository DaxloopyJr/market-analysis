import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Clock3, LockKeyhole, Mail, MessageSquare, ShieldCheck } from 'lucide-react';
import { showUserFacingError } from '../../utils/userFacingErrors.js';
import {
  lookupRecoveryDestination, requestRecoveryOtp, resetPasswordWithOtp,
} from '../../API/accountRecovery';
import AuthShell from './AuthShell';
import PasswordChecklist from './PasswordChecklist';
import './Login.css';

const OTP_LENGTH = 6;
const PASSWORD_RULES = [
  ['At least 10 characters', (value) => value.length >= 10],
  ['One uppercase letter', (value) => /[A-Z]/.test(value)],
  ['One lowercase letter', (value) => /[a-z]/.test(value)],
  ['One number', (value) => /\d/.test(value)],
  ['One special character', (value) => /[^\w\s]/.test(value)],
];

export default function ForgotPassword() {
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState(location.state?.email || '');
  const [channel, setChannel] = useState('email');
  const [step, setStep] = useState('request');
  const [digits, setDigits] = useState(Array(OTP_LENGTH).fill(''));
  const [otpContext, setOtpContext] = useState(null);
  const [masked, setMasked] = useState('');
  const [remaining, setRemaining] = useState(0);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const inputs = useRef([]);
  const [lang] = useState(location.state?.lang || 'EN');
  const sw = lang === 'SW';

  useEffect(() => {
    if (!otpContext?.expiresAt || !['otp', 'password'].includes(step)) return undefined;
    const update = () => setRemaining(Math.max(0, Math.ceil((Date.parse(otpContext.expiresAt) - Date.now()) / 1000)));
    update();
    const id = window.setInterval(update, 1000);
    return () => window.clearInterval(id);
  }, [step, otpContext]);

  async function requestOtp(event) {
    event.preventDefault();
    if (busy) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      void showUserFacingError('Enter a valid registered email address.', 'Invalid email');
      return;
    }
    setBusy(true);
    try {
      const payload = { login: email.trim(), method: channel };
      const lookup = await lookupRecoveryDestination(payload);
      if (!lookup.ok) { void showUserFacingError(lookup.error || lookup.message, 'Destination lookup failed'); return; }
      if (lookup.has_destination === false) { void showUserFacingError('No destination is available for the selected method.', 'Cannot send OTP'); return; }
      const result = await requestRecoveryOtp(payload);
      if (!result.ok) { void showUserFacingError(result.error || result.message, 'OTP request failed'); return; }
      setMasked(result.masked_destination || lookup.masked_destination || '');
      // The Laravel contract defines a fixed 10-minute lifetime but has no expiresAt field.
      // UI timer is informational; Laravel independently enforces actual expiry.
      setOtpContext({ expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString() });
      setDigits(Array(OTP_LENGTH).fill(''));
      setStep('otp');
    } finally { setBusy(false); }
  }

  function setOtpDigit(index, raw) {
    const value = raw.replace(/\D/g, '');
    if (value.length > 1) {
      const all = value.slice(0, OTP_LENGTH).split('');
      setDigits((current) => current.map((digit, i) => all[i] ?? digit));
      inputs.current[Math.min(all.length, OTP_LENGTH - 1)]?.focus();
      return;
    }
    setDigits((current) => current.map((digit, i) => i === index ? value : digit));
    if (value && index < OTP_LENGTH - 1) inputs.current[index + 1]?.focus();
  }

  function continueToPassword(event) {
    event.preventDefault();
    if (remaining <= 0 || digits.join('').length !== OTP_LENGTH || busy) {
      void showUserFacingError('Enter the complete 6-digit OTP before it expires.', 'Check OTP');
      return;
    }
    // No standalone OTP verification route exists. The backend verifies the code
    // atomically with the new password via POST /reset-password.
    setStep('password');
  }

  async function savePassword(event) {
    event.preventDefault();
    if (busy) return;
    if (remaining <= 0) { void showUserFacingError('OTP expired. Please request a new one.', 'Expired OTP'); setStep('request'); return; }
    if (!PASSWORD_RULES.every(([, validate]) => validate(password)) || password !== confirm) {
      void showUserFacingError('Meet all password requirements and confirm the same password.', 'Check your password');
      return;
    }
    setBusy(true);
    try {
      const result = await resetPasswordWithOtp({ login: email.trim(), method: channel, code: digits.join(''),
        password, password_confirmation: confirm });
      if (!result.ok) { void showUserFacingError(result.error || result.message, 'Password reset failed'); return; }
      setPassword(''); setConfirm(''); navigate('/login', { replace: true });
    } finally { setBusy(false); }
  }

  return (
    <AuthShell busy={busy}>
      <div className="form-card shadow-sm recovery-card">
        <Link to="/login" className="auth-back-link"><ArrowLeft size={16} /> {sw ? 'Rudi Login' : 'Back to Login'}</Link>
        <div className="auth-steps" aria-label="Password recovery steps">
          {[['request', 'Email'], ['otp', 'Code'], ['password', 'New password']].map(([key, label], index, all) => {
            const current = all.findIndex(([k]) => k === step);
            const state = index < current ? 'done' : index === current ? 'on' : '';
            return <div key={key} style={{display: 'contents'}}>
              {index > 0 && <hr />}
              <div className={state} aria-current={state === 'on' ? 'step' : undefined}><i>{state === 'done' ? '✓' : index + 1}</i><span>{label}</span></div>
            </div>;
          })}
        </div>
        <div className="recovery-head">
          <span className="recovery-head-icon">{step === 'request' ? <LockKeyhole /> : step === 'otp' ? <ShieldCheck /> : <CheckCircle2 />}</span>
          <h1>{step === 'request' ? 'Forgot Password' : step === 'otp' ? 'Verify OTP' : 'Create New Password'}</h1>
          <p>{step === 'request' ? 'Enter your registered email, then choose how to receive your code.' :
            step === 'otp' ? `Enter the 6-digit code sent by ${channel === 'sms' ? 'SMS' : 'email'}${masked ? ` (${masked})` : ''}.` : 'Set a secure password for your account.'}</p>
        </div>
        {step === 'request' && <form onSubmit={requestOtp} className="viwanda-auth-form">
          <label htmlFor="recovery-email">Email Address</label>
          <div className="field"><Mail size={18}/><input id="recovery-email" type="email" required autoComplete="email"
            placeholder="Enter your registered email" value={email} onChange={(e) => setEmail(e.target.value)}/></div>
          <label>Receive OTP via</label>
          <div className="recovery-channel-row" role="radiogroup" aria-label="Receive OTP via">
            <label className={`recovery-channel ${channel === 'email' ? 'selected' : ''}`}>
              <input type="radio" name="otp-channel" checked={channel === 'email'} onChange={() => setChannel('email')}/>
              <Mail size={19}/> <span>Email</span>
            </label>
            <label className={`recovery-channel ${channel === 'sms' ? 'selected' : ''}`}>
              <input type="radio" name="otp-channel" checked={channel === 'sms'} onChange={() => setChannel('sms')}/>
              <MessageSquare size={19}/> <span>SMS</span>
            </label>
          </div>
          <button className="form-submit btn btn-success" disabled={busy}>Request OTP</button>
          <p className="recovery-help">The 6-digit code expires 10 minutes after it is issued.</p>
        </form>}
        {step === 'otp' && <form onSubmit={continueToPassword} className="viwanda-auth-form">
          <div className="recovery-otp-row" onPaste={(e) => { const text = e.clipboardData.getData('text'); if (/^\d{6}$/.test(text)) { e.preventDefault(); setDigits(text.split('')); inputs.current[5]?.focus(); } }}>
            {digits.map((digit, index) => <input key={index} ref={(node) => { inputs.current[index] = node; }} value={digit} inputMode="numeric" pattern="[0-9]*"
              autoComplete={index === 0 ? 'one-time-code' : 'off'} maxLength={1} aria-label={`OTP digit ${index + 1}`}
              onChange={(e) => setOtpDigit(index, e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Backspace' && !digit && index) inputs.current[index - 1]?.focus(); }}/>) }
          </div>
          <div className={`recovery-timer ${remaining === 0 ? 'expired' : ''}`}><Clock3 size={17}/> <strong>{String(Math.floor(remaining / 60)).padStart(2, '0')}:{String(remaining % 60).padStart(2, '0')}</strong> remaining</div>
          {remaining === 0 && <p className="recovery-help">Code expired. Request a new OTP.</p>}
          <button className="form-submit btn btn-success" disabled={busy || remaining === 0 || digits.join('').length !== OTP_LENGTH}>Continue to New Password</button>
          <button type="button" className="recovery-text-button" onClick={() => { setStep('request'); setOtpContext(null); setMasked(''); }}>Change email/method or request a new OTP</button>
        </form>}
        {step === 'password' && <form className="viwanda-auth-form" onSubmit={savePassword}>
          <label htmlFor="new-password">New Password</label>
          <div className="field"><LockKeyhole size={18}/><input id="new-password" type={visible ? 'text' : 'password'} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            <button type="button" className="show-password" onClick={() => setVisible(!visible)}>{visible ? 'Hide' : 'Show'}</button></div>
          <PasswordChecklist rules={PASSWORD_RULES} value={password} />
          <label htmlFor="confirm-password">Confirm New Password</label>
          <div className="field"><LockKeyhole size={18}/><input id="confirm-password" type={visible ? 'text' : 'password'} autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)}/></div>
          {confirm && <ul className="pw-list" style={{margin: '-8px 0 12px'}}><li className={confirm === password ? 'met' : ''}>Matches new password</li></ul>}
          <button className="form-submit btn btn-success" disabled={busy || remaining === 0}>Verify OTP & Reset Password</button>
        </form>}
      </div>
    </AuthShell>
  );
}
