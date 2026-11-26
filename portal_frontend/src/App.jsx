/**
 * FILE: src/App.jsx
 * ROUTING FLOW: Login -> ProtectedRoute -> DashboardLayout -> RouteAccess
 * -> /dashboard/administration/institutions -> Admin/Institutions.jsx
 * -> /dashboard/administration/users -> Admin/Users.jsx
 * -> /dashboard/administration/roles-permissions -> Admin/RolesPermissions.jsx.
 * -> /dashboard/administration/departments -> Admin/MinistryDepartments.jsx.
 * -> /dashboard/administration/institution-admins -> Admin/InstitutionalAdmins.jsx.
 * -> /dashboard/reference-data -> ModulePage/ReferenceData.jsx (Reference Types/Values).
 * -> /dashboard/datasets -> ModulePage/Datasets.jsx (approved Dataset Builder + remote Laravel API).
 * Other REV26 routes, Auth and layout behavior are preserved unchanged.
 */
import { lazy } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import Home from "./pages/Home/Home";
import Login from "./pages/Login/Login";
import ForgotPassword from "./pages/Login/ForgotPassword";
import ResetPassword from "./pages/Login/ResetPassword";
import ActivateAccount from "./pages/Login/ActivateAccount";
import ProtectedRoute from "./Auth/ProtectedRoute";
import RouteAccess from "./Auth/RouteAccess";
import DashboardLayout from "./layouts/DashboardLayout";
import { MODULE_ROUTES } from "./config/moduleRoutes";
const RoleDashboardPreview = lazy(() => import("./pages/ModulePage/RoleDashboardPreview"));
const ModulePage = lazy(() => import("./pages/ModulePage/ModulePage"));
const Submissions = lazy(() => import("./pages/Submissions/Submissions"));
const DataEntry = lazy(() => import("./pages/DataEntry/DataEntry"));
const Reports = lazy(() => import("./pages/Reports/Reports"));
const AuditLogs = lazy(() => import("./pages/AuditLogs/AuditLogs"));
const Notifications = lazy(() => import("./pages/Notifications/Notifications"));
const Institutions = lazy(() => import("./pages/Admin/Institutions"));
const Users = lazy(() => import("./pages/Admin/Users"));
const RolesPermissions = lazy(() => import("./pages/Admin/RolesPermissions"));
const MinistryDepartments = lazy(() => import("./pages/Admin/MinistryDepartments"));
const InstitutionalAdmins = lazy(() => import("./pages/Admin/InstitutionalAdmins"));
const PortalSettings = lazy(() => import("./pages/Admin/PortalSettings"));
const ApprovalCircle = lazy(() => import("./pages/Admin/ApprovalCircle"));
const Delegations = lazy(() => import("./pages/Admin/Delegations"));
const ReferenceData = lazy(() => import("./pages/ModulePage/ReferenceData"));
const Datasets = lazy(() => import("./pages/ModulePage/Datasets"));
const InstitutionAnalytics = lazy(() => import("./pages/Analytics/InstitutionAnalytics"));
const InstitutionDashboard = lazy(() => import("./pages/Analytics/InstitutionDashboard"));
const DatasetAnalytics = lazy(() => import("./pages/Analytics/DatasetAnalytics"));
const MeReport = lazy(() => import("./pages/Analytics/MeReport"));
const SubmissionPeriods = lazy(() => import("./pages/SubmissionPeriods/SubmissionPeriods"));
const StrategicPlans = lazy(() => import("./pages/StrategicPlans/StrategicPlans"));
const MyProfile = lazy(() => import("./pages/Profile/AppearancePreferences"));
const HodInbox = lazy(() => import("./pages/HOD/HodInbox"));
const HodReviewed = lazy(() => import("./pages/HOD/HodReviewed"));
const HodReview = lazy(() => import("./pages/HOD/HodReview"));
const AoApprovals = lazy(() => import("./pages/AO/AoApprovals"));
import HodAccess from "./Auth/HodAccess";
import AoAccess from "./Auth/AoAccess";
import MdoAccess from "./Auth/MdoAccess";
import MddAccess from "./Auth/MddAccess";
const MdoWorkspace = lazy(() => import("./pages/MDO/MdoWorkspace"));
const MddWorkspace = lazy(() => import("./pages/MDD/MddWorkspace"));
/** Routes only. Sidebar permissions live in config/ and Auth/ (not App.jsx). */
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/activate" element={<ActivateAccount />} />
        <Route path="/activate-account" element={<ActivateAccount />} />

        <Route element={<ProtectedRoute />}>
          <Route path="/dashboard" element={<DashboardLayout />}>
            <Route index element={<RoleDashboardPreview />} />
            {/* My Profile: verified /me account + local theme; password API pending confirmation. */}
            <Route path="profile" element={<MyProfile />} />
            <Route path="data-entry" element={<RouteAccess><DataEntry /></RouteAccess>} />
            {/* Submissions submenus: each URL is protected by RouteAccess + backend later. */}
            <Route path="submissions" element={<RouteAccess><Submissions view="my" /></RouteAccess>} />
            <Route path="submissions/my" element={<RouteAccess><Submissions view="my" /></RouteAccess>} />
            <Route path="submissions/drafts" element={<RouteAccess><Submissions view="drafts" /></RouteAccess>} />
            <Route path="submissions/returned" element={<RouteAccess><Submissions view="returned" /></RouteAccess>} />
            <Route path="submissions/history" element={<RouteAccess><Submissions view="history" /></RouteAccess>} />
            <Route path="submissions/new" element={<RouteAccess><DataEntry /></RouteAccess>} />
            <Route path="submissions/monitor" element={<RouteAccess><Submissions view="monitor" /></RouteAccess>} />
            <Route path="submissions/approvals" element={<RouteAccess><Submissions view="approvals" /></RouteAccess>} />
            <Route path="submissions/published" element={<RouteAccess><Submissions view="published" /></RouteAccess>} />
            {/* HOD Submissions dropdown has one Pending Review list plus Review History. */}
            <Route path="hod/inbox" element={<HodAccess><HodInbox /></HodAccess>} />
            <Route path="hod/pending" element={<HodAccess><Navigate to="/dashboard/hod/inbox" replace /></HodAccess>} />
            <Route path="hod/history" element={<HodAccess><HodReviewed /></HodAccess>} />
            <Route path="hod/review/:id" element={<HodAccess><HodReview /></HodAccess>} />
            <Route path="hod/history/:id" element={<HodAccess><HodReview history /></HodAccess>} />
            {/* Account Officer: UI reference #2 list LEFT, read-only approval details RIGHT. */}
            <Route path="ao/pending" element={<AoAccess><AoApprovals /></AoAccess>} />
            <Route path="ao/reviewed" element={<AoAccess><AoApprovals reviewed /></AoAccess>} />
            <Route path="ao/review/:id" element={<AoAccess><AoApprovals review /></AoAccess>} />
            {/* Old/bookmarked AO links: inbox = Pending Approval (never fall through to "/"). */}
            <Route path="ao/inbox" element={<Navigate to="/dashboard/ao/pending" replace />} />
            {/* Ministry Data Officer: source catalogue -> dataset overview -> one-by-one review. */}
            <Route path="mdo/queue" element={<MdoAccess><MdoWorkspace mode="queue" /></MdoAccess>} />
            <Route path="mdo/source/:sourceType/:sourceId" element={<MdoAccess><MdoWorkspace mode="source" /></MdoAccess>} />
            <Route path="mdo/review/:id" element={<MdoAccess><MdoWorkspace mode="review" /></MdoAccess>} />
            <Route path="mdo/reviewed" element={<MdoAccess><MdoWorkspace mode="reviewed" /></MdoAccess>} />
            <Route path="mdo/returned" element={<MdoAccess><MdoWorkspace mode="returned" /></MdoAccess>} />
            {/* MDD: same compact government source/dataset workflow as MDO;
                Approve and Publish remain independent Laravel actions. */}
            <Route path="mdd/queue" element={<MddAccess><MddWorkspace mode="queue" /></MddAccess>} />
            <Route path="mdd/ready" element={<MddAccess><Navigate to="/dashboard/mdd/queue" replace /></MddAccess>} />
            <Route path="mdd/source/:sourceType/:sourceId" element={<MddAccess><MddWorkspace mode="source" /></MddAccess>} />
            <Route path="mdd/review/:id" element={<MddAccess><MddWorkspace mode="review" /></MddAccess>} />
            <Route path="mdd/reviewed" element={<MddAccess><MddWorkspace mode="reviewed" /></MddAccess>} />
            <Route path="mdd/published" element={<MddAccess><MddWorkspace mode="published" /></MddAccess>} />
            <Route path="mdd/returned" element={<MddAccess><MddWorkspace mode="returned" /></MddAccess>} />
            {/* Institution Analytics: cards -> organisation dashboard -> one dataset (published data only). */}
            <Route path="analytics/:type/:id" element={<RouteAccess><InstitutionDashboard /></RouteAccess>} />
            <Route path="analytics/:type/:id/dataset/:datasetId" element={<RouteAccess><DatasetAnalytics /></RouteAccess>} />
            {/* Printable M&E report (EN/SW, editable conclusion) -> browser "Save as PDF". */}
            <Route path="analytics/:type/:id/report" element={<RouteAccess><MeReport /></RouteAccess>} />
            <Route path="reports" element={<RouteAccess><Reports /></RouteAccess>} />
            {/* Team build: report pages are not shipped yet; old report links return to the list. */}
            <Route path="reports/:reportId" element={<Navigate to="/dashboard/reports" replace />} />
            <Route path="notifications" element={<Notifications />} />
            {MODULE_ROUTES.map(({ path, moduleId }) => (
              <Route
                key={path}
                path={path}
                element={
                  <RouteAccess>
                    {moduleId === "datasets" ? (
                      <Datasets />
                    ) : moduleId === "audit" ? (
                      <AuditLogs />
                    ) : moduleId === "analytics" ? (
                      <InstitutionAnalytics />
                    ) : moduleId === "periods" ? (
                      <SubmissionPeriods />
                    ) : moduleId === "strategic-plans" ? (
                      <StrategicPlans />
                    ) : moduleId === "reference-data" ? (
                      <ReferenceData />
                    ) : moduleId === "institutions" ? (
                      <Institutions />
                    ) : moduleId === "departments" ? (
                      <MinistryDepartments />
                    ) : moduleId === "institution-admins" ? (
                      <InstitutionalAdmins />
                    ) : moduleId === "settings" ? (
                      <PortalSettings />
                    ) : moduleId === "approval-circle" ? (
                      <ApprovalCircle />
                    ) : moduleId === "delegations" ? (
                      <Delegations />
                    ) : moduleId === "users" ? (
                      <Users />
                    ) : moduleId === "roles" ? (
                      <RolesPermissions />
                    ) : (
                      <ModulePage moduleId={moduleId} />
                    )}
                  </RouteAccess>
                }
              />
            ))}
            {/* Unknown page INSIDE the dashboard: stay signed in and return to Dashboard
                (previously fell through to "/" which looked like a logout). */}
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}