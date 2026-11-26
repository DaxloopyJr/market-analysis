/** Pure Strategic Plan display helpers (no API imports, unit-testable). */
/** Latest version per objective (versions are ordered by code then versionNumber). */
export function latestObjectiveVersions(versions = []) {
  const byObjective = new Map();
  for (const version of versions) {
    const current = byObjective.get(version.objectiveId);
    if (!current || Number(version.versionNumber) > Number(current.versionNumber)) byObjective.set(version.objectiveId, version);
  }
  return [...byObjective.values()].sort((a, b) => String(a.code).localeCompare(String(b.code), undefined, { numeric: true }));
}

/** Financial years ("2026/2027") covered by a plan's start/end dates (July–June years). */
export function planFinancialYears(startDate, endDate) {
  const start = Date.parse(startDate ?? ""), end = Date.parse(endDate ?? "");
  if (!Number.isFinite(start) || !Number.isFinite(end)) return [];
  const s = new Date(start), e = new Date(end);
  let year = s.getUTCMonth() >= 6 ? s.getUTCFullYear() : s.getUTCFullYear() - 1;
  const last = e.getUTCMonth() >= 6 ? e.getUTCFullYear() : e.getUTCFullYear() - 1;
  const years = [];
  while (year <= last && years.length < 20) { years.push(`${year}/${year + 1}`); year += 1; }
  return years;
}
