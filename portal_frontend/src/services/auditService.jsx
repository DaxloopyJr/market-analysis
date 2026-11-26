/**
 * AUDIT LOGS — ModulePage.jsx (audit), read-only UI.
 * MOA: portal-wide; IA: institution-scoped; others: NO ACCESS per matrix.
 * All API routes below UNCONFIRMED.
 *
 * TODO(BACKEND): example request / response:
 *   import api from "../Auth/Api";
 *   const {data} = await api.get("/api/v1/audit-logs", {
 *     params:{page:1,action:"submission.approve",from:"2026-10-01"}});
 *   // {"data":[{"id":991,"actor":{"id":12,"name":"Officer"},
 *   // "action":"submission.approve","subject_type":"submission",
 *   // "subject_id":501,"created_at":"2026-10-17T08:25:00Z"}],
 *   // "meta":{"current_page":1,"total":1}}
 *
 * Laravel must never expose audit logs to IDO/OMU/ME unless
 * the permission model is formally amended. Audit logs are append-only,
 * tamper protected, server-generated and not editable or deletable by UI.
 * IA must not access other institutions even with forged filter parameters.
 */
export const auditServiceReady = false;
