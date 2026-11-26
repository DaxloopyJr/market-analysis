/**
 * FILE: src/pages/Login/AuthShell.jsx
 * NAVIGATION FLOW: Home/Login/ForgotPassword/ResetPassword -> shared AuthShell visual wrapper
 * DATA / API FLOW: Reuses existing branding assets, layout and Footer; no direct API calls.
 * NOTE: This reorganization changes imports/comments only, not page behavior.
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Icon from "../../components/Icon";
import Footer from "../../components/Footer";

const EMBLEM = "/reference/national-emblem.png";
const benefits = [
  { icon: "chart", first: "Reliable", second: "Data" },
  { icon: "doc", first: "Informed", second: "Decisions" },
  { icon: "shield", first: "Industrial", second: "Growth" },
];

const INTRO_KEY = "viwanda.auth.intro.seen.v1";

/** First visit in this browser only, and never when the user asked the OS for reduced motion (11 Nov 2026). */
function shouldPlayIntro() {
  try {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return false;
    if (localStorage.getItem(INTRO_KEY)) return false;
    localStorage.setItem(INTRO_KEY, "1");
    return true;
  } catch {
    return false;
  }
}

/** "Mlango wa bendera": emblem, flag ring drawing, name, flag stripe, then the screen opens from the middle. */
function AuthIntro({ onDone }) {
  useEffect(() => {
    const opened = setTimeout(() => onDone(true), 1750);
    return () => clearTimeout(opened);
  }, [onDone]);
  return (
    <div className="auth-intro" role="presentation" onClick={() => onDone(true)}>
      <div className="auth-intro-emblem">
        <svg viewBox="0 0 140 140" aria-hidden="true">
          <defs><linearGradient id="authIntroFlag" x1="0" x2="1">
            <stop offset="0" stopColor="#1eb53a" /><stop offset=".45" stopColor="#fcd116" /><stop offset=".55" stopColor="#000" />
            <stop offset=".65" stopColor="#fcd116" /><stop offset="1" stopColor="#00a3dd" />
          </linearGradient></defs>
          <circle cx="70" cy="70" r="66" stroke="url(#authIntroFlag)" />
        </svg>
        <img src={EMBLEM} alt="" />
      </div>
      <b>VIWANDA PORTAL</b>
      <small>Wizara ya Viwanda na Biashara</small>
      <i aria-hidden="true" />
    </div>
  );
}

/**
 * Shared Login / Forgot Password / Reset Password shell; same approved branding.
 * Opening (11 Nov 2026, approved): staggered entrance every time; the flag-door intro only on the login page,
 * once per browser (`intro`).
 */
export default function AuthShell({ children, busy = false, intro = false }) {
  const navigate = useNavigate();
  const [introOn, setIntroOn] = useState(() => intro && shouldPlayIntro());
  const [introLeaving, setIntroLeaving] = useState(false);
  useEffect(() => {
    if (!introLeaving) return undefined;
    const gone = setTimeout(() => setIntroOn(false), 650);
    return () => clearTimeout(gone);
  }, [introLeaving]);
  return (
    <>
    {introOn && <div className={introLeaving ? "auth-intro-wrap leaving" : "auth-intro-wrap"}><AuthIntro onDone={setIntroLeaving} /></div>}
    <main className={`login-page auth-enter${introOn && !introLeaving ? " auth-enter-wait" : ""}`} aria-busy={busy}>
      <aside className="login-brand">
        <button type="button" className="back-home" aria-label="Back to home" onClick={() => navigate("/")}>←</button>
        <div className="brand-upper">
          <img className="brand-emblem" src={EMBLEM} alt="Coat of arms of the United Republic of Tanzania" />
          <h2>VIWANDA PORTAL</h2>
          <strong>Ministry of Industry and Trade</strong>
          <p>Industrial &amp; Trade Statistics Management Portal</p>
          <div className="brand-rule" />
          <div className="brand-benefits">
            {benefits.map(({ icon, first, second }) => (
              <div key={first}>
                <span><Icon name={icon} /></span>
                <small>{first}<br />{second}</small>
              </div>
            ))}
          </div>
        </div>
        <div className="brand-waves" aria-hidden="true">
          <div className="wave green" /><div className="wave yellow" /><div className="wave blue" />
        </div>
      </aside>
      <section className="login-main">
        <div className="login-panel">
          {children}
          <Footer />
        </div>
      </section>
    </main>
    </>
  );
}
