import {normalizeReadAliases,normalizeReadRows} from "../utils/recordAliases.js";
/**
 * FILE: src/API/institution.jsx
 * FLOW: Admin/Institutions.jsx -> API/institution.jsx -> API/axios.jsx
 *       -> Laravel /api/v1/institutions -> PostgreSQL.
 * CONFIRMED CONTRACT (provided by Backend Team, endpoints 11–13):
 * GET /institutions?page=&search=; POST /institutions;
 * PUT /institutions/{id} (includes activate/deactivate via is_active/status).
 * ACCESS: institutions.manage (MOA); institutions.view.own (IA, backend scoped).
 * NOT DOCUMENTED: GET /institutions/{id}, /options, /activate, /deactivate.
 */
import api from "./axios";
import { listResult, operationResult } from "./resourceHelpers";
import {institutionLogoUrl} from "../utils/institutionLogo";

const ROOT = "/institutions";
const route = (id) => `${ROOT}/${encodeURIComponent(id)}`;

export function normalizeInstitution(record) {
  const value = normalizeReadAliases(record, 'institution');
  const active=value.is_active;
  return {
    ...value,
    logo_url: institutionLogoUrl(record),
    // Do not fabricate an inactive status when Laravel omitted both flags.
    ...(value.status == null && typeof active === 'boolean'
      ? {status:active?'active':'inactive'} : {}),
  };
}

/** Backend GET response: {status:'success',data:{current_page,data:[...],total,per_page,last_page}} */
export async function listInstitutions(params = {}) {
  const result = listResult(await api.get(ROOT, { params }));
  return { ...result, items: result.items.map(normalizeInstitution) };
}

function institutionPayload(form, includeType = false) {
  return {
    name: form.name.trim(),
    code: form.code.trim().toUpperCase(),
    short_name: form.short_name?.trim() || null,
    ...(includeType ? {type: form.type} : {}),
    description: form.description?.trim() || null,
    reporting_channel: form.reporting_channel,
  };
}

/**
 * Institution picture (API reference #24, 27 Oct 2026)
 *   POST /institutions/{institution}/profile-image
 *   multipart/form-data  profileImage=<file>      -> upload / replace
 *   application/json     {"profileImage": null}   -> remove
 *   Response data: {id,name,code,profile_image_path,profile_image_url}
 *   Access: active MOA, or IA of the same institution. JPG/PNG/WebP, <= 2048 KB, <= 2000x2000 px.
 * POST/PUT /institutions stay plain JSON (they have no picture field).
 */
export async function uploadInstitutionImage(id, file) {
  const body = new FormData();
  body.append('profileImage', file, file.name);
  // Let the browser set the multipart boundary.
  const result = operationResult(await api.post(`${route(id)}/profile-image`, body, {headers:{'Content-Type':undefined}}));
  return {...result, data: normalizeInstitution(result.data ?? {})};
}
export async function removeInstitutionImage(id) {
  const result = operationResult(await api.post(`${route(id)}/profile-image`, {profileImage: null}));
  return {...result, data: normalizeInstitution(result.data ?? {})};
}

/** Saves details (JSON), then the picture when one was chosen or removed. */
async function savePicture(id, {logoFile, removeLogo}) {
  if (!id) return null;
  if (logoFile) return uploadInstitutionImage(id, logoFile);
  if (removeLogo) return removeInstitutionImage(id);
  return null;
}

/** Details are already saved when the picture step fails: report it separately, never as a lost save. */
async function withPicture(result, id, form) {
  try {
    const picture = await savePicture(id, form);
    return picture ? {...result, picture} : result;
  } catch (pictureError) {
    return {...result, pictureError};
  }
}

export async function createInstitution(form) {
  const result = operationResult(await api.post(ROOT, institutionPayload(form, true)));
  return withPicture(result, result.data?.id, form);
}

export async function updateInstitution(id, form) {
  const result = operationResult(await api.put(route(id), institutionPayload(form)));
  return withPicture(result, id, form);
}

export async function setInstitutionActive(id, active) {
  return operationResult(await api.put(route(id), {
    is_active: active,
    status: active ? "active" : "inactive",
  }));
}
