import {showUserFacingError} from '../../utils/userFacingErrors.js';
/**
 * FILE: src/pages/Login/Login.jsx
 * NAVIGATION FLOW: /login -> src/API/login.jsx -> src/API/axios.jsx -> POST /api/v1/login + GET /api/v1/me -> /dashboard
 * DATA / API FLOW: Verified session remains src/utils/tokenService.js and src/utils/verifiedUserStore.js.
 * NOTE: This reorganization changes imports/comments only, not page behavior.
 */
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import Icon from "../../components/Icon";
import LoginLoader from "../../components/LoginLoader/LoginLoader";
import { useToast } from "../../components/Toast/ToastProvider";
import { labels } from "../../config/translations";
import { submitLogin } from "../../API/login";
import AuthShell from "./AuthShell";
import MfaVerify from "./MfaVerify";
import PrivacyNotice from "../../components/PrivacyNotice.jsx";
import { takeSignOutReason } from "../../utils/sessionClock.js";
import "./Login.css";

/**
 * Login flow: validate -> /login -> /me -> backend permissions -> emblem -> dashboard.
 * API errors display a dismissible SweetAlert2 dialog with Close.
 */
export default function Login() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [lang, setLang] = useState("EN");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  // MFA challenge from POST /login when the account has MFA enabled (no token yet).
  const [mfa, setMfa] = useState(null);
  // FR-058: the sign-in page links to the Privacy Notice; it is accepted once, right after sign-in (PrivacyGate).
  const [privacyOpen, setPrivacyOpen] = useState(false);
  // FR-051: why the previous session ended (read once).
  const [signedOut] = useState(() => takeSignOutReason());
  const transitionTimer = useRef(null);
  const t = labels[lang];

  useEffect(() => () => {
    if (transitionTimer.current) window.clearTimeout(transitionTimer.current);
  }, []);

  // Only called once token, current user and dashboard.view are verified (with or without MFA).
  function finishSignIn(result) {
    if (result.message) {
      showToast({ type: "success", title: "Login successful", message: result.message, duration: 3200 });
    }
    // Show OUR single national-emblem transition, then reveal Dashboard.
    setTransitioning(true);
    transitionTimer.current = window.setTimeout(() => {
      navigate("/dashboard", { replace: true });
    }, 900);
  }

  async function handleSignIn(event) {
    event.preventDefault();
    if (submitting || transitioning) return;
    setSubmitting(true);
    try {
      // Do not render the national emblem while request/validation is pending.
      const result = await submitLogin({ email, password }, lang);
      if (!result.ok) {
        const firstError = result.errors && Object.values(result.errors)[0];
        void showUserFacingError(result.message || firstError || (lang === "SW" ? "Imeshindikana kuingia." : "Sign-in failed."),
          result.title || (lang === "SW" ? "Kagua taarifa" : "Check your details"));
        return;
      }

      // MFA enabled: Laravel issued a challenge, not a token -> show the OTP step.
      if (result.mfa) {
        setPassword("");
        setMfa(result.mfa);
        if (result.message) showToast({ type: "info", title: lang === "SW" ? "Msimbo umetumwa" : "Verification code sent", message: result.message, duration: 3200 });
        return;
      }
      finishSignIn(result);
    } catch {
      void showUserFacingError(lang === "SW" ? "Jaribu tena." : "Please try again.",
        lang === "SW" ? "Tatizo la kuingia" : "Sign-in error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      {transitioning && <LoginLoader language={lang} />}
      <AuthShell busy={submitting || transitioning} intro>
        {mfa ? (
          <MfaVerify key={mfa.challengeId} challenge={mfa} lang={lang}
            onCancel={() => setMfa(null)} onVerified={finishSignIn} />
        ) : (
        <div className="form-card shadow-sm">
          <div className="auth-card-top">
            <small>{lang === "SW" ? "Kuingia kwa usalama" : "Secure government sign-in"}</small>
            <div className="auth-lang" role="group" aria-label="Language">
              <button type="button" className={lang === "EN" ? "active" : ""} aria-pressed={lang === "EN"} onClick={() => setLang("EN")}>EN</button>
              <button type="button" className={lang === "SW" ? "active" : ""} aria-pressed={lang === "SW"} onClick={() => setLang("SW")}>SW</button>
            </div>
          </div>
          {signedOut === "idle" && <div className="auth-signed-out" role="status"><span aria-hidden="true">⏱</span><span>{lang === "SW"
            ? <><b>Umetolewa nje baada ya dakika 15 bila shughuli.</b> Ingia tena kuendelea. Mabadiliko ambayo hayakuhifadhiwa kwenye ukurasa uliokuwa wazi hayakubaki.</>
            : <><b>You were signed out after 15 minutes without activity.</b> Sign in again to continue. Unsaved changes on the open page were not kept.</>}</span></div>}
          <h1>{t.loginTitle}</h1>
          {t.loginDesc && <p className="login-description">{t.loginDesc}</p>}
          <form noValidate onSubmit={handleSignIn} className="viwanda-auth-form">
            <label htmlFor="username">{t.user}</label>
            <div className="field">
              <Icon name="mail" size={18} />
              <input id="username" name="username" type="text" autoComplete="username"
                value={email} onChange={(event) => setEmail(event.target.value)}
                placeholder="Email / Username" required disabled={submitting || transitioning} />
            </div>

            <label htmlFor="password">{t.password}</label>
            <div className="field">
              <Icon name="lock" size={18} />
              <input id="password" name="password" autoComplete="current-password"
                type={showPassword ? "text" : "password"} value={password}
                onChange={(event) => setPassword(event.target.value)} placeholder="Password" required disabled={submitting || transitioning} />
              <button className="show-password" type="button"
                aria-label={showPassword ? "Hide password" : "Show password"}
                onClick={() => setShowPassword((value) => !value)}>
                <Icon name="eye" size={19} />
              </button>
            </div>

            <div className="auth-forgot-row">
              <button type="button" onClick={() => navigate("/forgot-password", { state: { email, lang } })}>{t.forgot}</button>
            </div>

            <button className="form-submit btn btn-success" type="submit" disabled={submitting || transitioning}
              data-busy-text={lang === "SW" ? "Inaingia..." : "Signing in..."}>
              {t.signin}
              <Icon name="arrow" size={19} />
            </button>
          </form>
          <p className="auth-privacy-note"><span aria-hidden="true">🔒 </span>{lang === "SW"
            ? "Portal hii inahifadhi jina, mawasiliano, jukumu na shughuli zako ili kusimamia ufikiaji na kumbukumbu za ukaguzi. "
            : "This portal records your name, contact details, role and activity to manage access and keep an audit trail. "}
            <button type="button" onClick={() => setPrivacyOpen(true)}>{lang === "SW" ? "Soma Taarifa ya Faragha" : "Read the Privacy Notice"}</button></p>

          <div className="government-credit">
            <img src="/reference/national-emblem.png" alt="Tanzania national coat of arms" />
            <span>Government of the United Republic of Tanzania</span>
          </div>
        </div>
        )}
      </AuthShell>
      <PrivacyNotice open={privacyOpen} lang={lang} onClose={() => setPrivacyOpen(false)} />
    </>
  );
}
