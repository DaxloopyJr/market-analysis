/** Read-only Data Consumers API. The Dataset Configuration shares this master data. */
import api from './axios';
import { listResult } from './resourceHelpers';

export const dataConsumersAPI = {
  list: async () => listResult(await api.get('/data-consumers')),
};
