/**
 * FILE: src/services/datasetRegistryService.jsx
 * FLOW: Dataset pages -> datasetRegistryService -> src/API/axios.jsx
 * -> Laravel datasets -> PostgreSQL. No seeded records or sessionStorage.
 * TODO(BACKEND): Confirm datasets endpoints, schema and permission rules.
 */
import api from "../API/axios";
import { listResult, requireServerResult } from "../API/resourceHelpers";

const ROOT = import.meta.env.VITE_DATASETS_API_PATH || "/datasets";
/** Verified GET /datasets. These are scope-visible definitions, not confirmed assignments. */
export async function getAssignedDatasetDefinitions() {
  return (await listResult(await api.get(ROOT, {params:{status:"active",perPage:100}}))).items;
}
export async function saveAdminDataset(_user, payload) {
  const { id, ...data } = payload;
  return requireServerResult(await (id
    ? api.patch(`${ROOT}/${encodeURIComponent(id)}`, data)
    : api.post(ROOT, data)));
}
// Legacy named export retained for components importing it; all writes are real.
export const saveMockAdminDataset = saveAdminDataset;
