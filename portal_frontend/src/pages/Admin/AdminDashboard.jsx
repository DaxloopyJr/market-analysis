import {useErrorDialogState} from '../../utils/userFacingErrors.js';
/**
 * FILE: src/pages/Admin/AdminDashboard.jsx
 * ROUTE: /dashboard -> ProtectedRoute -> DashboardLayout ->
 *   RoleDashboardPreview (MOA) -> AdminDashboard.jsx.
 * DATA: AdminDashboard.jsx -> src/API/dashboard.jsx -> src/API/axios.jsx
 *   -> Laravel API -> PostgreSQL / real monitoring integrations.
 * AUTH: DashboardLayout and Laravel enforce access. No local demo records.
 * TODO(BACKEND): Confirm GET /api/v1/admin/dashboard response and monitoring source.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import {
  CartesianGrid,
  Line,
  LineChart,
  Pie,
  PieChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Activity, Building2, Database, FileText, ShieldCheck, Users, X, RefreshCw } from "lucide-react";
import { getAdminDashboard } from "../../API/dashboard";
import { apiError } from "../../API/resourceHelpers";
import "./adminDashboard.css";

const metricIcons = { users: Users, institutions: Building2, submissions: Database, datasets: FileText, roles: ShieldCheck, uptime: Activity };
const colors = ["#2374ed", "#12ad7b", "#efa72b", "#8b5cf6"];
const valueOf = (value) => value === null || value === undefined || value === "" ? "Not reported" : String(value);

function KV({ rows }) {
  if (!rows.length) return <p>No additional details returned.</p>;
  return (
    <div className="vad-modal-rows">
      {rows.map(([label, value], index) => (
        <div key={`${label}-${index}`} className="vad-modal-row">
          <span>{label}</span>
          <strong>{typeof value === "object" ? JSON.stringify(value) : valueOf(value)}</strong>
        </div>
      ))}
    </div>
  );
}

function PerformanceChart({ points, height = 210 }) {
  if (!points?.length) return <p className="p-3 text-muted">Performance information is not available yet.</p>;
  return (
    <div className="vad-chart-height" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 6, right: 12, bottom: 2, left: -14 }}>
          <CartesianGrid vertical={false} stroke="#e8edf5" />
          <XAxis dataKey="time" tick={{ fontSize: 11 }} />
          <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" />
          <Tooltip />
          <Line dataKey="cpu" name="CPU" stroke={colors[0]} strokeWidth={2} dot={false} />
          <Line dataKey="memory" name="Memory" stroke={colors[1]} strokeWidth={2} dot={false} />
          <Line dataKey="disk" name="Disk" stroke={colors[2]} strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function StorageChart({ storage, height = 190 }) {
  const used = Number(storage?.usedGB ?? storage?.used_gb);
  const total = Number(storage?.totalGB ?? storage?.total_gb);
  if (!Number.isFinite(used) || !Number.isFinite(total) || total <= 0) {
    return <p className="p-3 text-muted">Storage information is not available yet.</p>;
  }
  const free = Math.max(0, total - used);
  return (
    <div className="vad-storage-chart" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={[{ name: "Used", value: used }, { name: "Available", value: free }]}
            cx="50%" cy="50%" innerRadius="65%" outerRadius="88%" dataKey="value"
          >
            <Cell fill={colors[0]} /><Cell fill="#dfe6ef" />
          </Pie>
          <Tooltip formatter={(value) => `${value} GB`} />
        </PieChart>
      </ResponsiveContainer>
      <div className="vad-storage-center"><strong>{Math.round((used / total) * 100)}%</strong><span>Used</span></div>
    </div>
  );
}

function DetailModal({ selected, close, dashboard }) {
  useEffect(() => {
    const handle = (event) => { if (event.key === "Escape") close(); };
    document.addEventListener("keydown", handle);
    return () => document.removeEventListener("keydown", handle);
  }, [close]);

  const { kind, item } = selected;
  const title = kind === "performance" ? "System Performance"
    : kind === "storage" ? "Storage Usage"
      : kind === "servers" ? "Server Status"
        : kind === "logs" ? "Recent System Logs"
          : kind === "users" ? "Recent Users"
            : item?.label || item?.name || item?.module || "Dashboard Details";
  const details = item ? Object.entries(item).filter(([key]) => key !== "id") : [];

  return createPortal(
    <div className="vad-modal-root">
      <div className="vad-modal-backdrop" onClick={close} />
      <section className="vad-modal-dialog" role="dialog" aria-modal="true" aria-label={title}>
        <header className="vad-modal-header">
          <div><span className="vad-modal-eyebrow">VIWANDA PORTAL · ICT ADMIN</span><h2>{title}</h2>
            <p>Details reported by the portal.</p>
          </div>
          <button className="vad-modal-close" type="button" onClick={close} aria-label="Close"><X size={19} /></button>
        </header>
        <div className="vad-modal-content">
          {kind === "performance" && <div className="vad-insight-split"><PerformanceChart points={dashboard.performance} height={310} /><aside className="vad-insight-key"><h3>Key Details</h3><KV rows={[
            ['Reporting window', dashboard.performance?.length ? `${dashboard.performance.length} telemetry readings` : 'No telemetry returned'],
            ...['cpu','memory','disk'].map(key => [key.toUpperCase(), dashboard.performance?.length ? valueOf(dashboard.performance[dashboard.performance.length-1]?.[key]) + '%' : 'Not reported']),
          ]} /></aside></div>}
          {kind === "storage" && <div className="vad-insight-split"><StorageChart storage={dashboard.storage} height={310} /><aside className="vad-insight-key"><h3>Key Details</h3><KV rows={Object.entries(dashboard.storage || {})} /></aside></div>}
          {kind === "servers" && <KV rows={(dashboard.servers || []).map((record) => [record.name, `${valueOf(record.status)} · ${valueOf(record.uptime)}`])} />}
          {kind === "logs" && <KV rows={(dashboard.logs || []).map((record) => [valueOf(record.time), `${valueOf(record.level)} · ${valueOf(record.message)}`])} />}
          {kind === "users" && <KV rows={(dashboard.recentUsers || []).map((record) => [record.name, `${valueOf(record.role)} · ${valueOf(record.institution)}`])} />}
          {! ["performance", "storage", "servers", "logs", "users"].includes(kind) && <div className="vad-insight-split"><div className="vad-insight-stat"><strong>{valueOf(item?.value)}</strong><span>{title}</span></div><aside className="vad-insight-key"><h3>Key Details</h3><KV rows={details.length ? details : [['Details','No additional information']]} /></aside></div>}
        </div>
        <footer className="vad-modal-footer"><button type="button" className="vad-close-button" onClick={close}>Close</button></footer>
      </section>
    </div>, document.body
  );
}

function Panel({ title, children, onClick, className = "" }) {
  return (
    <section className={`vad-panel vi-insight-trigger ${className}`} role="button" tabIndex={0} aria-haspopup="dialog"
      onClick={(event) => { if (!event.target.closest('a, button, input, select')) onClick?.(); }}
      onKeyDown={(event) => { if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); onClick?.(); } }}>
      <header className="vad-panel-header"><h2>{title}</h2></header>
      {children}
    </section>
  );
}

export default function AdminDashboard() {
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useErrorDialogState("");
  const [selected, setSelected] = useState(null);
  const [window, setWindow] = useState("24h");
  const [attempt, setAttempt] = useState(0);
  const close = useCallback(() => setSelected(null), []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    getAdminDashboard(window, controller.signal)
      .then((payload) => setDashboard(payload))
      .catch((err) => { if (!controller.signal.aborted) { setDashboard(null); setError(apiError(err)); } })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [window, attempt]);

  const metrics = useMemo(() => {
    if (Array.isArray(dashboard?.metrics)) return dashboard.metrics;
    // No invented values: derived only from counters actually present in API response.
    const counters = dashboard?.summary ?? dashboard?.counts ?? {};
    return [
      ["users", "Total Users"], ["institutions", "Institutions"],
      ["submissions", "Submissions"], ["datasets", "Datasets"],
      ["roles", "Roles"], ["uptime", "System Uptime"],
    ].map(([id, label]) => ({ id, label, value: counters[id] ?? null }));
  }, [dashboard]);

  const performance = Array.isArray(dashboard?.performance) ? dashboard.performance : [];
  const servers = Array.isArray(dashboard?.servers) ? dashboard.servers : [];
  const logs = Array.isArray(dashboard?.logs) ? dashboard.logs : [];
  const recentUsers = Array.isArray(dashboard?.recentUsers) ? dashboard.recentUsers : [];
  const open = (kind, item = null) => setSelected({ kind, item });

  return (
    <main className="vad-admin-dashboard" aria-label="System Administrator Dashboard">
      <div className="vad-heading">
        <div>
          <div className="vad-breadcrumb">Home / System Admin / Dashboard</div>
          <h1>System Administrator Dashboard</h1>
          <p>Live portal information.</p>
        </div>
        <div className="d-flex gap-2 align-items-center">
          <select className="form-select form-select-sm" value={window} onChange={(event) => setWindow(event.target.value)} aria-label="Performance window">
            <option value="24h">Last 24 hours</option><option value="7d">Last 7 days</option><option value="30d">Last 30 days</option>
          </select>
          <button type="button" className="btn btn-outline-primary btn-sm" onClick={() => setAttempt((value) => value + 1)}><RefreshCw size={15} /> Refresh</button>
        </div>
      </div>
      {loading && <div className="alert alert-info" role="status">Loading live dashboard data...</div>}
      
      {!loading && !error && dashboard && (
        <>
          <div className="vad-metrics-grid">
            {metrics.map((metric, index) => {
              const Icon = metricIcons[metric.id] || Activity;
              return (
                <button key={metric.id || index} className={`vad-metric vad-tint-${["blue", "green", "orange", "purple", "blue", "green"][index % 6]}`} type="button" onClick={() => open("metric", metric)}>
                  <span className="vad-metric-icon"><Icon size={24} /></span>
                  <span className="vad-metric-copy">
                    <strong className="vad-metric-value">{valueOf(metric.value)}</strong>
                    <span className="vad-metric-label">{metric.label || metric.id}</span>
                    {metric.change != null && <span className="vad-metric-change">{valueOf(metric.change)}</span>}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="vad-primary-grid">
            <Panel className="vad-panel-performance" title="System Performance" onClick={() => open("performance")}>
              <button type="button" className="vad-chart-click" onClick={() => open("performance")} aria-label="Open performance detail"><PerformanceChart points={performance} /></button>
            </Panel>
            <Panel className="vad-panel-servers" title="Server Status" onClick={() => open("servers")}>
              {!servers.length && <p className="p-3 text-muted">No service status returned.</p>}
              <div className="vad-server-list">{servers.map((service, index) => (
                <button type="button" className="vad-server-row" key={service.id || index} onClick={() => open("server", service)}>
                  <span className="vad-server-name">{service.name}</span>
                  <span className="vad-service-status">{valueOf(service.status)}</span>
                  <small>{valueOf(service.uptime)}</small>
                </button>
              ))}</div>
            </Panel>
            <Panel className="vad-panel-storage" title="Storage Usage" onClick={() => open("storage")}>
              <button type="button" className="vad-chart-click" onClick={() => open("storage")} aria-label="Open storage detail"><StorageChart storage={dashboard.storage} /></button>
            </Panel>
          </div>
          <div className="vad-secondary-grid">
            <Panel title="Recent System Logs" onClick={() => open("logs")}>
              <div className="vad-table-scroll"><table className="vad-table">
                <thead><tr><th>Time</th><th>Level</th><th>Module</th><th>Message</th></tr></thead>
                <tbody>
                  {logs.map((entry, index) => <tr key={entry.id || index} tabIndex={0} onClick={() => open("log", entry)} onKeyDown={(event) => { if (event.key === "Enter") open("log", entry); }}>
                    <td>{valueOf(entry.time)}</td><td>{valueOf(entry.level)}</td><td>{valueOf(entry.module)}</td><td>{valueOf(entry.message)}</td>
                  </tr>)}
                  {!logs.length && <tr><td colSpan={4}>No log records returned.</td></tr>}
                </tbody>
              </table></div>
            </Panel>
            <Panel title="Recent Users" onClick={() => open("users")}>
              <div className="vad-table-scroll"><table className="vad-table">
                <thead><tr><th>Name</th><th>Institution</th><th>Role</th><th>Created</th></tr></thead>
                <tbody>
                  {recentUsers.map((record, index) => <tr key={record.id || index} tabIndex={0} onClick={() => open("user", record)} onKeyDown={(event) => { if (event.key === "Enter") open("user", record); }}>
                    <td>{valueOf(record.name)}</td><td>{valueOf(record.institution)}</td><td>{valueOf(record.role)}</td><td>{valueOf(record.joined ?? record.created_at)}</td>
                  </tr>)}
                  {!recentUsers.length && <tr><td colSpan={4}>No user records returned.</td></tr>}
                </tbody>
              </table></div>
            </Panel>
          </div>
          <Panel className="vad-quick-section" title="Quick Access" onClick={() => open("quick", { label: "Quick Access", description: "Navigate to existing authorized modules using the sidebar." })}>
            <div className="vad-quick-grid">
              <Link className="vad-quick-action" to="/dashboard/administration/users">
                <Users size={22} /> <span>User Management</span>
              </Link>
              <Link className="vad-quick-action" to="/dashboard/administration/institutions">
                <Building2 size={22} /> <span>Institutions Management</span>
              </Link>
            </div>
          </Panel>
        </>
      )}
      {selected && <DetailModal selected={selected} dashboard={dashboard || {}} close={close} />}
    </main>
  );
}
