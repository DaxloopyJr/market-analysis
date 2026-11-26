import {useErrorDialogState} from '../../utils/userFacingErrors.js';
/**
 * FILE PATH: src/pages/Admin/MinistryDepartments.jsx
 * PAGE ROUTE: /dashboard/administration/departments
 * NAVIGATION: Login -> ProtectedRoute -> DashboardLayout -> RouteAccess -> MinistryDepartments.
 * DATA FLOW: MinistryDepartments.jsx -> API/department.jsx -> API/axios.jsx
 *   -> Laravel GET/POST /api/v1/departments and PUT /api/v1/departments/{id} -> PostgreSQL.
 * PERMISSIONS: departments.manage, enforced again by Laravel.
 * CUSTOMIZE: Edit <thead>, row cells, the Form and ./ministryDepartments.css.
 * IMPORTANT: The supplied API does not promise GET /departments/{id}, DELETE, or
 *   ministry selection/contact/address fields. Search/status filter the CURRENT page.
 *   The department belongs to the single Ministry of Industry and Trade (MIT).
 */
import { TableLoader } from "../../components/common/LoadingState";
import { useCallback, useEffect, useMemo, useState } from "react";
import RowActionsMenu from "../../components/common/RowActionsMenu";
import { createPortal } from "react-dom";
import { useOutletContext } from "react-router-dom";
import Swal from "../../utils/portalAlerts";
import {
  AlertTriangle, Building2, Check, ChevronLeft, ChevronRight, Eye, Info, Mail, MapPin, Pencil, Phone, Plus,
  Power, RotateCcw, Search, UsersRound, X,
} from "lucide-react";
import {
  listDepartments, createDepartment, updateDepartment, setDepartmentActive,
} from "../../API/department";
import { apiError, validationErrors } from "../../API/resourceHelpers";
import "./institutions.css";
import "./ministryDepartments.css";
import PageSizeSelect from '../../components/common/PageSizeSelect.jsx';
import {usePageSize} from '../../components/common/usePageSize.js';
import {fetchUiPage} from '../../utils/pagedFetch.js';
import {MuHeader, MuKpi, MuTabs} from "../../components/modern/ModernUI.jsx";
import {AdmBar, AdmStatus, AdmWhen} from "../../components/modern/AdminParts.jsx";
import {countText} from "../../utils/adminDisplay.js";
import {CheckCircle2, LayoutGrid} from "lucide-react";
import "../../styles/admin-modern.css";

const present = (value) => value === null || value === undefined || value === "" ? "—" : String(value);
const active = (record) => record.is_active === true || (record.is_active == null && record.status === "active");
const dateText = (value) => value ? String(value).slice(0, 10) : "—";
const emptyForm = { name: "", code: "", description: "", parent_department_id: "" };

function DepartmentDialog({ title, onClose, children }) {
  useEffect(() => {
    const onEscape = (event) => {
      if (event.key === "Escape" && !document.querySelector(".swal2-container")) onClose();
    };
    document.addEventListener("keydown", onEscape);
    return () => document.removeEventListener("keydown", onEscape);
  }, [onClose]);

  return createPortal(
    <div className="vim-dialog-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section role="dialog" aria-modal="true" aria-label={title} className="vim-dialog vim-dialog-wide">
        <header className="vim-dialog-header">
          <h2>{title}</h2>
          <button className="vim-icon-button" type="button" aria-label="Close" onClick={onClose}><X size={18} /></button>
        </header>
        {children}
      </section>
    </div>, document.body
  );
}

function DepartmentDetails({ record, onClose, onEdit, canManage }) {
  const detailRows = [
    ["Department Name", record.name],
    ["Department Code", record.code],
    ["Parent Department ID", record.parent_department_id],
    ["Users Assigned", record.users_count],
    ["Description", record.description],
    ["Created", dateText(record.created_at)],
    ["Updated", dateText(record.updated_at)],
    ["ID", record.id],
  ];
  return <>
    <div className="vim-detail-heading">
      <span className="vim-detail-symbol"><Building2 size={25} /></span>
      <div><strong>{present(record.name)}</strong><small>Ministry of Industry and Trade (MIT)</small></div>
      <span className={`vim-status vim-status-${active(record) ? "active" : "inactive"}`}>
        {active(record) ? "Active" : "Inactive"}
      </span>
    </div>
    <div className="vim-details-list">
      {detailRows.map(([title, value]) => (
        <div className="vim-detail-row" key={title}><span>{title}</span><strong>{present(value)}</strong></div>
      ))}
    </div>
    <footer className="vim-dialog-footer">
      <button type="button" className="btn btn-outline-secondary" onClick={onClose}>Close</button>
      {canManage && <button type="button" className="btn btn-primary" onClick={onEdit}><Pencil size={15} /> Edit Department</button>}
    </footer>
  </>;
}

/**
 * Approved Ministry Departments reference:
 * Step 1 Basic Information -> Step 2 Contact Information -> Step 3 Additional Information.
 * The fields absent from the signed-off Laravel contract remain visible for design
 * parity but are NOT silently discarded or sent to an undocumented endpoint.
 */
function DepartmentForm({ initial, options, optionsError, onClose, onSaved }) {
  const editing = Boolean(initial?.id);
  const [form, setForm] = useState({
    ...emptyForm,
    ...initial,
    name: initial?.name ?? "",
    code: initial?.code ?? "",
    description: initial?.description ?? "",
    parent_department_id: initial?.parent_department_id ?? "",
    is_active: initial ? active(initial) : true,
    phone: initial?.phone ?? "",
    email: initial?.email ?? "",
    physical_address: initial?.physical_address ?? "",
    postal_address: initial?.postal_address ?? "",
    established_date: initial?.established_date ?? "",
    remarks: initial?.remarks ?? "",
  });
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const steps = ["Basic Information", "Contact Information", "Additional Information"];
  const parentOptions = options.filter((row) => String(row.id) !== String(initial?.id));
  const unsupportedKeys = ["phone", "email", "physical_address", "postal_address", "established_date", "remarks"];
  const unsupportedEntered = unsupportedKeys.some((key) => String(form[key] ?? "").trim());

  function change(key, value) {
    setForm((previous) => ({ ...previous, [key]: value }));
    setErrors((previous) => ({ ...previous, [key]: "" }));
  }

  function validateBasics() {
    const next = {};
    if (!String(form.name || "").trim()) next.name = "Department name is required.";
    if (!editing && !String(form.code || "").trim()) next.code = "Department code is required.";
    setErrors((previous) => ({ ...previous, ...next }));
    return !Object.keys(next).length;
  }

  async function nextOrSave() {
    if (step === 0) {
      if (validateBasics()) setStep(1);
      return;
    }
    if (step === 1) { setStep(2); return; }
    if (!validateBasics()) { setStep(0); return; }
    if (editing && String(form.parent_department_id) === String(initial?.id)) {
      setErrors((previous) => ({ ...previous, parent_department_id: "A department cannot be its own parent." }));
      return;
    }
    if (unsupportedEntered) {
      await Swal.fire({
        icon: "warning", title: "Some details cannot be saved",
        text: "Please leave the contact and additional information fields empty for now.",
      });
      return;
    }
    const answer = await Swal.fire({
      icon: "question", title: editing ? "Update department?" : "Create department?",
      text: `${form.name} — Ministry of Industry and Trade (MIT)`,
      showCancelButton: true,
      confirmButtonText: editing ? "Update Department" : "Save Department",
    });
    if (!answer.isConfirmed) return;
    setBusy(true);
    try {
      const payload = {
        name: String(form.name).trim(),
        description: String(form.description ?? "").trim() || null,
        parent_department_id: form.parent_department_id === "" ? null : Number(form.parent_department_id),
      };
      let result;
      if (editing) {
        result = await updateDepartment(initial.id, {
          ...payload,
          is_active: Boolean(form.is_active),
          status: form.is_active ? "active" : "inactive",
        });
      } else {
        result = await createDepartment({ ...payload, code: String(form.code).trim().toUpperCase() });
        // POST /departments doesn't document status. PUT /departments/{id} does.
        if (!form.is_active) {
          const createdId = result.data?.id;
          if (!createdId) {
            onClose(); onSaved();
            await Swal.fire({ icon: "warning", title: "Department created",
              text: "The department was created, but its status could not be set. Update its status from the table." });
            return;
          }
          try { await setDepartmentActive(createdId, false); }
          catch (statusError) {
            onClose(); onSaved();
            await Swal.fire({ icon: "warning", title: "Department created; status update failed", text: apiError(statusError) });
            return;
          }
        }
      }
      onClose(); onSaved();
      await Swal.fire({ icon: "success", title: editing ? "Department updated" : "Department created",
        text: result.message || "Changes saved." });
    } catch (error) {
      const returned = validationErrors(error);
      setErrors({});
      if (returned.name || returned.code) setStep(0);
      if (returned.parent_department_id) setStep(2);
      await Swal.fire({ icon: "error", title: "Request failed", text: apiError(error) });
    } finally { setBusy(false); }
  }

  const field = (key, label, placeholder = "", extra = {}) => (
    <label key={key} className={`vim-field ${extra.full ? "vim-field-full" : ""}`}>
      <span>{label}{extra.required && <b> *</b>}</span>
      {extra.multiline ? (
        <textarea className="form-control" rows={extra.rows ?? 4} placeholder={placeholder}
          value={form[key] ?? ""} onChange={(event) => change(key, event.target.value)} />
      ) : (
        <input className={`form-control ${errors[key] ? "is-invalid" : ""}`} type={extra.type ?? "text"}
          placeholder={placeholder} value={form[key] ?? ""} disabled={extra.disabled}
          onChange={(event) => change(key, event.target.value)} />
      )}
      {errors[key] && <small className="text-danger">{errors[key]}</small>}
    </label>
  );

  return <div className="vim-wizard vim-dept-wizard">
    <aside className="vim-steps" aria-label="Department form steps">
      {steps.map((title, index) => (
        <button key={title} type="button" disabled={busy || index > step} onClick={() => setStep(index)}
          className={step === index ? "active" : index < step ? "complete" : ""}>
          <span>{index < step ? <Check size={15} /> : index + 1}</span>{title}
        </button>
      ))}
    </aside>
    <div className="vim-wizard-main">
      <h3 className="vim-dept-section-title"><span className="vim-dept-title-icon">◖</span>{steps[step]}</h3>
      {step === 0 && <div className="vim-dept-fields">
        {field("name", "Department Name", "Enter department name", { required: true })}
        {field("code", "Department Code", "Enter unique code (e.g. DID)", { required: !editing, disabled: editing })}
        <label className="vim-field"><span>Status <b>*</b></span>
          <select className="form-select" value={form.is_active ? "active" : "inactive"}
            onChange={(event) => change("is_active", event.target.value === "active")}>
            <option value="active">Active</option><option value="inactive">Inactive</option>
          </select>
        </label>
        {field("description", "Description", "Enter department description", { multiline: true, rows: 4 })}
      </div>}
      {step === 1 && <div className="vim-dept-fields">
        <div className="vim-dept-icon-field"><Phone size={17} />{field("phone", "Phone Number", "Enter phone number")}</div>
        <div className="vim-dept-icon-field"><Mail size={17} />{field("email", "Email Address", "Enter email address", { type: "email" })}</div>
        <div className="vim-dept-icon-field"><MapPin size={17} />{field("physical_address", "Physical Address", "Enter physical address")}</div>
        <div className="vim-dept-icon-field"><MapPin size={17} />{field("postal_address", "Postal Address", "Enter postal address")}</div>
        
      </div>}
      {step === 2 && <div className="vim-dept-fields">
        {field("established_date", "Established Date", "", { type: "date" })}
        {field("remarks", "Remarks", "Enter additional remarks (optional)", { multiline: true, rows: 5 })}
        <label className="vim-field"><span>Parent Department (optional)</span>
          <select className="form-select" value={form.parent_department_id ?? ""} disabled={Boolean(optionsError)}
            onChange={(event) => change("parent_department_id", event.target.value)}>
            <option value="">No parent department</option>
            {parentOptions.map((row) => <option key={row.id} value={row.id}>{row.name} ({row.code})</option>)}
          </select>
          {errors.parent_department_id && <small className="text-danger">{errors.parent_department_id}</small>}
          
        </label>
        
      </div>}
    </div>
    <footer className="vim-dialog-footer vim-wizard-footer">
      {step === 0 ? <button type="button" className="btn btn-outline-secondary" disabled={busy} onClick={onClose}>Cancel</button>
        : <button type="button" className="btn btn-outline-secondary" disabled={busy} onClick={() => setStep(step - 1)}>Back</button>}
      <button type="button" className="btn btn-primary" disabled={busy} onClick={nextOrSave}>
        {busy ? "Saving..." : step === 2 ? editing ? "Update Department" : "Save Department" : "Next"}
      </button>
    </footer>
  </div>;
}

/** Reference-style confirmation modal. The optional reason is intentionally
 * disabled until Laravel supports an audit reason field on PUT /departments/{id}. */
function DepartmentStatusDialog({ record, busy, onClose, onConfirm }) {
  const activate = !active(record);
  return <div className="vim-reference-confirm">
    <div className={`vim-reference-confirm-icon ${activate ? "positive" : "negative"}`}>
      {activate ? <Check size={29} /> : <AlertTriangle size={29} />}
    </div>
    <div className="vim-reference-confirm-body">
      <strong>Are you sure you want to {activate ? "activate" : "deactivate"} this department?</strong>
      <b>{present(record.name)} ({present(record.code)})</b>
      <p>This department will be marked {activate ? "active" : "inactive"}.
        {activate ? " It will become available for selection." : " Existing users will retain their records."}</p>
      <label className="vim-field"><span>Reason (coming soon)</span>
        <textarea className="form-control" rows={2} disabled placeholder="Reason (coming soon)" />
      </label>
    </div>
    <footer className="vim-dialog-footer">
      <button type="button" className="btn btn-outline-secondary" disabled={busy} onClick={onClose}>Cancel</button>
      <button type="button" disabled={busy} className={`btn ${activate ? "btn-primary" : "btn-danger"}`} onClick={onConfirm}>
        {busy ? "Processing..." : activate ? "Activate Department" : "Deactivate Department"}
      </button>
    </footer>
  </div>;
}

export default function MinistryDepartments() {
  const { user } = useOutletContext();
  const canManage = user?.permissions?.includes("departments.manage") === true;
  const [rows, setRows] = useState([]);
  const [pagination, setPagination] = useState({ currentPage: 1, lastPage: 1, total: 0, perPage: 20 });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = usePageSize('departments', 20);
  const [searchInput, setSearchInput] = useState("");
  const search = searchInput.trim(); // current-page filter, applied as you type
  const [statusFilter, setStatusFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useErrorDialogState("");
  const [revision, setRevision] = useState(0);
  const [modal, setModal] = useState(null);
  const [statusBusy, setStatusBusy] = useState(false);
  const [selected, setSelected] = useState(null);
  const [allDepartments, setAllDepartments] = useState([]);
  const [optionsError, setOptionsError] = useErrorDialogState("");

  const reload = useCallback(() => setRevision((value) => value + 1), []);
  const close = useCallback(() => { setModal(null); setSelected(null); }, []);

  useEffect(() => {
    if (!canManage) { setError("You do not have departments.manage permission."); return; }
    let alive = true;
    setLoading(true);
    setError("");
    fetchUiPage((serverPage, perPage) => listDepartments({ page: serverPage, perPage }), page, pageSize)
      .then((result) => { if (!alive) return; setRows(result.items); setPagination({ ...result, perPage: pageSize }); })
      .catch((err) => { if (alive) { setRows([]); setError(apiError(err)); } })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [canManage, page, pageSize, revision]);

  // The parent selector needs real records from all pages; no hardcoded options.
  useEffect(() => {
    if (!modal || (modal !== "add" && modal !== "edit")) return;
    let alive = true;
    setOptionsError("");
    setAllDepartments([]);
    async function fetchParents() {
      try {
        const first = await listDepartments({ page: 1 });
        const list = [...first.items];
        // Stop rather than presenting an incomplete dropdown as complete.
        if (first.lastPage > 30) throw new Error("Too many options to list. Please narrow your search.");
        for (let next = 2; next <= first.lastPage; next++) {
          const extra = await listDepartments({ page: next });
          list.push(...extra.items);
        }
        if (alive) setAllDepartments(list);
      } catch (err) { if (alive) { setAllDepartments([]); setOptionsError(apiError(err)); } }
    }
    fetchParents();
    return () => { alive = false; };
  }, [modal, revision]);

  const visible = useMemo(() => rows.filter((row) => {
    const text = `${row.name ?? ""} ${row.code ?? ""} ${row.description ?? ""}`.toLowerCase();
    return (!search || text.includes(search.toLowerCase()))
      && (!statusFilter || (active(row) ? "active" : "inactive") === statusFilter);
  }), [rows, search, statusFilter]);
  const partial = Number(pagination.total) > rows.length;
  const activeN = rows.filter(active).length;
  const usersN = rows.reduce((sum, row) => sum + (Number(row.users_count) || 0), 0);
  const maxUsers = Math.max(1, ...rows.map((row) => Number(row.users_count) || 0));
  const note = (text) => partial ? `${text} · this page` : text;

  function open(kind, row = null) { setSelected(row); setModal(kind); }

  async function confirmDepartmentStatus() {
    if (!selected || !canManage) return;
    const activate = !active(selected);
    setStatusBusy(true);
    try {
      const result = await setDepartmentActive(selected.id, activate);
      close(); reload();
      await Swal.fire({ icon: "success", title: `Department ${activate ? "activated" : "deactivated"}`,
        text: result.message || "Changes saved." });
    } catch (err) {
      await Swal.fire({ icon: "error", title: "Action failed", text: apiError(err) });
    } finally { setStatusBusy(false); }
  }

  return <main className="vim-institutions vim-departments adm-modern container-fluid px-0">
    <MuHeader initials="MIT" title="Ministry Departments" subtitle="Departments and units under the Ministry of Industry and Trade (MIT)">
      {canManage && <button className="mu-btn mu-btn-primary vim-add" type="button" onClick={() => open("add")}><Plus size={16} /> Add Department</button>}
    </MuHeader>
    <div className="mu-kpis">
      <MuKpi tone="blue" icon={<LayoutGrid size={18}/>} title="Departments" value={countText(pagination.total, "department", loading && !rows.length)} note="under MIT" arrow={false} onOpen={() => setStatusFilter("")}/>
      <MuKpi tone="green" icon={<CheckCircle2 size={18}/>} title="Active" value={countText(activeN, "department", loading && !rows.length)} note={note("in use")} arrow={false} onOpen={() => setStatusFilter("active")}/>
      <MuKpi tone="red" icon={<Power size={18}/>} title="Inactive" value={countText(rows.length - activeN, "department", loading && !rows.length)} note={note("not in use")} arrow={false} onOpen={() => setStatusFilter("inactive")}/>
      <MuKpi tone="indigo" icon={<UsersRound size={18}/>} title="Department users" value={countText(usersN, "user", loading && !rows.length)} note={note("DDO and staff")} arrow={false}/>
    </div>
    <section className="vim-list-card">
      <header className="adm-card-head"><span className="adm-dot" aria-hidden="true"/><h2>Departments &amp; units</h2><span className="mu-count">{loading ? "…" : pagination.total}</span>
        <span className="vim-ministry-identity" style={{ marginLeft: "auto" }}><Building2 size={16} /><span>Ministry of Industry and Trade <b>(MIT)</b></span></span></header>
      <form className="vim-filters vim-filter-form adm-toolbar" onSubmit={(event) => event.preventDefault()}>
        <MuTabs label="Status" value={statusFilter || "all"} onChange={(value) => setStatusFilter(value === "all" ? "" : value)}
          items={[{ key: "all", label: "All", count: rows.length }, { key: "active", label: "Active", count: activeN }, { key: "inactive", label: "Inactive", count: rows.length - activeN }]}/>
        <label className="vim-search-field"><Search size={17} />
          <input value={searchInput} onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Search department or code..." aria-label="Search departments" />
        </label>
        {(searchInput || statusFilter) && <button className="mu-btn" type="button" onClick={() => { setSearchInput(""); setStatusFilter(""); }}><RotateCcw size={14} /> Reset</button>}
      </form>
      
      <div className="vim-table-scroll"><table className="table vim-table mb-0">
        <thead><tr><th>#</th><th>Department</th><th>Code</th><th>Parent Department</th><th>Users</th><th>Status</th><th>Date Created</th><th aria-label="Actions"/></tr></thead>
        <tbody>
          {!loading && !error && visible.length === 0 && <tr><td className="vim-empty" colSpan={8}>No departments match the current page filters.</td></tr>}
          {visible.map((row, index) => <tr key={row.id}>
            <td>{(page - 1) * (pagination.perPage || rows.length || 1) + index + 1}</td>
            <td><strong>{present(row.name)}</strong></td>
            <td><span className="adm-code">{present(row.code)}</span></td>
            <td>{present(row.parent_department?.name || row.parent_department_id)}</td>
            <td><AdmBar value={row.users_count} max={maxUsers}/></td>
            <td><AdmStatus status={active(row) ? "active" : "inactive"}/></td>
            <td><AdmWhen value={row.created_at} empty="—"/></td>
            <td className="mu-actions"><RowActionsMenu label="Row actions">
              <button type="button" title="View Details" aria-label={`View ${row.name}`} onClick={() => open("view", row)}><Eye size={15} /></button>
              {canManage && <>
                <button type="button" title="Edit Department" aria-label={`Edit ${row.name}`} onClick={() => open("edit", row)}><Pencil size={15} /></button>
                <button type="button" className={active(row) ? "vim-action-danger" : "vim-action-success"}
                  title={active(row) ? "Deactivate" : "Activate"} aria-label={`${active(row) ? "Deactivate" : "Activate"} ${row.name}`}
                  onClick={() => open("status", row)}><Power size={15} /></button>
              </>}
            </RowActionsMenu></td>
          </tr>)}
        </tbody>
      </table><TableLoader active={loading} /></div>
      <div className="vim-pagination-bar"><span>{loading && !rows.length ? <span className="vw-skeleton-bar" style={{display:"inline-block",width:160,height:11}}/> : `Page ${page} of ${Math.max(1, pagination.lastPage)} · ${pagination.total} departments`}</span>
        <div className="vim-pagination-controls">
          <PageSizeSelect value={pageSize} onChange={(value) => { setPageSize(value); setPage(1); }} />
          <button type="button" aria-label="Previous page" disabled={loading || page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft size={16} /></button>
          <button type="button" className="active" aria-current="page">{page}</button>
          <button type="button" aria-label="Next page" disabled={loading || page >= pagination.lastPage} onClick={() => setPage(page + 1)}><ChevronRight size={16} /></button>
        </div>
      </div>
    </section>
    {modal && <DepartmentDialog title={{ view: "Department Details", add: "Add New Department", edit: "Edit Department", status: selected && `${active(selected) ? "Deactivate" : "Activate"} Department` }[modal]}
      onClose={close}>
      {modal === "view" && selected && <DepartmentDetails record={selected} canManage={canManage} onClose={close}
        onEdit={() => setModal("edit")} />}
      {modal === "status" && selected && <DepartmentStatusDialog record={selected} busy={statusBusy}
        onClose={close} onConfirm={confirmDepartmentStatus} />}
      {(modal === "add" || modal === "edit") && <DepartmentForm key={`${modal}-${selected?.id || "new"}`}
        initial={modal === "edit" ? selected : null} options={allDepartments}
        optionsError={optionsError} onClose={close} onSaved={async () => { reload(); }} />}
    </DepartmentDialog>}
  </main>;
}
