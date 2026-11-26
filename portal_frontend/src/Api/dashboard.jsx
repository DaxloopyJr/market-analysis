/**
 * FILE: src/API/dashboard.jsx
 * FLOW: /dashboard (MOA) -> Admin/AdminDashboard.jsx -> API/dashboard.jsx
 *   -> API/axios.jsx -> Laravel (dashboard.view and scoped monitoring) -> database/monitoring.
 * TODO(BACKEND): Backend must expose true counts + telemetry/health. Endpoint
 * default is proposed, not verified. No fabricated uptime/logs/metrics.
 */
import api from "./axios";
import { requireServerResult } from "./resourceHelpers";

const ROOT = import.meta.env.VITE_ADMIN_DASHBOARD_API_PATH || "/admin/dashboard";
export async function getAdminDashboard(window = "24h", signal) {
  const data = requireServerResult(await api.get(ROOT, {
    params: { window },
    signal,
  }));
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("The server sent an unexpected response.");
  }
  return data;
}

/**
 * GET /api/v1/dashboard?fy=all|2025/2026&institution_id&department_id (permission dashboard.view; original backend).
 * One request with what a role dashboard shows, scoped by Laravel to the signed-in user (16 Nov 2026):
 *   {data:{scope, fy, cards:{draft,submitted,under_review,returned,approved,published,pending_approvals,awaiting_ministry,
 *     institutions,departments,...}, pending_approvals:[≤20], published_data:[≤20], recent_activity:[≤20],
 *     recent_grouped, by_institution, by_department, filters:{institutions,departments}, limits}}
 */
export async function fetchDashboard(params = {}) {
  const query = Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ""));
  const response = await api.get("/dashboard", { params: query });
  return response.data?.data ?? response.data;
}
