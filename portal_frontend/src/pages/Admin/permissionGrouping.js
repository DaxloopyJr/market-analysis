/**
 * FILE: src/pages/Admin/permissionGrouping.js
 * FLOW: RolesPermissions.jsx -> GET /permissions via src/API/roles.jsx
 *     -> permissionGrouping.js -> PermissionTree.jsx (display grouping only).
 * Purpose: Group the permission records returned by Laravel into familiar
 * VIWANDA Portal navigation modules. This file contains NO permission IDs,
 * NO locally granted access, NO API calls, and NO sample records.
 * The role->permission decisions are made ONLY by Laravel.
 */

// Presentation-only labels and display order from approved VIWANDA sidebar.
export const MODULE_ORDER = Object.freeze([
  "Dashboard",
  "Submissions",
  "Dataset Management",
  "Administration",
  "Analytics",
  "Reports",
  "Audit Logs",
  "System Monitoring",
]);

const PREFIX_TO_GROUP = Object.freeze({
  dashboard: "Dashboard",
  submissions: "Submissions",
  submission: "Submissions",
  data_entry: "Submissions",
  datasets: "Dataset Management",
  dataset: "Dataset Management",
  data_consumers: "Dataset Management",
  submission_periods: "Dataset Management",
  institutions: "Administration",
  institutional_admins: "Administration",
  departments: "Administration",
  ministry_departments: "Administration",
  users: "Administration",
  roles: "Administration",
  permissions: "Administration",
  approval_circle: "Administration",
  portal_settings: "Administration",
  administration: "Administration",
  analytics: "Analytics",
  institution_analytics: "Analytics",
  reports: "Reports",
  reporting: "Reports",
  audit_logs: "Audit Logs",
  audit: "Audit Logs",
  logs: "Audit Logs",
  system_monitoring: "System Monitoring",
  monitoring: "System Monitoring",
  integrations: "System Monitoring",
});

const MODULE_ALIASES = Object.freeze({
  "dataset management": "Dataset Management",
  "data management": "Dataset Management",
  "administration": "Administration",
  "audit logs": "Audit Logs",
  "approval circle": "Administration",
  "institution analytics": "Analytics",
  "system monitoring": "System Monitoring",
});

function normalize(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

function toDisplayTitle(value) {
  return String(value)
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

/**
 * Backend may omit the `module` attribute or set it to `Other`.
 * For the approved module groups, the permission CODE is more reliable.
 * An unknown module gets its own human-friendly group rather than being
 * forced under a single catch-all `Other` heading.
 */
export function groupForPermission(permission) {
  const codePrefix = normalize(permission?.code?.split(".")?.[0]);
  if (PREFIX_TO_GROUP[codePrefix]) {
    return PREFIX_TO_GROUP[codePrefix];
  }

  const rawModule = normalize(permission?.module);
  if (PREFIX_TO_GROUP[rawModule]) {
    return PREFIX_TO_GROUP[rawModule];
  }

  const readableModule = rawModule.replaceAll("_", " ");
  if (MODULE_ALIASES[readableModule]) {
    return MODULE_ALIASES[readableModule];
  }

  if (rawModule && !["other", "misc", "miscellaneous", "general", "unknown", "null"].includes(rawModule)) {
    return toDisplayTitle(rawModule);
  }

  // No valid backend module? Derive a section from the permission code.
  return codePrefix ? toDisplayTitle(codePrefix) : "General Access";
}

export function groupPermissions(permissions = []) {
  const groups = new Map();

  for (const permission of permissions) {
    if (!permission || permission.id == null) continue;
    const title = groupForPermission(permission);
    if (!groups.has(title)) groups.set(title, []);
    groups.get(title).push(permission);
  }

  return [...groups.entries()]
    .sort(([left], [right]) => {
      const leftIndex = MODULE_ORDER.indexOf(left);
      const rightIndex = MODULE_ORDER.indexOf(right);
      if (leftIndex !== -1 && rightIndex !== -1) return leftIndex - rightIndex;
      if (leftIndex !== -1) return -1;
      if (rightIndex !== -1) return 1;
      return left.localeCompare(right);
    })
    .map(([title, items]) => ({ title, items }));
}

/** Presentation label; do not change the backend permission code itself. */
export function permissionLabel(permission) {
  const serverName = String(permission?.name || "").trim();
  const code = String(permission?.code || "").trim();
  if (serverName && serverName.toLowerCase() !== code.toLowerCase()) return serverName;

  const words = code.split(".").slice(1).join(" ").replace(/_/g, " ");
  return words ? toDisplayTitle(words) : code || "Unnamed permission";
}
