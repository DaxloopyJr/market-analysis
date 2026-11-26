/**
 * FILE: src/components/Topbar.jsx
 * NAV: DashboardLayout -> Topbar user menu -> /dashboard/profile (all authenticated users).
 * PROFILE FLOW: My Profile displays /me fields, Security placeholder, personal theme.
 * ADMIN LOADING: Portal Settings -> System Preferences; not accessible here.
 * BACKEND: no new API; existing navigation and logout callbacks unchanged.
 * LAYOUT (10 Nov 2026, approved mockup "E, rangi za sasa" + menu 4 + language 4): emblem in a flag ring is the
 *   menu button (flag-line button on phones), wide centred search (Ctrl K), flag-ring language button, bell, profile pill.
 */
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { ChevronDown, LogOut, Menu, Monitor, Moon, Search, Sun, UserRound } from "lucide-react";
import NotificationBell from "./NotificationBell";
import { menuForUser } from "../config/permissionService";
import LanguageControl from "./LanguageControl";
import { getUnreadNotificationCount } from "../API/notifications";
import { MuLogo } from "./modern/ModernUI.jsx";
import { institutionLogoUrl } from "../utils/institutionLogo";
import { orgInitials } from "../utils/orgCards.js";
import { useLanguage } from "../i18n/LanguageContext.jsx";
import NetworkLine from "./NetworkLine.jsx";
import { useAppearance } from "../contexts/AppearanceContext";
import "./Topbar.css";

const EMBLEM = "/reference/national-emblem.png";

export default function Topbar({
  variant = "landing",
  language,
  onLanguageChange,
  labels,
  onMenuClick,
  sidebarCollapsed = false,
  user,
  onLogout,
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const { lang, setLang, t } = useLanguage();
  const [unreadCount, setUnreadCount] = useState(0);
  useEffect(() => {
    if (variant !== "dashboard" || !user) return undefined;
    let active = true;
    const refresh = () => getUnreadNotificationCount().then(count => {
      if(active) setUnreadCount(Number.isFinite(count)?Math.max(0,count):0);
    }).catch(() => { if(active) setUnreadCount(0); });
    refresh();
    window.addEventListener("viwanda:notifications:updated", refresh);
    window.addEventListener("focus", refresh);
    return () => {active=false;window.removeEventListener("viwanda:notifications:updated", refresh);window.removeEventListener("focus",refresh);};
  }, [variant, user?.id, location.pathname]);
  const [search, setSearch] = useState("");
  const searchRef = useRef(null);
  // Ctrl/Cmd + K focuses the page search (10 Nov 2026).
  useEffect(() => {
    if (variant !== "dashboard") return undefined;
    const onKey = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") { event.preventDefault(); searchRef.current?.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [variant]);
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef(null);
  // Account menu closes on a click/tap anywhere else and on Escape (8 Nov 2026).
  useEffect(() => {
    if (!profileOpen) return undefined;
    const onOutside = (event) => { if (!profileRef.current?.contains(event.target)) setProfileOpen(false); };
    const onKey = (event) => { if (event.key === "Escape") setProfileOpen(false); };
    document.addEventListener("pointerdown", onOutside);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", onOutside); document.removeEventListener("keydown", onKey); };
  }, [profileOpen]);

  if (variant !== "dashboard") {
    return (
      <header className="landing-header">
        <div className="landing-brand">
          <img src={EMBLEM} alt="Tanzania national coat of arms" />
          <div>
            <strong>Viwanda na Biashara Portal</strong>
            <span>Ministry of Industry and Trade — Data Collection and Reporting</span>
          </div>
        </div>
        <div className="landing-nav">
          <LanguageControl language={language} onChange={onLanguageChange} />
          <Link className="nav-login text-decoration-none" to="/login">
            {labels?.login || "Login"}
          </Link>
        </div>
      </header>
    );
  }

  const name = user?.name || "User";
  const role = user?.role || "Institution Officer";
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("");

  // Search available NAVIGATION pages only; it does not search backend records.
  // TODO(BACKEND): Full data search API example in API/search.jsx.
  const navigationResults = menuForUser(user)
    .flatMap((item) => item.children || [item])
    .filter((item) => item.path && search.trim() &&
      item.label.toLowerCase().includes(search.toLowerCase().trim()))
    .slice(0, 6);

  function handleSearch(event) {
    event.preventDefault();
    if (navigationResults.length) {
      navigate(navigationResults[0].path);
      setSearch("");
    }
  }

  const menuLabel = sidebarCollapsed ? t("Open menu") : t("Close menu");
  const roleCode = String(user?.roles?.[0]?.code ?? user?.role_code ?? user?.roleCode ?? "").toUpperCase();
  const scopeCode = user?.department?.code ?? user?.institution?.code ?? "";
  const roleLine = roleCode ? [roleCode, scopeCode].filter(Boolean).join(" · ") : t(role);
  const nextLang = lang === "sw" ? "en" : "sw";

  return (
    <header className="dashboard-topbar portal-topbar d-flex align-items-center">
      {/* Phones: the flag-line menu button (sidebar is hidden there). Desktop: the emblem is the menu button (10 Nov 2026). */}
      <button type="button" className="portal-flag-menu" onClick={onMenuClick} aria-label={menuLabel}
        aria-expanded={!sidebarCollapsed} aria-controls="dashboard-sidebar" title={menuLabel}>
        <span aria-hidden="true"><i /><i /><i /></span>
      </button>
      <div className="portal-topbar-brand d-flex align-items-center">
        <button type="button" className="portal-emblem-menu" onClick={onMenuClick} aria-label={menuLabel}
          aria-expanded={!sidebarCollapsed} aria-controls="dashboard-sidebar" title={menuLabel}>
          <span className="portal-emblem-ring">
            <img className="portal-topbar-emblem" src={EMBLEM} alt="Coat of arms of the United Republic of Tanzania" />
          </span>
          <span className="portal-emblem-mini" aria-hidden="true"><Menu size={10} strokeWidth={3} /></span>
        </button>
        <div className="portal-topbar-brand-copy">
          <strong>VIWANDA PORTAL</strong>
          <small>{t("Ministry of Industry and Trade")}</small>
        </div>
      </div>

      <div className="portal-topbar-grow" />
      <div className="portal-search-wrap">
      <form className="portal-topbar-search" onSubmit={handleSearch} role="search">
        <Search size={16} aria-hidden="true" />
        <input
          ref={searchRef}
          type="search"
          aria-label="Search portal"
          placeholder={t("Find a page or report...")}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <kbd className="portal-search-kbd" aria-hidden="true">Ctrl K</kbd>
      </form>
      {search.trim() && (
        <div className="portal-search-results" role="listbox" aria-label="Allowed navigation results">
          {navigationResults.length ? navigationResults.map((item) => (
            <Link key={item.path} role="option" aria-selected="false" to={item.path}
              onClick={() => setSearch("")}>{t(item.label)}</Link>
          )) : <span className="portal-search-empty">{t("No matching accessible pages")}</span>}
        </div>
      )}
      </div>
      <div className="portal-topbar-grow" />

      {/* Portal language (9 Nov 2026): one flag-ring button that flips SW <-> EN (10 Nov 2026). */}
      <button type="button" key={lang} className="portal-lang-ring" onClick={() => setLang(nextLang)}
        aria-label={nextLang === "en" ? "Switch language: English" : "Badili lugha: Kiswahili"}
        title={nextLang === "en" ? "Badili lugha: English" : "Switch language: Kiswahili"}>
        <b>{lang === "sw" ? "SW" : "EN"}</b>
      </button>
      <NotificationBell unreadCount={unreadCount} user={user} />

      <div className="portal-profile-wrap" ref={profileRef}>
      <button type="button" className="portal-topbar-profile d-flex align-items-center"
        aria-label="Open user account menu" aria-haspopup="true" aria-expanded={profileOpen}
        onClick={() => setProfileOpen((current) => !current)}>
        <span className="portal-topbar-avatar" aria-hidden="true">
          {initials || "U"}
        </span>
        <div className="portal-topbar-user-copy">
          <strong>{name}</strong>
          <small>{roleLine}</small>
        </div>
        <ChevronDown className="portal-topbar-profile-chevron" size={14} aria-hidden="true" />
      </button>
      {profileOpen && (
        <div className="portal-profile-popover">
          {/* Same size and items (10 Nov 2026 mockup 1): navy band with flag stripe and faint emblem, role chip. */}
          <div className="portal-profile-band">
            <img className="portal-profile-watermark" src={EMBLEM} alt="" aria-hidden="true" />
            <strong>{user?.name}</strong>
            <span className="portal-profile-chip">{roleLine}</span>
          </div>
          <span className="portal-profile-org"><MuLogo src={institutionLogoUrl(user?.institution)} initials={orgInitials(user?.institution?.name ? user.institution : {name: user?.department?.name || "MIT"}) || "MIT"} size={24}/>{user?.institution?.name || user?.department?.name || "MIT Headquarters"}</span>
          <div className="portal-profile-actions">
            <Link to="/dashboard/profile" className="portal-profile-appearance-link" onClick={() => setProfileOpen(false)}><span className="portal-profile-ic" aria-hidden="true"><UserRound size={15} /></span> {t("My Profile")}</Link>
            <ThemeSwitch t={t} />
            <button type="button" className="portal-profile-signout" onClick={() => {
              setProfileOpen(false);
              onLogout?.();
            }}><span className="portal-profile-ic" aria-hidden="true"><LogOut size={15} /></span> {t("Sign out")}</button>
          </div>
        </div>
      )}
      </div>
      <NetworkLine />
    </header>
  );
}

const THEMES = [
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
  { value: "auto", label: "Same as computer", Icon: Monitor },
];

/** Theme from the profile menu (11 Nov 2026, approved mockup A): saved where My Profile > Appearance saves it. */
function ThemeSwitch({ t }) {
  const { preferences, resolvedTheme, saveAppearance, canPersist } = useAppearance();
  if (!canPersist) return null;
  const CurrentIcon = resolvedTheme === "dark" ? Moon : Sun;
  return (
    <div className="portal-profile-theme">
      <span className="portal-profile-ic" aria-hidden="true"><CurrentIcon size={15} /></span>
      <span>{t("Theme")}</span>
      <span className="portal-theme-seg" role="radiogroup" aria-label={t("Theme")}>
        {THEMES.map(({ value, label, Icon }) => (
          <button key={value} type="button" role="radio" aria-checked={preferences.theme === value}
            className={preferences.theme === value ? "on" : ""} title={t(label)} aria-label={t(label)}
            onClick={() => saveAppearance({ ...preferences, theme: value })}>
            <Icon size={14} aria-hidden="true" />
          </button>
        ))}
      </span>
    </div>
  );
}
