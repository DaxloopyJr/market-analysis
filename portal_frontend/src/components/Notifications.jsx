/**
 * FILE: src/pages/Notifications/Notifications.jsx
 * ROUTE: /dashboard/notifications (already registered in App.jsx)
 * USES: GET /notifications, GET /notifications/unread-count,
 *       GET /notifications/{id}, PATCH /notifications/{id}/read.
 * IMPORTANT: Only the authenticated user's notifications. No fake data.
 * Search is CURRENT PAGE only; status and pagination use Laravel.
 * App's DashboardLayout supplies the sidebar and topbar.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Bell, BellDot, Check, CheckCheck, ChevronLeft, ChevronRight,
  Clock3, Eye, MailOpen, RefreshCw, RotateCcw, Search, X,
} from "lucide-react";
import api from "../../API/Api";
import SystemLoader from "../../components/common/SystemLoader";
import "../Admin/institutions.css";
import "./notifications.css";

const ROOT = "/notifications"; // Existing Axios baseURL must include /api/v1.
const formatType = (value) => String(value || "Notification")
  .replace(/([a-z])([A-Z])/g, "$1 $2")
  .replace(/[_-]+/g, " ");
const errorMessage = (error) => error?.response?.data?.message || error?.message || "Request failed.";

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

function DetailsDialog({ record, loading, error, marking, onClose, onMarkRead }) {
  const closeRef = useRef(null);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const handleKey = (event) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKey);
      previousFocus?.focus?.();
    };
  }, [onClose]);

  return createPortal(
    <div className="vim-dialog-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="vim-dialog vim-notif-dialog" role="dialog" aria-modal="true" aria-label="Notification details">
        <header className="vim-dialog-header">
          <h2>Notification Details</h2>
          <button type="button" ref={closeRef} className="vim-icon-button" aria-label="Close" onClick={onClose}>
            <X size={18} />
          </button>
        </header>

        {loading ? (
          <SystemLoader compact message="Loading notification..." />
        ) : error ? (
          <div className="alert alert-danger m-3" role="alert">{error}</div>
        ) : record ? (
          <>
            <div className="vim-notif-detail-body">
              <div className="vim-notif-detail-head">
                <div className="vim-notif-detail-icon"><Bell size={24} /></div>
                <div className="vim-notif-detail-title">
                  <strong>{formatType(record.type)}</strong>
                  <span>{dateText(record.createdAt)} EAT</span>
                </div>
                <span className={`vim-notif-status ${record.isRead ? "read" : "unread"}`}>
                  {record.isRead ? "Read" : "Unread"}
                </span>
              </div>
              <div className="vim-notif-message">{record.message || "No message supplied."}</div>
              <div className="vim-notif-detail-grid">
                <div><small>Notification ID</small><strong>#{record.id}</strong></div>
                <div><small>Type</small><strong>{record.type || "—"}</strong></div>
                <div><small>Created At (EAT)</small><strong>{dateText(record.createdAt)}</strong></div>
                <div><small>Sent At (EAT)</small><strong>{dateText(record.sentAt)}</strong></div>
                <div><small>Audit Event ID</small><strong>{record.auditEventId ?? "—"}</strong></div>
                <div><small>Read Status</small><strong>{record.isRead ? "Read" : "Unread"}</strong></div>
              </div>
            </div>
            <footer className="vim-dialog-footer">
              <button type="button" className="btn btn-outline-secondary" onClick={onClose}>Close</button>
              {!record.isRead && (
                <button type="button" className="btn btn-primary" disabled={marking === record.id}
                  onClick={() => onMarkRead(record)}>
                  <Check size={15} /> {marking === record.id ? "Updating..." : "Mark as Read"}
                </button>
              )}
            </footer>
          </>
        ) : null}
      </section>
    </div>, document.body
  );
}

export default function Notifications() {
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState({ current_page: 1, total: 0 });
  const [unreadCount, setUnreadCount] = useState(null);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(20);
  const [readFilter, setReadFilter] = useState(""); // "" = all, "0" = unread, "1" = read.
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState(""); // Local search: CURRENT PAGE only.
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [revision, setRevision] = useState(0);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [marking, setMarking] = useState(null);
  const detailRequest = useRef(0);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");

    api.get(ROOT, {
      params: {
        page,
        perPage,
        ...(readFilter !== "" ? { isRead: Number(readFilter) } : {}),
      },
    }).then(({ data }) => {
      if (!alive) return;
      if (!Array.isArray(data?.data)) throw new Error("Unexpected notifications response from Laravel.");
      setRows(data.data);
      setMeta(data.meta || { current_page: page, total: data.data.length });
    }).catch((requestError) => {
      if (!alive) return;
      setRows([]);
      setError(errorMessage(requestError));
    }).finally(() => {
      if (alive) setLoading(false);
    });

    return () => { alive = false; };
  }, [page, perPage, readFilter, revision]);

  useEffect(() => {
    let alive = true;
    api.get(`${ROOT}/unread-count`)
      .then(({ data }) => {
        if (!alive) return;
        const count = Number(data?.data?.unreadCount);
        setUnreadCount(Number.isFinite(count) ? count : null);
      })
      .catch(() => { if (alive) setUnreadCount(null); });
    return () => { alive = false; };
  }, [revision]);

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return rows;
    return rows.filter((item) => [item.id, item.type, item.message, item.auditEventId]
      .some((field) => String(field ?? "").toLowerCase().includes(query)));
  }, [rows, search]);

  const total = Number(meta.total) || 0;
  const currentPage = Number(meta.current_page) || page;
  const lastPage = Math.max(1, Number(meta.last_page) || Math.ceil(total / perPage));
  const from = total ? (Number(meta.from) || (currentPage - 1) * perPage + 1) : 0;
  const to = total ? (Number(meta.to) || Math.min(currentPage * perPage, total)) : 0;

  const reload = () => setRevision((value) => value + 1);
  const closeDetails = () => {
    detailRequest.current += 1;
    setDetailsOpen(false);
    setDetail(null);
    setDetailError("");
  };

  const viewDetails = async (notification) => {
    const requestId = ++detailRequest.current;
    setDetailsOpen(true);
    setDetail(null);
    setDetailError("");
    setDetailLoading(true);
    try {
      // GET details deliberately does NOT mark a notification as read.
      const { data } = await api.get(`${ROOT}/${notification.id}`);
      if (requestId === detailRequest.current) setDetail(data?.data || null);
    } catch (requestError) {
      if (requestId === detailRequest.current) setDetailError(errorMessage(requestError));
    } finally {
      if (requestId === detailRequest.current) setDetailLoading(false);
    }
  };

  const markAsRead = async (notification) => {
    if (!notification || notification.isRead || marking !== null) return;
    setMarking(notification.id);
    setActionError("");
    try {
      const { data } = await api.patch(`${ROOT}/${notification.id}/read`);
      const updated = data?.data;
      // Reflect confirmed backend state immediately; then refetch the filtered list/count.
      setRows((previous) => previous.map((item) => item.id === notification.id
        ? { ...item, ...(updated || {}), isRead: true } : item));
      setDetail((previous) => previous?.id === notification.id
        ? { ...previous, ...(updated || {}), isRead: true } : previous);
      reload();
      window.dispatchEvent(new Event("viwanda:notifications-updated"));
    } catch (requestError) {
      setActionError(errorMessage(requestError));
    } finally {
      setMarking(null);
    }
  };

  const selectFilter = (value) => {
    setReadFilter(value);
    setPage(1);
  };

  return (
    <main className="vim-institutions vim-notifications container-fluid px-0">
      <div className="vim-heading">
        <div>
          <div className="vim-breadcrumb">Home / My Account / Notifications</div>
          <h1>Notifications</h1>
          <p>View important portal updates and manage your unread notifications.</p>
        </div>
        <span className="vim-notif-identity"><Bell size={20} /> Personal Notifications</span>
      </div>

      <section className="vim-list-card" aria-label="My notifications">
        <div className="vim-notif-toolbar">
          <div className="vim-notif-tabs" role="group" aria-label="Filter notification read status">
            <button type="button" className={readFilter === "" ? "active" : ""}
              aria-pressed={readFilter === ""} onClick={() => selectFilter("")}>All</button>
            <button type="button" className={readFilter === "0" ? "active" : ""}
              aria-pressed={readFilter === "0"} onClick={() => selectFilter("0")}>
              <BellDot size={15} /> Unread
              <span className="vim-notif-count">{unreadCount ?? "—"}</span>
            </button>
            <button type="button" className={readFilter === "1" ? "active" : ""}
              aria-pressed={readFilter === "1"} onClick={() => selectFilter("1")}>
              <MailOpen size={15} /> Read
            </button>
          </div>
          <button type="button" className="btn btn-outline-primary vim-notif-refresh" onClick={reload}
            disabled={loading} aria-label="Refresh notifications"><RefreshCw size={15} /> Refresh</button>
        </div>

        <form className="vim-filters vim-filter-form vim-notif-filters" onSubmit={(event) => {
          event.preventDefault(); setSearch(searchInput.trim());
        }}>
          <label className="vim-search-field">
            <Search size={17} />
            <input value={searchInput} onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Search notifications (current page)..." aria-label="Search current page notifications" />
          </label>
          <select value={perPage} aria-label="Notifications per page" onChange={(event) => {
            setPerPage(Number(event.target.value)); setPage(1);
          }}>
            <option value={10}>10 per page</option>
            <option value={20}>20 per page</option>
            <option value={50}>50 per page</option>
            <option value={100}>100 per page</option>
          </select>
          <button className="btn btn-primary" type="submit">Search</button>
          <button className="btn btn-outline-secondary" type="button" onClick={() => {
            setSearch(""); setSearchInput(""); setReadFilter(""); setPerPage(20); setPage(1);
          }}><RotateCcw size={14} /> Reset</button>
        </form>

        {error && <div className="alert alert-danger mx-3 mt-3" role="alert">{error}</div>}
        {actionError && <div className="alert alert-danger mx-3 mt-3" role="alert">{actionError}</div>}

        <div className="vim-table-scroll">
          <table className="table vim-table vim-notif-table mb-0">
            <thead>
              <tr>
                <th>#</th>
                <th>Notification</th>
                <th>Type</th>
                <th>Audit Event</th>
                <th>Date & Time</th>
                <th>Status</th>
                <th className="text-end">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <SystemLoader colSpan={7} message="Loading notifications..." />
              ) : error ? (
                <tr><td colSpan={7} className="vim-empty">Could not load notifications.</td></tr>
              ) : visible.length === 0 ? (
                <tr><td colSpan={7} className="vim-empty">
                  {search ? "No notifications match your search on this page." : "No notifications found."}
                </td></tr>
              ) : visible.map((item) => (
                <tr key={item.id} className={item.isRead ? "" : "vim-notif-unread-row"}>
                  <td>{(currentPage - 1) * perPage + rows.indexOf(item) + 1}</td>
                  <td>
                    <div className="vim-notif-message-cell">
                      <span className={`vim-notif-row-icon ${item.isRead ? "read" : "unread"}`}>
                        {item.isRead ? <MailOpen size={17} /> : <BellDot size={17} />}
                      </span>
                      <div>
                        <strong>{item.message || "—"}</strong>
                        <small>Notification #{item.id}</small>
                      </div>
                    </div>
                  </td>
                  <td>{formatType(item.type)}</td>
                  <td>{item.auditEventId != null ? `#${item.auditEventId}` : "—"}</td>
                  <td><span className="vim-notif-date"><Clock3 size={14} />{dateText(item.createdAt)}</span></td>
                  <td><span className={`vim-notif-status ${item.isRead ? "read" : "unread"}`}>
                    {item.isRead ? "Read" : "Unread"}
                  </span></td>
                  <td>
                    <div className="vim-row-actions">
                      <button type="button" title="View Details" aria-label={`View notification ${item.id}`}
                        onClick={() => viewDetails(item)}><Eye size={16} /></button>
                      {!item.isRead && (
                        <button type="button" title="Mark as Read" aria-label={`Mark notification ${item.id} as read`}
                          disabled={marking !== null} onClick={() => markAsRead(item)}><CheckCheck size={16} /></button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <footer className="vim-pagination-bar">
          <span>Showing {from}–{to} of {total} notifications · Page {currentPage} of {lastPage}
            {search && " · Search applies to current page"}</span>
          <div className="vim-pagination-controls">
            <button type="button" aria-label="Previous page" disabled={loading || page <= 1}
              onClick={() => setPage((value) => value - 1)}><ChevronLeft size={16} /></button>
            <button type="button" className="active" aria-current="page">{currentPage}</button>
            <button type="button" aria-label="Next page" disabled={loading || page >= lastPage}
              onClick={() => setPage((value) => value + 1)}><ChevronRight size={16} /></button>
          </div>
        </footer>
      </section>

      {detailsOpen && (
        <DetailsDialog record={detail} loading={detailLoading} error={detailError}
          marking={marking} onClose={closeDetails} onMarkRead={markAsRead} />
      )}
    </main>
  );
}
