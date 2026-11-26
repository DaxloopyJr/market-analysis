/**
 * FILE: src/pages/ModulePage/ModulePage.jsx
 * NAVIGATION FLOW: /dashboard/{module route} -> ProtectedRoute -> RouteAccess -> ModulePage
 * DATA / API FLOW: Permission/menu in src/config; example API contracts in src/API/. Existing UI unchanged.
 * NOTE: This reorganization changes imports/comments only, not page behavior.
 */
import { Link, useOutletContext } from "react-router-dom";
import { CheckCircle2 } from "lucide-react";
import PageHeader from "../../components/Workspace/PageHeader";
import SectionHeader from "../../components/Workspace/SectionHeader";
import { userCan } from "../../config/rolePermissions";
import { canAccessPath } from "../../config/permissionService";
import "./ModulePage.css";

/**
 * Placeholder screens for ROUTES, not invented business forms.
 * Each menu is functional and route-protected while UI is awaiting approval.
 * Page -> the corresponding commented service in src/services/.
 */
const MODULE_INFO = {
  datasets: {
    title: "Datasets", 
    service: "API/dataset.jsx", endpoint: "GET /api/v1/datasets",
    functions: [
      ["datasets.configure", "Configure dataset definitions (create, edit, deactivate)"],
      ["datasets.view", "View assigned dataset templates"],
    ],
  },
  consumers: {
    title: "Data Consumers",
    service: "API/dataset.jsx", endpoint: "GET /api/v1/datasets/{id}/consumers",
    functions: [["data_consumers.configure", "Manage consumers by dataset and approved scope"]],
  },
  periods: {
    title: "Submission Periods",
    service: "API/dataset.jsx", endpoint: "GET /api/v1/submission-periods",
    functions: [["submission_periods.view", "View current and upcoming periods"], ["submission_periods.configure", "Configure / close / re-open periods"]],
  },
  institutions: {
    title: "Institutions",
    service: "API/institution.jsx", endpoint: "GET /api/v1/institutions",
    functions: [["institutions.manage", "Create, edit and deactivate institutions"], ["institutions.view_own", "View own institution profile only"]],
  },
  departments: {
    title: "Ministry Departments",
    service: "API/administration.jsx", endpoint: "GET /api/v1/departments",
    functions: [["departments.manage", "Create, edit and deactivate departments"]],
  },
  "institution-admins": {
    title: "Institutional Admins",
    service: "API/administration.jsx", endpoint: "GET /api/v1/institution-admins",
    functions: [["institutional_admins.manage", "Create, edit and deactivate institutional admins"]],
  },
  users: {
    title: "Users",
    service: "API/administration.jsx", endpoint: "GET /api/v1/users",
    functions: [["users.manage.ministry", "Manage portal-wide users"], ["users.manage.institution", "Manage own institution's users only"]],
  },
  roles: {
    title: "Roles & Permissions",
    service: "API/administration.jsx", endpoint: "GET /api/v1/roles",
    functions: [["roles.manage", "Create/update roles and assign permissions"]],
  },
  settings: {
    title: "Portal Settings",
    service: "API/administration.jsx", endpoint: "GET /api/v1/settings",
    functions: [["portal_settings.manage", "Configure Ministry-wide portal settings"]],
  },
  "approval-circle": {
    title: "Approval Circle",
    service: "API/approval.jsx", endpoint: "GET /api/v1/approval-workflows",
    functions: [["approval_circle.manage.ministry", "Configure Ministry-level approval workflow"], ["approval_circle.manage.institution", "Configure own institution's HoD/AO workflow"]],
  },
  analytics: {
    title: "Institution Analytics",
    service: "API/analyticsReports.jsx", endpoint: "GET /api/v1/analytics/institutions",
    functions: [["analytics.view.ministry", "View all institution analytics"], ["analytics.view.own", "View own institution analytics"], ["analytics.view.ministry", "View Ministry-authorized analytics"], ["analytics.view.institution", "View specifically granted analytics"]],
  },
  audit: {
    title: "Audit Logs",
    service: "API/audit.jsx", endpoint: "GET /api/v1/audit-logs",
    functions: [["audit_logs.view.ministry", "Read all system audit records"], ["audit_logs.view.institution", "Read own institution audit records only"]],
  },
  delegations: {
    title: "Delegations",
    functions: [], // No dedicated Laravel endpoint in the supplied backend.
  },
  submissions: {
    title: "Submissions",
    service: "API/submissionWorkflow.jsx", endpoint: "GET /api/v1/submissions",
    functions: [
      ["submissions.create", "Create new Draft submission"],
      ["submissions.edit", "Edit Draft / Returned submission"],
      ["submissions.submit", "Submit to approval circle"],
      ["submissions.view.scope", "View own submissions and feedback"],
      ["submissions.view.scope", "Monitor submission progress without editing"],
      ["submissions.view.approved", "View approved / published submissions only"],
      ["submissions.review", "Review received submission"],
      ["submissions.return", "Return with comments"],
      ["submissions.forward", "Forward to next approval level"],
      ["submissions.approve", "Approve institutional submission as AO"],
      ["submissions.approve", "Final approve as DD"],
      ["submissions.publish", "Publish approved data to dashboard as DD"],
    ],
  },
  reports: {
    title: "Reports",
    service: "API/analyticsReports.jsx", endpoint: "GET /api/v1/reports",
    functions: [["reports.view.ministry", "All portal reports"], ["reports.view.institution", "Own institution reports"], ["reports.view.ministry", "Ministry summary reports"], ["reports.view.own", "Own submission history"], ["reports.view.institution", "Approval activity reports"]],
  },
};

export default function ModulePage({ moduleId }) {
  const { user } = useOutletContext();
  const info = MODULE_INFO[moduleId];
  if (!info) return <div className="alert alert-warning">Unknown module.</div>;

  const allowed = info.functions.filter(([permission]) => userCan(user, [permission]));
  // TODO(BACKEND): The actual role-scoped data and actions must come from the
  // service documented in MODULE_INFO. RouteAccess is UI-only; Laravel enforces
  // permissions and institution/department ownership for every API request.
  return (
    <div className="viwanda-module-preview container-fluid px-0">
      <PageHeader title={info.title} />
      <section className="viwanda-surface">
        <SectionHeader title="Available Actions" />
        <div className="viwanda-actions-list">
          {allowed.map(([permission, label]) => (
            <div className="viwanda-action-row" key={`${permission}-${label}`}>
              <CheckCircle2 size={18} aria-hidden="true" />
              <strong>{label}</strong>
            </div>
          ))}
          {allowed.length === 0 && (
            <p className="viwanda-empty-state">No actions are available for this role.</p>
          )}
          {moduleId === "submissions" && canAccessPath(user, "/dashboard/data-entry") && (
            <Link to="/dashboard/data-entry" className="btn btn-primary align-self-start">
              New Submission
            </Link>
          )}
        </div>
      </section>
    </div>
  );
}
