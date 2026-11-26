/**
 * FILE: src/pages/Admin/PortalSystemPreferences.jsx
 * ROUTE: /dashboard/administration/portal-settings (System Preferences panel).
 * ACCESS: portal_settings.manage (MOA; enforced by route and checked here).
 * FLOW: PortalSettings -> PortalSystemPreferences -> AppearanceContext -> user-keyed
 *       browser localStorage -> shared PageLoader and TableLoader components.
 * NO BACKEND: /portal-settings only supports identity/contact/logo in supplied API.
 * The admin controls are LOCAL to this admin's account/browser, NOT applied to others.
 * Page Loading default None, Table Loading default Overlay Spinner.
 * No theme or loader config is sent to Laravel without a verified endpoint.
 */
import { useEffect, useState } from "react";
import { Check, RotateCcw, Monitor, Palette, LoaderCircle, Info } from "lucide-react";
import { DEFAULT_APPEARANCE, useAppearance } from "../../contexts/AppearanceContext";
import { PageLoader, TableLoader } from "../../components/common/LoadingState";

const PAGE_STYLES = [["none", "None (Default)"], ["skeleton", "Skeleton Shimmer"], ["spinner", "Centered Spinner"], ["dots", "Animated Dots"], ["logo", "Portal Logo (Login animation)"]];
const TABLE_STYLES = [["none", "None"], ["calm", "Calm – keeps rows, small ring (Default)"], ["overlay", "Overlay Spinner"], ["skeleton", "Skeleton Rows"], ["progress", "Thin Progress Bar"], ["logo", "Portal Logo"]];
const ACCENTS = [["blue", "Portal Blue"], ["green", "Emerald Green"], ["teal", "Technology Teal"]];

export default function PortalSystemPreferences() {
  const { preferences, saveAppearance, canManageLoaders, canPersist } = useAppearance();
  const [draft, setDraft] = useState(preferences);
  const [message, setMessage] = useState("");
  const [preview, setPreview] = useState("page");
  useEffect(() => setDraft(preferences), [preferences]);
  const change = (key, value) => { setDraft(v => ({ ...v, [key]: value })); setMessage(""); };
  if (!canManageLoaders) return <div className="alert alert-warning m-3" role="alert">Only users with portal_settings.manage permission can manage loading configuration.</div>;
  const changed = Object.keys(DEFAULT_APPEARANCE).some(k => draft[k] !== preferences[k]);
  function save() {
    try { saveAppearance(draft); setMessage("Settings saved for this browser and admin account only."); }
    catch (e) { setMessage(e.message || "Could not save preferences."); }
  }
  function reset() {
    try { saveAppearance({ ...DEFAULT_APPEARANCE }); setDraft(DEFAULT_APPEARANCE); setMessage("System Preferences reset locally. Page: None; Table: Overlay Spinner."); }
    catch (e) { setMessage(e.message || "Could not reset preferences."); }
  }
  return <div className="vim-ps-form vw-ps-preferences">
    <div className="alert alert-info small mb-0" role="note"><Info size={16} aria-hidden="true"/> Changes here apply to <strong>your admin browser only</strong>. A portal-wide live setting for all users would require an approved shared system configuration endpoint.</div>
    <section className="vim-ps-form-card"><h3><Palette size={18}/> My Admin Theme</h3>
      <div className="vw-ps-fields">
        <label>Theme Mode<select className="form-select" value={draft.theme} onChange={e => change("theme", e.target.value)}><option value="light">Light</option><option value="dark">Dark</option><option value="auto">Auto (device)</option></select></label>
        <label>Accent Color<select className="form-select" value={draft.accent} onChange={e => change("accent", e.target.value)}>{ACCENTS.map(([v,n]) => <option key={v} value={v}>{n}</option>)}</select></label>
      </div>
    </section>
    <section className="vim-ps-form-card"><h3><LoaderCircle size={18}/> Loading Animations</h3>
      <div className="vw-ps-fields">
        <label>Page Loading Style<select className="form-select" value={draft.pageLoader} onChange={e => change("pageLoader", e.target.value)}>{PAGE_STYLES.map(([v,n]) => <option key={v} value={v}>{n}</option>)}</select><small>Default: None. No artificial animation between cached pages.</small></label>
        <label>Table Loading Style<select className="form-select" value={draft.tableLoader} onChange={e => change("tableLoader", e.target.value)}>{TABLE_STYLES.map(([v,n]) => <option key={v} value={v}>{n}</option>)}</select><small>Default: Calm – rows already shown stay visible under a light veil while they refresh (loading style F, 9 Nov 2026).</small></label>
      </div>
      <div className="vw-ps-loader-preview"><div className="vw-ps-preview-top"><strong><Monitor size={16}/> Live Loading Preview</strong>
        <div className="btn-group btn-group-sm" role="group" aria-label="Choose loader preview"><button type="button" className={`btn ${preview === "page" ? "btn-primary" : "btn-outline-primary"}`} onClick={()=>setPreview("page")}>Page</button><button type="button" className={`btn ${preview === "table" ? "btn-primary" : "btn-outline-primary"}`} onClick={()=>setPreview("table")}>Table</button></div></div>
        <div className="vw-ps-loader-surface">{(preview === "page" && draft.pageLoader === "none") || (preview === "table" && draft.tableLoader === "none") ? <div className="vw-ps-none-label">None — No visible loading animation</div> : preview === "page" ? <PageLoader styleOverride={draft.pageLoader} label="Loading page preview…"/> : <TableLoader active styleOverride={draft.tableLoader} label="Loading table preview…"/>}</div>
      </div>
    </section>
    <footer className="vim-ps-footer-actions"><button type="button" className="btn btn-outline-secondary" onClick={reset} disabled={!canPersist}><RotateCcw size={15}/> Reset Defaults</button>
      <button type="button" className="btn btn-primary" onClick={save} disabled={!canPersist || !changed}><Check size={15}/> Save Preferences</button></footer>
    {message && <div className="alert alert-info small" role="status">{message}</div>}
  </div>;
}
