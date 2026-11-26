/**
 * FILE: src/services/institutionLogoService.js
 * Fills the shared institution-logo directory (utils/institutionLogo.js) once per sign-in, so a picture
 * also shows where Laravel embeds only {id,name,code} (submissions, analytics organisations, reports).
 * Sources, each optional (a 403 is silently skipped): the signed-in user's institution, GET /institutions
 * (all pages), GET /reports/filters institutions.
 */
import {cached, fetchAllPages} from './listCache.js';
import {reportFiltersRaw} from './meReportService.js';
import {listInstitutions} from '../API/institution.jsx';
import {rememberInstitutionLogos} from '../utils/institutionLogo.js';

let primed = null;
export function primeInstitutionLogos(user) {
  if (user?.institution) rememberInstitutionLogos(user.institution);
  if (primed) return primed;
  primed = (async () => {
    let added = 0;
    try {
      // Same cache key as the MDO/MDD catalogue: one GET /institutions per session (5 Nov 2026).
      const items = await cached('institutions:all', async () => (await fetchAllPages(params => listInstitutions(params))).items, 300_000);
      added += rememberInstitutionLogos(items);
    } catch { /* no permission for /institutions */ }
    try {
      // Shared with the report pages: one GET /reports/filters per minute, not one per caller.
      const body = await reportFiltersRaw();
      const list = body?.institutions ?? [];
      added += rememberInstitutionLogos(Array.isArray(list) ? list : []);
    } catch { /* no report permission */ }
    return added;
  })();
  return primed;
}
export const resetInstitutionLogos = () => { primed = null; };
