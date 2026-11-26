/**
 * FILE: src/API/referenceData.jsx
 * MODULE: Dataset Management / Reference Data
 * FLOW: ReferenceData.jsx -> referenceData.jsx -> axios.jsx -> remote Laravel API.
 * API CONTRACT: GET/POST /reference-data; GET/PATCH/DELETE /reference-data/{id};
 * GET/POST /reference-data/{id}/values; GET/PATCH/DELETE /reference-data/{id}/values/{valueId}.
 * GET: active authenticated users. Mutations: reference_data.manage (MOA/IA).
 * IMPORTANT: request fields are camelCase; Laravel responses contain snake_case.
 * DELETE deactivates (soft delete). PATCH status='active' reactivates.
 */
import api from "./axios";
import { listResult, operationResult, unwrap } from "./resourceHelpers";

const typeUrl = (typeId) => `/reference-data/${encodeURIComponent(String(typeId))}`;
const valuesUrl = (typeId) => `${typeUrl(typeId)}/values`;
const valueUrl = (typeId, valueId) => `${valuesUrl(typeId)}/${encodeURIComponent(String(valueId))}`;

/** List response: { current_page, data: [...], per_page, total }. */
export async function listReferenceTypes({ status, page = 1, perPage = 20 } = {}) {
  const params = { page, perPage };
  if (status === "active" || status === "inactive") params.status = status;
  return listResult(await api.get("/reference-data", { params }));
}

export async function getReferenceType(typeId) {
  return unwrap(await api.get(typeUrl(typeId)));
}

/** No speculative fields: only those supported by POST /reference-data. */
export async function createReferenceType(form) {
  return operationResult(await api.post("/reference-data", {
    dataTypeCode: form.dataTypeCode.trim().toUpperCase(),
    dataTypeNameEn: form.dataTypeNameEn.trim(),
    dataTypeNameSw: form.dataTypeNameSw?.trim() || null,
    descriptionEn: form.descriptionEn?.trim() || null,
    descriptionSw: form.descriptionSw?.trim() || null,
    status: form.status || "active",
  }));
}

export async function updateReferenceType(typeId, form) {
  return operationResult(await api.patch(typeUrl(typeId), {
    dataTypeCode: form.dataTypeCode.trim().toUpperCase(),
    dataTypeNameEn: form.dataTypeNameEn.trim(),
    dataTypeNameSw: form.dataTypeNameSw?.trim() || null,
    descriptionEn: form.descriptionEn?.trim() || null,
    descriptionSw: form.descriptionSw?.trim() || null,
    status: form.status,
  }));
}

export async function deactivateReferenceType(typeId) {
  return operationResult(await api.delete(typeUrl(typeId)));
}

export async function reactivateReferenceType(typeId) {
  return operationResult(await api.patch(typeUrl(typeId), { status: "active" }));
}

export async function listReferenceValues(typeId, { status, page = 1, perPage = 20 } = {}) {
  const params = { page, perPage };
  if (status === "active" || status === "inactive") params.status = status;
  return listResult(await api.get(valuesUrl(typeId), { params }));
}

export async function getReferenceValue(typeId, valueId) {
  return unwrap(await api.get(valueUrl(typeId, valueId)));
}

/** parentId references another value under this type, NOT reference-data type ID. */
const valuePayload = (form) => ({
  dataValueCode: form.dataValueCode.trim().toUpperCase(),
  dataValueNameEn: form.dataValueNameEn.trim(),
  dataValueNameSw: form.dataValueNameSw?.trim() || null,
  parentId: form.parentId ? Number(form.parentId) : null,
  value: form.value?.trim() || null,
  effectiveFrom: form.effectiveFrom || null,
  effectiveTo: form.effectiveTo || null,
  status: form.status || "active",
});

export async function createReferenceValue(typeId, form) {
  return operationResult(await api.post(valuesUrl(typeId), valuePayload(form)));
}

export async function updateReferenceValue(typeId, valueId, form) {
  return operationResult(await api.patch(valueUrl(typeId, valueId), valuePayload(form)));
}

export async function deactivateReferenceValue(typeId, valueId) {
  return operationResult(await api.delete(valueUrl(typeId, valueId)));
}

export async function reactivateReferenceValue(typeId, valueId) {
  return operationResult(await api.patch(valueUrl(typeId, valueId), { status: "active" }));
}

/**
 * Load available parent options across pages on demand; never hardcode IDs.
 * Do not silently truncate the list: show a clear error if too many options.
 */
export async function getReferenceValueOptions(typeId) {
  const first = await listReferenceValues(typeId, { page: 1, perPage: 100 });
  if (first.total > 5000) {
    throw new Error("Too many options to list. Please narrow your search.");
  }
  const options = [...first.items];
  const pageCount = Math.max(1, Math.ceil(first.total / 100));
  for (let page = 2; page <= pageCount; page += 1) {
    const result = await listReferenceValues(typeId, { page, perPage: 100 });
    options.push(...result.items);
  }
  return options;
}

/**
 * Reusable Dataset Builder dropdown API (e.g. SECTOR / UNIT).
 * Resolves the real type ID from GET /reference-data, then its active values.
 * Does NOT hardcode reference IDs or pre-populate fake items.
 * Example: const sectors = await getActiveReferenceOptions("SECTOR");
 *          <option value={sector.id}>{sector.label}</option>
 */
export async function getActiveReferenceOptions(typeCode) {
  const expectedCode = String(typeCode).trim().toUpperCase();
  if (!expectedCode) throw new Error("A reference type code is required.");
  const first = await listReferenceTypes({ status: "active", page: 1, perPage: 100 });
  if (first.total > 5000) throw new Error("Too many options to list. Please narrow your search.");
  const types = [...first.items];
  for (let page = 2; page <= Math.ceil(first.total / 100); page += 1) {
    types.push(...(await listReferenceTypes({ status: "active", page, perPage: 100 })).items);
  }
  const type = types.find((entry) => entry.data_type_code === expectedCode);
  if (!type) throw new Error(`Active reference type ${expectedCode} was not found in the system.`);
  const values = await getReferenceValueOptions(type.id);
  const today = new Date().toISOString().slice(0, 10);
  return values.filter((entry) => (
    entry.status === "active" &&
    (!entry.effective_from || entry.effective_from <= today) &&
    (!entry.effective_to || entry.effective_to >= today)
  )).map((entry) => ({
    id: entry.id,
    code: entry.data_value_code,
    label: entry.data_value_name_en,
    labelSw: entry.data_value_name_sw,
    parentId: entry.parent_id,
    value: entry.value,
  }));
}
