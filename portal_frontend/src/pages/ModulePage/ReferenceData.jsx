import {useErrorDialogState} from '../../utils/userFacingErrors.js';
/**
 * FILE: src/pages/ModulePage/ReferenceData.jsx
 * ROUTE: /dashboard/reference-data
 * NAV: DashboardLayout -> Dataset Management -> Reference Data -> RouteAccess.
 * PERMISSION: All active users may read the reference-data API; only users with
 *   reference_data.manage (seeded MOA, IA) may create/edit/deactivate/reactivate.
 * FLOW: ReferenceData -> API/referenceData.jsx -> API/axios.jsx -> remote Laravel.
 * CONTRACT: Reference Types and Reference Values are paginated independently.
 * IMPORTANT: Reference IDs/names come ONLY from backend. No fabricated lists.
 * DELETE is deactivation, never permanent deletion. Show Laravel messages/errors.
 * DESIGN: approved VIWANDA_REFERENCE_MANAGEMENT_UIUX_REVIEW.zip: Types/Values tabs,
 *   bordered tables, Add/Edit/View dialogs and explicit Activate/Deactivate action.
 * STYLING: existing institutions.css + referenceData.css; no sidebar/topbar redesign.
 */
import { TableLoader } from "../../components/common/LoadingState";
import { useCallback, useEffect, useMemo, useState } from "react";
import RowActionsMenu from "../../components/common/RowActionsMenu";
import { createPortal } from "react-dom";
import { useOutletContext } from "react-router-dom";
import Swal from "../../utils/portalAlerts";
import {
  ArrowLeft, ChevronLeft, ChevronRight, Database, Eye, Pencil,
  Plus, Power, RotateCcw, Search, X,
} from "lucide-react";
import {
  createReferenceType, updateReferenceType, deactivateReferenceType,
  reactivateReferenceType, listReferenceTypes, getReferenceType,
  createReferenceValue, updateReferenceValue, deactivateReferenceValue,
  reactivateReferenceValue, listReferenceValues, getReferenceValue,
  getReferenceValueOptions,
} from "../../API/referenceData";
import { apiError, validationErrors } from "../../API/resourceHelpers";
import "../Admin/institutions.css";
import "./referenceData.css";
import "../../styles/admin-modern.css";
import {MuHeader, MuKpi, MuTabs} from "../../components/modern/ModernUI.jsx";
import {AdmStatus} from "../../components/modern/AdminParts.jsx";
import {countText} from "../../utils/adminDisplay.js";
import {CheckCircle2, ListTree, PauseCircle, Rows3} from "lucide-react";
import PageSizeSelect from '../../components/common/PageSizeSelect.jsx';
import {usePageSize} from '../../components/common/usePageSize.js';
import {fetchUiPage} from '../../utils/pagedFetch.js';

const blankType = () => ({
  dataTypeCode: "", dataTypeNameEn: "", dataTypeNameSw: "",
  descriptionEn: "", descriptionSw: "", status: "active",
});
const blankValue = () => ({
  dataValueCode: "", dataValueNameEn: "", dataValueNameSw: "",
  parentId: "", value: "", effectiveFrom: "", effectiveTo: "", status: "active",
});
const toTypeForm = (item) => ({
  dataTypeCode: item.data_type_code ?? "",
  dataTypeNameEn: item.data_type_name_en ?? "",
  dataTypeNameSw: item.data_type_name_sw ?? "",
  descriptionEn: item.description_en ?? "",
  descriptionSw: item.description_sw ?? "",
  status: item.status ?? "active",
});
const toValueForm = (item) => ({
  dataValueCode: item.data_value_code ?? "",
  dataValueNameEn: item.data_value_name_en ?? "",
  dataValueNameSw: item.data_value_name_sw ?? "",
  parentId: item.parent_id == null ? "" : String(item.parent_id),
  value: item.value ?? "",
  effectiveFrom: item.effective_from ?? "",
  effectiveTo: item.effective_to ?? "",
  status: item.status ?? "active",
});
const printable = (value) => value == null || value === "" ? "—" : String(value);

function Dialog({ title, onClose, children }) {
  useEffect(() => {
    function onEscape(event) {
      if (event.key === "Escape" && !document.querySelector(".swal2-container")) onClose();
    }
    document.addEventListener("keydown", onEscape);
    return () => document.removeEventListener("keydown", onEscape);
  }, [onClose]);
  return createPortal(
    <div className="vim-dialog-backdrop" onMouseDown={(e) => {
      if (e.target === e.currentTarget) onClose();
    }}>
      <section className="vim-dialog vim-dialog-wide vim-ref-dialog" role="dialog"
        aria-modal="true" aria-label={title}>
        <header className="vim-dialog-header">
          <h2>{title}</h2>
          <button type="button" className="vim-icon-button" onClick={onClose} aria-label="Close dialog">
            <X size={18} />
          </button>
        </header>
        {children}
      </section>
    </div>, document.body
  );
}

function Field({ label, name, form, onChange, errors, required = false, type = "text", children }) {
  return (
    <label className="vim-field">
      <span>{label}{required ? <b> *</b> : null}</span>
      {children ?? <input type={type} className={`form-control ${errors[name] ? "is-invalid" : ""}`}
        value={form[name] ?? ""} onChange={(e) => onChange(name, e.target.value)} />}
      {errors[name] && <small className="invalid-feedback d-block">{errors[name]}</small>}
    </label>
  );
}

function ReferenceForm({ kind, initial, typeId, onCancel, onSaved }) {
  const isType = kind === "type";
  const editing = Boolean(initial?.id);
  const [form, setForm] = useState(() => isType
    ? (editing ? toTypeForm(initial) : blankType())
    : (editing ? toValueForm(initial) : blankValue()));
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [parentOptions, setParentOptions] = useState([]);
  const [parentError, setParentError] = useErrorDialogState("");
  const [parentBusy, setParentBusy] = useState(false);
  const change = (key, value) => {
    setForm((previous) => ({ ...previous, [key]: value }));
    setErrors((previous) => ({ ...previous, [key]: "" }));
  };

  useEffect(() => {
    if (isType || !typeId) return;
    let active = true;
    setParentBusy(true);
    getReferenceValueOptions(typeId)
      .then((options) => { if (active) setParentOptions(options); })
      .catch((error) => { if (active) setParentError(apiError(error)); })
      .finally(() => { if (active) setParentBusy(false); });
    return () => { active = false; };
  }, [isType, typeId]);

  async function save(event) {
    event.preventDefault();
    const fields = {};
    const code = isType ? "dataTypeCode" : "dataValueCode";
    const name = isType ? "dataTypeNameEn" : "dataValueNameEn";
    if (!form[code].trim()) fields[code] = "Code is required.";
    if (!form[name].trim()) fields[name] = "English name is required.";
    if (!isType && form.effectiveTo && form.effectiveFrom && form.effectiveTo < form.effectiveFrom) {
      fields.effectiveTo = "Effective To cannot precede Effective From.";
    }
    if (!isType && editing && String(initial.id) === String(form.parentId)) {
      fields.parentId = "A reference value cannot be its own parent.";
    }
    setErrors(fields);
    if (Object.keys(fields).length > 0) return;
    setSaving(true);
    try {
      const result = isType
        ? (editing ? await updateReferenceType(initial.id, form) : await createReferenceType(form))
        : (editing ? await updateReferenceValue(typeId, initial.id, form) : await createReferenceValue(typeId, form));
      await onSaved();
      await Swal.fire({ icon: "success", title: editing ? "Updated" : "Created",
        text: result.message || "Saved successfully." });
    } catch (error) {
      setErrors({});
      await Swal.fire({ icon: "error", title: "Request failed", text: apiError(error) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} noValidate>
      <div className="vim-ref-form-body">
        <h3 className="vim-ref-section-heading">
          {isType ? "Reference Type Information" : "Reference Value Information"}
        </h3>
        <div className={`vim-ref-form-grid ${isType ? "vim-ref-type-form" : "vim-ref-value-form"}`}>
          <Field label={isType ? "Type Code" : "Value Code"} name={isType ? "dataTypeCode" : "dataValueCode"}
            form={form} onChange={change} errors={errors} required />
          <Field label="Name (English)" name={isType ? "dataTypeNameEn" : "dataValueNameEn"}
            form={form} onChange={change} errors={errors} required />
          <Field label="Name (Swahili)" name={isType ? "dataTypeNameSw" : "dataValueNameSw"}
            form={form} onChange={change} errors={errors} />
          <label className="vim-field">
            <span>Status</span>
            <select className="form-select" value={form.status}
              onChange={(e) => change("status", e.target.value)}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </label>
          {isType ? (
            <>
              <label className="vim-field vim-ref-full">
                <span>Description (English)</span>
                <textarea className="form-control" rows={2} value={form.descriptionEn}
                  onChange={(e) => change("descriptionEn", e.target.value)} />
              </label>
              <label className="vim-field vim-ref-full">
                <span>Description (Swahili)</span>
                <textarea className="form-control" rows={2} value={form.descriptionSw}
                  onChange={(e) => change("descriptionSw", e.target.value)} />
              </label>
            </>
          ) : (
            <>
              <label className="vim-field">
                <span>Parent Value (Optional)</span>
                <select className={`form-select ${errors.parentId ? "is-invalid" : ""}`}
                  value={form.parentId} disabled={parentBusy || Boolean(parentError)}
                  onChange={(e) => change("parentId", e.target.value)}>
                  <option value="">None — Top Level</option>
                  {parentOptions.filter((option) => option.id !== initial?.id).map((option) => (
                    <option value={option.id} key={option.id}>
                      {option.data_value_name_en} ({option.data_value_code})
                    </option>
                  ))}
                </select>
                {parentBusy && <small>Loading options...</small>}
                
                {errors.parentId && <small className="text-danger">{errors.parentId}</small>}
              </label>
              <Field label="Custom Value (Optional)" name="value"
                form={form} onChange={change} errors={errors} />
              <Field label="Effective From" name="effectiveFrom" type="date"
                form={form} onChange={change} errors={errors} />
              <Field label="Effective To" name="effectiveTo" type="date"
                form={form} onChange={change} errors={errors} />
            </>
          )}
        </div>
        {!isType && (
          <p className="vim-ref-help">
            Parent ID must refer to another value within this reference type. Dates are optional.
            Values with existing usage are retained when deactivated.
          </p>
        )}
      </div>
      <footer className="vim-dialog-footer">
        <button type="button" className="btn btn-outline-secondary" disabled={saving}
          onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? "Saving..." : editing ? "Save Changes" : `Create ${isType ? "Type" : "Value"}`}
        </button>
      </footer>
    </form>
  );
}

function Details({ kind, record, onClose, onEdit, canManage }) {
  const fields = kind === "type" ? [
    ["Code", record.data_type_code], ["English Name", record.data_type_name_en],
    ["Swahili Name", record.data_type_name_sw],
    ["Description (English)", record.description_en],
    ["Description (Swahili)", record.description_sw], ["Status", record.status],
  ] : [
    ["Code", record.data_value_code], ["English Name", record.data_value_name_en],
    ["Swahili Name", record.data_value_name_sw],
    ["Parent Value ID", record.parent_id], ["Custom Value", record.value],
    ["Effective From", record.effective_from], ["Effective To", record.effective_to],
    ["Status", record.status],
  ];
  return (
    <>
      <div className="vim-ref-form-body">
        <div className="vim-details-list">
          {fields.map(([label, value]) => (
            <div key={label} className="vim-detail-row">
              <span>{label}</span><strong>{printable(value)}</strong>
            </div>
          ))}
        </div>
      </div>
      <footer className="vim-dialog-footer">
        <button type="button" className="btn btn-outline-secondary" onClick={onClose}>Close</button>
        {canManage && <button type="button" className="btn btn-primary" onClick={onEdit}>
          <Pencil size={15} /> Edit
        </button>}
      </footer>
    </>
  );
}

function Pager({ page, total, perPage, onChange, loading, onPerPage }) {
  const last = Math.max(1, Math.ceil(total / perPage));
  return (
    <footer className="vim-ref-pager">
      <span>Page {page} of {last} · {total} record{total === 1 ? "" : "s"}</span>
      <div className="vim-ref-pager-buttons">
        {onPerPage && <PageSizeSelect value={perPage} disabled={loading} onChange={(value) => { onPerPage(value); onChange(1); }} />}
        <button type="button" className="btn btn-sm btn-outline-secondary"
          disabled={loading || page <= 1} onClick={() => onChange(page - 1)} aria-label="Previous page">
          <ChevronLeft size={16} />
        </button>
        <button type="button" className="btn btn-sm btn-outline-secondary"
          disabled={loading || page >= last} onClick={() => onChange(page + 1)} aria-label="Next page">
          <ChevronRight size={16} />
        </button>
      </div>
    </footer>
  );
}

export default function ReferenceData() {
  const { user } = useOutletContext();
  const canManage = user?.permissions?.includes("reference_data.manage") === true;
  // UI tab selection is presentation state only; all records still come from Laravel.
  const [selectedType, setSelectedType] = useState(null);
  const [activeTab, setActiveTab] = useState("types");
  const [types, setTypes] = useState([]);
  const [values, setValues] = useState([]);
  const [typePage, setTypePage] = useState(1);
  const [valuePage, setValuePage] = useState(1);
  const [PAGE_SIZE, setPageSize] = usePageSize('reference-data', 20);
  const [typeTotal, setTypeTotal] = useState(0);
  const [valueTotal, setValueTotal] = useState(0);
  const [typeStatus, setTypeStatus] = useState("");
  const [valueStatus, setValueStatus] = useState("");
  const [search, setSearch] = useState("");
  const [valueSearch, setValueSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useErrorDialogState("");
  const [revision, setRevision] = useState(0);
  const [modal, setModal] = useState(null);
  const [current, setCurrent] = useState(null);
  const [detailBusy, setDetailBusy] = useState(false);

  const typeId = selectedType?.id ?? null;
  const showingValues = activeTab === "values" && typeId !== null;
  const choosingValueType = activeTab === "values" && typeId === null;
  const currentPage = showingValues ? valuePage : typePage;
  const recordList = showingValues ? values : types;
  const total = showingValues ? valueTotal : typeTotal;
  const query = showingValues ? valueSearch : search;
  const displayList = useMemo(() => recordList.filter((record) => {
    const text = showingValues
      ? [record.data_value_code, record.data_value_name_en, record.data_value_name_sw]
      : [record.data_type_code, record.data_type_name_en, record.data_type_name_sw];
    return text.filter(Boolean).join(" ").toLowerCase().includes(query.toLowerCase());
  }), [query, recordList, showingValues]);

  const reload = useCallback(() => setRevision((value) => value + 1), []);
  const currentStatus = showingValues ? valueStatus : typeStatus;
  const activeCount = recordList.filter((record) => record.status === "active").length;
  const inactiveCount = recordList.filter((record) => record.status === "inactive").length;
  const typeCodes = types.slice(0, 2).map((record) => record.data_type_code).filter(Boolean).join(", ")
    + (types.length > 2 ? "…" : "");
  const setStatusFilter = (value) => {
    if (showingValues) { setValueStatus(value); setValuePage(1); }
    else { setTypeStatus(value); setTypePage(1); }
  };

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");
    const request = typeId !== null
      ? fetchUiPage((serverPage, perPage) => listReferenceValues(typeId, { page: serverPage, perPage, status: valueStatus }), valuePage, PAGE_SIZE)
      : fetchUiPage((serverPage, perPage) => listReferenceTypes({ page: serverPage, perPage, status: typeStatus }), typePage, PAGE_SIZE);
    request.then((result) => {
      if (!alive) return;
      if (typeId !== null) {
        setValues(result.items);
        setValueTotal(result.total);
      } else {
        setTypes(result.items);
        setTypeTotal(result.total);
      }
    }).catch((err) => {
      if (alive) {
        setError(apiError(err));
        if (typeId !== null) { setValues([]); setValueTotal(0); }
        else { setTypes([]); setTypeTotal(0); }
      }
    }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [typeId, typePage, valuePage, PAGE_SIZE, typeStatus, valueStatus, revision]);

  const openValueList = async (item) => {
    setSelectedType(item);
    setActiveTab("values");
    setValuePage(1);
    setValueStatus("");
    setValueSearch("");
    setModal(null);
  };
  const backToTypes = () => {
    setSelectedType(null);
    setActiveTab("types");
    setValuePage(1);
    setError("");
    setModal(null);
  };
  const changeTab = (tab) => {
    setModal(null);
    setError("");
    setActiveTab(tab);
    if (tab === "types") setSelectedType(null);
  };
  const openRecord = async (kind, item = null) => {
    if (!item) { setCurrent(null); setModal(kind); return; }
    setDetailBusy(true);
    try {
      const fresh = showingValues
        ? await getReferenceValue(typeId, item.id)
        : await getReferenceType(item.id);
      setCurrent(fresh);
      setModal(kind);
    } catch (err) {
      await Swal.fire({ icon: "error", title: "Unable to load details", text: apiError(err) });
    } finally { setDetailBusy(false); }
  };
  const changeStatus = async (record) => {
    if (!canManage) return;
    const activate = record.status !== "active";
    const answer = await Swal.fire({
      icon: activate ? "question" : "warning",
      title: `${activate ? "Activate" : "Deactivate"} reference ${showingValues ? "value" : "type"}?`,
      text: showingValues ? record.data_value_name_en : record.data_type_name_en,
      showCancelButton: true, confirmButtonText: activate ? "Activate" : "Deactivate",
    });
    if (!answer.isConfirmed) return;
    try {
      const result = showingValues
        ? activate ? await reactivateReferenceValue(typeId, record.id)
          : await deactivateReferenceValue(typeId, record.id)
        : activate ? await reactivateReferenceType(record.id)
          : await deactivateReferenceType(record.id);
      reload();
      await Swal.fire({ icon: "success", title: activate ? "Activated" : "Deactivated",
        text: result.message || "Saved successfully." });
    } catch (err) {
      await Swal.fire({ icon: "error", title: "Request failed", text: apiError(err) });
    }
  };

  return (
    <main className="vim-institutions vim-ref-page adm-modern container-fluid px-0">
      <MuHeader initials="▤" title="Reference Data"
        subtitle="Reference types and values used across VIWANDA datasets and indicators">
        {canManage && !choosingValueType && (
          <button className="mu-btn mu-btn-primary vim-add" type="button"
            onClick={() => openRecord(showingValues ? "value-create" : "type-create")}>
            <Plus size={16} /> {showingValues ? "Add Reference Value" : "Add Reference Type"}
          </button>
        )}
      </MuHeader>

      <div className="mu-kpis">
        <MuKpi tone="blue" icon={<ListTree size={18}/>} title="Reference types"
          value={countText(typeStatus ? null : typeTotal, "type", loading && !typeTotal)}
          note={typeStatus ? "open All to count" : typeCodes || "reference types"} arrow={false}
          onOpen={() => { changeTab("types"); setTypeStatus(""); setTypePage(1); }}/>
        <MuKpi tone="indigo" icon={<Rows3 size={18}/>} title="Reference values"
          value={typeId !== null && !valueStatus ? countText(valueTotal, "value", loading) : "—"}
          note={typeId !== null ? `in ${selectedType?.data_type_code || "this type"}` : "open a type to count"} arrow={false}/>
        <MuKpi tone="green" icon={<CheckCircle2 size={18}/>} title="Active"
          value={countText(loading ? null : activeCount, showingValues ? "value" : "type", loading)}
          note={`in use · this page`} arrow={false} onOpen={() => setStatusFilter("active")}/>
        <MuKpi tone="red" icon={<PauseCircle size={18}/>} title="Inactive"
          value={countText(loading ? null : inactiveCount, showingValues ? "value" : "type", loading)}
          note={`hidden from forms · this page`} arrow={false} onOpen={() => setStatusFilter("inactive")}/>
      </div>

      <section className="vim-list-card adm-card">
        <nav className="vim-ref-tabs adm-seg" role="tablist" aria-label="Reference Data tabs">
          <button type="button" role="tab" aria-selected={activeTab === "types"}
            className={activeTab === "types" ? "active" : ""} onClick={() => changeTab("types")}>Reference Types</button>
          <button type="button" role="tab" aria-selected={activeTab === "values"}
            className={activeTab === "values" ? "active" : ""} onClick={() => changeTab("values")}>Reference Values</button>
        </nav>
        {choosingValueType && <div className="vim-ref-choose-banner" role="status">
          <Database size={18}/>
          <span><strong>Select a Reference Type.</strong> Choose a row below and click Manage Values to view its values.</span>
        </div>}
        {showingValues && (
          <div className="vim-ref-navigation">
            <button type="button" className="mu-btn" onClick={backToTypes}>
              <ArrowLeft size={15} /> Back to Reference Types
            </button>
            <div className="vim-ref-navigation-type">
              <Database size={17} /> <strong>{selectedType.data_type_name_en}</strong>
              <span className="adm-code">{selectedType.data_type_code}</span>
            </div>
          </div>
        )}
        <header className="adm-card-head"><span className="adm-dot" aria-hidden="true"/>
          <h2>{showingValues ? `Reference values · ${selectedType?.data_type_code}` : choosingValueType ? "Select reference type" : "Reference types"}</h2>
          <span className="mu-count">{loading ? "…" : total}</span></header>
        <div className="vim-filters">
          <div className="vim-ref-filters adm-toolbar">
            <MuTabs label="Filter status" value={currentStatus || "all"}
              onChange={(value) => setStatusFilter(value === "all" ? "" : value)}
              items={[{key: "all", label: "All"}, {key: "active", label: "Active"}, {key: "inactive", label: "Inactive"}]}/>
            <label className="vim-search-field">
              <Search size={16} />
              <input type="search" aria-label="Search current page"
                placeholder="Search code or name…"
                value={query} onChange={(e) => showingValues
                  ? setValueSearch(e.target.value) : setSearch(e.target.value)} />
            </label>
            <button type="button" className="mu-btn adm-icon-btn" title="Refresh" aria-label="Refresh"
              onClick={reload} disabled={loading}><RotateCcw size={15} /></button>
          </div>
        </div>
        <p className="adm-muted-note">Search filters the current page only.</p>

        <div className="vim-table-scroll">
          <table className="table vim-table mb-0 vim-ref-table">
            <thead>
              <tr>
                <th scope="col">#</th>
                <th scope="col">Code</th>
                <th scope="col">Name</th>
                {showingValues ? <>
                  <th scope="col">Parent</th>
                  <th scope="col">Effective Dates</th>
                </> : <th scope="col">Description</th>}
                <th scope="col">Status</th>
                <th scope="col" aria-label="Actions"></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={showingValues ? 7 : 6} className="text-center py-4">
                  Loading reference data...</td></tr>
              ) : displayList.length === 0 ? (
                <tr><td colSpan={showingValues ? 7 : 6} className="text-center py-4">
                  {error ? "Unable to load records." : "No reference records found."}</td></tr>
              ) : displayList.map((item, index) => (
                <tr key={item.id}>
                  <td>{(currentPage - 1) * PAGE_SIZE + index + 1}</td>
                  <td><span className="adm-code">{showingValues ? item.data_value_code : item.data_type_code}</span></td>
                  <td><strong>{showingValues ? item.data_value_name_en : item.data_type_name_en}</strong></td>
                  {showingValues ? <>
                    <td>{item.parent_id == null ? "Top Level" : `#${item.parent_id}`}</td>
                    <td>{printable(item.effective_from)} → {printable(item.effective_to)}</td>
                  </> : <td>{printable(item.description_en)}</td>}
                  <td><AdmStatus status={item.status} /></td>
                  <td>
                    <RowActionsMenu label="Row actions">
                      <button type="button" title="View details" aria-label="View details"
                        disabled={detailBusy} onClick={() => openRecord("details", item)}>
                        <Eye size={16} /></button>
                      {!showingValues && (
                        <button type="button" title="Manage values" aria-label="Manage values"
                          onClick={() => openValueList(item)}><Database size={16} /></button>
                      )}
                      {canManage && <>
                        <button type="button" title="Edit" aria-label="Edit" disabled={detailBusy}
                          onClick={() => openRecord("edit", item)}><Pencil size={16} /></button>
                        <button type="button" title={item.status === "active" ? "Deactivate" : "Activate"}
                          aria-label={item.status === "active" ? "Deactivate" : "Activate"}
                          onClick={() => changeStatus(item)}>
                          {item.status === "active" ? <Power size={16} /> : <RotateCcw size={16} />}
                        </button>
                      </>}
                    </RowActionsMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table><TableLoader active={loading} />
        </div>
        <Pager page={currentPage} total={total} perPage={PAGE_SIZE} loading={loading} onPerPage={setPageSize}
          onChange={showingValues ? setValuePage : setTypePage} />
      </section>

      {modal && (
        <Dialog title={modal === "details" ? "Reference Details"
          : modal.endsWith("create") ? `Add ${showingValues ? "Reference Value" : "Reference Type"}`
            : `Edit ${showingValues ? "Reference Value" : "Reference Type"}`}
          onClose={() => setModal(null)}>
          {modal === "details" && current ? (
            <Details kind={showingValues ? "value" : "type"} record={current}
              onClose={() => setModal(null)} canManage={canManage}
              onEdit={() => setModal("edit")} />
          ) : (
            <ReferenceForm key={`${modal}-${current?.id ?? "new"}-${typeId ?? "types"}`}
              kind={showingValues ? "value" : "type"}
              typeId={typeId} initial={modal.endsWith("create") ? null : current}
              onCancel={() => setModal(null)}
              onSaved={async () => { setModal(null); reload(); }} />
          )}
        </Dialog>
      )}
    </main>
  );
}
