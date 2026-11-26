/**
 * FILE: src/API/strategicPlans.js
 * FLOW: StrategicPlans page -> this module -> API/axios.jsx -> Laravel /api/v1.
 * CONFIRMED CONTRACT (28 Oct 2026, endpoints 133–140):
 *  GET    /strategic-plans                 ?institutionId&status=draft|active&perPage&page  (flat paginator)
 *  POST   /strategic-plans                 {institutionId?, name, startDate, endDate}       -> 201 draft plan
 *  GET    /strategic-plans/{id}            -> plan + objectiveVersions (full history)
 *  PATCH  /strategic-plans/{id}            {name?, startDate?, endDate?}  (draft only; 409 when active)
 *  POST   /strategic-plans/{id}/objectives {code, description, effectiveFrom}               -> version 1
 *  PATCH  /strategic-plans/{id}/objectives/{objectiveId} {description?, effectiveFrom?}     (draft only)
 *  POST   /strategic-plans/{id}/activate   (needs ≥1 objective effective at plan start; 409 overlap)
 *  POST   /strategic-plans/{id}/objectives/{objectiveId}/versions {description, effectiveFrom, reason}
 * No delete / deactivate endpoints exist. Laravel enforces role + institution scope on every call.
 */
import api from "./axios";
import { operationResult } from "./resourceHelpers";

const ROOT = "/strategic-plans";
const id = (value) => encodeURIComponent(value);

/** Laravel returns a flat paginator {current_page,data,per_page,total}; keep its total. */
export async function listStrategicPlans({ institutionId, status, page = 1, perPage = 20 } = {}) {
  const response = await api.get(ROOT, { params: {
    ...(institutionId ? { institutionId } : {}), ...(status ? { status } : {}), page, perPage,
  } });
  const body = response.data ?? {};
  const items = Array.isArray(body.data) ? body.data : Array.isArray(body) ? body : [];
  return {
    items,
    total: Number(body.total ?? body.meta?.total ?? items.length),
    currentPage: Number(body.current_page ?? body.meta?.current_page ?? page),
    lastPage: Number(body.last_page ?? body.meta?.last_page ?? 1),
    perPage: Number(body.per_page ?? body.meta?.per_page ?? perPage),
  };
}

export async function getStrategicPlan(planId) {
  const response = await api.get(`${ROOT}/${id(planId)}`);
  return response.data?.data ?? response.data;
}

export const createStrategicPlan = async (payload) => operationResult(await api.post(ROOT, payload));
export const updateStrategicPlan = async (planId, fields) => operationResult(await api.patch(`${ROOT}/${id(planId)}`, fields));
export const activateStrategicPlan = async (planId) => operationResult(await api.post(`${ROOT}/${id(planId)}/activate`));
export const createObjective = async (planId, payload) =>
  operationResult(await api.post(`${ROOT}/${id(planId)}/objectives`, payload));
export const updateObjective = async (planId, objectiveId, fields) =>
  operationResult(await api.patch(`${ROOT}/${id(planId)}/objectives/${id(objectiveId)}`, fields));
export const addObjectiveVersion = async (planId, objectiveId, payload) =>
  operationResult(await api.post(`${ROOT}/${id(planId)}/objectives/${id(objectiveId)}/versions`, payload));

export {latestObjectiveVersions, planFinancialYears} from "../utils/strategicPlanDisplay.js";
