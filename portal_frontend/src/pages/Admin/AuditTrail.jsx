/**
 * FILE: src/pages/Admin/AuditTrail.jsx
 * PAGE: /dashboard/audit-logs (via MODULE_ROUTES moduleId: "audit")
 * DATA: GET /api/v1/audit-events?page=N via the existing Axios instance.
 * DESIGN: Matches MinistryDepartments using the shared institutions.css styles.
 * SCOPE: Read-only. Filters search the CURRENT downloaded page only.
 * NOTE: Laravel must enforce access to audit records and redact sensitive data.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ChevronLeft, ChevronRight, Clock3, Eye, RefreshCw,
  RotateCcw, Search, ShieldCheck, UserRound, X, FileDown, FileSpreadsheet,
} from "lucide-react";
import api from "../../API/Api";
import { exportAuditExcel, exportAuditPdf } from "./auditReportExport";
import "./institutions.css";
import "./auditTrail.css";

const ENDPOINT = "/audit-events"; // Axios baseURL should include /api/v1
const blankMeta = { current_page: 1, last_page: 1, total: 0, from: 0, to: 0 };

function label(value) {
  if (value === null || value === undefined || value === "") return "—";
  return String(value).replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function dateText(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Dar_es_Salaam",
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(date);
}

function eventTone(type = "") {
  if (/deactivat|delet|remov|fail/i.test(type)) return "danger";
  if (/creat|attach|activat/i.test(type)) return "success";
  if (/updat|edit|draft/i.test(type)) return "warning";
  if (/login|logout/i.test(type)) return "info";
  return "neutral";
}

// Frontend masking is defense-in-depth; backend must also redact before responding.
function redact(value) {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [
      key,
      /password|passwd|secret|token|authorization|api[_-]?key|otp|credential|private[_-]?key|session|cookie/i.test(key)
        ? "[REDACTED]" : redact(entry),
    ]));
  }
  return value;
}

function stableString(value) {
  return JSON.stringify(value, (_key, item) => {
    if (item && !Array.isArray(item) && typeof item === "object") {
      return Object.fromEntries(
        Object.keys(item).sort().map((key) => [key, item[key]])
      );
    }
    return item;
  });
}

function changedFields(event) {
  const before = redact(event.oldValues ?? {});
  const after = redact(event.newValues ?? {});
  const oldObject = before && typeof before === "object" && !Array.isArray(before) ? before : {};
  const newObject = after && typeof after === "object" && !Array.isArray(after) ? after : {};
  const keys = [...new Set([...Object.keys(oldObject), ...Object.keys(newObject)])];
  return keys.filter((key) => stableString(oldObject[key]) !== stableString(newObject[key]))
    .map((key) => ({ key, before: oldObject[key], after: newObject[key] }));
}

function valueText(value) {
  if (value === null || value === undefined) return "—";
  if (typeof value === "object") return JSON.stringify(value, null, 2);
  return String(value);
}

function AuditDialog({ record, onClose }) {
  const [tab, setTab] = useState("changes");
  const closeRef = useRef(null);
  const changes = useMemo(() => changedFields(record), [record]);

  useEffect(() => {
    const oldOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const onKey = (event) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = oldOverflow;
      window.removeEventListener("keydown", onKey);
      previousFocus?.focus?.();
    };
  }, [onClose]);

  const info = [
    ["Event ID", `#${record.id}`],
    ["Actor", record.userId != null ? `User #${record.userId}` : label(record.actorType)],
    ["Actor Type", label(record.actorType)],
    ["Entity Type", label(record.entityType)],
    ["Entity ID", record.entityId ?? "—"],
    ["IP Address", record.ipAddress ?? "—"],
    ["Request ID", record.requestId ?? "—"],
    ["Date & Time (EAT)", dateText(record.createdAt)],
  ];

  return createPortal(
    <div className="vim-dialog-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="vim-dialog vim-dialog-wide vim-audit-dialog"
        role="dialog" aria-modal="true" aria-label={`Audit Event #${record.id}`}>
        <header className="vim-dialog-header">
          <h2>Audit Event Details</h2>
          <button type="button" className="vim-icon-button" ref={closeRef}
            onClick={onClose} aria-label="Close details"><X size={18} /></button>
        </header>

        <div className="vim-detail-heading">
          <span className="vim-detail-symbol"><ShieldCheck size={25} /></span>
          <div>
            <strong>{label(record.eventType)}</strong>
            <small>Event #{record.id} · {dateText(record.createdAt)} EAT</small>
          </div>
          <span className={`vim-audit-badge vim-audit-${eventTone(record.eventType)}`}>
            {label(record.eventType)}
          </span>
        </div>

        <div className="vim-audit-detail-body">
          <div className="vim-audit-info-grid">
            {info.map(([key, value]) => (
              <div className="vim-audit-info-item" key={key}>
                <small>{key}</small>
                <strong>{value}</strong>
              </div>
            ))}
          </div>

          {record.reason && (
            <div className="vim-audit-reason"><b>Reason / Description</b><p>{record.reason}</p></div>
          )}

          <div className="vim-audit-tabs" role="tablist" aria-label="Change details">
            <button type="button" role="tab" aria-selected={tab === "changes"}
              className={tab === "changes" ? "active" : ""}
              onClick={() => setTab("changes")}>Changed Fields ({changes.length})</button>
            <button type="button" role="tab" aria-selected={tab === "json"}
              className={tab === "json" ? "active" : ""}
              onClick={() => setTab("json")}>Before / After JSON</button>
          </div>

          {tab === "changes" ? (
            changes.length ? (
              <div className="vim-audit-diff-scroll">
                <table className="table vim-audit-diff-table mb-0">
                  <thead><tr><th>Field</th><th>Old Value</th><th>New Value</th></tr></thead>
                  <tbody>{changes.map((entry) => (
                    <tr key={entry.key}>
                      <td><strong>{label(entry.key)}</strong></td>
                      <td className="vim-audit-before"><pre>{valueText(entry.before)}</pre></td>
                      <td className="vim-audit-after"><pre>{valueText(entry.after)}</pre></td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            ) : (
              <div className="vim-audit-no-changes">
                No before/after field changes were captured for this event.
              </div>
            )
          ) : (
            <div className="vim-audit-json-grid">
              <div><h3>Old Values</h3><pre>{record.oldValues == null ? "No data" : JSON.stringify(redact(record.oldValues), null, 2)}</pre></div>
              <div><h3>New Values</h3><pre>{record.newValues == null ? "No data" : JSON.stringify(redact(record.newValues), null, 2)}</pre></div>
            </div>
          )}
        </div>
        <footer className="vim-dialog-footer">
          <button className="btn btn-outline-secondary" type="button" onClick={onClose}>Close</button>
        </footer>
      </section>
    </div>, document.body
  );
}

export default function AuditTrail() {
  const [events, setEvents] = useState([]);
  const [meta, setMeta] = useState(blankMeta);
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [eventFilter, setEventFilter] = useState("");
  const [entityFilter, setEntityFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(null);
  const [exporting, setExporting] = useState("");
  const [exportError, setExportError] = useState("");

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");
    setEvents([]);
    api.get(ENDPOINT, { params: { page } })
      .then(({ data }) => {
        if (!alive) return;
        setEvents(Array.isArray(data?.data) ? data.data : []);
        setMeta({ ...blankMeta, ...(data?.meta || {}), current_page: page });
      })
      .catch((err) => {
        if (!alive) return;
        setEvents([]);
        setMeta(blankMeta);
        setError(err.response?.data?.message || err.message || "Unable to load audit events.");
      })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [page, revision]);

  // Event/entity dropdown options come from the CURRENT page (no endpoint for options provided).
  const eventTypes = useMemo(() => [...new Set(events.map((e) => e.eventType).filter(Boolean))].sort(), [events]);
  const entityTypes = useMemo(() => [...new Set(events.map((e) => e.entityType).filter(Boolean))].sort(), [events]);
  const visible = useMemo(() => events.filter((event) => {
    const haystack = [event.id, event.userId, event.actorType, event.eventType,
      event.entityType, event.entityId, event.ipAddress, event.requestId, event.reason]
      .map((value) => value ?? "").join(" ").toLowerCase();
    return (!search || haystack.includes(search.toLowerCase()))
      && (!eventFilter || event.eventType === eventFilter)
      && (!entityFilter || event.entityType === entityFilter);
  }), [events, search, eventFilter, entityFilter]);

  const lastPage = Math.max(1, Number(meta.last_page) || 1);
  const closeDialog = () => setSelected(null);
  const reset = () => { setSearchInput(""); setSearch(""); setEventFilter(""); setEntityFilter(""); };
  const movePage = (next) => { reset(); setPage(next); };
  const exportDisabled = loading || Boolean(error) || Boolean(exporting) || visible.length === 0;

  async function downloadReport(format) {
    if (exportDisabled) return;
    setExportError("");
    setExporting(format);
    // Snapshot the visible rows so export exactly matches the current filtered table.
    const records = visible.slice();
    const options = {
      page, lastPage, search, eventFilter, entityFilter,
      generatedAt: new Date(),
    };
    try {
      if (format === "pdf") await exportAuditPdf(records, options);
      else await exportAuditExcel(records, options);
    } catch (err) {
      console.error("Audit export failed:", err);
      setExportError(`Unable to export ${format.toUpperCase()}. ${err?.message || "Please try again."}`);
    } finally {
      setExporting("");
    }
  }

  return (
    <main className="vim-institutions vim-audit-trail container-fluid px-0">
      <div className="vim-heading">
        <div>
          <div className="vim-breadcrumb">Home / Administration / Audit Trail</div>
          <h1>Audit Trail</h1>
          <p>Monitor system activities, users and recorded data changes.</p>
        </div>
        <span className="vim-audit-identity"><ShieldCheck size={21} /> System Activity Log <b>· Read only</b></span>
      </div>

      <section className="vim-list-card" aria-label="Audit events list">
        <div className="vim-audit-export-toolbar">
          <div className="vim-audit-export-description">
            <strong>Audit Report</strong>
            <small>Export {visible.length} visible record{visible.length === 1 ? "" : "s"} from page {page} only. Search and filters are applied.</small>
          </div>
          <div className="vim-audit-export-buttons">
            <button type="button" className="btn vim-audit-export-pdf"
              onClick={() => downloadReport("pdf")} disabled={exportDisabled}>
              <FileDown size={16} /> {exporting === "pdf" ? "Generating PDF..." : "Export PDF"}
            </button>
            <button type="button" className="btn vim-audit-export-excel"
              onClick={() => downloadReport("excel")} disabled={exportDisabled}>
              <FileSpreadsheet size={16} /> {exporting === "excel" ? "Generating Excel..." : "Export Excel"}
            </button>
          </div>
        </div>
        {exportError && <div className="alert alert-danger mx-3 mt-2" role="alert">{exportError}</div>}
        <form className="vim-filters vim-filter-form" onSubmit={(e) => {
          e.preventDefault(); setSearch(searchInput.trim());
        }}>
          <label className="vim-search-field">
            <Search size={17} />
            <input value={searchInput} onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search event, user, IP (current page)..." aria-label="Search current page" />
          </label>
          <select aria-label="Filter event on current page" value={eventFilter}
            onChange={(e) => setEventFilter(e.target.value)}>
            <option value="">All events (current page)</option>
            {eventTypes.map((event) => <option key={event} value={event}>{label(event)}</option>)}
          </select>
          <select aria-label="Filter entity on current page" value={entityFilter}
            onChange={(e) => setEntityFilter(e.target.value)}>
            <option value="">All entities (current page)</option>
            {entityTypes.map((entity) => <option key={entity} value={entity}>{label(entity)}</option>)}
          </select>
          <button type="submit" className="btn btn-primary">Search</button>
          <button type="button" className="btn btn-outline-secondary" onClick={reset}>
            <RotateCcw size={14} /> Reset
          </button>
          <button type="button" className="btn btn-primary vim-add"
            disabled={loading} onClick={() => setRevision((value) => value + 1)}>
            <RefreshCw size={15} /> Refresh
          </button>
        </form>

        {error && <div className="alert alert-danger mx-3" role="alert">{error}</div>}

        <div className="vim-table-scroll">
          <table className="table vim-table mb-0 vim-audit-table">
            <thead><tr>
              <th>#</th><th>Actor</th><th>Event / Action</th><th>Entity</th>
              <th>IP Address</th><th>Date & Time (EAT)</th><th className="text-end">Actions</th>
            </tr></thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="vim-audit-loading-cell">
                    <div className="vim-audit-loading-state" role="status" aria-live="polite">
                      <span className="spinner-border text-primary" aria-hidden="true" />
                      <span>Loading audit events...</span>
                    </div>
                  </td>
                </tr>
              ) : error ? (
                <tr><td colSpan={7} className="vim-empty">Unable to display audit events.</td></tr>
              ) : visible.length === 0 ? (
                <tr><td colSpan={7} className="vim-empty">No audit events match the filters on this page.</td></tr>
              ) : visible.map((event) => (
                <tr key={event.id}>
                  <td>{event.id}</td>
                  <td>
                    <span className="vim-audit-actor"><UserRound size={15} />
                      <strong>{event.userId != null ? `User #${event.userId}` : label(event.actorType)}</strong>
                    </span>
                  </td>
                  <td><span className={`vim-audit-badge vim-audit-${eventTone(event.eventType)}`}>
                    {label(event.eventType)}
                  </span></td>
                  <td><strong>{label(event.entityType)}</strong><small className="vim-audit-entity-id">ID: {event.entityId ?? "—"}</small></td>
                  <td className="vim-audit-mono">{event.ipAddress || "—"}</td>
                  <td><span className="vim-audit-date"><Clock3 size={14} />{dateText(event.createdAt)}</span></td>
                  <td className="text-end"><div className="vim-row-actions">
                    <button type="button" title="View event details" aria-label={`View audit event ${event.id}`}
                      onClick={() => setSelected(event)}><Eye size={16} /></button>
                  </div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="vim-pagination-bar">
          <span>
            Page {page} of {lastPage} · {meta.total ?? 0} audit events
            {(search || eventFilter || entityFilter) && ` · ${visible.length} shown on this page`}
          </span>
          <div className="vim-pagination-controls">
            <button type="button" aria-label="Previous page" disabled={loading || page <= 1}
              onClick={() => movePage(page - 1)}><ChevronLeft size={16} /></button>
            <button type="button" className="active" aria-current="page">{page}</button>
            <button type="button" aria-label="Next page" disabled={loading || page >= lastPage}
              onClick={() => movePage(page + 1)}><ChevronRight size={16} /></button>
          </div>
        </div>
      </section>
      {selected && <AuditDialog record={selected} onClose={closeDialog} />}
    </main>
  );
}
