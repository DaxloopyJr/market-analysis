/**
 * Future Data Entry / Submissions pages -> submissionService.jsx -> Api.jsx.
 * These examples are intentionally commented: backend routes are unconfirmed.
 */

// TODO(BACKEND): Fetch institution submissions.
// import api from "./Api";
// export async function getSubmissions(filters = {}) {
//   const response = await api.get("/api/v1/submissions", { params: filters });
//   return response.data;
// }

// TODO(BACKEND): Create a submission; align payload fields with real dataset schema.
// export async function createSubmission(payload) {
//   const response = await api.post("/api/v1/submissions", payload);
//   return response.data;
// }

// TODO(BACKEND): Resubmit returned record.
// export async function resubmitRecord(id, payload) {
//   const response = await api.patch(`/api/v1/submissions/${id}`, payload);
//   return response.data;
// }

export const submissionApiStatus = "waiting-for-backend-contract";
