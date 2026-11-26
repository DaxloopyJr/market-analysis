/**
 * Data Entry Step 1: pure selection helpers.
 * Dataset frequencies are configuration from Laravel; periods are the verified
 * intersection of assigned reporting-calendar entries and institution periods.
 * Do not calculate or invent deadlines. Time-based eligibility uses the
 * shared reportingPeriodRules; Laravel must enforce it server-side at submit.
 */
import { isEntryEligible, periodType, reportingYear, todayISO } from "./reportingPeriodRules.js";

const ORDER = ["monthly", "quarterly", "annual"];
const ALIASES = { month: "monthly", quarter: "quarterly", yearly: "annual", year: "annual" };
export function normalizeFrequency(value) {
  const code = String(value ?? "").toLowerCase().trim();
  return ALIASES[code] || code;
}
export function frequencyLabel(value) {
  const code = normalizeFrequency(value);
  const known = { monthly: "Monthly", quarterly: "Quarterly", annual: "Annual",
    semiannual: "Semiannual", weekly: "Weekly", daily: "Daily" };
  return known[code] || (code ? code[0].toUpperCase() + code.slice(1) : "—");
}
export function getConfiguredFrequencies(dataset, eligiblePeriods = []) {
  if (!dataset) return [];
  const configured = Array.isArray(dataset.frequencies)
    ? dataset.frequencies : [dataset.frequency].filter(Boolean);
  // Fallback is only for legacy responses missing the frequencies property:
  // don't fabricate choices not actually attached in reporting calendar.
  const provided = configured.length ? configured : eligiblePeriods.map(periodType);
  const distinct = [...new Set(provided.map(normalizeFrequency).filter(Boolean))];
  return distinct.sort((a, b) => {
    const left = ORDER.indexOf(a), right = ORDER.indexOf(b);
    return (left < 0 ? 100 : left) - (right < 0 ? 100 : right);
  });
}
export function getFrequencyPeriods(periods, financialYear, frequency) {
  if (!financialYear || !frequency) return [];
  return (periods || [])
    .filter(p => reportingYear(p) === financialYear && normalizeFrequency(periodType(p)) === normalizeFrequency(frequency))
    .sort((a,b)=>String(a.startDate).localeCompare(String(b.startDate)));
}
export function getEligibleFrequencyPeriods(periods, financialYear, frequency, today = todayISO()) {
  if (!financialYear || !frequency) return [];
  return getFrequencyPeriods(periods, financialYear, frequency).filter(p => isEntryEligible(p, today));
}
export function recommendPeriod(periods, today = todayISO()) {
  // Recommend only a reporting window containing today; never auto-select an
  // older still-open deadline or a period from another frequency/year.
  return (periods || []).find(p => p.startDate <= today && today <= p.endDate) || null;
}
export function formattedReportingDate(dateString) {
  if (!/^\d{4}-\d{2}-\d{2}/.test(String(dateString || ""))) return "—";
  const parsed = new Date(`${String(dateString).slice(0, 10)}T12:00:00Z`);
  if (!Number.isFinite(parsed.getTime())) return "—";
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC',
  }).format(parsed);
}
