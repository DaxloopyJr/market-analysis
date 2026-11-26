import {useErrorDialogState} from '../../utils/userFacingErrors.js';
/**
 * FILE PATH: src/pages/Admin/Institutions.jsx
 * PAGE ROUTE: /dashboard/administration/institutions
 * NAVIGATION: Login -> ProtectedRoute -> DashboardLayout -> RouteAccess -> Institutions.
 * API FLOW: Institutions.jsx -> src/API/institution.jsx -> src/API/axios.jsx
 *   -> GET/POST /api/v1/institutions; PUT /api/v1/institutions/{id} -> PostgreSQL.
 * PERMISSIONS: MOA institutions.manage; IA institutions.view.own (Laravel enforces scope).
 * DATA: Laravel API only. No fake records, preview saves or local persistence.
 * IMPORTANT: No GET /institutions/{id} in supplied specification; details open
 *   from the actual GET list record. Only documented fields are editable.
 */
import { TableLoader } from "../../components/common/LoadingState";
import { useEffect, useState } from "react";
import RowActionsMenu from "../../components/common/RowActionsMenu";
import { createPortal } from "react-dom";
import { useOutletContext } from "react-router-dom";
import Swal from "../../utils/portalAlerts";
import {
  Building2, ChevronLeft, ChevronRight, Eye, Pencil, ImagePlus,
  Plus, Power, RotateCcw, Search, X,
} from "lucide-react";
import {
  listInstitutions, createInstitution, updateInstitution, setInstitutionActive,
} from "../../API/institution";
import { apiError, validationErrors } from "../../API/resourceHelpers";
import {institutionLogoDimensionError, institutionLogoUrl, institutionLogoValidation} from "../../utils/institutionLogo";

/** Reads the picture size in the browser so the 2000 x 2000 px rule is checked before upload. */
function imageSize(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => { resolve({width: image.naturalWidth, height: image.naturalHeight}); URL.revokeObjectURL(url); };
    image.onerror = () => { resolve(null); URL.revokeObjectURL(url); };
    image.src = url;
  });
}
import {showUserFacingError} from "../../utils/userFacingErrors";
import "./institutions.css";
import {MuBadge, MuHeader, MuKpi, MuTabs} from "../../components/modern/ModernUI.jsx";
import {AdmStatus} from "../../components/modern/AdminParts.jsx";
import {countText} from "../../utils/adminDisplay.js";
import {useDebouncedValue} from "../../hooks/useDebouncedValue.js";
import {ArrowLeftRight, CheckCircle2, Zap} from "lucide-react";
import "../../styles/admin-modern.css";
import PageSizeSelect from '../../components/common/PageSizeSelect.jsx';
import {usePageSize} from '../../components/common/usePageSize.js';
import {fetchUiPage} from '../../utils/pagedFetch.js';

const TYPES = ["institution", "agency", "commission"];
const CHANNELS = ["portal", "api"];
const blank = {
  name: "", code: "", short_name: "", type: "institution",
  description: "", reporting_channel: "portal",
};

const ownsPermission = (user, name) => user?.permissions?.includes(name) === true;
const showValue = (value) => value === null || value === undefined || value === "" ? "—" : String(value);

function Dialog({ title, onClose, children }) {
  useEffect(() => {
    const handle = (event) => {
      if (event.key === "Escape" && !document.querySelector(".swal2-container")) onClose();
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, [onClose]);

  return createPortal(
    <div
      className="vim-dialog-backdrop"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <section className="vim-dialog vim-dialog-wide" role="dialog" aria-modal="true" aria-label={title}>
        <header className="vim-dialog-header">
          <h2>{title}</h2>
          <button type="button" className="vim-icon-button" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </header>
        {children}
      </section>
    </div>,
    document.body
  );
}

function Details({ record, canManage, onClose, onEdit }) {
  const fields = [
    ["Institution Name", record.name],
    ["Code", record.code],
    ["Short Name", record.short_name],
    ["Type", record.type],
    ["Reporting Channel", record.reporting_channel],
    ["Status", record.status],
    ["Number of Users", record.users_count],
    ["Description", record.description],
    ["ID", record.id],
  ];
  return (
    <>
      <div className="vim-detail-heading">
        <span className="vim-detail-symbol vim-logo-detail">{institutionLogoUrl(record)
          ? <img src={institutionLogoUrl(record)} alt={`${record.name} logo`} />
          : <Building2 size={26} />}</span>
        <div><strong>{record.name}</strong><small>{record.code}</small></div>
        <span className={`vim-status vim-status-${record.status}`}>{record.status}</span>
      </div>
      <div className="vim-details-list">
        {fields.map(([label, value]) => (
          <div className="vim-detail-row" key={label}>
            <span>{label}</span><strong>{showValue(value)}</strong>
          </div>
        ))}
      </div>
      <footer className="vim-dialog-footer">
        <button className="btn btn-outline-secondary" type="button" onClick={onClose}>Close</button>
        {canManage && (
          <button type="button" className="btn btn-primary" onClick={onEdit}>
            <Pencil size={15} /> Edit Institution
          </button>
        )}
      </footer>
    </>
  );
}

function FormField({ title, name, value, error, onChange, required = false }) {
  return (
    <label className="vim-field">
      <span>{title}{required && <b> *</b>}</span>
      <input
        className={`form-control ${error ? "is-invalid" : ""}`}
        value={value || ""}
        required={required}
        onChange={(event) => onChange(name, event.target.value)}
      />
      {error && <small className="invalid-feedback d-block">{error}</small>}
    </label>
  );
}

function InstitutionForm({ initial, onClose, onSaved }) {
  const editing = Boolean(initial?.id);
  const [form, setForm] = useState({ ...blank, ...initial });
  const [logoFile, setLogoFile] = useState(null);
  const [logoError, setLogoError] = useState('');
  const [logoPreview, setLogoPreview] = useState('');
  const [removeLogo, setRemoveLogo] = useState(false);
  const savedLogo = removeLogo ? '' : institutionLogoUrl(initial);
  useEffect(() => {
    if (!logoFile) { setLogoPreview(''); return undefined; }
    const objectUrl = URL.createObjectURL(logoFile);
    setLogoPreview(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [logoFile]);
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const sections = ["Basic Information", "Reporting & Description", "Review & Save"];
  const change = (name, value) => {
    setForm((previous) => ({ ...previous, [name]: value }));
    setErrors((previous) => ({ ...previous, [name]: "" }));
  };

  async function save() {
    const validation = {};
    if (!form.name.trim()) validation.name = "Institution name is required.";
    if (!form.code.trim()) validation.code = "Code is required.";
    if (!TYPES.includes(form.type)) validation.type = "Select an approved institution type.";
    if (!CHANNELS.includes(form.reporting_channel)) validation.reporting_channel = "Select a reporting channel.";
    if (logoError) validation.logo = logoError;
    else if (logoFile && institutionLogoValidation(logoFile)) validation.logo = institutionLogoValidation(logoFile);
    setErrors(validation);
    if (Object.keys(validation).length) { setStep(0); return; }

    if (step < sections.length - 1) { setStep((current) => current + 1); return; }
    const confirmed = await Swal.fire({
      title: editing ? "Update institution?" : "Create institution?",
      text: editing ? "Save the changes to this institution?" : "Save this institution to the portal?",
      icon: "question", showCancelButton: true,
      confirmButtonText: editing ? "Update" : "Save",
    });
    if (!confirmed.isConfirmed) return;
    setBusy(true);
    try {
      const result = editing
        ? await updateInstitution(initial.id, {...form,logoFile,removeLogo:removeLogo&&!logoFile})
        : await createInstitution({...form,logoFile});
      onClose();
      await onSaved();
      if (result.pictureError) {
        // Details were saved; only the picture step failed.
        await showUserFacingError(result.pictureError, editing ? "Institution updated, picture not saved" : "Institution created, picture not saved");
      } else {
        await Swal.fire({
          icon: "success", title: editing ? "Institution updated" : "Institution created",
          text: result.message || "The server completed the request successfully.",
        });
      }
    } catch (error) {
      setErrors({});
      await showUserFacingError(error, "Institution could not be saved");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="vim-wizard">
      <aside className="vim-steps">
        {sections.map((section, i) => (
          <button
            type="button" key={section} disabled={i > step}
            className={step === i ? "active" : ""}
            onClick={() => { setStep(i); }}
          >
            <span>{i + 1}</span> {section}
          </button>
        ))}
      </aside>
      <div className="vim-wizard-main">
        {step === 0 && (
          <div className="vim-form-grid">
            <FormField title="Institution Name" name="name" value={form.name} onChange={change} required error={errors.name} />
            <FormField title="Code" name="code" value={form.code} onChange={change} required error={errors.code} />
            <FormField title="Short Name" name="short_name" value={form.short_name} onChange={change} error={errors.short_name} />
            <div className="vim-field vim-logo-field vim-field-full">
              <span>Institution Logo</span>
              <div className="vim-logo-upload">
                <div className="vim-logo-preview">{logoPreview || savedLogo
                  ? <img src={logoPreview || savedLogo} alt="Institution logo preview" />
                  : <Building2 size={27} aria-hidden="true" />}</div>
                <div className="vim-logo-input-wrap">
                  <label htmlFor="vim-institution-logo" className="btn btn-outline-primary btn-sm">
                    <ImagePlus size={15} /> {logoFile ? 'Change selected logo' : savedLogo ? 'Replace logo' : 'Choose logo'}
                  </label>
                  <input id="vim-institution-logo" type="file" accept="image/png,image/jpeg,image/webp"
                    onChange={async (event) => {
                      const file = event.target.files?.[0] ?? null;
                      event.target.value = '';
                      let message = institutionLogoValidation(file);
                      if (!message && file) {
                        const size = await imageSize(file);
                        message = size ? institutionLogoDimensionError(size.width, size.height) : 'This picture could not be read. Choose another JPG, PNG or WebP file.';
                      }
                      setLogoError(message);
                      setErrors(current => ({...current,logo:message}));
                      setLogoFile(message ? null : file);
                      if (!message && file) setRemoveLogo(false);
                    }} />
                  {(logoFile || (editing && savedLogo)) && (
                    <button type="button" className="btn btn-link btn-sm text-danger p-0 vim-logo-remove"
                      onClick={() => { setLogoFile(null); setLogoError(''); setErrors(current => ({...current,logo:''})); setRemoveLogo(Boolean(institutionLogoUrl(initial))); }}>
                      Remove picture
                    </button>
                  )}
                  {removeLogo && !logoFile && <small className="text-danger">Picture will be removed when you save.</small>}
                  <small>JPG, PNG or WebP · maximum 2 MB · up to 2000 × 2000 px</small>
                  {logoFile && <small className="vim-logo-filename">{logoFile.name}</small>}
                  {errors.logo && <small className="text-danger" role="alert">{errors.logo}</small>}
                </div>
              </div>
            </div>
            <label className="vim-field">
              <span>Institution Type *</span>
              <select className="form-select" value={form.type} disabled={editing} onChange={(e) => change("type", e.target.value)}>
                {TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
              </select>
            </label>
          </div>
        )}
        {step === 1 && (
          <div className="vim-form-grid">
            <label className="vim-field">
              <span>Reporting Channel *</span>
              <select className="form-select" value={form.reporting_channel} onChange={(e) => change("reporting_channel", e.target.value)}>
                {CHANNELS.map((channel) => <option key={channel} value={channel}>{channel}</option>)}
              </select>
            </label>
            <label className="vim-field vim-field-full">
              <span>Description</span>
              <textarea rows={4} className="form-control" value={form.description ?? ""} onChange={(e) => change("description", e.target.value)} />
            </label>
          </div>
        )}
        {step === 2 && (
          <div className="vim-details-list">
            {[
              ["Name", form.name], ["Code", form.code], ["Short Name", form.short_name],
              ["Type", form.type], ["Reporting Channel", form.reporting_channel],
              ["Description", form.description],
              ["Institution Logo", logoFile ? logoFile.name : removeLogo ? "Will be removed" : savedLogo ? "Existing logo" : "Not added"],
            ].map(([name, value]) => (
              <div className="vim-detail-row" key={name}><span>{name}</span><strong>{showValue(value)}</strong></div>
            ))}

          </div>
        )}
      </div>
      <footer className="vim-dialog-footer">
        <button type="button" className="btn btn-outline-secondary" onClick={onClose}>Cancel</button>
        {step > 0 && (
          <button className="btn btn-outline-primary" type="button" onClick={() => setStep((value) => value - 1)}>
            <ChevronLeft size={15} /> Back
          </button>
        )}
        <button className="btn btn-primary" type="button" disabled={busy} onClick={save}>
          {busy ? "Saving..." : step === 2 ? (editing ? "Update Institution" : "Save Institution") : "Next"}
          {step < 2 && <ChevronRight size={15} />}
        </button>
      </footer>
    </div>
  );
}

export default function Institutions() {
  const { user } = useOutletContext();
  const manage = ownsPermission(user, "institutions.manage");
  const viewOwn = ownsPermission(user, "institutions.view.own");
  const [records, setRecords] = useState([]);
  const [searchValue, setSearchValue] = useState("");
  const search = useDebouncedValue(searchValue.trim(), 450);
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [lastPage, setLastPage] = useState(1);
  const [PAGE_SIZE, setPageSize] = usePageSize('institutions', 20);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useErrorDialogState("");
  const [modal, setModal] = useState(null);
  const [current, setCurrent] = useState(null);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");
    if (!manage && !viewOwn) {
      setRecords([]);
      setError("Institution permission has not been assigned.");
      void showUserFacingError("Institution permission has not been assigned.");
      setLoading(false);
      return () => { alive = false; };
    }

    fetchUiPage((serverPage, perPage) => listInstitutions({ page: serverPage, perPage, search: search || undefined }), page, PAGE_SIZE)
      .then((result) => {
        if (!alive) return;
        // IA scope MUST be enforced by Laravel. Defensive client-side filter.
        const ownId = user?.institution?.id;
        const items = manage ? result.items : result.items.filter(
          (record) => ownId && String(record.id) === String(ownId)
        );
        setRecords(items);
        setTotal(manage ? result.total : items.length);
        setLastPage(manage ? result.lastPage : 1);
      })
      .catch((err) => {
        if (!alive) return;
        setRecords([]);
        setError(apiError(err));
        void showUserFacingError(err, "Unable to load institutions");
      })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [manage, viewOwn, user?.institution?.id, search, page, PAGE_SIZE, refresh]);

  const reload = () => setRefresh((value) => value + 1);
  const close = () => { setModal(null); setCurrent(null); };
  const open = (kind, item = null) => { setCurrent(item); setModal(kind); };
  const visible = records.filter((record) => !statusFilter || record.status === statusFilter);
  const partial = Number(total) > records.length;
  const note = (text) => partial ? `${text} · this page` : text;
  const channelOf = (record) => { const c = String(record.reporting_channel || "").toLowerCase(); return /api|integration|system/.test(c) ? "api" : /direct|portal/.test(c) ? "direct" : ""; };
  const activeN = records.filter((record) => record.status === "active").length;
  const directN = records.filter((record) => channelOf(record) === "direct").length;
  const apiN = records.filter((record) => channelOf(record) === "api").length;

  async function toggle(record) {
    if (!manage) return;
    const activate = record.status !== "active";
    const answer = await Swal.fire({
      title: activate ? "Activate institution?" : "Deactivate institution?",
      text: record.name,
      icon: activate ? "question" : "warning", showCancelButton: true,
      confirmButtonText: activate ? "Activate" : "Deactivate",
    });
    if (!answer.isConfirmed) return;
    try {
      const result = await setInstitutionActive(record.id, activate);
      reload();
      await Swal.fire({
        icon: "success", title: activate ? "Institution activated" : "Institution deactivated",
        text: result.message || "The server completed the request successfully.",
      });
    } catch (error) {
      await showUserFacingError(error, "Institution status could not be changed");
    }
  }

  return (
    <main className="vim-institutions adm-modern container-fluid px-0">
      <MuHeader initials="🏛" title="Institutions" subtitle="Institutions authorized by the Ministry of Industry and Trade">
        {manage && <button type="button" className="mu-btn mu-btn-primary vim-add" onClick={() => open("create")}><Plus size={17} /> Add Institution</button>}
      </MuHeader>
      <div className="mu-kpis">
        <MuKpi tone="blue" icon={<Building2 size={18}/>} title="All institutions" value={countText(total, "institution", loading && !records.length)} note="national registry" arrow={false} onOpen={() => setStatusFilter("")}/>
        <MuKpi tone="green" icon={<CheckCircle2 size={18}/>} title="Active" value={countText(activeN, "institution", loading && !records.length)} note={note("reporting")} arrow={false} onOpen={() => setStatusFilter("active")}/>
        <MuKpi tone="indigo" icon={<ArrowLeftRight size={18}/>} title="Direct portal" value={countText(directN, "institution", loading && !records.length)} note={note("reporting channel")} arrow={false}/>
        <MuKpi tone="orange" icon={<Zap size={18}/>} title="API integration" value={countText(apiN, "institution", loading && !records.length)} note={note("reporting channel")} arrow={false}/>
      </div>

      <section className="vim-list-card">
        <header className="adm-card-head"><span className="adm-dot" aria-hidden="true"/><h2>Institution registry</h2><span className="mu-count">{loading ? "…" : total}</span></header>
        <form className="vim-filters vim-filter-form adm-toolbar" onSubmit={(event) => { event.preventDefault(); setPage(1); }}>
          <MuTabs label="Status" value={statusFilter || "all"} onChange={(value) => setStatusFilter(value === "all" ? "" : value)}
            items={[{ key: "all", label: "All", count: records.length }, { key: "active", label: "Active", count: activeN }, { key: "inactive", label: "Inactive", count: records.length - activeN }]}/>
          <label className="vim-search-field">
            <Search size={17} />
            <input value={searchValue} onChange={(e) => { setSearchValue(e.target.value); setPage(1); }} placeholder="Search institution name or code..." aria-label="Search institutions" />
          </label>
          <button className="adm-hidden-submit" type="submit">Search</button>
          {(searchValue || statusFilter) && <button className="mu-btn" type="button" onClick={() => { setSearchValue(""); setStatusFilter(""); setPage(1); }}><RotateCcw size={14} /> Reset</button>}
        </form>

        <div className="vim-table-scroll">
          <table className="table vim-table mb-0">
            <thead><tr>
              <th>#</th><th>Logo</th><th>Institution Name</th><th>Code</th><th>Type</th>
              <th>Reporting Channel</th><th>Users</th><th>Status</th><th aria-label="Actions"/>
            </tr></thead>
            <tbody>
              {visible.map((record, index) => (
                <tr key={record.id}>
                  <td>{(page - 1) * PAGE_SIZE + index + 1}</td>
                  <td><span className="vim-table-logo">{institutionLogoUrl(record)
                    ? <img src={institutionLogoUrl(record)} alt={`${record.name} logo`} loading="lazy" />
                    : <Building2 size={19} aria-label="No logo uploaded" />}</span></td>
                  <td><strong>{record.name}</strong></td>
                  <td><span className="adm-code">{showValue(record.code)}</span></td>
                  <td>{showValue(record.type)}</td>
                  <td>{record.reporting_channel ? <MuBadge tone={channelOf(record) === "api" ? "violet" : "blue"}>{showValue(record.reporting_channel).replace(/_/g, " ")}</MuBadge> : <span className="mu-muted">Not set</span>}</td>
                  <td>{showValue(record.users_count)}</td>
                  <td><AdmStatus status={record.status}/></td>
                  <td className="mu-actions"><RowActionsMenu label="Row actions">
                    <button type="button" title="Details" aria-label={`Details ${record.name}`} onClick={() => open("details", record)}><Eye size={16} /></button>
                    {manage && <>
                      <button type="button" title="Edit" aria-label={`Edit ${record.name}`} onClick={() => open("edit", record)}><Pencil size={16} /></button>
                      <button type="button" title={record.status === "active" ? "Deactivate" : "Activate"} onClick={() => toggle(record)}>
                        <Power size={16} />
                      </button>
                    </>}
                  </RowActionsMenu></td>
                </tr>
              ))}
              {!loading && !visible.length && (
                <tr><td colSpan={9} className="vim-empty">No institutions returned for these filters.</td></tr>
              )}
            </tbody>
          </table><TableLoader active={loading} />
        </div>
        <footer className="vim-pagination-bar">
          <span>Showing {visible.length} of {total} · page {page} of {lastPage}</span>
          <div className="vim-pagination-controls">
            <PageSizeSelect value={PAGE_SIZE} onChange={(value) => { setPageSize(value); setPage(1); }} />
            <button type="button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)} aria-label="Previous"><ChevronLeft size={16} /></button>
            <button type="button" disabled={page >= lastPage} onClick={() => setPage((value) => value + 1)} aria-label="Next"><ChevronRight size={16} /></button>
          </div>
        </footer>
      </section>
      {modal === "details" && current && (
        <Dialog title="Institution Details" onClose={close}>
          <Details record={current} canManage={manage} onClose={close} onEdit={() => setModal("edit")} />
        </Dialog>
      )}
      {(modal === "create" || modal === "edit") && (
        <Dialog title={modal === "create" ? "Add New Institution" : "Edit Institution"} onClose={close}>
          <InstitutionForm
            key={`${modal}-${current?.id ?? "new"}`}
            initial={modal === "edit" ? current : null}
            onClose={close}
            onSaved={reload}
          />
        </Dialog>
      )}
    </main>
  );
}
