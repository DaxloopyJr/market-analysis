/**
 * FILE: src/API/resourceHelpers.js
 * FLOW: pages -> feature API -> axios.jsx -> Laravel -> helpers -> page alerts.
 * Every successful write preserves the server's `message`; HTTP/validation
 * errors preserve safe Laravel `message` and `errors` (never stack traces).
 */
const safeText = (value) => (
  typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 800) : ""
);

export function backendMessage(response, fallback = "") {
  const body = response?.data;
  return safeText(body?.message) || fallback;
}

export function unwrap(response) {
  const body = response?.data;
  if ((body === "" || body == null) && response?.status === 204) return {};
  if (!body || typeof body !== "object") {
    throw new Error("The server sent an invalid response.");
  }
  if (body.status === "error" || body.success === false) {
    throw new Error(backendMessage(response, "The request was rejected."));
  }
  return body.data ?? body;
}

export function listResult(response) {
  const payload = unwrap(response);
  const records = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.data)
      ? payload.data
      : Array.isArray(payload?.items)
        ? payload.items
        : null;
  if (!records) throw new Error("The server sent an unexpected response.");
  // Laravel root paginators ({data:[…], total, last_page}) unwrap to the bare array: read the paging from the
  // body, otherwise only the first page of a list is ever read (9 Nov 2026).
  const body = response?.data;
  const meta = payload?.meta ?? (Array.isArray(payload) && body && !Array.isArray(body) ? (body.meta ?? body) : payload);
  return {
    items: records,
    total: Number(meta.total ?? records.length),
    currentPage: Number(meta.current_page ?? meta.currentPage ?? 1),
    lastPage: Number(meta.last_page ?? meta.lastPage ?? 1),
    perPage: Number(meta.per_page ?? records.length),
    paginated: Number.isFinite(Number(meta.last_page ?? meta.lastPage)),
    summary: response?.data?.summary ?? payload?.summary ?? null,
    message: backendMessage(response),
  };
}

/** POST/PUT mutations: the calling page displays the server message verbatim as text. */
export function operationResult(response) {
  return { data: unwrap(response), message: backendMessage(response) };
}

export function validationErrors(error) {
  const fields = error?.response?.data?.errors;
  if (!fields || typeof fields !== "object" || Array.isArray(fields)) return {};
  return Object.fromEntries(
    Object.entries(fields).map(([field, value]) => [
      field,
      (Array.isArray(value) ? value : [value]).map(safeText).filter(Boolean).join(" "),
    ])
  );
}

export function apiError(error) {
  const status = error?.response?.status;
  // Backend is authoritative for non-5xx errors, including lockout and 422.
  // Never show raw server exceptions, traces or database error details.
  if (status && status < 500) {
    const message = backendMessage(error.response);
    if (message) return message;
    const fields = Object.values(validationErrors(error)).filter(Boolean);
    if (fields.length) return fields.join(" ").slice(0, 800);
  }
  if (status === 401) return "Authentication required. Please sign in again.";
  if (status === 403) return "You do not have permission to perform this operation.";
  if (status === 404) return "The requested service was not found.";
  if (status === 422) return "Please correct the highlighted fields.";
  if (status === 423) return "Account is locked. Contact your administrator.";
  if (status === 429) return "Too many requests. Please try again later.";
  if (status >= 500) return "The server could not complete this request. Please try again later.";
  if (error?.code === "ERR_NETWORK" || error?.code === "ECONNABORTED") {
    return "Could not reach the server. Check your connection and try again.";
  }
  return safeText(error?.message) || "Request failed.";
}

export function requireServerResult(response) {
  return unwrap(response);
}
