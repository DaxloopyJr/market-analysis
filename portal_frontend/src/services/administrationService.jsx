/**
 * ADMINISTRATION API HOOKS — NO requests are active until Laravel is confirmed.
 * Pages: ModulePage.jsx -> institutions, departments, institution-admins,
 * users, roles, settings. See also approvalService.jsx for Approval Circle.
 * Import client inside each implemented function: import api from "../Auth/Api";
 *
 * TODO(BACKEND) INSTITUTIONS (MOA all, IA own READ only):
 *   const {data} = await api.get("/api/v1/institutions", {params:{page:1}});
 *   // {"data":[{"id":11,"name":"CAMARTEC","status":"active"}],"meta":{"total":13}}
 *   const newInstitution = {name:"Example Institution",code:"EXM",status:"active"};
 *   await api.post("/api/v1/institutions", newInstitution); // MOA only
 *   await api.patch("/api/v1/institutions/11", {name:"CAMARTEC"}); // MOA only
 *   await api.patch("/api/v1/institutions/11/deactivate", {}); // MOA only, soft-delete
 *
 * TODO(BACKEND) MINISTRY DEPARTMENTS (MOA only):
 *   const {data} = await api.get("/api/v1/departments");
 *   // {"data":[{"id":2,"name":"Department of Industry Development"}]}
 *   await api.post("/api/v1/departments", {name:"New Department"});
 *   await api.patch("/api/v1/departments/2", {name:"Updated Department"});
 *
 * TODO(BACKEND) INSTITUTIONAL ADMINS (MOA only):
 *   const {data} = await api.get("/api/v1/institution-admins");
 *   await api.post("/api/v1/institution-admins", {
 *     name:"Institution Admin", email:"admin@example.or.tz", institution_id:11,
 *     role_code:"IA"});
 *
 * TODO(BACKEND) USERS (MOA all, IA own institution only):
 *   const {data} = await api.get("/api/v1/users", {params:{page:1,search:""}});
 *   // {"data":[{"id":14,"name":"Amina","role_code":"IDO",
 *   // "institution":{"id":11,"name":"CAMARTEC"},"status":"active"}]}
 *   await api.post("/api/v1/users", {
 *     name:"New Officer",email:"officer@example.or.tz",
 *     role_code:"IDO", institution_id:11});
 *   await api.patch("/api/v1/users/14", {role_code:"IDO"});
 *   await api.patch("/api/v1/users/14/deactivate", {});
 *   // Backend MUST bind IA to own institution even if client forges institution_id.
 *
 * TODO(BACKEND) ROLES AND PERMISSIONS (MOA only):
 *   const {data} = await api.get("/api/v1/roles");
 *   // {"data":[{"code":"IA","label":"Institution Admin",
 *   // "permissions":["users.manage_own","dashboard.view"]}]}
 *   await api.put("/api/v1/roles/IA/permissions", {
 *     permissions:["dashboard.view","users.manage_own"]});
 *   // IMPORTANT: role codes / capabilities must be aligned to October 2026 matrix.
 *
 * TODO(BACKEND) PORTAL SETTINGS (MOA only):
 *   const {data} = await api.get("/api/v1/settings");
 *   // {"data":{"portal_name":"VIWANDA PORTAL","contact_email":"..."}}
 *   await api.patch("/api/v1/settings", {portal_name:"VIWANDA PORTAL"});
 *
 * Expected errors: 401 unauthenticated, 403 forbidden/out-of-scope,
 * 404 not found, 409 conflict, 422 {errors:{field:[messages]}}.
 * Validate each field server-side; log admin changes to immutable audit logs.
 */
export const administrationServiceReady = false;
