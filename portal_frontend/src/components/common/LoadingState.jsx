/**
 * FILE: src/components/common/LoadingState.jsx
 * FLOW: DashboardLayout route Suspense -> PageLoader; table fetch state -> TableLoader.
 * My Profile saves theme; authorized admin chooses loader in Portal Settings -> System Preferences.
 * Portal Logo option REUSES the exact LoginLoader emblem and spinner styles/animation,
 * but excludes the full-screen login overlay (Sidebar, Topbar, Footer remain mounted).
 * No Laravel endpoints or simulated network request / artificial delay.
 */
import { useAppearance } from "../../contexts/AppearanceContext";
import "../LoginLoader/LoginLoader.css";
import "../../styles/management.css";
import "../modern/ModernUI.css";

function LogoLoader({ compact = false }) {
  return <div className={`viwanda-login-loader vw-embedded-login-loader ${compact ? "vw-loader-small" : ""}`}>
    <img className="viwanda-login-emblem" src="/reference/national-emblem.png" alt="" aria-hidden="true" />
    <div className="viwanda-login-spinner" aria-hidden="true"><span className="viwanda-login-spinner-center" /></div>
    <strong className="viwanda-login-title">VIWANDA PORTAL</strong>
    <div className="viwanda-login-dots" aria-hidden="true"><span/><span/><span/></div>
  </div>;
}
function Dots() {
  return <div className="vw-loading-dots" aria-hidden="true"><span/><span/><span/></div>;
}
export function PageLoader({ label = "Loading page content…", styleOverride }) {
  const { preferences } = useAppearance();
  const mode = styleOverride ?? preferences.pageLoader;
  if (mode === "none") return <span className="visually-hidden" role="status">{label}</span>;
  return <section className="vw-page-loading" role="status" aria-live="polite" aria-label={label}>
    {mode === "skeleton" ? <div className="vw-loading-skeleton" aria-hidden="true">
      <div className="vw-skeleton-bar vw-skeleton-title"/><div className="vw-skeleton-bar vw-skeleton-subtitle"/>
      <div className="vw-skeleton-panel"><div className="vw-skeleton-bar"/><div className="vw-skeleton-bar"/><div className="vw-skeleton-bar"/></div>
      <div className="vw-skeleton-panel"><div className="vw-skeleton-bar"/><div className="vw-skeleton-bar"/><div className="vw-skeleton-bar"/><div className="vw-skeleton-bar"/></div>
    </div> : mode === "logo" ? <LogoLoader/> : mode === "dots" ? <Dots/> :
      <div className="vw-loading-spinner" aria-hidden="true"/>}
    <span className="vw-loading-label">{label}</span>
  </section>;
}
/** calm (default, loading style F, 9 Nov 2026): rows already shown stay visible under a light veil with one small ring;
 * an empty table shows only the ring. skeleton: rows shaped like a table. */
const SKELETON_ROWS = [[40, 80, 55, 70, 45, 60], [40, 92, 48, 62, 52, 66], [40, 74, 60, 78, 40, 58], [40, 86, 50, 66, 48, 70], [40, 78, 56, 72, 44, 62], [40, 90, 46, 60, 50, 64]];
export function TableLoader({ active, label = "Loading table data…", styleOverride }) {
  const { preferences } = useAppearance();
  if (!active) return null;
  const mode = styleOverride ?? preferences.tableLoader;
  if (mode === "none") return <span className="visually-hidden" role="status">{label}</span>;
  return <div className={`vw-table-loading vw-table-loading--${mode}`} role="status" aria-live="polite" aria-label={label}>
    {mode === "calm" ? <span className="mu-wait-ring" aria-hidden="true"/>
      : mode === "skeleton" ? <div className="vw-table-skeleton" aria-hidden="true">{SKELETON_ROWS.map((widths,r)=><div key={r} className="vw-sk-row">
        {widths.map((w,c)=><span key={c} className="vw-skeleton-bar" style={{width:`${w}%`}}/>)}</div>)}</div>
      : mode === "logo" ? <LogoLoader compact/>
      : mode === "progress" ? <div className="vw-progress-track" aria-hidden="true"><span/></div>
      : <div className="vw-loading-spinner" aria-hidden="true"/>}
    <span className="vw-loading-label">{label}</span>
  </div>;
}
