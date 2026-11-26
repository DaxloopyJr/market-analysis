/** FILE: src/API/audit.jsx
 * FLOW: pages/AuditLogs/AuditLogs.jsx -> this module -> API/axios.jsx -> Laravel API.
 *
 * CONFIRMED Laravel audit contract (API list #120, #121 — read-only, immutable history):
 *   GET /audit-events?eventType=&actorType=&entityType=&entityId=&userId=&requestId=&startDate=&endDate=&perPage=&page=
 *     -> {data:[{id,userId,actorType,eventType,entityType,entityId,requestId,oldValues,newValues,reason,ipAddress,createdAt,actor}],links,meta}
 *   GET /audit-events/{id} -> {data:{...same fields}}
 * Rules: dates YYYY-MM-DD, endDate >= startDate; requestId is a UUID; perPage 1–100 (default 20).
 * Scope is decided by Laravel: audit.readAll / audit_logs.view.ministry = ministry-wide;
 * audit_logs.view.institution = events stamped with the user's institution only (other IDs return 404).
 * The UI never creates, edits or deletes audit records.
 */
import api from './axios';

const clean = params => Object.fromEntries(Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== '' && value !== 'all'));

export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** One page of audit events. Returns {items, meta:{current_page,per_page,total,last_page}}. */
export async function listAuditEvents({page = 1, perPage = 20, ...filters} = {}) {
  const response = await api.get('/audit-events', {params: clean({...filters, page, perPage: Math.min(100, Math.max(1, perPage))})});
  const body = response.data ?? {};
  const items = Array.isArray(body.data) ? body.data : Array.isArray(body.data?.data) ? body.data.data : [];
  const meta = body.meta ?? body.data?.meta ?? {};
  const total = Number(meta.total ?? body.total ?? items.length);
  const perPageValue = Number(meta.per_page ?? perPage);
  return {items, meta: {current_page: Number(meta.current_page ?? page), per_page: perPageValue, total,
    last_page: Number(meta.last_page ?? Math.max(1, Math.ceil(total / perPageValue)))}};
}

/** One audit event (Laravel returns 404 outside the user's scope). */
export async function getAuditEvent(id) {
  const value = Number(id);
  if (!Number.isSafeInteger(value) || value < 1) throw new Error('Invalid audit event ID.');
  const response = await api.get(`/audit-events/${value}`);
  return response.data?.data ?? null;
}

export const auditServiceReady = true;
