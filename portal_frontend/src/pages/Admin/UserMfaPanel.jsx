/**
 * FILE: src/pages/Admin/UserMfaPanel.jsx
 * Admin control to turn sign-in MFA on/off for ONE user and pick email or SMS.
 * FLOW: Users.jsx (⋮ -> Multi-factor authentication; MOA, and IA within its institution)
 *   -> API/mfa.js setUserMfa -> PUT /users/{id} {mfa_enabled, mfa_method} (endpoint 27).
 * Laravel invalidates the user's outstanding MFA challenges; the new method applies at next sign-in.
 */
import { useState } from 'react';
import { Mail, MessageSquare, ShieldCheck, ShieldOff } from 'lucide-react';
import Swal from '../../utils/portalAlerts';
import { apiError } from '../../API/resourceHelpers';
import { setUserMfa, userMfaState } from '../../API/mfa';

export default function UserMfaPanel({ user, onClose, onSaved }) {
  const current = userMfaState(user);
  const [choice, setChoice] = useState(current?.enabled ? current.method : current ? 'off' : 'email');
  const [saving, setSaving] = useState(false);
  const hasPhone = Boolean(String(user?.phone ?? '').trim());
  const unchanged = current && ((choice === 'off' && !current.enabled) || (current.enabled && choice === current.method));

  async function save() {
    const enabled = choice !== 'off';
    const answer = await Swal.fire({
      icon: 'question', showCancelButton: true,
      title: enabled ? 'Require MFA for this user?' : 'Turn off MFA for this user?',
      text: enabled
        ? `${user.name || user.email} will need a 6-digit code by ${choice === 'sms' ? 'SMS' : 'email'} every time they sign in.`
        : `${user.name || user.email} will sign in with password only.`,
      confirmButtonText: enabled ? 'Enable MFA' : 'Disable MFA',
    });
    if (!answer.isConfirmed) return;
    setSaving(true);
    try {
      const result = await setUserMfa(user.id, { enabled, method: choice });
      onSaved();
      Swal.fire({ icon: 'success', title: enabled ? 'MFA enabled' : 'MFA disabled',
        text: `${result.message ? `${result.message} ` : ''}${enabled
          ? `The ${choice === 'sms' ? 'SMS' : 'email'} code will be required from ${user.name || user.email}'s next sign-in.`
          : `${user.name || user.email} will sign in with password only from the next sign-in.`}` });
    } catch (err) {
      const status = err?.response?.status;
      Swal.fire({
        icon: 'error', title: 'MFA not saved',
        text: status === 403
          ? `${apiError(err)} (MFA administration is available to MOA only.)`
          : apiError(err),
      });
    } finally { setSaving(false); }
  }

  const option = (value, Icon, title, note, disabled = false) => (
    <label className={`vim-mfa-option ${choice === value ? 'selected' : ''} ${disabled ? 'disabled' : ''}`}>
      <input type="radio" name="user-mfa" checked={choice === value} disabled={disabled || saving} onChange={() => setChoice(value)} />
      <span className="vim-mfa-icon"><Icon size={17} /></span>
      <span><b>{title}</b><small>{note}</small></span>
    </label>
  );

  return <>
    <div className="vim-wizard-main vim-mfa-panel">
      <div className="vim-mfa-current">
        <span>Current status</span>
        <strong className={current?.enabled ? 'on' : ''}>
          {current === null ? 'Not reported' : current.enabled ? `On · ${current.method === 'sms' ? 'SMS' : 'Email'}` : 'Off'}
        </strong>
      </div>
      <p className="vim-mfa-help">When MFA is on, <b>{user.name || user.email}</b> signs in with their password and then a 6-digit code (valid 10 minutes).</p>
      <div className="vim-mfa-options" role="radiogroup" aria-label="Sign-in verification">
        {option('email', Mail, 'Email code', user.email || 'Registered email')}
        {option('sms', MessageSquare, 'SMS code', hasPhone ? user.phone : 'No phone number registered', !hasPhone)}
        {option('off', ShieldOff, 'Off', 'Password only')}
      </div>
    </div>
    <footer className="vim-dialog-footer">
      <button type="button" className="btn btn-outline-secondary" onClick={onClose} disabled={saving}>Cancel</button>
      <button type="button" className="btn btn-primary" onClick={save} disabled={saving || unchanged}>
        <ShieldCheck size={15} /> {saving ? 'Saving...' : 'Save MFA setting'}
      </button>
    </footer>
  </>;
}
