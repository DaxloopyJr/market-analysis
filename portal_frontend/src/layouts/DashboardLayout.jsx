/**
 * FILE: src/layouts/DashboardLayout.jsx
 * ROUTE: /dashboard/* -> ProtectedRoute(/me) -> persistent Topbar/Sidebar/Footer.
 * FLOW: verified account -> AppearanceProvider (local browser) -> Main Content loader
 * -> lazy route page -> page's TableLoader while real Laravel fetch is running.
 * Backend API and permission checks remain in each feature page / RouteAccess.
 */
import { Suspense, useEffect, useState } from "react";
import { primeInstitutionLogos } from "../services/institutionLogoService.js";
import { useToast } from "../components/Toast/ToastProvider";
import { Outlet, useNavigate, useOutletContext, useLocation } from "react-router-dom";
import Sidebar from "../components/Sidebar";
import Topbar from "../components/Topbar";
import Footer from "../components/Footer";
import { logoutUser } from "../API/login";
import IdleSessionGuard from "../components/IdleSessionGuard.jsx";
import PrivacyGate from "../components/PrivacyGate.jsx";
import { privacyNoticeNeeded } from "../utils/privacyGate.js";
import { invalidate } from "../services/listCache.js";
import { useLanguage } from "../i18n/LanguageContext.jsx";
import { setPageLanguage } from "../i18n/autoTranslate.js";
import "../styles/dashboard-layout.css";
import "../styles/workspace-ui.css";
import { AppearanceProvider, useAppearance } from "../contexts/AppearanceContext";
import { PageLoader } from "../components/common/LoadingState";
import GlobalBreadcrumb from "../components/common/GlobalBreadcrumb.jsx";
import {BreadcrumbContext} from "../contexts/BreadcrumbContext.jsx";

/**
 * PERSISTENT LAYOUT: single verified profile comes from ProtectedRoute.
 * No getDashboardUser() call here and NO "Loading user profile..." loader.
 * Sidebar and role-specific Dashboard use the same Laravel /me account.
 */
export default function DashboardLayout() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [loggingOut, setLoggingOut] = useState(false);
  const { user } = useOutletContext();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { lang } = useLanguage();
  // FR-058: pages open only after the Privacy Notice is accepted, so none of them is refused first.
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const privacyPending = !privacyAccepted && privacyNoticeNeeded(user);
  // Kiswahili for pages that do not translate themselves (phase 2, 9 Nov 2026).
  useEffect(() => { setPageLanguage(lang); }, [lang]);
  useEffect(() => () => { setPageLanguage("en"); }, []);

  function toggleSidebar() {
    if (window.matchMedia("(max-width: 991px)").matches) {
      setSidebarOpen((current) => !current);
    } else {
      setSidebarCollapsed((current) => !current);
    }
  }

  async function handleLogout(options = {}) {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      // Backend: POST /api/v1/logout with the current Bearer token.
      // Success toast ONLY when Laravel confirms logout.
      const result = await logoutUser();
      // Idle sign-out (FR-051): the sign-in page explains it, no success toast.
      if (!options.idle) showToast({
        type: "success",
        title: "Logged out",
        message: result.message || "You have been logged out successfully.",
      });
    } catch {
      // logoutUser clears the browser session even if the server is unreachable.
      // Do not claim the server token was revoked when it was not confirmed.
      if (!options.idle) showToast({
        type: "warning",
        title: "Signed out locally",
        message: "Your browser session was cleared, but server logout could not be confirmed.",
        duration: 4500,
      });
    } finally {
      navigate("/login", { replace: true });
    }
  }

  return <AppearanceProvider user={user}>
    <IdleSessionGuard minutes={user?.session_idle_minutes ?? 15} onSignOut={() => handleLogout({ idle: true })} />
    <PrivacyGate user={user} needed={privacyPending} onAccepted={() => { invalidate(); setPrivacyAccepted(true); }} onSignOut={() => handleLogout()} />
    <DashboardShell user={user} locked={privacyPending} loggingOut={loggingOut} onLogout={handleLogout}
      sidebarCollapsed={sidebarCollapsed} sidebarOpen={sidebarOpen}
      onMenuClick={toggleSidebar} onCloseSidebar={() => setSidebarOpen(false)} />
  </AppearanceProvider>;
}

/** Theme tokens are scoped to the persistent authenticated layout only. */
function DashboardShell({ user, locked, loggingOut, onLogout, sidebarCollapsed, sidebarOpen, onMenuClick, onCloseSidebar }) {
  const { resolvedTheme, preferences } = useAppearance();
  const {pathname}=useLocation();
  const [breadcrumb,setBreadcrumb]=useState(null);
  return (<BreadcrumbContext.Provider value={{...breadcrumb,setBreadcrumb}}>

    <div className="dashboard-shell" data-vw-theme={resolvedTheme} data-vw-accent={preferences.accent} aria-busy={loggingOut}>
      <Topbar
        variant="dashboard"
        user={user}
        sidebarCollapsed={sidebarCollapsed}
        onMenuClick={onMenuClick}
        onLogout={onLogout}
      />

      <div className="dashboard-workspace">
        <Sidebar
          open={sidebarOpen}
          collapsed={sidebarCollapsed}
          onClose={onCloseSidebar}
          user={user}
        />

        <div className="dashboard-main-column">
          <GlobalBreadcrumb />
          <main className="dashboard-content" id="main-content">
            {locked ? <div className="vw-privacy-wait" aria-hidden="true" /> : <WorkspacePageContent user={user} />}
          </main>
          <Footer variant="dashboard" />
        </div>
      </div>
    </div>
    </BreadcrumbContext.Provider>
  );
}

/**
 * Main-content lazy-loading state (NO artificial timers / unnecessary page flashes).
 * Page None -> visually hidden accessible status; table spinner default unchanged.
 * Topbar, Sidebar and Footer remain mounted during actual module loading.
 */
function WorkspacePageContent({ user }) {
  // Institution pictures are loaded once; logoVersion re-renders open pages when they arrive.
  const [logoVersion, setLogoVersion] = useState(0);
  const userId = user?.id ?? user?.userId ?? '';
  useEffect(() => {
    let alive = true;
    primeInstitutionLogos(user).then(added => { if (alive && added) setLogoVersion(v => v + 1); }).catch(() => {});
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);
  return <Suspense fallback={<PageLoader label="Loading page module…" />}>
    <Outlet context={{ user, logoVersion }} />
  </Suspense>;
}
