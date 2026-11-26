import {showUserFacingError} from '../../utils/userFacingErrors.js';
/**
 * FILE: src/pages/Login/ResetPassword.jsx
 * NAVIGATION FLOW: /reset-password?login=...&token=... -> /activate
 * DATA / API FLOW: Reset token validated by Laravel; do not log credentials.
 * Link token required; no activation or password change without Laravel validation.
 */
import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, LockKeyhole } from "lucide-react";
import AuthShell from "./AuthShell";
import PasswordChecklist from "./PasswordChecklist";

import { activateUserAccount } from "../../API/accountRecovery";
import "./Login.css";

export default function ResetPassword() {
  const [params] = useSearchParams();
  const login = params.get("login") || params.get("email") || "";
  const token = params.get("token") || "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    if (busy || done) return;
    if (!login || !token) {
      void showUserFacingError("Reset link is missing login or token.", "Invalid reset link");
      return;
    }
    if (password.length < 8) {
      void showUserFacingError("Use at least 8 characters.", "Password too short");
      return;
    }
    if (password !== confirm) {
      void showUserFacingError("Confirm the same password.", "Passwords do not match");
      return;
    }
    setBusy(true);
    try {
      const result = await activateUserAccount({ login, token, password, password_confirmation: confirm });
      if (!result.ok) {
        void showUserFacingError(result.error || result.message, "Request failed");
        return;
      }
      setDone(true);
      setPassword("");
      setConfirm("");
      
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell busy={busy}>
      <div className="form-card shadow-sm">
        <Link to="/login" className="auth-back-link"><ArrowLeft size={16} /> Back to Sign In</Link>
        <div className="recovery-head"><span className="recovery-head-icon"><LockKeyhole /></span><h1>Reset Password</h1>
          <p>Set a new password for your VIWANDA PORTAL account.</p></div>
        {(!login || !token) ? (<div className="auth-complete"><p>Invalid or incomplete reset link. Open the complete link from your email.</p></div>) : done ? (
          <div className="auth-complete">
            <p>Your password has been updated.</p>
            <Link to="/login" className="form-submit auth-submit-link">Sign In <ArrowRight size={18} /></Link>
          </div>
        ) : (
          <form className="viwanda-auth-form" noValidate onSubmit={handleSubmit}>
            <label htmlFor="reset-email">Account email</label>
            <div className="field"><input id="reset-email" type="email" readOnly value={login} placeholder="Email from reset link" /></div>
            <label htmlFor="reset-password">New password</label>
            <div className="field"><LockKeyhole size={18} /><input id="reset-password" type="password" minLength={8} autoComplete="new-password"
              value={password} onChange={(event) => setPassword(event.target.value)} placeholder="New password" /></div>
            <PasswordChecklist rules={[["At least 8 characters", (v) => v.length >= 8]]} value={password}
              extra={confirm ? [["Matches confirmation", confirm === password]] : []} />
            <label htmlFor="reset-confirm">Confirm new password</label>
            <div className="field"><LockKeyhole size={18} /><input id="reset-confirm" type="password" minLength={8} autoComplete="new-password"
              value={confirm} onChange={(event) => setConfirm(event.target.value)} placeholder="Confirm password" /></div>
            <button className="form-submit btn btn-success" disabled={busy} type="submit">
              {busy ? "Updating..." : "Reset Password"} <ArrowRight size={18} />
            </button>
          </form>
        )}
      </div>
    </AuthShell>
  );
}
