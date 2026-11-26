import {useErrorDialogState} from '../../utils/userFacingErrors.js';
/**
 * FILE: src/pages/Admin/Users.jsx
 * ROUTE: Login -> ProtectedRoute -> DashboardLayout -> RouteAccess
 *   -> /dashboard/administration/users -> pages/Admin/Users.jsx.
 * DATA: Users.jsx -> API/users.jsx -> API/axios.jsx (Bearer token)
 *   -> Laravel policies (users.manage.ministry / users.manage.institution) -> PostgreSQL.
 * AFFILIATION: Ministry -> department_id; Institution -> institution_id.
 * Dropdown choices are loaded from Laravel (API/department.jsx, API/institution.jsx).
 * CONFIRMED API: GET/POST /users; PUT /users/{id};
 *   POST /users/{id}/unlock and /users/{id}/send-reset-link; GET /roles (MOA).
 * MFA (endpoints 26–29): MOA and IA (own scope) set mfa_enabled/mfa_method via PUT /users/{id} (⋮ dialog)
 *   or on POST /users (Add User). Fields are never sent by other administrators.
 *   GET /users/{id} and user activity API were not supplied; the details
 *   modal uses the actual GET /users record only.
 * ACCESS: permissions and institution scope are enforced by Laravel.
 * No fake users, statistics, institutions, roles or successful requests.
 */
import { TableLoader } from "../../components/common/LoadingState";
import { useEffect, useMemo, useState } from "react";
import RowActionsMenu from "../../components/common/RowActionsMenu";
import { createPortal } from "react-dom";
import { useOutletContext } from "react-router-dom";
import Swal from "../../utils/portalAlerts";
import { Eye, Pencil, Plus, Search, RotateCcw, Power, ShieldCheck, KeyRound, LockKeyhole, ChevronLeft, ChevronRight, X, UsersRound, CheckCircle2, MailCheck, Fingerprint } from "lucide-react";
import { ADMIN_MFA_ROLES, adminMfaFields, userMfaState } from "../../API/mfa";
import { roleCodes } from "../../utils/datasetOwnership.js";
import UserMfaPanel from "./UserMfaPanel";
import {
  assignUserRoles, availableRoles, createUser, listUsers,
  requestUserPasswordReset, setUserActive, unlockUser, updateUser,
} from "../../API/users";
import { listInstitutions } from "../../API/institution";
import { listDepartments } from "../../API/department";
import { apiError, validationErrors } from "../../API/resourceHelpers";
import "./institutions.css";
import "./users.css";
import {MuBadge, MuHeader, MuKpi, MuTabs} from "../../components/modern/ModernUI.jsx";
import {AdmOrg, AdmPerson, AdmStatus, AdmWhen} from "../../components/modern/AdminParts.jsx";
import {adminStatus, countText, summaryCount} from "../../utils/adminDisplay.js";
import {institutionLogoUrl} from "../../utils/institutionLogo.js";
import {useDebouncedValue} from "../../hooks/useDebouncedValue.js";
import "../../styles/admin-modern.css";
import PageSizeSelect from '../../components/common/PageSizeSelect.jsx';
import {usePageSize} from '../../components/common/usePageSize.js';
import {fetchUiPage} from '../../utils/pagedFetch.js';

const initialForm = {
  name: "",
  username: "",
  email: "",
  phone: "",
  affiliation_type: "",
  institution_id: "",
  department_id: "",
  role_code: "",
};
const ministryManage = (user) => user?.permissions?.includes("users.manage.ministry") === true;
const institutionManage = (user) => user?.permissions?.includes("users.manage.institution") === true;
const label = (value) => value == null || value === "" ? "—" : String(value);

/** Only trust explicit affiliation or a populated FK; never infer from role label. */
function affiliationOf(record) {
  const explicit = String(record?.affiliation_type ?? record?.user_type ?? "").toLowerCase();
  if (explicit === "ministry" || explicit === "institution") return explicit;
  if (record?.department_id != null || record?.department?.id != null || record?.department?.name) {
    return "ministry";
  }
  if (record?.institution_id != null || record?.institution?.id != null || record?.institution?.name) {
    return "institution";
  }
  return "";
}

function affiliationName(record) {
  const type = affiliationOf(record);
  if (type === "ministry") return "Ministry";
  if (type === "institution") return "Institution";
  return "—";
}

function placementName(record) {
  const type = affiliationOf(record);
  if (type === "ministry") {
    return record?.department?.name ?? record?.department_name ?? "—";
  }
  if (type === "institution") {
    return record?.institution?.name ?? record?.institution_name ?? "—";
  }
  return "—";
}

const mfaLabel = (record) => {
  const state = userMfaState(record);
  return state === null ? null : state.enabled ? `On (${state.method === "sms" ? "SMS" : "Email"})` : "Off";
};

/** MFA column: shown only from Laravel data (mfa_enabled / mfa_method); "—" until the API sends it. */
function MfaBadge({ record }) {
  const state = userMfaState(record);
  if (state === null) return <span className="vim-mfa-na" title="MFA status not available">—</span>;
  return state.enabled
    ? <MuBadge tone="green">{state.method === "sms" ? "SMS" : "Email"}</MuBadge>
    : <MuBadge tone="grey">Off</MuBadge>;
}

function Dialog({ title, onClose, children }) {
  useEffect(() => {
    const key = (event) => {
      if (event.key === "Escape" && !document.querySelector(".swal2-container")) onClose();
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [onClose]);
  return createPortal(
    <div className="vim-dialog-backdrop" onMouseDown={(event) => {
      if (event.currentTarget === event.target) onClose();
    }}>
      <section role="dialog" aria-modal="true" aria-label={title} className="vim-dialog vim-dialog-wide">
        <header className="vim-dialog-header"><h2>{title}</h2>
          <button className="vim-icon-button" onClick={onClose} type="button" aria-label="Close"><X size={18} /></button>
        </header>
        {children}
      </section>
    </div>, document.body
  );
}

function Field({ name, title, value, change, error, type = "text", required = false, disabled = false }) {
  return (
    <label className="vim-field"><span>{title}{required && <b> *</b>}</span>
      <input type={type} className={`form-control ${error ? "is-invalid" : ""}`} value={value ?? ""}
        onChange={(event) => change(name, event.target.value)} disabled={disabled} required={required} />
      {error && <small className="invalid-feedback d-block">{error}</small>}
    </label>
  );
}

/**
 * USER FORM FLOW:
 * Users.jsx modal -> choose affiliation -> select Laravel department/institution
 * -> API/users.jsx -> API/axios.jsx -> Laravel FormRequest + policy -> PostgreSQL.
 * TODO(BACKEND): Validate exclusive department_id / institution_id, role scope,
 * institution ownership, and return affiliation_type + nested placement on reads.
 */
function UserForm({
  original,
  roles,
  institutionId,
  institutionName,
  isMinistry,
  canManageMfa = false,
  onSave,
  onClose,
}) {
  const editing = Boolean(original?.id);
  // Add User only: optional sign-in MFA (MOA/IA). Edits use the ⋮ Multi-factor dialog.
  const [mfaChoice, setMfaChoice] = useState("off");
  const [form, setForm] = useState(() => ({
    ...initialForm,
    name: original?.name ?? "",
    username: original?.username ?? "",
    email: original?.email ?? "",
    phone: original?.phone ?? "",
    affiliation_type: isMinistry ? affiliationOf(original) : "institution",
    institution_id: isMinistry
      ? original?.institution_id ?? original?.institution?.id ?? ""
      : institutionId ?? "",
    department_id: isMinistry
      ? original?.department_id ?? original?.department?.id ?? ""
      : "",
    role_code: original?.role_code ?? original?.roles?.[0]?.code ?? "",
  }));
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [institutions, setInstitutions] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [institutionsLoading, setInstitutionsLoading] = useState(false);
  const [departmentsLoading, setDepartmentsLoading] = useState(false);
  const [institutionOptionsError, setInstitutionOptionsError] = useErrorDialogState("");
  const [departmentOptionsError, setDepartmentOptionsError] = useErrorDialogState("");

  // Only request the selected organization category. Never fetch a fake list.
  useEffect(() => {
    if (!isMinistry || form.affiliation_type !== "ministry") return;
    let mounted = true;
    setDepartmentsLoading(true);
    setDepartmentOptionsError("");

    listDepartments({ page: 1, perPage: 100, per_page: 100 })
      .then((result) => { if (mounted) setDepartments(result.items); })
      .catch((error) => { if (mounted) setDepartmentOptionsError(apiError(error)); })
      .finally(() => { if (mounted) setDepartmentsLoading(false); });

    return () => { mounted = false; };
  }, [isMinistry, form.affiliation_type]);

  useEffect(() => {
    if (!isMinistry || form.affiliation_type !== "institution") return;
    let mounted = true;
    setInstitutionsLoading(true);
    setInstitutionOptionsError("");

    listInstitutions({ page: 1, perPage: 100, per_page: 100 })
      .then((result) => { if (mounted) setInstitutions(result.items); })
      .catch((error) => { if (mounted) setInstitutionOptionsError(apiError(error)); })
      .finally(() => { if (mounted) setInstitutionsLoading(false); });

    return () => { mounted = false; };
  }, [isMinistry, form.affiliation_type]);

  const change = (key, value) => {
    setForm((previous) => {
      if (key === "affiliation_type") {
        return {
          ...previous,
          affiliation_type: value,
          institution_id: "",
          department_id: "",
        };
      }
      return { ...previous, [key]: value };
    });
    setErrors((previous) => ({
      ...previous,
      [key]: undefined,
      institution_id: undefined,
      department_id: undefined,
      affiliation_type: undefined,
    }));
  };

  const submit = async (event) => {
    event.preventDefault();
    const nextErrors = {};

    if (!form.name.trim()) nextErrors.name = "Full name is required.";
    if (!editing && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      nextErrors.email = "Enter a valid email.";
    }
    if (!editing && !form.username.trim()) nextErrors.username = "Username is required.";
    if (!editing && !form.affiliation_type) nextErrors.affiliation_type = "Choose Ministry or Institution.";
    if (!editing && isMinistry && !form.role_code) nextErrors.role_code = "Select a role.";
    if (!editing && !isMinistry) {
      nextErrors.role_code = "Roles for institutional users are not available yet.";
    }
    if (!isMinistry && !institutionId) {
      nextErrors.institution_id = "Signed-in account has no verified institution ID.";
    }
    if (!editing && form.affiliation_type === "ministry" && !form.department_id) {
      nextErrors.department_id = "Select a ministry department.";
    }
    if (!editing && form.affiliation_type === "institution" && !form.institution_id) {
      nextErrors.institution_id = "Select an institution.";
    }
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      return;
    }

    const choice = form.affiliation_type === "ministry"
      ? departments.find((department) => String(department.id) === String(form.department_id))
      : institutions.find((institution) => String(institution.id) === String(form.institution_id));

    // IA placement is provided by the signed-in institution, never an editable dropdown.
    const placement = !isMinistry
      ? institutionName || `Institution ID ${institutionId}`
      : choice?.name || choice?.department_name || "the selected office";

    const confirmation = await Swal.fire({
      title: editing ? "Update user?" : "Create user?",
      text: `Assign this user to ${placement}?`,
      icon: "question",
      showCancelButton: true,
      confirmButtonText: editing ? "Update" : "Create",
    });
    if (!confirmation.isConfirmed) return;

    setSaving(true);
    try {
      // The supplied Laravel contract identifies placement by institution_id or
      // department_id; there is no affiliation_type request field in the spec.
      // The verified update contract does not confirm reassignment to another
      // institution/department. Keep placement unchanged on edit requests.
      const payload = {
        name: form.name.trim(),
        username: form.username.trim(),
        phone: form.phone?.trim() || null,
      };

      if (!editing) {
        const role = roles.find((item) => item.code === form.role_code);
        if (!role) {
          throw new Error("Select a role.");
        }
        Object.assign(payload, {
          email: form.email.trim(),
          department_id: form.affiliation_type === "ministry"
            ? Number(form.department_id) : null,
          institution_id: form.affiliation_type === "institution"
            ? Number(isMinistry ? form.institution_id : institutionId) : null,
          role_ids: [role.id],
        });
        if (canManageMfa && mfaChoice !== "off") Object.assign(payload, adminMfaFields({enabled: true, method: mfaChoice}));
      }
      const result = await onSave(payload, original?.id);
      onClose();
      await Swal.fire({
        icon: "success",
        title: editing ? "User updated" : "User created",
        text: result.message || "The server completed the request successfully.",
      });
    } catch (error) {
      setErrors({});
      await Swal.fire({ icon: "error", title: "Save failed", text: apiError(error) });
    } finally {
      setSaving(false);
    }
  };

  const selectionUnavailable = isMinistry && (
    (form.affiliation_type === "ministry" && (departmentsLoading || !!departmentOptionsError)) ||
    (form.affiliation_type === "institution" && (institutionsLoading || !!institutionOptionsError))
  );

  return (
    <form onSubmit={submit}>
      <div className="vim-wizard-main">
        <div className="vim-form-grid">
          <Field
            name="name"
            title="Full Name"
            value={form.name}
            change={change}
            error={errors.name}
            required
          />
          <Field
            name="username"
            title="Username"
            value={form.username}
            change={change}
            error={errors.username}
            disabled={editing}
            required={!editing}
          />
          <Field
            name="email"
            title="Email Address"
            type="email"
            value={form.email}
            change={change}
            error={errors.email}
            disabled={editing}
            required
          />
          <Field
            name="phone"
            title="Phone Number"
            value={form.phone}
            change={change}
            error={errors.phone}
          />
          {!editing && canManageMfa && <label className="vim-mfa-create">
            <span>Sign-in MFA (optional)</span>
            <select className="form-control" value={mfaChoice} onChange={(event) => setMfaChoice(event.target.value)}>
              <option value="off">Off — password only</option>
              <option value="email">Email code</option>
              <option value="sms" disabled={!form.phone?.trim()}>SMS code{form.phone?.trim() ? "" : " (add a phone number first)"}</option>
            </select>
            <small>Required at every sign-in once the account is active.</small>
          </label>}
        </div>

        <div className="vim-affiliation-block">
          <h3>User Organization</h3>
          {isMinistry ? (
            <div className="vim-form-grid">
              <label className="vim-field">
                <span>User Belongs To <b>*</b></span>
                <select
                  className={`form-select ${errors.affiliation_type ? "is-invalid" : ""}`}
                  value={form.affiliation_type}
                  onChange={(event) => change("affiliation_type", event.target.value)}
                  disabled={editing}
                  required
                >
                  <option value="">Select user organization</option>
                  <option value="ministry">Ministry</option>
                  <option value="institution">Institution</option>
                </select>
                {errors.affiliation_type && (
                  <small className="invalid-feedback d-block">{errors.affiliation_type}</small>
                )}
              </label>

              {form.affiliation_type === "ministry" && (
                <label className="vim-field">
                  <span>Ministry Department <b>*</b></span>
                  <select
                    className={`form-select ${errors.department_id ? "is-invalid" : ""}`}
                    value={form.department_id}
                    onChange={(event) => change("department_id", event.target.value)}
                    disabled={editing || departmentsLoading || !!departmentOptionsError}
                    required
                  >
                    <option value="">
                      {departmentsLoading ? "Loading departments..." : "Select department"}
                    </option>
                    {departments.map((department) => (
                      <option key={department.id} value={department.id}>
                        {department.name || department.department_name}
                      </option>
                    ))}
                  </select>
                  {errors.department_id && (
                    <small className="invalid-feedback d-block">{errors.department_id}</small>
                  )}
                  
                  {!departmentsLoading && !departmentOptionsError && !departments.length && (
                    <small className="text-muted">No departments available.</small>
                  )}
                </label>
              )}

              {form.affiliation_type === "institution" && (
                <label className="vim-field">
                  <span>Institution <b>*</b></span>
                  <select
                    className={`form-select ${errors.institution_id ? "is-invalid" : ""}`}
                    value={form.institution_id}
                    onChange={(event) => change("institution_id", event.target.value)}
                    disabled={editing || institutionsLoading || !!institutionOptionsError}
                    required
                  >
                    <option value="">
                      {institutionsLoading ? "Loading institutions..." : "Select institution"}
                    </option>
                    {institutions.map((institution) => (
                      <option key={institution.id} value={institution.id}>
                        {institution.name}
                      </option>
                    ))}
                  </select>
                  {errors.institution_id && (
                    <small className="invalid-feedback d-block">{errors.institution_id}</small>
                  )}
                  
                  {!institutionsLoading && !institutionOptionsError && !institutions.length && (
                    <small className="text-muted">No institutions available.</small>
                  )}
                </label>
              )}
            </div>
          ) : (
            <div className="vim-affiliation-fixed">
              <span className="text-muted">User Belongs To</span>
              <strong>Institution</strong>
              <span className="text-muted">Institution</span>
              <strong>{institutionName || `Institution ID ${institutionId || "unavailable"}`}</strong>
              <small>Assigned institution scope; cannot select another institution.</small>
            </div>
          )}
        </div>

        {!editing && isMinistry && (
          <div className="vim-form-grid mt-3">
            <label className="vim-field">
              <span>Initial Role *</span>
              <select
                className="form-select"
                value={form.role_code}
                onChange={(event) => change("role_code", event.target.value)}
              >
                <option value="">Select role when available</option>
                {roles.map((role) => (
                  <option value={role.code} key={role.code}>
                    {role.name || role.label || role.code}
                  </option>
                ))}
              </select>
              {errors.role_code && <small className="text-danger">{errors.role_code}</small>}
            </label>
          </div>
        )}
        {editing && (
          <p className="text-muted mt-3 small">
            The user's organisation cannot be changed while editing.
          </p>
        )}
        {errors.role_code && !isMinistry && (
          <p className="alert alert-warning mt-3" role="alert">
            {errors.role_code}
          </p>
        )}
        <p className="text-muted mt-3 small">
          The user sets a password from the secure invitation email.
          No password is stored in this form.
        </p>
      </div>
      <footer className="vim-dialog-footer">
        <button type="button" className="btn btn-outline-secondary" onClick={onClose}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={saving || selectionUnavailable}>
          {saving ? "Saving..." : editing ? "Update User" : "Save User"}
        </button>
      </footer>
    </form>
  );
}

export default function Users() {
  const { user } = useOutletContext();
  const isMinistry = ministryManage(user);
  const canManage = isMinistry || institutionManage(user);
  const institutionId = user?.institution?.id;
  const institutionName = user?.institution?.name;
  const [rows, setRows] = useState([]);
  const [roles, setRoles] = useState([]);
  const [searchInput, setSearchInput] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [PAGE_SIZE, setPageSize] = usePageSize('users', 10);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState(null);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useErrorDialogState("");
  const [modal, setModal] = useState(null);
  const [selected, setSelected] = useState(null);
  const [selectedRoles, setSelectedRoles] = useState([]);
  const [roleError, setRoleError] = useErrorDialogState("");
  const [saving, setSaving] = useState(false);
  const [revision, setRevision] = useState(0);
  const [allRows, setAllRows] = useState([]);
  // Live search (no Search button): follow the typed text after a short pause.
  const search = useDebouncedValue(searchInput.trim(), 450);

  useEffect(() => {
    let mounted = true;
    if (!isMinistry) return;

    availableRoles()
      .then((result) => { if (mounted) setRoles(result.items); })
      .catch((err) => { if (mounted) setRoleError(apiError(err)); });

    return () => { mounted = false; };
  }, [isMinistry]);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError("");
    if (!canManage || (!isMinistry && !institutionId)) {
      setRows([]);
      setLoading(false);
      setError("Your account lacks Users permission or institution scope.");
      return;
    }
    // Only backend may decide IA scope; do not permit an arbitrary client scope.
    // Backend specification supports page/search; status is a current-page UI filter.
    // perPage ≤ 100 per request; 200 / 500 rows are read as consecutive pages of 100.
    fetchUiPage((serverPage, perPage) => listUsers({ page: serverPage, perPage, search: search || undefined }), page, PAGE_SIZE)
      .then((result) => {
        if (!mounted) return;
        // Server enforces IA scope; only reject clearly mismatched institution
        // IDs when provided. Some list responses contain institution name only.
        const scoped = isMinistry ? result.items : result.items.filter((record) => {
          const recordId = record.institution_id ?? record.institution?.id;
          return recordId == null || String(recordId) === String(institutionId);
        });
        setAllRows(scoped);
        setRows(scoped.filter((record) => !status ||
          String(record.status || (record.is_active ? "active" : "inactive")).toLowerCase() === status));
        setSummary(isMinistry ? result.summary : null);
        setTotal(result.total);
        setPages(Math.max(1, result.lastPage));
      })
      .catch((err) => {
        if (mounted) {
          setRows([]);
          setSummary(null);
          setError(apiError(err));
        }
      })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [canManage, isMinistry, institutionId, page, PAGE_SIZE, search, status, revision]);

  // Laravel allows admin MFA changes (PUT /profile/mfa) only for IA and MOA.
  const canManageMfa = roleCodes(user).some((code) => ADMIN_MFA_ROLES.includes(code));
  const canEditUser = (record) => isMinistry || String(record?.institution_id ?? record?.institution?.id) === String(institutionId);
  const doReload = () => setRevision((value) => value + 1);
  const close = () => { setModal(null); setSelected(null); };
  const open = (kind, record = null) => {
    if (kind === "create") { setSelected(null); setModal(kind); return; }
    if (!canEditUser(record)) {
      Swal.fire({ icon: "error", title: "Access denied", text: "User is outside your institution scope." });
      return;
    }
    // No GET /users/{id} in the supplied API contract. Use real list record.
    setSelected(record);
    setSelectedRoles((record.roles || []).map((role) => role.id).filter((id) => id != null));
    setModal(kind);
  };

  const update = async (payload, id) => {
    const result = id ? await updateUser(id, payload) : await createUser(payload);
    doReload();
    return result;
  };
  const toggle = async (record) => {
    if (!canEditUser(record)) return;
    const activate = String(
      record.status || (record.is_active ? "active" : "inactive")
    ).toLowerCase() !== "active";
    const action = activate ? "Activate" : "Deactivate";
    const confirmation = await Swal.fire({
      title: `${action} user?`, text: record.name || record.email,
      icon: activate ? "question" : "warning", showCancelButton: true,
      confirmButtonText: action, confirmButtonColor: activate ? "#168452" : "#df3f50",
    });
    if (!confirmation.isConfirmed) return;
    try {
      const result = await setUserActive(record.id, activate);
      doReload();
      Swal.fire({
        icon: "success", title: `User ${activate ? "activated" : "deactivated"}`,
        text: result.message || "The server completed the request successfully.",
      });
    } catch (err) {
      Swal.fire({ icon: "error", title: "Action failed", text: apiError(err) });
    }
  };

  const unlock = async (record) => {
    const answer = await Swal.fire({
      title: "Unlock account?", text: record.name || record.email,
      icon: "question", showCancelButton: true, confirmButtonText: "Unlock",
    });
    if (!answer.isConfirmed) return;
    try {
      const result = await unlockUser(record.id);
      doReload();
      Swal.fire({ icon: "success", title: "Account unlocked", text: result.message || "Account unlocked." });
    } catch (err) {
      Swal.fire({ icon: "error", title: "Unlock failed", text: apiError(err) });
    }
  };

  const resetPassword = async () => {
    const answer = await Swal.fire({
      title: "Send password reset?", text: `Send a secure reset link to ${selected.email}?`,
      icon: "question", showCancelButton: true, confirmButtonText: "Send reset link",
    });
    if (!answer.isConfirmed) return;
    try {
      const result = await requestUserPasswordReset(selected.id);
      close();
      Swal.fire({ icon: "success", title: "Reset requested", text: result.message || "The server completed the request successfully." });
    } catch (err) { Swal.fire({ icon: "error", title: "Reset failed", text: apiError(err) }); }
  };
  const saveRoles = async () => {
    if (!isMinistry) return;
    const answer = await Swal.fire({ title: "Update user roles?", text: "The assignments are checked when saved.", icon: "question", showCancelButton: true });
    if (!answer.isConfirmed) return;
    setSaving(true);
    try {
      const result = await assignUserRoles(selected.id, selectedRoles);
      doReload(); close();
      Swal.fire({ icon: "success", title: "Roles updated", text: result.message || "The server completed the request successfully." });
    } catch (err) { Swal.fire({ icon: "error", title: "Role update failed", text: apiError(err) }); }
    finally { setSaving(false); }
  };

  const labels = useMemo(() => selected ? [
    ["Name", selected.name], ["Username", selected.username], ["Email", selected.email],
    ["Phone", selected.phone],
    ["User Belongs To", affiliationName(selected)],
    ["Department / Institution", placementName(selected)],
    ["Status", selected.status], ["Roles", (selected.roles || []).map((role) => role.name || role.code || role).join(", ")],
    ["Last Login", selected.last_login_at],
    ["Account Locked Until", selected.locked_until],
    ["Sign-in MFA", mfaLabel(selected)],
    ["Created", selected.created_at],
  ] : [], [selected]);

  // KPI numbers: Laravel summary when supplied, otherwise counted from the loaded page (labelled "this page").
  const fromSummary = (keys) => summaryCount(summary, keys);
  const pageCount = (key) => allRows.filter((record) => adminStatus(record).key === key).length;
  const usingSummary = fromSummary(["active", "active_users", "activeUsers"]) !== null;
  const activeCount = fromSummary(["active", "active_users", "activeUsers"]) ?? (loading ? null : pageCount("active"));
  const pendingCount = fromSummary(["pending", "pending_users", "pendingUsers", "pending_activation"]) ?? (loading ? null : pageCount("pending"));
  const inactiveCount = fromSummary(["inactive", "inactive_users", "inactiveUsers"]) ?? (loading ? null : pageCount("inactive"));
  const kpiNote = (text) => usingSummary || total <= allRows.length ? text : `${text} · this page`;
  const roleOf = (record) => record.role?.code || record.roles?.[0]?.code || record.role_code || record.roles?.[0]?.name || "";
  return (
    <main className="vim-institutions vim-users adm-modern container-fluid px-0">
      <MuHeader initials="👥" title="User Management" subtitle="Authorized portal accounts, their roles and access">
        {canManage && <button type="button" className="mu-btn mu-btn-primary vim-add" onClick={() => open("create")}><Plus size={17} /> Add New User</button>}
      </MuHeader>
      <div className="mu-kpis">
        <MuKpi tone="blue" icon={<UsersRound size={18}/>} title="All users" value={countText(total, "user", loading && !total)} note={isMinistry ? "in your scope" : institutionName || "your institution"} arrow={false} onOpen={() => { setStatus(""); setPage(1); }}/>
        <MuKpi tone="green" icon={<CheckCircle2 size={18}/>} title="Active" value={countText(activeCount, "user", loading && activeCount === null)} note={kpiNote("can sign in")} arrow={false} onOpen={() => { setStatus("active"); setPage(1); }}/>
        <MuKpi tone="amber" icon={<MailCheck size={18}/>} title="Pending" value={countText(pendingCount, "user", loading && pendingCount === null)} note={kpiNote("awaiting activation")} arrow={false}/>
        <MuKpi tone="red" icon={<Power size={18}/>} title="Inactive" value={countText(inactiveCount, "user", loading && inactiveCount === null)} note={kpiNote("access disabled")} arrow={false} onOpen={() => { setStatus("inactive"); setPage(1); }}/>
      </div>
      {!isMinistry && canManage && (
        <div className="alert alert-info" role="note">
          Creating institution users is not available yet. You can still view
          and update existing users.
        </div>
      )}
      {summary && typeof summary === "object" && (
        <div className="vim-user-summary" aria-label="Users overview">
          {Object.entries(summary)
            .filter(([key, value]) => key !== "by_role" && (typeof value === "number" || typeof value === "string"))
            .map(([key, value]) => (
              <button
                type="button"
                className="vim-user-summary-card"
                key={key}
                onClick={() => {
                  setSelected({ name: key, value });
                  setModal("summary");
                }}
              >
                <strong>{value}</strong>
                <span>{key.replaceAll("_", " ")}</span>
              </button>
            ))}
          {Array.isArray(summary.by_role) && (
            <button
              type="button"
              className="vim-user-summary-card"
              onClick={() => { setSelected({ name: "Users by Role" }); setModal("by_role"); }}
            >
              <strong>View</strong><span>Users by Role</span>
            </button>
          )}
        </div>
      )}
      <section className="vim-list-card">
        <header className="adm-card-head"><span className="adm-dot" aria-hidden="true"/><h2>User accounts</h2><span className="mu-count">{loading ? "…" : total}</span></header>
        <div className="vim-filters"><form className="vim-filter-form adm-toolbar" onSubmit={(event) => { event.preventDefault(); setPage(1); }}>
          <MuTabs label="Status" value={status || "all"} onChange={(value) => { setStatus(value === "all" ? "" : value); setPage(1); }}
            items={[{ key: "all", label: "All", count: total }, { key: "active", label: "Active", count: activeCount ?? undefined }, { key: "inactive", label: "Inactive", count: inactiveCount ?? undefined }]}/>
          <label className="vim-search-field"><Search size={17}/><input value={searchInput} onChange={(event) => { setSearchInput(event.target.value); setPage(1); }} placeholder="Search name, username or email..." aria-label="Search users" /></label>
          <button type="submit" className="adm-hidden-submit">Search</button>
          {(searchInput || status) && <button type="button" className="mu-btn" onClick={() => { setSearchInput(""); setStatus(""); setPage(1); }}><RotateCcw size={14}/> Reset</button>}
        </form></div>
        
        
        <div className="vim-table-scroll"><table className="table vim-table mb-0"><thead><tr>
          <th>#</th><th>User</th><th>Organisation</th><th>Role</th><th>Status</th><th>MFA</th><th>Last Login</th><th aria-label="Actions"/>
        </tr></thead><tbody>
          {rows.map((record, index) => <tr key={record.id}>
            <td>{(page - 1) * PAGE_SIZE + index + 1}</td>
            <td><AdmPerson name={label(record.name)} sub={[record.email, record.username && `@${record.username}`].filter(Boolean).join(" · ")} seed={record.id ?? record.email}/></td>
            <td><AdmOrg logo={institutionLogoUrl(record.institution)} code={record.institution?.code || record.department?.code || affiliationName(record)} name={placementName(record)}/></td>
            <td><span className="adm-role">{roleOf(record) ? <MuBadge tone="blue">{roleOf(record)}</MuBadge> : "—"}<small>{record.role?.name || record.roles?.map((r) => r.name).filter(Boolean).join(", ")}</small></span></td>
            <td><AdmStatus record={record}/></td>
            <td><MfaBadge record={record}/></td>
            <td><AdmWhen value={record.last_login_at}/></td><td className="mu-actions"><RowActionsMenu label="Row actions">
              <button type="button" title="View" aria-label="View user" onClick={() => open("view", record)}><Eye size={15}/></button>
              <button type="button" title="Edit" aria-label="Edit user" onClick={() => open("edit", record)}><Pencil size={15}/></button>
              {isMinistry && <button type="button" title="Roles" aria-label="Assign roles" onClick={() => open("roles", record)}><ShieldCheck size={15}/></button>}
              <button type="button" title="Password reset" aria-label="Reset password" onClick={() => open("reset", record)}><KeyRound size={15}/></button>
              {canManageMfa && <button type="button" title="Multi-factor authentication" aria-label="Multi-factor authentication" onClick={() => open("mfa", record)}><Fingerprint size={15}/></button>}
              {record.locked_until && <button type="button" title="Unlock account" aria-label="Unlock account" onClick={() => unlock(record)}><LockKeyhole size={15}/></button>}
              <button type="button" title="Activate / Deactivate" aria-label="Activate or deactivate user" onClick={() => toggle(record)}><Power size={15}/></button>
            </RowActionsMenu></td>
          </tr>)}
          {!loading && !rows.length && <tr><td colSpan={8} className="vim-empty">No users match these filters.</td></tr>}
        </tbody></table><TableLoader active={loading} /></div>
        <footer className="vim-pagination-bar"><span>Showing {rows.length} of {total} users</span><div className="vim-pagination-controls">
          <PageSizeSelect value={PAGE_SIZE} onChange={(value) => { setPageSize(value); setPage(1); }} />
          <button type="button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)} aria-label="Previous"><ChevronLeft size={16}/></button>
          <span className="mx-2">Page {page} of {pages}</span>
          <button type="button" disabled={page >= pages} onClick={() => setPage((value) => value + 1)} aria-label="Next"><ChevronRight size={16}/></button>
        </div></footer>
      </section>
      {modal && (
        <Dialog
          title={modal === "create" ? "Add New User"
            : modal === "edit" ? "Edit User"
              : modal === "roles" ? "Assign Roles"
                : modal === "reset" ? "Password Reset"
                  : modal === "mfa" ? "Multi-factor Authentication"
                    : modal === "by_role" ? "Users by Role"
                      : modal === "summary" ? "User Summary"
                        : "User Details"}
          onClose={close}
        >
        {(modal === "create" || modal === "edit") && (
          <UserForm
            original={modal === "edit" ? selected : null}
            roles={roles}
            institutionId={institutionId}
            institutionName={institutionName}
            isMinistry={isMinistry}
            canManageMfa={canManageMfa}
            onSave={update}
            onClose={close}
          />
        )}
        {modal === "summary" && selected && (
          <div className="vim-wizard-main">
            <div className="vim-detail-row">
              <span>{label(selected.name)}</span>
              <strong>{label(selected.value)}</strong>
            </div>
          </div>
        )}
        {modal === "by_role" && (
          <div className="vim-wizard-main">
            <div className="vim-details-list">
              {(summary?.by_role || []).map((row, index) => (
                <div key={row.code || row.name || index} className="vim-detail-row">
                  <span>{label(row.name || row.code)}</span>
                  <strong>{label(row.count ?? row.value)}</strong>
                </div>
              ))}
            </div>
          </div>
        )}
        {modal === "view" && selected && <><div className="vim-wizard-main"><div className="vim-details-list">
          {labels.map(([key, value]) => <div className="vim-detail-row" key={key}><span>{key}</span><strong>{label(value)}</strong></div>)}
        </div></div><footer className="vim-dialog-footer"><button type="button" className="btn btn-outline-secondary" onClick={close}>Close</button></footer></>}
        {modal === "roles" && selected && <><div className="vim-wizard-main">
          
          {!roles.length && <p>No roles available.</p>}
          <div className="vim-user-role-grid">{roles.map((role) => <label key={role.code} className="form-check">
            <input className="form-check-input" type="checkbox" checked={selectedRoles.includes(role.id)}
              onChange={(event) => setSelectedRoles((current) => event.target.checked ? [...current, role.id] : current.filter((id) => id !== role.id))}/>
            <span>{role.name || role.label || role.code}</span>
          </label>)}</div>
        </div><footer className="vim-dialog-footer"><button type="button" className="btn btn-outline-secondary" onClick={close}>Cancel</button>
            <button type="button" className="btn btn-primary" disabled={!roles.length || saving} onClick={saveRoles}>Save Roles</button>
          </footer></>}
        {modal === "mfa" && selected && <UserMfaPanel user={selected} onClose={close} onSaved={() => { doReload(); close(); }}/>}
        {modal === "reset" && selected && <><div className="vim-wizard-main"><p>Request a secure password reset link for <strong>{selected.email}</strong>. No password will be displayed or generated in the browser.</p></div>
          <footer className="vim-dialog-footer"><button type="button" className="btn btn-outline-secondary" onClick={close}>Cancel</button>
            <button type="button" className="btn btn-primary" onClick={resetPassword}>Send Reset Link</button></footer></>}
        </Dialog>
      )}
    </main>
  );
}
