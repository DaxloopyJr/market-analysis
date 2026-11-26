/**
 * DATASET MANAGEMENT BACKEND INTEGRATION GUIDE
 * Pages: ModulePage.jsx (datasets / consumers / periods), DataEntry.jsx.
 * Detailed template ownership and working mock registration are in
 * services/datasetRegistryService.jsx. There is ONE definition per dataset
 * with indicators[]; DataEntry.jsx builds the table from that array.
 * Client: Auth/Api.jsx (Axios)
 * ALL endpoints and JSON shapes below are EXAMPLES, not confirmed by Laravel.
 * UI uses mock role permissions; NO data request is issued yet.
 *
 * TODO(BACKEND) LIST DATASETS — authorized scope only:
 *   import api from "../Auth/Api";
 *   export async function listDatasets({page=1, search=""}={}) {
 *     const {data} = await api.get("/api/v1/datasets", {params:{page,search}});
 *     return data;
 *   }
 * Example response:
 *   {"data":[{"id":21,"code":"IND-001","name":"Industrial Output",
 *     "status":"active","periodicity":"quarterly","can_configure":false}],
 *     "meta":{"current_page":1,"total":1}}
 *
 * TODO(BACKEND) CREATE DATASET — MOA / IA within permitted scope:
 *   const payload = { name:"Industrial Output", code:"IND-001",
 *     frequency:"quarterly", institution_id: 11,
 *     indicators:[{key:"output_units",label:"Units",unit:"Units",type:"number",required:true,order:1}] };
 *   const {data} = await api.post("/api/v1/datasets", payload);
 *   // Expected: {"data":{"id":21,"name":"Industrial Output"}}
 *   // Backend must reject any institution_id outside the authorized scope.
 *   // For edit: PATCH /api/v1/datasets/{id}, payload {name, indicators}.
 *   // For deactivate: PATCH /api/v1/datasets/{id}/deactivate (soft delete).
 *
 * TODO(BACKEND) DATA CONSUMERS — MOA/IA configure:
 *   const {data} = await api.get("/api/v1/datasets/21/consumers");
 *   // Expected: {"data":[{"user_id":9,"name":"Consumer","access":"view"}]}
 *   await api.put("/api/v1/datasets/21/consumers", {user_ids:[9,12]});
 *   // Expected: {"message":"Consumers updated"}
 *
 * TODO(BACKEND) SUBMISSION PERIODS — all may view; MOA/IA configure:
 *   const {data} = await api.get("/api/v1/submission-periods", {
 *     params:{dataset_id:21, status:"open"}});
 *   // Expected: {"data":[{"id":7,"dataset_id":21,"label":"Q1 2026/27",
 *   // "opens_at":"2026-07-01","closes_at":"2026-09-30","status":"open"}]}
 *   await api.post("/api/v1/submission-periods", {
 *     dataset_id:21, label:"Q2 2026/27",
 *     opens_at:"2026-10-01", closes_at:"2026-12-31"});
 *   await api.patch("/api/v1/submission-periods/7", {status:"closed"});
 *
 * Error contract to confirm: 401 (expired), 403 (scope),
 * 422 {message,errors:{field:[...]}}, 409 (duplicate/closed period).
 */
export const datasetServiceReady = false;
