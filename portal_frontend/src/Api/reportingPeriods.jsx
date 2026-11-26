/**
 * FILE: src/API/reportingPeriods.jsx
 * ROUTE: /dashboard/submission-periods (MOA configuration).
 * FLOW: SubmissionPeriods.jsx -> this API -> axios.jsx -> Laravel /api/v1/reporting-periods.
 * GLOBAL RULE: MOA creates periods once for all entities. No institutionId is sent,
 * including null, on list/create/update. All authenticated institutions consume them.
 * DATE CONTRACT: startDate / endDate / deadline = YYYY-MM-DD exactly.
 * DELETE is a soft close. Global reminder writes are NOT documented yet.
 * BACKEND: must enforce MOA-only mutations; frontend role check alone is insufficient.
 */
import api from './axios';
import {listResult,operationResult,unwrap} from './resourceHelpers';
import {annualPeriodPayload,childPeriodPayload,globalPeriodListParams,globalPeriodUpdatePayload,deadlineOffset} from '../utils/globalReportingPeriods';
const path = id => `/reporting-periods/${encodeURIComponent(String(id))}`;
export const reportingPeriodsAPI = {
  list: async (params = {}) => listResult(await api.get('/reporting-periods', {params:globalPeriodListParams(params)})),
  get: async id => unwrap(await api.get(path(id))),
  createYear: async fields => operationResult(await api.post('/reporting-periods',annualPeriodPayload(fields))),
  generateQuarters: async (id,deadlineDays=0) => operationResult(await api.post(`${path(id)}/quarters`, {deadlineDays:deadlineOffset(deadlineDays)})),
  createChild: async fields => operationResult(await api.post('/reporting-periods',childPeriodPayload(fields))),
  update: async (id,fields) => operationResult(await api.patch(path(id),globalPeriodUpdatePayload(fields))),
  close: async id => operationResult(await api.delete(path(id))),
};
