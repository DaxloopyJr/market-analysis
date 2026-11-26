/**
 * VIWANDA PORTAL / System Administrator Dashboard / DEMO DATA ONLY
 *
 * FLOW:
 *   AdminDashboard.jsx --> adminDashboardMockData.js --> read-only rendering
 *   Click on a metric/chart/row --> local details modal (no database write)
 *
 * TODO(BACKEND): Replace imports of this module inside AdminDashboard.jsx only
 * after the real API contract is agreed; do not change existing auth or pages.
 * All names, events, metrics and dates here are illustrative and NOT live data.
 */

export const dashboardMock = {
  demo: true,
  snapshot: "Illustrative preview data (not connected to Laravel)",
  metrics: [
    {
      id: "users",
      label: "Total Users",
      value: "356",
      icon: "users",
      tint: "blue",
      change: "+12%",
      note: "from previous month",
      explanation: "All registered portal user accounts across authorized organizations.",
      rows: [
        ["Active", "329"],
        ["Inactive", "19"],
        ["Pending activation", "8"],
        ["Reporting period", "Illustrative month"]
      ]
    },
    {
      id: "institutions",
      label: "Institutions",
      value: "13",
      icon: "building",
      tint: "cyan",
      change: "0%",
      note: "target participating institutions",
      explanation: "Participating institutions whose data access and submissions are centrally managed.",
      rows: [
        ["Participating institutions", "13"],
        ["Connected API integrations", "9 (demo)"],
        ["Manual submissions", "4 (demo)"],
        ["Institution scope", "Ministry administrator"]
      ]
    },
    {
      id: "submissions",
      label: "Total Submissions",
      value: "842",
      icon: "database",
      tint: "mint",
      change: "+18%",
      note: "from previous month",
      explanation: "Submissions received in the portal, across permitted institutional datasets.",
      rows: [
        ["Published", "511"],
        ["Approved, not published", "143"],
        ["Submitted / in review", "161"],
        ["Returned", "27"]
      ]
    },
    {
      id: "datasets",
      label: "Datasets",
      value: "32",
      icon: "file",
      tint: "sky",
      change: "+6%",
      note: "from previous month",
      explanation: "Available data collection definitions; access still depends on authorization.",
      rows: [
        ["Active datasets", "29"],
        ["Draft datasets", "3"],
        ["Submission periods", "Quarterly / Monthly (demo)"]
      ]
    },
    {
      id: "roles",
      label: "Roles",
      value: "11",
      icon: "shield",
      tint: "purple",
      change: "No change",
      note: "roles in approved matrix",
      explanation: "System role definitions. Effective rights come from the user's permissions and scope.",
      rows: [
        ["Matrix-defined roles", "11"],
        ["Permission policy", "Deny by default"],
        ["Institution access", "Scoped in Laravel"]
      ]
    },
    {
      id: "uptime",
      label: "System Uptime",
      value: "99.8%",
      icon: "pulse",
      tint: "lavender",
      change: "+0.2%",
      note: "from previous month",
      explanation: "Illustrative uptime; production value must come from validated monitoring.",
      rows: [
        ["Current availability", "99.8% (demo)"],
        ["Measurement window", "Last 30 days (demo)"],
        ["Source", "Monitoring service (future integration)"]
      ]
    }
  ],
  performance: [
    { time: "00:00", cpu: 28, memory: 67, disk: 18 },
    { time: "02:00", cpu: 31, memory: 71, disk: 21 },
    { time: "04:00", cpu: 26, memory: 69, disk: 16 },
    { time: "06:00", cpu: 35, memory: 73, disk: 24 },
    { time: "08:00", cpu: 34, memory: 71, disk: 27 },
    { time: "10:00", cpu: 29, memory: 68, disk: 20 },
    { time: "12:00", cpu: 37, memory: 73, disk: 24 },
    { time: "14:00", cpu: 41, memory: 77, disk: 30 },
    { time: "16:00", cpu: 33, memory: 69, disk: 23 },
    { time: "18:00", cpu: 28, memory: 64, disk: 19 },
    { time: "20:00", cpu: 36, memory: 70, disk: 22 },
    { time: "22:00", cpu: 30, memory: 66, disk: 17 }
  ],
  servers: [
    { id: "web", name: "Web Server", service: "Web application", status: "Running", uptime: "12 days" },
    { id: "api", name: "Laravel API", service: "Backend API", status: "Running", uptime: "12 days" },
    { id: "db", name: "PostgreSQL", service: "Portal database", status: "Running", uptime: "12 days" },
    { id: "queue", name: "Queue Worker", service: "Background jobs", status: "Running", uptime: "11 days" },
    { id: "files", name: "File Storage", service: "Uploads and exports", status: "Running", uptime: "12 days" },
    { id: "cron", name: "Scheduler", service: "Scheduled tasks", status: "Running", uptime: "12 days" }
  ],
  storage: {
    totalGB: 100,
    usedGB: 42,
    freeGB: 58,
    breakdown: [
      ["User uploads", "20 GB"],
      ["Reports & exports", "9 GB"],
      ["Application files", "8 GB"],
      ["Other", "5 GB"],
      ["Free capacity", "58 GB"]
    ]
  },
  logs: [
    { id: 201, time: "16:20", level: "INFO", module: "Auth", message: "Demo login completed", explanation: "Example authentication event; no real identity was queried." },
    { id: 202, time: "15:55", level: "WARNING", module: "Upload", message: "Large sample attachment detected", explanation: "Example size warning intended for monitoring dashboards." },
    { id: 203, time: "15:20", level: "INFO", module: "Users", message: "Demo user account created", explanation: "Illustrative audit event; no real account was created." },
    { id: 204, time: "14:45", level: "ERROR", module: "Integration", message: "Example external API timeout", explanation: "Historical sample integration event, not a current outage." },
    { id: 205, time: "14:10", level: "INFO", module: "Backup", message: "Demo backup completed", explanation: "Illustrative entry only; no backup was actually executed." }
  ],
  recentUsers: [
    { id: "U-001", name: "Demo Officer A", institution: "Institution A", role: "Data Officer", joined: "2026-10-17", status: "Active" },
    { id: "U-002", name: "Demo Officer B", institution: "Institution B", role: "Data Officer", joined: "2026-10-17", status: "Active" },
    { id: "U-003", name: "Demo Reviewer C", institution: "Institution C", role: "Reviewer", joined: "2026-10-16", status: "Active" },
    { id: "U-004", name: "Demo User D", institution: "Institution D", role: "Read-only", joined: "2026-10-15", status: "Pending" }
  ],
  quickActions: [
    { id: "add-user", name: "Add User", icon: "users", note: "User registration page to be discussed later." },
    { id: "register-institution", name: "Institutions", icon: "building", note: "Institution administration is outside this dashboard-only phase." },
    { id: "manage-roles", name: "Manage Roles", icon: "shield", note: "Roles/permissions screens will be approved separately." },
    { id: "settings", name: "System Settings", icon: "settings", note: "Configuration actions are intentionally disabled in this preview." },
    { id: "audit", name: "Audit Logs", icon: "logs", note: "A dedicated audit-log page will be designed later." },
    { id: "backup", name: "Backup", icon: "backup", note: "No database backup is triggered by the preview." },
    { id: "cache", name: "Clear Cache", icon: "refresh", note: "No cache-clearing request is sent by this preview." },
    { id: "monitor", name: "Monitoring", icon: "pulse", note: "Monitoring details will be sourced from approved APIs later." }
  ]
};
