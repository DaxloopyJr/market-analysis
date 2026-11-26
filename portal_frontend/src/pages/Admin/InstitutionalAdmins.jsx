import {useErrorDialogState} from '../../utils/userFacingErrors.js';
/**
 * FILE PATH: src/pages/Admin/InstitutionalAdmins.jsx
 * PAGE ROUTE: /dashboard/administration/institution-admins
 * NAVIGATION: Login -> ProtectedRoute -> DashboardLayout -> RouteAccess -> InstitutionalAdmins.
 * API FLOW: InstitutionalAdmins.jsx -> API/institutionAdmins.jsx -> API/users.jsx
 *   -> API/axios.jsx -> GET /users?role=IA; POST /users; PUT /users/{id};
 *      POST /users/{id}/unlock and /send-reset-link -> PostgreSQL.
 * OPTIONS: MOA GET /institutions, GET /roles (filter for code IA; use backend ID).
 * PERMISSIONS: users.manage.ministry (MOA), users.manage.institution (IA scoped).
 * DATA: List responses only. Assign an existing user via documented PUT
 *   role_ids; create a new one via POST. No invented assignment dates or DELETE.
 *   IA role dropdown cannot be fetched by non-MOA yet.
 * CUSTOMIZE: Table header/row markup below; existing table/dialog CSS from
 *   institutions.css and unique styling in institutionalAdmins.css.
 */
import { TableLoader } from "../../components/common/LoadingState";
import { useCallback, useEffect, useMemo, useState } from "react";
import RowActionsMenu from "../../components/common/RowActionsMenu";
import { createPortal } from "react-dom";
import { useOutletContext } from "react-router-dom";
import Swal from "../../utils/portalAlerts";
import {
  AlertTriangle, Building2, ChevronLeft, ChevronRight, Eye, KeyRound, LockKeyhole,
  Pencil, Plus, Power, RotateCcw, Search, ShieldCheck, UserRoundCog, X,
} from "lucide-react";
import {
  listInstitutionalAdmins, createInstitutionalAdmin, updateInstitutionalAdmin,
  setInstitutionalAdminActive, unlockInstitutionalAdmin, sendInstitutionalAdminResetLink,
} from "../../API/institutionAdmins";
import { listInstitutions } from "../../API/institution";
import { listUsers } from "../../API/users";
import { listRoles } from "../../API/roles";
import { apiError, validationErrors } from "../../API/resourceHelpers";
import "./institutions.css";
import "./institutionalAdmins.css";
import PageSizeSelect from '../../components/common/PageSizeSelect.jsx';
import {MuHeader, MuKpi, MuTabs} from "../../components/modern/ModernUI.jsx";
import {AdmOrg, AdmPerson, AdmStatus, AdmWhen} from "../../components/modern/AdminParts.jsx";
import {countText} from "../../utils/adminDisplay.js";
import {institutionLogoUrl} from "../../utils/institutionLogo.js";
import {useDebouncedValue} from "../../hooks/useDebouncedValue.js";
import {CheckCircle2, UserX} from "lucide-react";
import "../../styles/admin-modern.css";
import {usePageSize} from '../../components/common/usePageSize.js';
import {fetchUiPage} from '../../utils/pagedFetch.js';

const present = (value) => value == null || value === "" ? "—" : String(value);
const isActive = (row) => row.is_active === true || (row.is_active == null && row.status === "active");
const dateText = (value) => value ? String(value).replace("T", " ").slice(0, 16) : "—";
const hasRoleIA = (row) => (
  Array.isArray(row.roles) && row.roles.some((role) => String(role.code || "").toUpperCase() === "IA")
) || String(row.role?.code ?? row.role ?? "").toUpperCase() === "IA";

function AdminDialog({ title, children, onClose }) {
  useEffect(() => {
    const keyHandler = (event) => {
      if (event.key === "Escape" && !document.querySelector(".swal2-container")) onClose();
    };
    document.addEventListener("keydown", keyHandler);
    return () => document.removeEventListener("keydown", keyHandler);
  }, [onClose]);
  return createPortal(
    <div className="vim-dialog-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section role="dialog" aria-modal="true" aria-label={title} className="vim-dialog vim-dialog-wide vim-ia-modal">
        <header className="vim-dialog-header"><h2>{title}</h2>
          <button className="vim-icon-button" type="button" aria-label="Close" onClick={onClose}><X size={18} /></button>
        </header>
        {children}
      </section>
    </div>, document.body
  );
}

function AdminDetails({ record, onClose, onEdit }) {
  const details = [
    ["Full Name", record.name], ["Email", record.email], ["Phone Number", record.phone],
    ["Institution", record.institution?.name ?? record.institution_name],
    ["Institution Type", record.institution?.type], ["Role", "Institutional Admin (IA)"],
    ["Status", isActive(record) ? "Active" : "Inactive"],
    ["Date Assigned", dateText(record.assigned_at)],
    ["Last Updated", dateText(record.updated_at)],
  ];
  const additional = [
    ["Username", record.username], ["Employee ID", record.employee_id],
    ["Department", record.department?.name], ["Job Title", record.job_title],
    ["Last Login", dateText(record.last_login_at)],
    ["Account Locked Until", dateText(record.locked_until)],
  ];
  const renderItems = (list) => list.map(([label, value]) => (
    <div className="vim-ia-detail-line" key={label}><span>{label}</span><strong>{present(value)}</strong></div>
  ));
  return <div className="vim-ia-reference-details">
    <div className="vim-ia-detail-list">{renderItems(details)}</div>
    <h3><ShieldCheck size={16}/> Additional Information</h3>
    <div className="vim-ia-detail-extra">{renderItems(additional)}</div>
    <footer className="vim-dialog-footer">
      <button type="button" className="btn btn-outline-secondary" onClick={onClose}>Close</button>
      <button type="button" className="btn btn-primary" onClick={onEdit}><Pencil size={15}/> Edit Admin</button>
    </footer>
  </div>;
}

function AdminField({ title, name, value, errors, change, required = false, type = "text", disabled = false }) {
  return <label className="vim-field"><span>{title}{required && <b> *</b>}</span>
    <input className={`form-control ${errors[name] ? "is-invalid" : ""}`} type={type}
      value={value || ""} disabled={disabled} required={required}
      onChange={(event) => change(name, event.target.value)} />
    {errors[name] && <small className="invalid-feedback d-block">{errors[name]}</small>}
  </label>;
}

/**
 * Approved reference: Assign / Edit / Details / Change Status modals.
 * Existing user assignment is PUT /users/{id} with role_ids (documented).
 * New user creation remains POST /users with activation email. Assignment
 * start/end dates and ad-hoc notification email have no backend contract and
 * are rendered disabled rather than pretending that they were saved.
 */
function AdminForm({ initial, currentUser, institutions, institutionsError, iaRole, roleError, onClose, onSaved }) {
  const editing = Boolean(initial?.id);
  const isMinistry = currentUser?.permissions?.includes("users.manage.ministry") === true;
  const ownInstitutionId = currentUser?.institution?.id ?? "";
  const [mode, setMode] = useState("existing");
  const [form, setForm] = useState({
    name: initial?.name ?? "", phone: initial?.phone ?? "",
    username: initial?.username ?? "", email: initial?.email ?? "",
    institution_id: initial?.institution_id ?? initial?.institution?.id ?? (!isMinistry ? ownInstitutionId : ""),
    is_active: initial ? isActive(initial) : true,
  });
  const [selectedUserId, setSelectedUserId] = useState("");
  const [candidates, setCandidates] = useState([]);
  const [queryText, setQueryText] = useState("");
  const [query, setQuery] = useState("");
  const [candidateLoading, setCandidateLoading] = useState(false);
  const [candidateError, setCandidateError] = useErrorDialogState("");
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  const candidate = candidates.find((row) => String(row.id) === String(selectedUserId));
  const cannotCreate = !editing && !iaRole?.id;
  const cannotChooseInstitution = !editing && isMinistry && Boolean(institutionsError);
  const change = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: "" }));
  };

  useEffect(() => {
    if (editing || mode !== "existing") return;
    let alive = true;
    setCandidateLoading(true);
    setCandidateError("");
    listUsers({ page: 1, search: query || undefined })
      .then((result) => { if (alive) setCandidates(result.items.filter((row) => !hasRoleIA(row) && !row.department_id && !row.department?.id)); })
      .catch((error) => { if (alive) { setCandidates([]); setCandidateError(apiError(error)); } })
      .finally(() => { if (alive) setCandidateLoading(false); });
    return () => { alive = false; };
  }, [editing, mode, query]);

  async function submit(event) {
    event.preventDefault();
    const nextErrors = {};
    if (!form.institution_id) nextErrors.institution_id = "Choose an institution.";
    if (editing && !String(form.name).trim()) nextErrors.name = "Name is required.";
    if (!editing && mode === "existing" && !selectedUserId) nextErrors.user_id = "Choose an existing user.";
    if (!editing && mode === "new") {
      if (!String(form.name).trim()) nextErrors.name = "Name is required.";
      if (!String(form.email).trim()) nextErrors.email = "Email is required.";
      if (!String(form.username).trim()) nextErrors.username = "Username is required.";
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length || cannotCreate || cannotChooseInstitution) return;
    if (editing && !isMinistry && String(form.institution_id) !== String(ownInstitutionId)) {
      await Swal.fire({ icon: "error", title: "Access denied", text: "You can only manage your own institution." });
      return;
    }
    // Preserve all existing role IDs when granting IA (never overwrite roles with just IA).
    let previousRoleIds = [];
    if (!editing && mode === "existing") {
      if (!candidate) return;
      const roles = Array.isArray(candidate.roles) ? candidate.roles : [];
      previousRoleIds = roles.map((role) => Number(role.id)).filter((id) => Number.isInteger(id) && id > 0);
      if (roles.length && previousRoleIds.length !== roles.length) {
        await Swal.fire({ icon: "error", title: "Role IDs not available",
          text: "This user's current roles could not be read, so the role cannot be changed safely now." });
        return;
      }
    }
    const answer = await Swal.fire({
      icon: "question", title: editing ? "Update institutional admin?" : "Assign Institutional Admin?",
      text: editing ? "Save changes to this administrator?" : mode === "existing"
        ? "The selected user will receive the IA role. Existing roles will be preserved."
        : "The new user will receive an activation invitation.",
      showCancelButton: true, confirmButtonText: editing ? "Update" : "Assign Admin",
    });
    if (!answer.isConfirmed) return;
    setBusy(true);
    try {
      let result;
      if (editing) {
        result = await updateInstitutionalAdmin(initial.id, {
          name: form.name.trim(), phone: form.phone.trim() || null,
          ...(isMinistry && form.institution_id ? { institution_id: Number(form.institution_id) } : {}),
          is_active: Boolean(form.is_active), status: form.is_active ? "active" : "inactive",
        });
      } else if (mode === "existing") {
        result = await updateInstitutionalAdmin(candidate.id, {
          institution_id: Number(form.institution_id),
          role_ids: [...new Set([...previousRoleIds, Number(iaRole.id)])],
        });
      } else {
        result = await createInstitutionalAdmin({ ...form, institution_id: form.institution_id }, iaRole.id);
      }
      onClose(); onSaved();
      await Swal.fire({ icon: "success", title: editing ? "Admin updated" : "Institutional Admin assigned",
        text: result.message || "Saved successfully." });
    } catch (error) {
      setErrors({});
      await Swal.fire({ icon: "error", title: "Request failed", text: apiError(error) });
    } finally { setBusy(false); }
  }

  const selection = <label className="vim-field"><span>Institution <b>*</b></span>
    {isMinistry ? <select className="form-select" value={form.institution_id ?? ""}
      disabled={Boolean(institutionsError)} onChange={(event) => change("institution_id", event.target.value)}>
      <option value="">Select institution...</option>
      {institutions.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
      {editing && form.institution_id && !institutions.some((row) => String(row.id) === String(form.institution_id)) &&
        <option value={form.institution_id}>{initial?.institution?.name || "Current institution"}</option>}
    </select> : <input className="form-control" readOnly value={currentUser?.institution?.name || initial?.institution?.name || "Own institution"} />}
    {errors.institution_id && <small className="text-danger">{errors.institution_id}</small>}
    
  </label>;

  return <form onSubmit={submit} className="vim-ia-reference-form">
    <div className="vim-ia-reference-fields">
      {!editing && <div className="vim-ia-mode-tabs" role="group" aria-label="Assignment method">
        <button type="button" className={mode === "existing" ? "active" : ""} onClick={() => setMode("existing")}>Existing User</button>
        <button type="button" className={mode === "new" ? "active" : ""} onClick={() => setMode("new")}>Create New User</button>
      </div>}
      {selection}
      {editing ? <>
        <label className="vim-field"><span>User <b>*</b></span>
          <input className="form-control" readOnly value={`${initial.name} (${initial.email})`} />
        </label>
      </> : mode === "existing" ? <>
        <label className="vim-field"><span>User <b>*</b></span>
          <select className="form-select" value={selectedUserId} disabled={candidateLoading}
            onChange={(event) => setSelectedUserId(event.target.value)}>
            <option value="">{candidateLoading ? "Loading users..." : "Select user..."}</option>
            {candidates.map((row) => <option key={row.id} value={row.id}>{row.name} ({row.email})</option>)}
          </select>
          {errors.user_id && <small className="text-danger">{errors.user_id}</small>}
        </label>
        <div className="vim-ia-candidate-search">
          <Search size={15}/><input aria-label="Search existing users" placeholder="Search existing users..." value={queryText}
            onChange={(event) => setQueryText(event.target.value)} />
          <button type="button" onClick={() => { setSelectedUserId(""); setQuery(queryText.trim()); }}>Search</button>
        </div>
        
        <small className="vim-ia-helper">Only the first page of matching users is shown. Search to find another user.</small>
      </> : <div className="vim-ia-new-user-fields">
        <AdminField title="Full Name" name="name" required value={form.name} errors={errors} change={change}/>
        <AdminField title="Email Address" name="email" type="email" required value={form.email} errors={errors} change={change}/>
        <AdminField title="Username" name="username" required value={form.username} errors={errors} change={change}/>
        <AdminField title="Phone Number" name="phone" value={form.phone} errors={errors} change={change}/>
      </div>}
      <label className="vim-field"><span>Role <b>*</b></span>
        <select className="form-select" value="IA" disabled><option value="IA">Institutional Admin (IA)</option></select>
        
      </label>
      <div className="vim-ia-reference-dates">
        <label className="vim-field"><span>Start Date <b>*</b></span><input type="date" className="form-control" disabled aria-label="Start Date (coming soon)" /></label>
        <label className="vim-field"><span>End Date (Optional)</span><input type="date" className="form-control" disabled aria-label="End Date (coming soon)" /></label>
      </div>
      {editing && <>
        <div className="vim-field vim-ia-status-control"><span>Status <b>*</b></span>
          <span className="vim-ia-radio-row">
            <label><input type="radio" name="ia-status" checked={form.is_active} onChange={() => change("is_active", true)}/> Active</label>
            <label><input type="radio" name="ia-status" checked={!form.is_active} onChange={() => change("is_active", false)}/> Inactive</label>
          </span>
        </div>
        <div className="vim-ia-profile-compact">
          <AdminField title="Full Name" name="name" required value={form.name} errors={errors} change={change}/>
          <AdminField title="Phone Number" name="phone" value={form.phone} errors={errors} change={change}/>
        </div>
      </>}
      <label className="vim-ia-checkline"><input type="checkbox" checked={mode === "new" && !editing} disabled readOnly />
        {mode === "new" && !editing ? "An activation email is sent automatically" : "Send notification email to the user (coming soon)"}
      </label>
      <div className="vim-ia-notice"><ShieldCheck size={18} />
        {editing ? "Changes to status and profile are saved through " : mode === "new"
          ? "The new user will receive an activation invitation."
          : "The selected user will be assigned the IA role for this institution."}
      </div>
      <small className="vim-ia-contract-footnote">Assignment dates and notification email are coming soon.</small>
    </div>
    <footer className="vim-dialog-footer">
      <button className="btn btn-outline-secondary" type="button" disabled={busy} onClick={onClose}>Cancel</button>
      <button className="btn btn-primary" type="submit" disabled={busy || cannotCreate || cannotChooseInstitution}>
        {busy ? "Saving..." : editing ? "Update" : "Assign Admin"}
      </button>
    </footer>
  </form>;
}

function AdminStatusDialog({ record, busy, onClose, onConfirm }) {
  const deactivate = isActive(record);
  return <div className="vim-ia-confirm">
    <div className="vim-ia-warning"><AlertTriangle size={28} />
      <strong>Are you sure you want to {deactivate ? "deactivate" : "activate"} this Institutional Admin?</strong>
      <p>{deactivate ? "The user will lose Institutional Admin access until reactivated." : "The user will regain access."}</p>
    </div>
    <div className="vim-ia-confirm-rows">
      {[["User", record.name], ["Email", record.email], ["Institution", record.institution?.name],
        ["Current Status", isActive(record) ? "Active" : "Inactive"], ["New Status", deactivate ? "Inactive" : "Active"]]
        .map(([label, value]) => <div key={label}><span>{label}</span><strong>{present(value)}</strong></div>)}
    </div>
    <label className="vim-field"><span>Remarks (coming soon)</span>
      <textarea className="form-control" disabled rows={3} placeholder="Not available" />
    </label>
    <footer className="vim-dialog-footer">
      <button type="button" className="btn btn-outline-secondary" onClick={onClose} disabled={busy}>Cancel</button>
      <button type="button" className={`btn ${deactivate ? "btn-danger" : "btn-primary"}`} onClick={onConfirm} disabled={busy}>
        {busy ? "Processing..." : deactivate ? "Deactivate" : "Activate"}
      </button>
    </footer>
  </div>;
}

export default function InstitutionalAdmins() {
  const { user } = useOutletContext();
  const isMinistry = user?.permissions?.includes("users.manage.ministry") === true;
  const canManage = isMinistry || user?.permissions?.includes("users.manage.institution") === true;
  const ownInstitutionId = user?.institution?.id ?? "";
  const [rows, setRows] = useState([]);
  const [pagination, setPagination] = useState({ currentPage: 1, lastPage: 1, total: 0, perPage: 20 });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = usePageSize('institutional-admins', 20);
  const [searchInput, setSearchInput] = useState("");
  const search = useDebouncedValue(searchInput.trim(), 450);
  const [institutionId, setInstitutionId] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useErrorDialogState("");
  const [modal, setModal] = useState(null);
  const [statusBusy, setStatusBusy] = useState(false);
  const [selected, setSelected] = useState(null);
  const [revision, setRevision] = useState(0);
  const [institutions, setInstitutions] = useState([]);
  const [institutionsError, setInstitutionsError] = useErrorDialogState("");
  const [iaRole, setIaRole] = useState(null);
  const [roleError, setRoleError] = useErrorDialogState("");

  const reload = useCallback(() => setRevision((value) => value + 1), []);
  const close = useCallback(() => { setModal(null); setSelected(null); }, []);

  useEffect(() => {
    if (!isMinistry) return;
    let alive = true;
    async function getOptions() {
      try {
        const first = await listInstitutions({ page: 1 });
        if (first.lastPage > 30) throw new Error("Too many options to list. Please narrow your search.");
        const all = [...first.items];
        for (let i = 2; i <= first.lastPage; i++) {
          const response = await listInstitutions({ page: i });
          all.push(...response.items);
        }
        if (alive) setInstitutions(all);
      } catch (err) { if (alive) setInstitutionsError(apiError(err)); }
    }
    async function getRole() {
      try {
        const roles = await listRoles();
        const match = roles.items.find((role) => String(role.code || "").toUpperCase() === "IA");
        if (alive) {
          setIaRole(match?.id ? match : null);
          if (!match?.id) setRoleError("The Institution Admin role could not be found.");
        }
      } catch (err) { if (alive) setRoleError(apiError(err)); }
    }
    getOptions();
    getRole();
    return () => { alive = false; };
  }, [isMinistry]);

  useEffect(() => {
    if (!canManage || (!isMinistry && !ownInstitutionId)) {
      setRows([]); setError("Your account lacks users management permissions or institution scope."); return;
    }
    let alive = true;
    setLoading(true);
    setError("");
    const params = { search: search || undefined };
    if (isMinistry && institutionId) params.institution_id = institutionId;
    fetchUiPage((serverPage, perPage) => listInstitutionalAdmins({ ...params, page: serverPage, perPage }), page, pageSize)
      .then((result) => {
        if (!alive) return;
        // A defensive filter; Laravel must also enforce role and IA institution scope.
        const filtered = result.items.filter((row) => {
          if (!hasRoleIA(row)) return false;
          if (isMinistry) return true;
          const rowId = row.institution_id ?? row.institution?.id;
          return rowId == null || String(rowId) === String(ownInstitutionId);
        });
        setRows(filtered);
        setPagination({ ...result, perPage: pageSize });
      })
      .catch((err) => { if (alive) { setRows([]); setError(apiError(err)); } })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [page, pageSize, search, institutionId, isMinistry, canManage, ownInstitutionId, revision]);

  const displayed = useMemo(() => rows.filter((row) => !status ||
    (isActive(row) ? "active" : "inactive") === status), [rows, status]);
  // KPI numbers from the loaded rows; "this page" when Laravel reports more than were loaded.
  const partial = Number(pagination.total) > rows.length;
  const activeN = rows.filter(isActive).length, inactiveN = rows.length - activeN;
  const covered = new Set(rows.map((row) => String(row.institution_id ?? row.institution?.id ?? "")).filter(Boolean)).size;
  const withoutAdmin = isMinistry && institutions.length && !partial && !institutionId ? Math.max(0, institutions.length - covered) : null;
  const note = (text) => partial ? `${text} · this page` : text;

  function open(which, row = null) {
    const rowInstitution = row?.institution_id ?? row?.institution?.id;
    if (row && !isMinistry && rowInstitution != null && String(rowInstitution) !== String(ownInstitutionId)) {
      Swal.fire({ icon: "error", title: "Access denied", text: "Admin belongs to a different institution." });
      return;
    }
    setModal(which); setSelected(row);
  }

  async function confirmStatus() {
    if (!selected) return;
    const enable = !isActive(selected);
    setStatusBusy(true);
    try {
      const result = await setInstitutionalAdminActive(selected.id, enable);
      close(); reload();
      await Swal.fire({ icon: "success", title: `Admin ${enable ? "activated" : "deactivated"}`,
        text: result.message || "Saved successfully." });
    } catch (err) {
      await Swal.fire({ icon: "error", title: "Action failed", text: apiError(err) });
    } finally { setStatusBusy(false); }
  }

  async function unlock(record) {
    const answer = await Swal.fire({ title: "Unlock institutional admin?", text: record.email,
      icon: "question", showCancelButton: true, confirmButtonText: "Unlock Account" });
    if (!answer.isConfirmed) return;
    try {
      const result = await unlockInstitutionalAdmin(record.id);
      reload();
      await Swal.fire({ icon: "success", title: "Account unlocked", text: result.message || "Saved successfully." });
    } catch (err) { await Swal.fire({ icon: "error", title: "Unlock failed", text: apiError(err) }); }
  }

  async function sendReset(record) {
    const answer = await Swal.fire({ title: "Send password-reset link?", text: `Send a secure reset link to ${record.email}?`,
      icon: "question", showCancelButton: true, confirmButtonText: "Send Reset Link" });
    if (!answer.isConfirmed) return;
    try {
      const result = await sendInstitutionalAdminResetLink(record.id);
      await Swal.fire({ icon: "success", title: "Reset requested", text: result.message || "Saved successfully." });
    } catch (err) { await Swal.fire({ icon: "error", title: "Reset request failed", text: apiError(err) }); }
  }

  return <main className="vim-institutions vim-institution-admins adm-modern container-fluid px-0">
    <MuHeader initials="🛡" title="Institutional Admins" subtitle="Users holding the Institution Admin (IA) role for each institution">
      {canManage && <button type="button" className="mu-btn mu-btn-primary vim-add" onClick={() => open("add")}><Plus size={16} /> Add Institutional Admin</button>}
    </MuHeader>
    <div className="mu-kpis">
      <MuKpi tone="blue" icon={<ShieldCheck size={18}/>} title="Institutional admins" value={countText(pagination.total, "admin", loading && !rows.length)} note="across institutions" arrow={false} onOpen={() => setStatus("")}/>
      <MuKpi tone="green" icon={<CheckCircle2 size={18}/>} title="Active" value={countText(activeN, "admin", loading && !rows.length)} note={note("managing users")} arrow={false} onOpen={() => setStatus("active")}/>
      <MuKpi tone="red" icon={<UserX size={18}/>} title="Inactive" value={countText(inactiveN, "admin", loading && !rows.length)} note={note("access disabled")} arrow={false} onOpen={() => setStatus("inactive")}/>
      {withoutAdmin !== null
        ? <MuKpi tone="amber" icon={<Building2 size={18}/>} title="Without admin" value={countText(withoutAdmin, "institution")} note="needs an IA" arrow={false}/>
        : <MuKpi tone="indigo" icon={<Building2 size={18}/>} title="Institutions covered" value={countText(covered, "institution", loading && !rows.length)} note={note("with an IA")} arrow={false}/>}
    </div>
    <section className="vim-list-card">
      <header className="adm-card-head"><span className="adm-dot" aria-hidden="true"/><h2>Admin accounts</h2><span className="mu-count">{loading ? "…" : pagination.total}</span></header>
      <form className="vim-filters vim-filter-form adm-toolbar" onSubmit={(event) => { event.preventDefault(); setPage(1); }}>
        <MuTabs label="Status" value={status || "all"} onChange={(value) => setStatus(value === "all" ? "" : value)}
          items={[{ key: "all", label: "All", count: rows.length }, { key: "active", label: "Active", count: activeN }, { key: "inactive", label: "Inactive", count: inactiveN }]}/>
        {isMinistry && <select aria-label="Filter institution" value={institutionId} onChange={(event) => { setInstitutionId(event.target.value); setPage(1); }}>
          <option value="">All Institutions</option>
          {institutions.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
        </select>}
        <label className="vim-search-field"><Search size={16} />
          <input value={searchInput} onChange={(event) => { setSearchInput(event.target.value); setPage(1); }}
            placeholder="Search by name, email or username..." aria-label="Search institutional admins" />
        </label>
        <button className="adm-hidden-submit" type="submit">Search</button>
        {(searchInput || institutionId || status) && <button type="button" className="mu-btn" onClick={() => {
          setSearchInput(""); setInstitutionId(""); setStatus(""); setPage(1);
        }}><RotateCcw size={14} /> Reset</button>}
      </form>
      
      <div className="vim-table-scroll"><table className="table vim-table mb-0">
        <thead><tr><th>#</th><th>Admin</th><th>Institution</th><th>Phone</th><th>Status</th><th>Last Login</th><th aria-label="Actions"/></tr></thead>
        <tbody>
          {!loading && !error && displayed.length === 0 && <tr><td className="vim-empty" colSpan={7}>No institutional admins match the current filters.</td></tr>}
          {displayed.map((row, index) => <tr key={row.id}>
            <td>{(page - 1) * (pagination.perPage || rows.length || 1) + index + 1}</td>
            <td><AdmPerson name={present(row.name)} sub={[row.email, row.username && `@${row.username}`].filter(Boolean).join(" · ")} seed={row.id ?? row.email}/></td>
            <td><AdmOrg logo={institutionLogoUrl(row.institution)} code={row.institution?.code || row.institution?.short_name} name={present(row.institution?.name ?? row.institution_name)}/></td>
            <td>{present(row.phone)}</td>
            <td><AdmStatus status={isActive(row) ? "active" : "inactive"}/></td>
            <td><AdmWhen value={row.last_login_at}/></td>
            <td className="mu-actions"><RowActionsMenu label="Row actions">
              <button type="button" title="View Details" aria-label={`View ${row.name}`} onClick={() => open("view", row)}><Eye size={15} /></button>
              <button type="button" title="Edit Admin" aria-label={`Edit ${row.name}`} onClick={() => open("edit", row)}><Pencil size={15} /></button>
              <button type="button" title={isActive(row) ? "Deactivate" : "Activate"}
                className={isActive(row) ? "vim-action-danger" : "vim-action-success"}
                aria-label={`${isActive(row) ? "Deactivate" : "Activate"} ${row.name}`} onClick={() => open("status", row)}><Power size={15} /></button>
              <button type="button" title="Send Reset Link" aria-label={`Reset password for ${row.name}`}
                onClick={() => sendReset(row)}><KeyRound size={15} /></button>
              <button type="button" title={row.locked_until ? "Unlock Account" : "Account not locked"}
                aria-label={`Unlock ${row.name}`} disabled={!row.locked_until} onClick={() => unlock(row)}><LockKeyhole size={15} /></button>
            </RowActionsMenu></td>
          </tr>)}
        </tbody>
      </table><TableLoader active={loading} /></div>
      <div className="vim-pagination-bar"><span>Page {page} of {Math.max(1, pagination.lastPage)} · {pagination.total} admins</span>
        <div className="vim-pagination-controls">
          <PageSizeSelect value={pageSize} onChange={(value) => { setPageSize(value); setPage(1); }} />
          <button type="button" aria-label="Previous page" disabled={loading || page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft size={16} /></button>
          <button type="button" className="active" aria-current="page">{page}</button>
          <button type="button" aria-label="Next page" disabled={loading || page >= pagination.lastPage} onClick={() => setPage(page + 1)}><ChevronRight size={16} /></button>
        </div>
      </div>
    </section>
    {modal && <AdminDialog onClose={close} title={{ add: "Assign Institutional Admin", view: "Institutional Admin Details", edit: "Edit Institutional Admin", status: "Change Status" }[modal]}>
      {modal === "view" && selected && <AdminDetails record={selected} onClose={close} onEdit={() => setModal("edit")} />}
      {modal === "status" && selected && <AdminStatusDialog record={selected} busy={statusBusy}
        onClose={close} onConfirm={confirmStatus} />}
      {(modal === "add" || modal === "edit") && <AdminForm key={`${modal}-${selected?.id || "new"}`}
        initial={modal === "edit" ? selected : null} currentUser={user} institutions={institutions}
        institutionsError={institutionsError} iaRole={iaRole} roleError={roleError}
        onSaved={reload} onClose={close} />}
    </AdminDialog>}
  </main>;
}
