/**
 * FILE: src/pages/Profile/AppearancePreferences.jsx  (My Profile)
 * ROUTE: /dashboard/profile -> ProtectedRoute -> DashboardLayout -> MyProfile.
 * NAV: Topbar user menu -> My Profile. Every authenticated user may open it.
 * DATA FLOW: POST /login -> GET /api/v1/me (verified in API/login.jsx)
 *   -> ProtectedRoute -> DashboardLayout -> useOutletContext().user -> read-only Profile Details.
 * PERSONAL THEME: My Profile -> AppearanceContext -> per-user browser localStorage -> CSS tokens.
 * SECURITY: Confirmed POST /change-password (Bearer token) with current password and confirmation.
 * LOADING: Managed only by portal_settings.manage users under Portal Settings -> System Preferences.
 *   Regular users cannot change loading; Page=None, Table=Overlay are defaults.
 */
import { useEffect, useState } from "react";
import { changeOwnPassword } from "../../API/profile";
import { showUserFacingError } from "../../utils/userFacingErrors";
import { showPortalToast } from "../../utils/portalAlerts";
import { Link, useOutletContext } from "react-router-dom";
import { AtSign, BadgeCheck, CalendarDays, Check, ExternalLink, LayoutGrid, Phone, RotateCcw, Palette, UserRound, LockKeyhole, Info, Mail, Building2, ShieldCheck, Eye, EyeOff } from "lucide-react";
import PasswordChecklist from "../Login/PasswordChecklist";
import { shortDateTime } from "../../utils/adminDisplay.js";
import { MuLogo } from "../../components/modern/ModernUI.jsx";
import { institutionLogoUrl } from "../../utils/institutionLogo";
import { orgInitials } from "../../utils/orgCards.js";
import "../../components/modern/ModernUI.css";
import { DEFAULT_APPEARANCE, useAppearance } from "../../contexts/AppearanceContext";
import "./appearancePreferences.css";

const accentColors = [
  {value:"blue",label:"Portal Blue",hex:"#155dbb"},
  {value:"green",label:"Emerald Green",hex:"#168452"},
  {value:"teal",label:"Technology Teal",hex:"#087e91"},
];
const formatWhen = (value) => { const d = shortDateTime(value); return d ? `${d.date}, ${d.time}` : value; };
const textValue = (value) => (value === null || value === undefined || value === "" ? "—" : String(value));

export default function MyProfile() {
  const { user } = useOutletContext();
  const { preferences, saveAppearance, resetAppearance, canPersist } = useAppearance();
  const [draft, setDraft] = useState({ theme: preferences.theme, accent: preferences.accent });
  const [message, setMessage] = useState("");
  const [tab, setTab] = useState("profile");
  const [showPasswords, setShowPasswords] = useState(false);
  const [passwords, setPasswords] = useState({current:"", next:"", confirm:""});
  const [passwordBusy, setPasswordBusy] = useState(false);
  const updatePasswordField = (field, value) => setPasswords(previous => ({...previous, [field]:value}));
  async function handleChangePassword(event) {
    event.preventDefault();
    if (!passwords.current) return void showUserFacingError("Enter your current password.", "Password validation");
    if (passwords.next.length < 8) return void showUserFacingError("New password must be at least 8 characters.", "Password validation");
    if (passwords.next !== passwords.confirm) return void showUserFacingError("New password and confirmation do not match.", "Password validation");
    if (passwords.next === passwords.current) return void showUserFacingError("New password must be different from your current password.", "Password validation");
    if (passwordBusy) return;
    setPasswordBusy(true);
    try {
      const response = await changeOwnPassword({
        currentPassword: passwords.current,
        newPassword: passwords.next,
        confirmation: passwords.confirm,
      });
      setPasswords({current:"", next:"", confirm:""});
      setShowPasswords(false);
      showPortalToast({type:"success", title:"Password updated", message:response?.message || "Your password has been updated."});
    } catch (error) {
      await showUserFacingError(error, "Unable to change password");
    } finally {
      setPasswordBusy(false);
    }
  }
  useEffect(() => { setDraft({ theme: preferences.theme, accent: preferences.accent }); }, [preferences.theme, preferences.accent]);
  const fullName = user?.name || user?.full_name || "";
  const roles = Array.isArray(user?.roles) ? user.roles.map(r => r?.name || r?.code).filter(Boolean) : [];
  const initials = fullName.trim().split(/\s+/).slice(0, 2).map(p => p.charAt(0).toUpperCase()).join("") || "U";
  const department = typeof user?.department === "object" ? user?.department?.name : user?.department;
  const institution = typeof user?.institution === "object" ? user?.institution?.name : user?.institution;
  const status = user?.status || (typeof user?.is_active === "boolean" ? (user.is_active ? "active" : "inactive") : null);
  const dirty = draft.theme !== preferences.theme || draft.accent !== preferences.accent;
  function saveTheme() {
    try {
      saveAppearance({ ...preferences, theme: draft.theme, accent: draft.accent });
      setMessage("Theme saved in this browser for your account.");
    } catch (error) { setMessage(error.message || "Unable to save theme."); }
  }
  function resetTheme() {
    // Reset only personal theme, preserve admin loader choice if present.
    saveAppearance({ ...preferences, theme: DEFAULT_APPEARANCE.theme, accent: DEFAULT_APPEARANCE.accent });
    setDraft({ theme: DEFAULT_APPEARANCE.theme, accent: DEFAULT_APPEARANCE.accent });
    setMessage("Personal theme reset to the VIWANDA defaults.");
  }
  const lastLogin = user?.last_login_at ? formatWhen(user.last_login_at) : null;
  const statusActive = String(status || "").toLowerCase() === "active";
  const row = (Icon, label, value) => <div key={label}><i><Icon size={16}/></i><div><small>{label}</small><b className={textValue(value) === "—" ? "na" : ""}>{textValue(value)}</b></div></div>;
  const eye = <button type="button" className="vw-pf-eye" onClick={()=>setShowPasswords(v=>!v)} aria-label={showPasswords?"Hide passwords":"Show passwords"} aria-pressed={showPasswords}>{showPasswords?<EyeOff size={17}/>:<Eye size={17}/>}</button>;
  return <div className="vw-profile-appearance vw-my-profile vw-pf-modern">
    <section className="vw-pf-hero" aria-label="User summary">
      <div className="vw-my-profile-avatar" aria-hidden="true">{initials}</div>
      <div className="vw-pf-hero-main">
        <h1>{textValue(fullName)}</h1>
        <p className="vw-pf-org-line">{user?.email && <span>{user.email}</span>}{institution && <span className="vw-pf-org"><MuLogo src={institutionLogoUrl(user?.institution)} initials={orgInitials(typeof user?.institution === "object" ? user.institution : {name: institution})} size={22}/>{institution}</span>}{!user?.email && !institution && "—"}</p>
        <div className="vw-pf-chips">
          {(roles.length ? roles : [user?.role].filter(Boolean)).map(role => <span key={role} className="vw-pf-chip blue">{role}</span>)}
          {status && <span className={`vw-pf-chip ${statusActive ? "green" : "grey"}`}>● {status}</span>}
        </div>
      </div>
      <dl className="vw-pf-meta">
        <dt>Username</dt><dd className={user?.username ? "" : "na"}>{textValue(user?.username)}</dd>
        <dt>Department</dt><dd className={department ? "" : "na"}>{textValue(department)}</dd>
        {lastLogin && <><dt>Last login</dt><dd>{lastLogin}</dd></>}
      </dl>
    </section>
    <nav className="vw-my-profile-tabs vw-pf-tabs" role="tablist" aria-label="Profile sections">
      {[["profile","Profile",UserRound],["security","Change Password",LockKeyhole],["appearance","Appearance",Palette]].map(([key,label,Icon]) =>
        <button key={key} id={`vw-tab-${key}`} type="button" role="tab" aria-selected={tab===key} aria-controls={`vw-panel-${key}`} className={tab===key?"active":""} onClick={()=>setTab(key)}><Icon size={16}/>{label}</button>)}
    </nav>
    {tab === "profile" && <div id="vw-panel-profile" role="tabpanel" aria-labelledby="vw-tab-profile">
      <div className="vw-pf-grid">
        <section className="vw-management-card vw-pf-card"><h2><span className="vw-pf-dot"/>Account</h2>
          <div className="vw-pf-rows">{row(UserRound,"Full name",fullName)}{row(AtSign,"Username",user?.username)}{row(Mail,"Email address",user?.email)}{row(Phone,"Phone number",user?.phone)}</div></section>
        <section className="vw-management-card vw-pf-card"><h2><span className="vw-pf-dot"/>Organisation &amp; access</h2>
          <div className="vw-pf-rows">{institution ? <div key="Institution"><i className="vw-pf-logo-icon"><MuLogo src={institutionLogoUrl(user?.institution)} initials={orgInitials(typeof user?.institution === "object" ? user.institution : {name: institution})} size={34}/></i><div><small>Institution</small><b>{institution}</b></div></div> : row(Building2,"Institution",institution)}{row(LayoutGrid,"Department",department)}{row(ShieldCheck,"Role(s)",roles.join(", ") || user?.role)}{row(BadgeCheck,"Account status",status)}
            {user?.created_at && row(CalendarDays,"Member since",formatWhen(user.created_at))}</div></section>
      </div>
      <div className="vw-pf-note" role="status"><Info size={16}/> Details come from your account and are read-only. Ask your administrator to change them. A dash means the system did not send that field.</div>
    </div>}
    {tab === "security" && <section id="vw-panel-security" role="tabpanel" aria-labelledby="vw-tab-security" className="vw-management-card vw-pf-card vw-pf-narrow">
      <h2><span className="vw-pf-dot"/>Change password</h2><p className="vw-profile-help">After updating, use the new password next time you sign in.</p>
      <form onSubmit={handleChangePassword} noValidate>
        <label className="vw-pf-label">Current password <b>*</b>
          <span className="vw-pf-field"><LockKeyhole size={16}/><input type={showPasswords?"text":"password"} autoComplete="current-password" placeholder="Current password" value={passwords.current} onChange={event=>updatePasswordField("current",event.target.value)} required disabled={passwordBusy}/>{eye}</span></label>
        <div className="vw-pf-two">
          <label className="vw-pf-label">New password <b>*</b>
            <span className="vw-pf-field"><LockKeyhole size={16}/><input type={showPasswords?"text":"password"} autoComplete="new-password" placeholder="Minimum 8 characters" value={passwords.next} onChange={event=>updatePasswordField("next",event.target.value)} minLength={8} required disabled={passwordBusy}/>{eye}</span></label>
          <label className="vw-pf-label">Confirm new password <b>*</b>
            <span className="vw-pf-field"><LockKeyhole size={16}/><input type={showPasswords?"text":"password"} autoComplete="new-password" placeholder="Confirm new password" value={passwords.confirm} onChange={event=>updatePasswordField("confirm",event.target.value)} required disabled={passwordBusy}/>{eye}</span></label>
        </div>
        <PasswordChecklist rules={[["At least 8 characters", value => value.length >= 8]]} value={passwords.next}
          extra={[["Matches confirmation", Boolean(passwords.confirm) && passwords.confirm === passwords.next],
            ["Different from current password", Boolean(passwords.next) && Boolean(passwords.current) && passwords.next !== passwords.current]]}/>
        <div className="vw-profile-buttons vw-pf-actions"><Link className="mu-btn" to="/forgot-password"><ExternalLink size={15}/> Password Recovery</Link><button type="submit" className="mu-btn mu-btn-primary" disabled={passwordBusy}><LockKeyhole size={15}/> {passwordBusy?"Updating...":"Update Password"}</button></div>
      </form>
    </section>}
    {tab === "appearance" && <div id="vw-panel-appearance" role="tabpanel" aria-labelledby="vw-tab-appearance" className="vw-pf-grid vw-pf-grid-wide">
      <section className="vw-management-card vw-pf-card vw-profile-form"><h2><span className="vw-pf-dot"/>Theme &amp; appearance <small className="vw-pf-aside">Only on this browser</small></h2>
        <fieldset><legend>Theme Mode</legend><div className="vw-pf-themes">{[["light","Light"],["dark","Dark"],["auto","Auto (device)"]].map(([value,label])=><label key={value} className={`vw-pf-theme ${value} ${draft.theme===value?"selected":""}`}><input type="radio" name="theme" checked={draft.theme===value} onChange={()=>{setDraft(d=>({...d,theme:value}));setMessage("");}}/><span className="vw-pf-thumb" aria-hidden="true"><b/><span><i/><i/></span></span>{label}</label>)}</div></fieldset>
        <fieldset><legend>Primary Accent Color</legend><div className="vw-profile-colors">{accentColors.map(c=><button key={c.value} type="button" className={draft.accent===c.value?"chosen":""} onClick={()=>{setDraft(d=>({...d,accent:c.value}));setMessage("");}} aria-pressed={draft.accent===c.value} title={c.label}><span style={{background:c.hex}}>{draft.accent===c.value&&<Check size={16} color="white"/>}</span><small>{c.label}</small></button>)}</div></fieldset>
        <div className="vw-profile-buttons vw-pf-actions"><button className="mu-btn" type="button" onClick={resetTheme} disabled={!canPersist}><RotateCcw size={16}/> Reset Theme</button><button className="mu-btn mu-btn-primary" type="button" onClick={saveTheme} disabled={!canPersist||!dirty}><Check size={16}/> Save Theme</button></div>
        {message&&<div className="vw-pf-note mt-3" role="status"><Info size={16}/> {message}</div>}
      </section>
      <section className="vw-management-card vw-pf-card"><h2><span className="vw-pf-dot"/>Live preview</h2>
        <div className="vw-profile-preview-surface" data-vw-theme={draft.theme==="dark"?"dark":"light"} data-vw-accent={draft.accent}><div className="vw-profile-preview-top"><strong>Dataset Management</strong><span className="vw-profile-example-button">+ Add Dataset</span></div><div className="vw-profile-preview-row"><span>Human Resources</span><span className="badge bg-success">Active</span></div></div>
        <p className="vw-profile-help mt-2">Loading animations are managed under Portal Settings → System Preferences by authorized administrators. Other users retain the default loading behavior.</p>
      </section>
    </div>}
  </div>;
}
