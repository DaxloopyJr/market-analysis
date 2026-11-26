/** Rows-per-page choices (approved 28 Oct 2026). */
export const PAGE_SIZES = [10, 20, 50, 100, 200, 500];
export const SERVER_MAX_PER_PAGE = 100;

/**
 * One UI page of `pageSize` rows from a Laravel list whose perPage is capped at 100.
 * fetchPage(serverPage, perPage) must resolve {items, total, lastPage?}.
 * pageSize ≤ 100: one request. 200 / 500: consecutive server pages of 100, merged in order.
 * Returns {...firstServerResult, items, total, lastPage} expressed in UI pages.
 */
export async function fetchUiPage(fetchPage, page, pageSize) {
  if (pageSize <= SERVER_MAX_PER_PAGE) {
    const result = await fetchPage(page, pageSize);
    const total = Number(result.total ?? result.items?.length ?? 0);
    return {...result, items: result.items ?? [], total, lastPage: Number(result.lastPage ?? Math.max(1, Math.ceil(total / pageSize)))};
  }
  const chunks = Math.ceil(pageSize / SERVER_MAX_PER_PAGE);
  const firstServerPage = (page - 1) * chunks + 1;
  const items = [];
  let first = null;
  let total = 0;
  let serverLast = firstServerPage;
  for (let offset = 0; offset < chunks; offset += 1) {
    const serverPage = firstServerPage + offset;
    if (offset > 0 && serverPage > serverLast) break;
    const result = await fetchPage(serverPage, SERVER_MAX_PER_PAGE);
    first = first ?? result;
    items.push(...(result.items ?? []));
    total = Number(result.total ?? total);
    serverLast = Number(result.lastPage ?? Math.max(1, Math.ceil(total / SERVER_MAX_PER_PAGE)));
    if ((result.items ?? []).length < SERVER_MAX_PER_PAGE) break;
  }
  // Other fields (e.g. summary) come from the first server page.
  return {...(first ?? {}), items, total, lastPage: Math.max(1, Math.ceil(total / pageSize))};
}
