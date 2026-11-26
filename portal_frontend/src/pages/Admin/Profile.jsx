import { useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import {
  UserCircle2,
  Mail,
  Building2,
  Briefcase,
  Shield,
  Grid2x2,
  Clock3,
  Download,
  Pencil,
  Lock,
  KeyRound,
  CalendarDays,
  CheckCircle2,
  Home,
} from "lucide-react";
import "./profile.css";

const text = (value) => {
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
};

const formatDate = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const prettifyPermission = (permission) =>
  String(permission || "")
    .replaceAll(".", " ")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());

export default function Profile() {
  const { user } = useOutletContext();
  const [activeTab, setActiveTab] = useState("overview");
  const [permissionSearch, setPermissionSearch] = useState("");

  const primaryRole = user?.roles?.[0];
  const pivot = primaryRole?.pivot || {};

  const permissionCount = user?.permissions?.length || 0;
  const roleCount = user?.roles?.length || 0;
  const delegatedRoleCount = user?.delegated_roles?.length || 0;
  const menuCount = user?.menu?.length || 0;

  const filteredPermissions = useMemo(() => {
    const all = user?.permissions || [];
    const q = permissionSearch.trim().toLowerCase();
    if (!q) return all;
    return all.filter((item) => item.toLowerCase().includes(q));
  }, [user?.permissions, permissionSearch]);

  return (
    <main className="vp-profile-page container-fluid px-0">
      {/* Heading */}
      <div className="vp-profile-heading">
        <div className="vp-profile-breadcrumb">
          <Home size={14} />
          <span>Home</span>
          <span>/</span>
          <span>My Account</span>
          <span>/</span>
          <span>Profile</span>
        </div>

        <h1>My Profile</h1>
        <p>View your account information, roles, permissions and activity.</p>
      </div>

      {/* Hero Card */}
      <section className="vp-profile-hero">
        <div className="vp-profile-user-block">
          <div className="vp-profile-avatar">
            {user?.roles?.[0]?.code || user?.name?.slice(0, 3)?.toUpperCase() || "USR"}
          </div>

          <div className="vp-profile-user-info">
            <div className="vp-profile-name-row">
              <h2>{text(user?.name)}</h2>
              <span className="vp-profile-badge active">
                <CheckCircle2 size={14} />
                Active
              </span>
            </div>

            <div className="vp-profile-meta">
              <div><Mail size={16} /> {text(user?.email)}</div>
              <div><Building2 size={16} /> {text(user?.institution?.name)} ({text(user?.institution?.code)})</div>
              <div><Briefcase size={16} /> {text(user?.department?.name)} ({text(user?.department?.code)})</div>
            </div>
          </div>
        </div>

        <div className="vp-profile-actions">
          <button type="button" className="btn btn-primary">
            <Pencil size={15} />
            Edit Profile
          </button>
          <button type="button" className="btn btn-outline-primary">
            <Lock size={15} />
            Change Password
          </button>
          <button type="button" className="btn btn-outline-secondary">
            <Download size={15} />
            Download Profile
          </button>
        </div>

        <div className="vp-profile-stats">
          <div className="vp-stat-card blue">
            <div className="vp-stat-icon"><Shield size={20} /></div>
            <div>
              <strong>{roleCount}</strong>
              <span>Active Role</span>
            </div>
          </div>

          <div className="vp-stat-card purple">
            <div className="vp-stat-icon"><KeyRound size={20} /></div>
            <div>
              <strong>{permissionCount}</strong>
              <span>Permissions</span>
            </div>
          </div>

          <div className="vp-stat-card green">
            <div className="vp-stat-icon"><Grid2x2 size={20} /></div>
            <div>
              <strong>{menuCount}</strong>
              <span>Menu Modules</span>
            </div>
          </div>

          <div className="vp-stat-card orange">
            <div className="vp-stat-icon"><UserCircle2 size={20} /></div>
            <div>
              <strong>{delegatedRoleCount}</strong>
              <span>Delegated Roles</span>
            </div>
          </div>
        </div>
      </section>

      {/* Tabs */}
      <div className="vp-profile-tabs">
        <button
          type="button"
          className={activeTab === "overview" ? "active" : ""}
          onClick={() => setActiveTab("overview")}
        >
          <UserCircle2 size={16} />
          Overview
        </button>

        <button
          type="button"
          className={activeTab === "roles" ? "active" : ""}
          onClick={() => setActiveTab("roles")}
        >
          <Shield size={16} />
          Roles & Permissions
        </button>

        <button
          type="button"
          className={activeTab === "navigation" ? "active" : ""}
          onClick={() => setActiveTab("navigation")}
        >
          <Grid2x2 size={16} />
          Navigation Access
        </button>

        <button
          type="button"
          className={activeTab === "activity" ? "active" : ""}
          onClick={() => setActiveTab("activity")}
        >
          <Clock3 size={16} />
          Activity
        </button>
      </div>

      {/* Overview */}
      {activeTab === "overview" && (
        <div className="vp-profile-grid">
          <div className="vp-card vp-card-large">
            <div className="vp-card-title">
              <Building2 size={18} />
              <h3>Organization Details</h3>
            </div>

            <div className="vp-details-table">
              <div className="vp-detail-row">
                <span>Institution</span>
                <strong>{text(user?.institution?.name)}</strong>
              </div>
              <div className="vp-detail-row">
                <span>Institution Code</span>
                <strong>{text(user?.institution?.code)}</strong>
              </div>
              <div className="vp-detail-row">
                <span>Department</span>
                <strong>{text(user?.department?.name)}</strong>
              </div>
              <div className="vp-detail-row">
                <span>Department Code</span>
                <strong>{text(user?.department?.code)}</strong>
              </div>
              <div className="vp-detail-row">
                <span>User ID</span>
                <strong>{text(user?.id)}</strong>
              </div>
              <div className="vp-detail-row">
                <span>Institution ID</span>
                <strong>{text(user?.institution_id)}</strong>
              </div>
              <div className="vp-detail-row">
                <span>Department ID</span>
                <strong>{text(user?.department_id)}</strong>
              </div>
            </div>
          </div>

          <div className="vp-card">
            <div className="vp-card-title">
              <Shield size={18} />
              <h3>Primary Role</h3>
            </div>

            <div className="vp-details-table">
              <div className="vp-detail-row">
                <span>Role Name</span>
                <strong>{text(primaryRole?.name)}</strong>
              </div>
              <div className="vp-detail-row">
                <span>Role Code</span>
                <strong>{text(primaryRole?.code)}</strong>
              </div>
              <div className="vp-detail-row">
                <span>Effective From</span>
                <strong>{text(pivot?.effective_from)}</strong>
              </div>
              <div className="vp-detail-row">
                <span>Effective To</span>
                <strong>{text(pivot?.effective_to || "Ongoing")}</strong>
              </div>
              <div className="vp-detail-row">
                <span>Status</span>
                <strong>
                  <span className="vp-profile-badge active">
                    <CheckCircle2 size={14} />
                    {text(pivot?.status || "active")}
                  </span>
                </strong>
              </div>
            </div>
          </div>

          <div className="vp-card vp-card-large">
            <div className="vp-card-header-inline">
              <div className="vp-card-title">
                <KeyRound size={18} />
                <h3>Permissions ({permissionCount})</h3>
              </div>

              <input
                type="text"
                className="form-control vp-permission-search"
                placeholder="Search permissions..."
                value={permissionSearch}
                onChange={(e) => setPermissionSearch(e.target.value)}
              />
            </div>

            <div className="vp-chip-list">
              {filteredPermissions.length ? (
                filteredPermissions.map((permission) => (
                  <span className="vp-chip" key={permission}>
                    <KeyRound size={13} />
                    {prettifyPermission(permission)}
                  </span>
                ))
              ) : (
                <p className="text-muted mb-0">No permissions match your search.</p>
              )}
            </div>
          </div>

          <div className="vp-card">
            <div className="vp-card-title">
              <Clock3 size={18} />
              <h3>Recent Activity</h3>
            </div>

            <div className="vp-activity-list">
              <div className="vp-activity-row">
                <CalendarDays size={16} />
                <div>
                  <strong>Last Login</strong>
                  <span>{formatDate(user?.last_login_at)}</span>
                </div>
              </div>

              <div className="vp-activity-row">
                <UserCircle2 size={16} />
                <div>
                  <strong>Account Type</strong>
                  <span>Ministry-level Administrator</span>
                </div>
              </div>

              <div className="vp-activity-row">
                <Shield size={16} />
                <div>
                  <strong>Delegated Roles</strong>
                  <span>
                    {delegatedRoleCount ? `${delegatedRoleCount} delegated role(s)` : "None"}
                  </span>
                  {!delegatedRoleCount && (
                    <small>This user has not delegated any roles.</small>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Roles & Permissions */}
      {activeTab === "roles" && (
        <div className="vp-profile-grid">
          <div className="vp-card vp-card-large">
            <div className="vp-card-title">
              <Shield size={18} />
              <h3>Assigned Roles</h3>
            </div>

            <div className="vp-role-list">
              {(user?.roles || []).map((role) => (
                <div key={role.code} className="vp-role-card">
                  <div>
                    <strong>{text(role.name)}</strong>
                    <span>{text(role.code)}</span>
                  </div>
                  <span className="vp-profile-badge active">
                    <CheckCircle2 size={14} />
                    {text(role?.pivot?.status || "active")}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="vp-card vp-card-large">
            <div className="vp-card-header-inline">
              <div className="vp-card-title">
                <KeyRound size={18} />
                <h3>Permissions ({permissionCount})</h3>
              </div>

              <input
                type="text"
                className="form-control vp-permission-search"
                placeholder="Search permissions..."
                value={permissionSearch}
                onChange={(e) => setPermissionSearch(e.target.value)}
              />
            </div>

            <div className="vp-chip-list">
              {filteredPermissions.map((permission) => (
                <span className="vp-chip" key={permission}>
                  <KeyRound size={13} />
                  {prettifyPermission(permission)}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Navigation */}
      {activeTab === "navigation" && (
        <div className="vp-profile-grid">
          <div className="vp-card vp-card-large">
            <div className="vp-card-title">
              <Grid2x2 size={18} />
              <h3>Navigation Access</h3>
            </div>

            <div className="vp-menu-list">
              {(user?.menu || []).map((item) => (
                <div className="vp-menu-item" key={item.key}>
                  <div>
                    <strong>{text(item.label)}</strong>
                    <span>{text(item.path || "Module group")}</span>
                  </div>

                  {Array.isArray(item.children) && item.children.length > 0 && (
                    <div className="vp-menu-children">
                      {item.children.map((child) => (
                        <span key={child.key} className="vp-chip small">
                          {child.label}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Activity */}
      {activeTab === "activity" && (
        <div className="vp-profile-grid">
          <div className="vp-card vp-card-large">
            <div className="vp-card-title">
              <Clock3 size={18} />
              <h3>Account Activity</h3>
            </div>

            <div className="vp-details-table">
              <div className="vp-detail-row">
                <span>Last Login</span>
                <strong>{formatDate(user?.last_login_at)}</strong>
              </div>
              <div className="vp-detail-row">
                <span>Primary Role</span>
                <strong>{text(primaryRole?.name)}</strong>
              </div>
              <div className="vp-detail-row">
                <span>Role Effective From</span>
                <strong>{text(pivot?.effective_from)}</strong>
              </div>
              <div className="vp-detail-row">
                <span>Role Status</span>
                <strong>{text(pivot?.status || "active")}</strong>
              </div>
              <div className="vp-detail-row">
                <span>Delegated Roles</span>
                <strong>{delegatedRoleCount}</strong>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}