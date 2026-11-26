/**
 * FILE: src/pages/ModulePage/RoleDashboardPreview.jsx
 * NAVIGATION FLOW: /dashboard -> ProtectedRoute -> DashboardLayout -> RoleDashboardPreview
 * DATA / API FLOW: MOA => pages/Admin/AdminDashboard.jsx; other roles => existing Quick Access preview.
 * NOTE: This reorganization changes imports/comments only, not page behavior.
 */
/**
 * PAGE: VIWANDA Portal > Dashboard landing / Role resolver (REV26)
 *
 * EXISTING ROUTE / AUTH FLOW (unchanged):
 *   App.jsx: /login -> Login.jsx -> existing Laravel authentication
 *   -> ProtectedRoute -> /dashboard -> DashboardLayout
 *   -> <RoleDashboardPreview /> (this component)
 *   -> useOutletContext().user (user supplied by the existing layout)
 *
 * PAGE FLOW:
 *   - System/ICT Admin (MOA) -> pages/Admin/AdminDashboard.jsx
 *     -> API-driven Admin Dashboard -> clickable cards/charts -> detail modals.
 *   - Every other role -> existing role-aware Quick Access landing
 *     -> menuForUser(user) -> existing permitted module routes.
 *
 * TODO(BACKEND): Confirm the EXACT role code returned by the working
 * authentication endpoint. This UI checks MOA / System Administrator variants
 * only. Authorization (including institution scope) MUST stay enforced in
 * the Laravel API and the existing route/permission layers.
 *
 * This file does NOT create or change routes, login, logout, token handling,
 * national emblem, Topbar, Sidebar, Footer, or any backend API call.
 */

import ExecutiveDashboard from "../ExecutiveDashboard/ExecutiveDashboard.jsx";
import { Link, Navigate, useOutletContext } from "react-router-dom";
import { ArrowRight } from "lucide-react";

import PageHeader from "../../components/Workspace/PageHeader";
import SectionHeader from "../../components/Workspace/SectionHeader";
import { menuForUser } from "../../config/permissionService";
import ManagementDashboard from "../Admin/ManagementDashboard.jsx";
import DashboardContentBoundary from "../../components/Workspace/DashboardContentBoundary.jsx";
import MinistryDashboard from "../MinistryDashboard/MinistryDashboard.jsx";
import IhodDashboard from "../IhodDashboard/IhodDashboard.jsx";
import AoDashboard from "../AoDashboard/AoDashboard.jsx";
import IdoDashboard from "../Dashboard/Dashboard.jsx";

import "./ModulePage.css";

/**
 * Map the existing backend's role value (string/object/array) to readable text.
 * Exact backend fields still need confirmation; unknown roles default to the
 * EXISTING dashboard, never to the System Admin dashboard.
 */
function roleTexts(user) {
  const values = [user?.role, user?.role_code];

  if (Array.isArray(user?.roles)) {
    values.push(...user.roles);
  }

  return values.flatMap((value) => {
    if (typeof value === "string") return [value];
    if (value && typeof value === "object") {
      return [value.code, value.name, value.slug].filter(Boolean);
    }
    return [];
  });
}

function isSystemIctAdmin(user) {
  const allowedRoles = new Set([
    "moa",
    "ministry overall admin",
    "ministry overall administrator",
    "system admin",
    "system administrator",
    "ict admin",
    "system ict admin"
  ]);

  return roleTexts(user).some((role) => {
    const normalized = role
      .trim()
      .toLowerCase()
      .replace(/[_/\-]+/g, " ")
      .replace(/\s+/g, " ");

    return allowedRoles.has(normalized);
  });
}

function ministryRole(user) {
  const roles = roleTexts(user).map(x=>String(x).trim().toUpperCase().replace(/[\s_-]+/g,''));
  if (roles.some(x=>['MDD','MINISTRYDATADIRECTOR','MINISTRYDIRECTOR'].includes(x))) return 'MDD';
  if (roles.some(x=>['MDO','MINISTRYDATAOFFICER'].includes(x))) return 'MDO';
  return null;
}

/** Existing role-aware landing, kept for all non-System-Admin roles. */
function QuickAccessDashboard({ user }) {
  const links = menuForUser(user)
    .flatMap((item) => item.children || [item])
    .filter((item) => item.path && item.path !== "/dashboard");

  return (
    <div className="container-fluid px-0 viwanda-module-preview">
      <PageHeader title={`${user?.role || "Portal"} Dashboard`} />

      <section className="viwanda-surface">
        <SectionHeader title="Quick Access" />

        {links.length ? (
          <div className="row g-3 viwanda-module-grid">
            {links.map((item) => (
              <div
                key={item.path}
                className="col-12 col-sm-6 col-xl-4"
              >
                <Link className="viwanda-module-tile" to={item.path}>
                  <strong>{item.label}</strong>
                  <ArrowRight size={17} aria-hidden="true" />
                </Link>
              </div>
            ))}
          </div>
        ) : (
          <p className="viwanda-empty-state">
            No additional modules assigned.
          </p>
        )}
      </section>
    </div>
  );
}

export default function RoleDashboardPreview() {
  const { user } = useOutletContext();

  // Change ONLY the dashboard landing for MOA/System-ICT Admin.
  if (isSystemIctAdmin(user)) {
    return <DashboardContentBoundary><ManagementDashboard role="MOA" user={user} /></DashboardContentBoundary>;
  }

  const institutionAdminCodes = new Set(['IA','INSTITUTIONADMIN','INSTITUTIONADMINISTRATOR']);
  if (roleTexts(user).some(value=>institutionAdminCodes.has(String(value).replace(/[\s_-]+/g,'').toUpperCase()))) {
    return <DashboardContentBoundary><ManagementDashboard role="IA" user={user} /></DashboardContentBoundary>;
  }

  // Ministry executives (Minister, Deputy Minister, PS, Deputy PS): role ME, 8 Nov 2026.
  if (roleTexts(user).some(value => String(value).trim().toUpperCase() === "ME")) {
    return <DashboardContentBoundary><ExecutiveDashboard user={user} /></DashboardContentBoundary>;
  }

  const role = ministryRole(user);
  if (role) return <MinistryDashboard role={role} />;
  // Resolve AO workspace from the SAME effective navigation tree used by Sidebar.
  // Raw /api/me user.menu contains module keys, not necessarily child URLs.
  // An unfamiliar future role can enter this workspace when Laravel grants
  // AO-style routes and an approval permission; never grant via a role name.
  const visibleChildren = menuForUser(user)
    .flatMap(item => item.children ?? []);
  const aoWorkspaceAvailable = visibleChildren.some(item =>
    ["/dashboard/ao/pending", "/dashboard/ao/reviewed"].includes(item.path)
  );
  const approvalPermission = (user?.permissions ?? []).some(permission => {
    const code = typeof permission === "string"
      ? permission
      : (permission?.code ?? permission?.name ?? "");
    return ["submissions.approve", "submissions.approval"].includes(code);
  });
  if (aoWorkspaceAvailable && approvalPermission) return <AoDashboard />;
  // Backend /me.menu determines which reviewer workspace this user may enter.
  // Newly created roles work without editing this component when the backend
  // grants submissions.review and includes the institution-review menu entry.
  const reviewerMenu = user?.menu?.find(item => item.key === "submissions");
  const institutionalReview = reviewerMenu?.children?.some(c => ["hod-inbox", "institution-review", "pending-review"].includes(c.key) || c.path === "/dashboard/hod/inbox");
  const institutionGrant = user?.permissions?.includes("submissions.review.institution") || user?.permissions?.includes("submissions.review.own");
  const legacyReviewer = [user?.role_code,...(user?.roles??[]).map(r=>typeof r==="string"?r:r.code)].some(c=>["IHOD","HOD"].includes(String(c).toUpperCase()));
  if (user?.permissions?.includes("submissions.review") && (institutionalReview || institutionGrant || legacyReviewer)) return <IhodDashboard />;
  // The IDO/DDO dashboard has to be selected by the actual /dashboard
  // resolver; merely adding Dashboard.jsx does not make it visible.
  // Use backend-granted capabilities, not a fixed IDO/DDO role name.
  const grants = new Set((user?.permissions ?? []).map(permission =>
    typeof permission === "string" ? permission : permission?.code ?? permission?.name
  ));
  const officerChildren = menuForUser(user).flatMap(item => item.children ?? []);
  const hasOfficerSubmissionMenu = officerChildren.some(item =>
    ["/dashboard/submissions/my", "/dashboard/submissions/new"].includes(item.path)
  );
  if (grants.has("submissions.view.scope") &&
      grants.has("submissions.create") && hasOfficerSubmissionMenu) {
    return <IdoDashboard />;
  }
  // Previewer (analytics.view.published, read-only): the landing page is Institution Analytics.
  if (grants.has("analytics.view.published")) return <Navigate to="/dashboard/analytics" replace />;
  return <QuickAccessDashboard user={user} />;
}
