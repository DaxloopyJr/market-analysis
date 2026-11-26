import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Eye, EyeOff, LockKeyhole, UserRoundCheck } from 'lucide-react';
import { showUserFacingError } from '../../utils/userFacingErrors.js';
import { activateUserAccount } from '../../API/accountRecovery';
import AuthShell from './AuthShell';
import PasswordChecklist from './PasswordChecklist';
import './Login.css';

const ACTIVATION_RULES = [
  ['Minimum 10 characters', (v) => v.length >= 10],
  ['Uppercase letter', (v) => /[A-Z]/.test(v)],
  ['Lowercase letter', (v) => /[a-z]/.test(v)],
  ['Number', (v) => /\d/.test(v)],
  ['Special character', (v) => /[^\w\s]/.test(v)],
];

export default function ActivateAccount() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const login = params.get('login') || params.get('email') || '';
  const token = params.get('token') || '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [visible, setVisible] = useState(false);

  async function activate(event) {
    event.preventDefault();
    if (!token || !login) { void showUserFacingError('Invalid or incomplete activation link.', 'Activation failed'); return; }
    if (password.length < 10 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/\d/.test(password) || !/[^\w\s]/.test(password) || password !== confirm) {
      void showUserFacingError('Use at least 10 characters, upper/lowercase, number and symbol; confirm the password.', 'Check your password'); return;
    }
    setBusy(true);
    try {
      const result = await activateUserAccount({ login, token, password, password_confirmation: confirm });
      if (!result.ok) { void showUserFacingError(result.error || result.message, 'Activation failed'); return; }
      setPassword(''); setConfirm(''); navigate('/login', { replace: true });
    } finally { setBusy(false); }
  }

  return <AuthShell busy={busy}><div className="form-card shadow-sm recovery-card">
    <Link to="/login" className="auth-back-link"><ArrowLeft size={16}/> Back to Login</Link>
    <div className="recovery-head"><span className="recovery-head-icon"><UserRoundCheck/></span><h1>Activate Your Account</h1>
      <p>Create a password to activate your VIWANDA PORTAL account{login ? <> for <b>{login}</b></> : ''}.</p></div>
    {(!login || !token) ? <p className="recovery-help">Invalid or incomplete activation link. Please use the complete link from your email.</p> : <form className="viwanda-auth-form" onSubmit={activate}>
      <label htmlFor="activation-password">New Password</label>
      <div className="field"><LockKeyhole size={18}/><input id="activation-password" type={visible ? 'text' : 'password'} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)}/>
        <button type="button" className="show-password" aria-label={visible ? 'Hide password' : 'Show password'} onClick={() => setVisible((v) => !v)}>{visible ? <EyeOff size={18}/> : <Eye size={18}/>}</button></div>
      <PasswordChecklist rules={ACTIVATION_RULES} value={password} />
      <label htmlFor="activation-confirm">Confirm New Password</label>
      <div className="field"><LockKeyhole size={18}/><input id="activation-confirm" type={visible ? 'text' : 'password'} autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)}/></div>
      {confirm && <ul className="pw-list" style={{margin: '-8px 0 12px'}}><li className={confirm === password ? 'met' : ''}>Matches new password</li></ul>}
      <button className="form-submit btn btn-success" disabled={busy || !login || !token}>Activate Account</button>
    </form>}
  </div></AuthShell>;
}
