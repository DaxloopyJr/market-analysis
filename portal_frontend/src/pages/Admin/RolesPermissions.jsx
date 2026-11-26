import {useErrorDialogState} from '../../utils/userFacingErrors.js';
/**
 * FILE: src/pages/Admin/RolesPermissions.jsx
 * ROUTE: Login -> ProtectedRoute -> DashboardLayout -> RouteAccess
 *     -> /dashboard/administration/roles-permissions -> RolesPermissions.jsx.
 * READ: Page -> src/API/roles.jsx -> src/API/axios.jsx (Bearer token)
 *     -> GET /api/v1/roles and GET /api/v1/permissions -> Laravel -> PostgreSQL.
 * WRITE: Add role -> POST /roles; Edit / status -> PUT /roles/{id}.
 * ACCESS: roles.manage (MOA) only. RouteAccess is presentation protection;
 *     Laravel must authorize every operation and enforce server-side policies.
 * RESPONSE: Display Laravel message and 422 validation errors via SweetAlert2.
 * UX: Grouped permission tree in Add / Edit / Details / Manage Permissions.
 * NOTE: No hardcoded roles, permissions, success responses or sample records.
 *     All API routes below are relative to src/API/axios.jsx's /api/v1 baseURL.
 */
import {MuHeader, MuKpi, MuTabs} from "../../components/modern/ModernUI.jsx";
import {AdmBar, AdmStatus} from "../../components/modern/AdminParts.jsx";
import {countText} from "../../utils/adminDisplay.js";
import {Building, Landmark, ListChecks, ShieldCheck as ShieldIcon} from "lucide-react";
import "../../styles/admin-modern.css";
import { TableLoader } from "../../components/common/LoadingState";
import { useCallback, useEffect, useMemo, useState } from "react";
import RowActionsMenu from "../../components/common/RowActionsMenu";
import { createPortal } from "react-dom";
import { useOutletContext } from "react-router-dom";
import {
  KeyRound,
  Eye,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  X,
  Power,
  Trash2,
} from "lucide-react";
import Swal from "../../utils/portalAlerts";
import {
  createRole,
  listPermissions,
  listRoles,
  updateRole,
} from "../../API/roles";
import {
  apiError,
  validationErrors,
} from "../../API/resourceHelpers";
import PermissionTree from "./PermissionTree";
import "./rolesPermissions.css";

const blankRole = {
  code: "",
  name: "",
  level: "ministry",
  description: "",
  permission_ids: [],
};

function isActive(role) {
  return role.is_active !== false && role.status !== "inactive";
}

function display(value) {
  return value === "" || value == null ? "—" : String(value);
}

function RoleDialog({ title, onClose, children, wide = false }) {
  useEffect(() => {
    function onEscape(event) {
      if (event.key === "Escape" && !document.querySelector(".swal2-container")) {
        onClose();
      }
    }
    document.addEventListener("keydown", onEscape);
    return () => document.removeEventListener("keydown", onEscape);
  }, [onClose]);

  return createPortal(
    <div
      className="vrp-backdrop"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
    >
      <section
        className={`vrp-dialog ${wide ? "vrp-dialog-wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header className="vrp-dialog-header">
          <h2>{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close dialog">
            <X size={18} />
          </button>
        </header>
        {children}
      </section>
    </div>,
    document.body
  );
}

function RoleDetails({ role, onClose, onEdit, onManage }) {
  const rolePermissions = Array.isArray(role.permissions) ? role.permissions : [];
  const assignedIds = rolePermissions.map((permission) => Number(permission.id));

  return (
    <div className="vrp-dialog-body">
      <div className="vrp-profile">
        <span className="vrp-profile-icon"><ShieldCheck size={24} /></span>
        <div>
          <h3>{display(role.name)}</h3>
          <p>{display(role.code)}</p>
        </div>
        <span className={`vrp-status ${isActive(role) ? "vrp-active" : "vrp-inactive"}`}>
          {isActive(role) ? "Active" : "Inactive"}
        </span>
      </div>
      <div className="vrp-detail-grid">
        <div><span>Role Code</span><strong>{display(role.code)}</strong></div>
        <div><span>Level</span><strong className="text-capitalize">{display(role.level)}</strong></div>
        <div><span>Type</span><strong>{role.is_system ? "System role" : "Custom role"}</strong></div>
        <div><span>Total Permissions</span><strong>{rolePermissions.length}</strong></div>
        <div className="vrp-full"><span>Description</span><strong>{display(role.description)}</strong></div>
      </div>
      <h4 className="vrp-section-title">Assigned Permissions by Module</h4>
      {rolePermissions.length ? (
        <PermissionTree
          permissions={rolePermissions}
          selectedIds={assignedIds}
          readOnly
        />
      ) : (
        <p className="vrp-empty">No permissions are assigned to this role.</p>
      )}
      <footer className="vrp-dialog-footer">
        <button type="button" className="btn btn-outline-secondary" onClick={onClose}>
          Close
        </button>
        <button type="button" className="btn btn-outline-primary" onClick={onManage}>
          <KeyRound size={15} /> Manage Permissions
        </button>
        <button type="button" className="btn btn-primary" onClick={onEdit}>
          <Pencil size={15} /> Edit Role
        </button>
      </footer>
    </div>
  );
}

/**
 * EDITOR: Permission IDs and module descriptions always come from GET /permissions.
 * Edit loads role.permissions from GET /roles; no fabricated grant IDs are allowed.
 */
function RoleEditor({ role, availablePermissions, onClose, onSaved }) {
  const editing = Boolean(role);
  const [form, setForm] = useState(() => ({
    ...blankRole,
    code: role?.code || "",
    name: role?.name || "",
    level: role?.level || "ministry",
    description: role?.description || "",
    permission_ids: (role?.permissions || [])
      .map((permission) => Number(permission.id))
      .filter(Number.isInteger),
  }));
  const [search, setSearch] = useState("");
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  function change(name, value) {
    setForm((previous) => ({ ...previous, [name]: value }));
    setErrors((previous) => ({ ...previous, [name]: undefined }));
  }

  async function save(event) {
    event.preventDefault();
    const nextErrors = {};
    if (!editing && !form.code.trim()) nextErrors.code = "Role code is required.";
    if (!form.name.trim()) nextErrors.name = "Role name is required.";
    if (!editing && !["ministry", "institution"].includes(form.level)) {
      nextErrors.level = "Select a valid role level.";
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    const confirmation = await Swal.fire({
      title: editing ? "Update role and permissions?" : "Create new role?",
      text: "The role and its selected permissions will be saved.",
      icon: "question",
      showCancelButton: true,
      confirmButtonText: editing ? "Update Role" : "Save Role",
    });
    if (!confirmation.isConfirmed) return;

    setSaving(true);
    try {
      // VERIFIED contract: only the documented POST/PUT fields are submitted.
      const payload = editing
        ? {
            name: form.name.trim(),
            description: form.description.trim(),
            permission_ids: form.permission_ids,
          }
        : {
            code: form.code.trim().toUpperCase(),
            name: form.name.trim(),
            level: form.level,
            permission_ids: form.permission_ids,
          };
      const result = editing
        ? await updateRole(role.id, payload)
        : await createRole(payload);
      onClose();
      await onSaved();
      await Swal.fire({
        icon: "success",
        title: editing ? "Role updated" : "Role created",
        text: result.message || "Saved successfully.",
      });
    } catch (error) {
      setErrors({});
      await Swal.fire({ icon: "error", title: "Request failed", text: apiError(error) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="vrp-editor">
      <div className="vrp-dialog-body">
        <div className="vrp-form-grid">
          <label>
            <span>Role Code {!editing && <b>*</b>}</span>
            <input
              className={`form-control ${errors.code ? "is-invalid" : ""}`}
              value={form.code}
              onChange={(event) => change("code", event.target.value)}
              disabled={editing}
              maxLength={30}
              required={!editing}
              placeholder="e.g. AUD"
            />
            {errors.code && <small className="text-danger">{errors.code}</small>}
          </label>
          <label>
            <span>Role Name <b>*</b></span>
            <input
              className={`form-control ${errors.name ? "is-invalid" : ""}`}
              value={form.name}
              onChange={(event) => change("name", event.target.value)}
              required
              placeholder="e.g. Auditor"
            />
            {errors.name && <small className="text-danger">{errors.name}</small>}
          </label>
          <label>
            <span>Role Level {!editing && <b>*</b>}</span>
            <select
              className="form-select"
              value={form.level}
              onChange={(event) => change("level", event.target.value)}
              disabled={editing}
            >
              <option value="ministry">Ministry</option>
              <option value="institution">Institution</option>
            </select>
          </label>
          {editing && (
            <label className="vrp-full">
              <span>Description</span>
              <textarea
                className="form-control"
                rows={2}
                value={form.description}
                onChange={(event) => change("description", event.target.value)}
                placeholder="Role description"
              />
              {errors.description && <small className="text-danger">{errors.description}</small>}
            </label>
          )}
        </div>
        <div className="vrp-permissions-head">
          <div>
            <h3>Role Permissions</h3>
            <p>Permissions are grouped by module.</p>
          </div>
          <span className="vrp-selected-count">{form.permission_ids.length} selected</span>
        </div>
        <label className="vrp-search-box">
          <Search size={16} />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search permissions by name, code or module..."
          />
        </label>
        {errors.permission_ids && (
          <p className="text-danger small mt-2">{errors.permission_ids}</p>
        )}
        <p className="vrp-tree-hint">
          Select a module to select all visible permissions in that group.
          Expand the module to choose individual permissions.
        </p>
        <PermissionTree
          permissions={availablePermissions}
          selectedIds={form.permission_ids}
          onChange={(permissionIds) => change("permission_ids", permissionIds)}
          search={search}
        />
      </div>
      <footer className="vrp-dialog-footer">
        <button className="btn btn-outline-secondary" type="button" onClick={onClose} disabled={saving}>
          Cancel
        </button>
        <button className="btn btn-primary" type="submit" disabled={saving}>
          {saving ? "Saving..." : editing ? "Update Role" : "Save Role"}
        </button>
      </footer>
    </form>
  );
}

/**
 * DELETE ROLE MODAL — design reference only, not a backend mutation.
 * The official API contract has NO DELETE /roles/{id} endpoint.
 * We cannot offer a functioning destructive action until Laravel supports it.
 */
function DeleteRoleNotice({ role, onClose }) {
  return (
    <div className="vrp-dialog-body">
      <div className="alert alert-danger" role="alert">
        Role deletion is currently unavailable.
      </div>
      <div className="vrp-detail-grid">
        <div><span>Role Name</span><strong>{display(role.name)}</strong></div>
        <div><span>Role Code</span><strong>{display(role.code)}</strong></div>
        <div><span>Status</span><strong>{isActive(role) ? "Active" : "Inactive"}</strong></div>
        <div>
          <span>Assigned Permissions</span>
          <strong>{Array.isArray(role.permissions) ? role.permissions.length : "—"}</strong>
        </div>
      </div>
      <p className="vrp-tree-hint mt-3">
        You may deactivate a custom role using the status action in the table.
        Use Deactivate to prevent new assignments to this role.
      </p>
      <footer className="vrp-dialog-footer">
        <button type="button" className="btn btn-outline-secondary" onClick={onClose}>
          Close
        </button>
        <button type="button" className="btn btn-danger" disabled title="Role deletion unavailable">
          <Trash2 size={15} /> Delete Role
        </button>
      </footer>
    </div>
  );
}

/**
 * Same grouped tree as Add/Edit, dedicated to editing ONLY permission_ids.
 * FLOW: GET /roles + GET /permissions -> Manage Permissions modal
 * -> PUT /roles/{id} -> Laravel role/permission pivot update.
 */
function RolePermissionManager({ role, availablePermissions, onClose, onSaved }) {
  const [permissionIds, setPermissionIds] = useState(() => (
    (role.permissions || []).map((permission) => Number(permission.id))
  ));
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);

  async function save(event) {
    event.preventDefault();
    const confirmation = await Swal.fire({
      title: "Save permissions?",
      text: `Update permissions for ${role.name}?`,
      icon: "question",
      showCancelButton: true,
      confirmButtonText: "Save Permissions",
    });
    if (!confirmation.isConfirmed) return;

    setSaving(true);
    try {
      const response = await updateRole(role.id, { permission_ids: permissionIds });
      await onSaved();
      onClose();
      await Swal.fire({
        icon: "success",
        title: "Permissions updated",
        text: response.message || "Permissions were saved successfully.",
      });
    } catch (error) {
      await Swal.fire({
        icon: "error",
        title: "Could not save permissions",
        text: apiError(error),
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="vrp-editor" onSubmit={save}>
      <div className="vrp-dialog-body">
        <div className="vrp-manager-role">
          <ShieldCheck size={18} />
          <div>
            <strong>{display(role.name)}</strong>
            <span>{display(role.code)} · {permissionIds.length} selected</span>
          </div>
        </div>
        <label className="vrp-search-box">
          <Search size={16} />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search permissions by name, code or module..."
          />
        </label>
        <p className="vrp-tree-hint">
          Check a module to select its visible permissions, or expand it to select one by one.
        </p>
        <PermissionTree
          permissions={availablePermissions}
          selectedIds={permissionIds}
          onChange={setPermissionIds}
          search={search}
        />
      </div>
      <footer className="vrp-dialog-footer">
        <button type="button" className="btn btn-outline-secondary" onClick={onClose} disabled={saving}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? "Saving..." : "Save Permissions"}
        </button>
      </footer>
    </form>
  );
}

/**
 * No extra API paths: `/roles` and `/permissions` only, and PUT to toggle
 * custom-role status. Backend is authoritative about `is_system` and 403s.
 */
export default function RolesPermissions() {
  const { user } = useOutletContext();
  const canManage = user?.permissions?.includes("roles.manage") === true;
  const [roles, setRoles] = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [rolesError, setRolesError] = useErrorDialogState("");
  const [permissionsError, setPermissionsError] = useErrorDialogState("");
  const [search, setSearch] = useState("");
  const [levelFilter, setLevelFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [modal, setModal] = useState(null);
  const [busyRoleId, setBusyRoleId] = useState(null);

  const refresh = useCallback(async () => {
    if (!canManage) return;
    setLoading(true);
    const results = await Promise.allSettled([listRoles(), listPermissions()]);
    if (results[0].status === "fulfilled") {
      setRoles(results[0].value.items);
      setRolesError("");
    } else {
      setRolesError(apiError(results[0].reason));
    }
    if (results[1].status === "fulfilled") {
      setPermissions(results[1].value.items);
      setPermissionsError("");
    } else {
      setPermissionsError(apiError(results[1].reason));
      setPermissions([]);
    }
    setLoading(false);
  }, [canManage]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const filteredRoles = useMemo(() => roles.filter((role) => {
    const matchingSearch = `${role.name || ""} ${role.code || ""} ${role.level || ""}`
      .toLowerCase()
      .includes(search.trim().toLowerCase());
    const matchingLevel = levelFilter === "all" || role.level === levelFilter;
    const matchingStatus = statusFilter === "all"
      || (statusFilter === "active" ? isActive(role) : !isActive(role));
    return matchingSearch && matchingLevel && matchingStatus;
  }), [roles, search, levelFilter, statusFilter]);
  const levelCount = (level) => roles.filter((role) => String(role.level || "").toLowerCase() === level).length;
  const maxPermissions = Math.max(1, ...roles.map((role) => Array.isArray(role.permissions) ? role.permissions.length : 0));

  function showEditor(role = null) {
    if (permissionsError || permissions.length === 0) {
      Swal.fire({
        icon: "warning",
        title: "Permissions unavailable",
        text: permissionsError || "The system has not returned permissions. Refresh to try again.",
      });
      return;
    }
    if (role && !Array.isArray(role.permissions)) {
      Swal.fire({
        icon: "warning",
        title: "Role permissions unavailable",
        text: "The system did not return the role permissions; editing could unintentionally replace them.",
      });
      return;
    }
    setModal({ kind: "edit", role });
  }

  function showPermissionManager(role) {
    if (permissionsError || !permissions.length) {
      Swal.fire({
        icon: "warning",
        title: "Permissions unavailable",
        text: permissionsError || "The system has not returned the permission definitions.",
      });
      return;
    }
    if (!Array.isArray(role.permissions)) {
      Swal.fire({
        icon: "warning",
        title: "Assigned permissions unavailable",
        text: "The system did not return this role's permissions; updating would risk replacing grants.",
      });
      return;
    }
    setModal({ kind: "permissions", role });
  }

  async function toggleActive(role) {
    if (role.is_system && isActive(role)) {
      await Swal.fire({
        icon: "warning",
        title: "System role protected",
        text: "System roles cannot be deactivated.",
      });
      return;
    }
    const activate = !isActive(role);
    const confirmed = await Swal.fire({
      title: activate ? "Activate this role?" : "Deactivate this role?",
      text: `${role.name} (${role.code})`,
      icon: activate ? "question" : "warning",
      showCancelButton: true,
      confirmButtonText: activate ? "Activate" : "Deactivate",
      confirmButtonColor: activate ? "#146bd3" : "#d23c48",
    });
    if (!confirmed.isConfirmed) return;

    setBusyRoleId(role.id);
    try {
      const result = await updateRole(role.id, {
        is_active: activate,
        status: activate ? "active" : "inactive",
      });
      await refresh();
      await Swal.fire({
        icon: "success",
        title: activate ? "Role activated" : "Role deactivated",
        text: result.message || "Status updated.",
      });
    } catch (error) {
      await Swal.fire({ icon: "error", title: "Request failed", text: apiError(error) });
    } finally {
      setBusyRoleId(null);
    }
  }

  if (!canManage) {
    return (
      <div className="alert alert-danger" role="alert">
        You do not have permission to manage roles and permissions.
      </div>
    );
  }

  return (
    <div className="vrp-page adm-modern container-fluid px-0">
      <MuHeader initials="🔑" title="Roles & Permissions" subtitle="Role definitions and their access to VIWANDA Portal modules">
        <button type="button" className="mu-btn mu-btn-primary vrp-add" onClick={() => showEditor()}><Plus size={17} /> Add Role</button>
      </MuHeader>
      <div className="mu-kpis">
        <MuKpi tone="blue" icon={<ShieldIcon size={18}/>} title="Roles" value={countText(roles.length, "role", loading)} note="configured" arrow={false} onOpen={() => setLevelFilter("all")}/>
        <MuKpi tone="green" icon={<Landmark size={18}/>} title="Ministry level" value={countText(levelCount("ministry"), "role", loading)} note="MOA, MDO, MDD…" arrow={false} onOpen={() => setLevelFilter("ministry")}/>
        <MuKpi tone="indigo" icon={<Building size={18}/>} title="Institution level" value={countText(levelCount("institution"), "role", loading)} note="IA, IDO, IHOD…" arrow={false} onOpen={() => setLevelFilter("institution")}/>
        <MuKpi tone="amber" icon={<ListChecks size={18}/>} title="Permissions" value={countText(permissions.length, "permission", loading)} note="available to assign" arrow={false}/>
      </div>

      <section className="vrp-panel adm-card">
        <header className="adm-card-head"><span className="adm-dot" aria-hidden="true"/><h2>Role catalogue</h2><span className="mu-count">{loading ? "…" : filteredRoles.length}</span></header>
        <div className="vrp-filters adm-toolbar">
          <MuTabs label="Level filter" value={levelFilter} onChange={setLevelFilter} items={[{ key: "all", label: "All", count: roles.length }, { key: "ministry", label: "Ministry", count: levelCount("ministry") }, { key: "institution", label: "Institution", count: levelCount("institution") }]}/>
          <label className="vrp-search-box mu-search">
            <Search size={16} />
            <input
              type="search"
              placeholder="Search role name or code..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <label>
            <span className="visually-hidden">Status filter</span>
            <select className="form-select" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </label>
          <button type="button" className="mu-btn" title="Refresh" aria-label="Refresh roles" onClick={refresh} disabled={loading}>
            <RefreshCw size={15} />
          </button>
        </div>
        
        
        <div className="vrp-table-wrap">
          <table className="table table-hover vrp-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Role Name</th>
                <th>Code</th>
                <th>Level</th>
                <th>Type</th>
                <th>Permissions</th>
                <th>Status</th>
                <th aria-label="Actions"/>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="vrp-empty-row">Loading roles...</td></tr>
              ) : filteredRoles.length === 0 ? (
                <tr>
                  <td colSpan={8} className="vrp-empty-row">
                    {rolesError ? "Could not load roles." : "No roles found."}
                  </td>
                </tr>
              ) : filteredRoles.map((role, index) => (
                <tr key={role.id}>
                  <td>{index + 1}</td>
                  <td><strong>{display(role.name)}</strong></td>
                  <td><span className="adm-code">{display(role.code)}</span></td>
                  <td className="text-capitalize">{display(role.level)}</td>
                  <td>
                    <span className={`vrp-kind ${role.is_system ? "vrp-system" : ""}`}>
                      {role.is_system ? "System" : "Custom"}
                    </span>
                  </td>
                  <td>{Array.isArray(role.permissions) ? <AdmBar value={role.permissions.length} max={Math.max(permissions.length, maxPermissions)} color="#1eb53a"/> : "—"}</td>
                  <td><AdmStatus status={isActive(role) ? "active" : "inactive"}/></td>
                  <td className="mu-actions">
                    <RowActionsMenu label="Row actions">
                      <button type="button" title="View role" aria-label={`View ${role.name}`} onClick={() => setModal({ kind: "view", role })}>
                        <Eye size={16} />
                      </button>
                      <button type="button" title="Edit role" aria-label={`Edit ${role.name}`} onClick={() => showEditor(role)}>
                        <Pencil size={16} />
                      </button>
                      <button
                        type="button"
                        title="Manage permissions"
                        aria-label={`Manage permissions for ${role.name}`}
                        onClick={() => showPermissionManager(role)}
                      >
                        <KeyRound size={16} />
                      </button>
                      <button
                        type="button"
                        title="Delete role (coming soon)"
                        aria-label={`Delete ${role.name}`}
                        onClick={() => setModal({ kind: "delete", role })}
                        className="vrp-danger-button"
                      >
                        <Trash2 size={16} />
                      </button>
                      <button
                        type="button"
                        title={role.is_system && isActive(role) ? "System roles cannot be deactivated" : isActive(role) ? "Deactivate" : "Activate"}
                        aria-label={`${isActive(role) ? "Deactivate" : "Activate"} ${role.name}`}
                        disabled={busyRoleId === role.id || (role.is_system && isActive(role))}
                        onClick={() => toggleActive(role)}
                        className={isActive(role) ? "vrp-danger-button" : "vrp-success-button"}
                      >
                        <Power size={16} />
                      </button>
                    </RowActionsMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table><TableLoader active={loading} />
        </div>
        <div className="vrp-table-footer">
          Showing {filteredRoles.length} of {roles.length} roles
          
        </div>
      </section>

      {modal?.kind === "view" && (
        <RoleDialog title="Role Details" onClose={() => setModal(null)} wide>
          <RoleDetails
            role={modal.role}
            onClose={() => setModal(null)}
            onEdit={() => showEditor(modal.role)}
            onManage={() => showPermissionManager(modal.role)}
          />
        </RoleDialog>
      )}
      {modal?.kind === "delete" && (
        <RoleDialog title="Delete Role" onClose={() => setModal(null)}>
          <DeleteRoleNotice role={modal.role} onClose={() => setModal(null)} />
        </RoleDialog>
      )}
      {modal?.kind === "permissions" && (
        <RoleDialog
          title="Manage Permissions"
          onClose={() => setModal(null)}
        >
          <RolePermissionManager
            role={modal.role}
            availablePermissions={permissions}
            onClose={() => setModal(null)}
            onSaved={refresh}
          />
        </RoleDialog>
      )}
      {modal?.kind === "edit" && (
        <RoleDialog
          title={modal.role ? "Edit Role & Permissions" : "Add New Role"}
          onClose={() => setModal(null)}
          wide
        >
          <RoleEditor
            role={modal.role}
            availablePermissions={permissions}
            onClose={() => setModal(null)}
            onSaved={refresh}
          />
        </RoleDialog>
      )}
    </div>
  );
}
