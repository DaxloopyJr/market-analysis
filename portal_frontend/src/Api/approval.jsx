/** FILE: src/API/approval.jsx
 * FLOW: React page/module -> this module -> API/axios.jsx -> Laravel API (only where implemented).
 * TODO(BACKEND): Unverified endpoints remain documentation only.
 */
/**
 * APPROVAL CIRCLE CONFIGURATION — ModulePage.jsx "approval-circle".
 * Matrix: MOA configures global Ministry sequence; IA configures HoD+AO for
 * OWN institution only. This does not give MOA/IA approval authority.
 * All endpoints are EXAMPLES, not confirmed.
 *
 * TODO(BACKEND): LIST WORKFLOWS WITH AUTHENTICATED SCOPE
 *   import api from "./axios";
 *   const {data} = await api.get("/api/v1/approval-workflows");
 *   // {"data":[{"id":8,"scope":"institution","institution_id":11,
 *   // "steps":[{"order":1,"role_code":"HoD","user_id":4},
 *   //          {"order":2,"role_code":"AO","user_id":5}]}]}
 *
 * TODO(BACKEND): UPDATE OWN APPROVAL WORKFLOW (IA) / GLOBAL (MOA)
 *   const payload = {scope:"institution",institution_id:11,
 *     steps:[{order:1,role_code:"HoD",user_id:4},
 *            {order:2,role_code:"AO",user_id:5}]};
 *   const {data} = await api.put("/api/v1/approval-workflows/8", payload);
 *   // {"data":{"id":8,"version":2,"updated_at":"..."}}
 *
 * Confirm how global + institution workflows compose; audit every change.
 * Must verify assigned user belongs to the correct institution/department.
 */
export const approvalServiceReady = false;
