/**
 * Shared rules for the approved organisation cards (27 Oct 2026):
 *  - Institution Analytics  (budget absorption cards)
 *  - MDO / MDD Review Queue (Datasets + Pending cards)
 * Pure functions only, so they can be unit tested with node --test.
 */
import {institutionLogoUrl} from './institutionLogo.js';
const present = value => value !== undefined && value !== null && String(value).trim() !== '';
export const pickValue = (...values) => values.find(present);
const toNumber = value => {
  if (!present(value)) return null;
  const parsed = Number(String(value).replace(/[,\s]/g, '').replace(/%$/, ''));
  return Number.isFinite(parsed) ? parsed : null;
};

/** Same thresholds as the annual-target performance bar. */
export function absorptionBand(percent) {
  const value = toNumber(percent);
  if (value === null) return {band: 'none', label: 'No data', percent: null, width: 0};
  const band = value > 80 ? 'excellence' : value >= 50 ? 'good' : 'under';
  const label = band === 'excellence' ? 'Excellence' : band === 'good' ? 'Good' : 'Under Performance';
  const rounded = Math.round(value * 10) / 10;
  return {band, label, percent: rounded, width: Math.max(0, Math.min(100, value))};
}

/** TZS short form: 3362876018 -> "TZS 3.36B", 605000000 -> "TZS 605.0M". */
export function formatTzs(amount) {
  const value = toNumber(amount);
  if (value === null) return '';
  const abs = Math.abs(value);
  const short = abs >= 1e12 ? `${(value / 1e12).toFixed(2)}T`
    : abs >= 1e9 ? `${(value / 1e9).toFixed(2)}B`
      : abs >= 1e6 ? `${(value / 1e6).toFixed(1)}M`
        : abs >= 1e3 ? `${(value / 1e3).toFixed(1)}K`
          : String(Math.round(value));
  return `TZS ${short}`;
}

/** Up to 5 letters for the round badge when the API has no picture. */
export function orgInitials(org = {}) {
  const code = pickValue(org.short_name, org.shortName, org.code);
  if (code) return String(code).replace(/[^A-Za-z0-9-]/g, '').replace(/-HQ$/i, '').slice(0, 5).toUpperCase();
  const words = String(org.name ?? '').split(/\s+/).filter(word => /^[A-Za-z]/.test(word) && !/^(and|of|the|&)$/i.test(word));
  return (words.map(word => word[0]).join('').slice(0, 4) || 'ORG').toUpperCase();
}

/** Institution picture — shared resolver (profile_image_url, else profile_image_path). */
export function orgPicture(org = {}) {
  return institutionLogoUrl(org);
}

/** Card title = short code (CBE); second line = location, else the full name. */
export function orgHeading(org = {}, {department = false, parentLabel = ''} = {}) {
  const title = department ? pickValue(org.name, org.code, 'Department')
    : pickValue(org.short_name, org.shortName, org.code, org.name, 'Institution');
  const location = pickValue(org.region, org.location, org.city, org.contact_address, org.address);
  const fullName = !department && org.name && org.name !== title ? org.name : '';
  const subtitle = department ? [parentLabel, location].filter(Boolean).join(' · ') : (location || fullName);
  return {title: String(title), subtitle: subtitle ? String(subtitle) : ''};
}

/** Financial years Jul–Jun, newest first: 2026/2027, 2025/2026 … */
export function financialYearOptions(now = new Date(), count = 6) {
  const start = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
  return Array.from({length: count}, (_, index) => `${start - index}/${start - index + 1}`);
}
export const currentFinancialYear = (now = new Date()) => financialYearOptions(now, 1)[0];

/** Normalises the "2026/27", "2026-2027" and "2026/2027" spellings for comparison. */
export function sameFinancialYear(a, b) {
  const key = value => {
    const match = String(value ?? '').match(/(\d{4})\s*[/-]\s*(\d{2,4})/);
    if (!match) return String(value ?? '').trim();
    return `${match[1]}/${match[2].length === 2 ? match[1].slice(0, 2) + match[2] : match[2]}`;
  };
  return key(a) === key(b);
}

/**
 * Performance figures from /analytics/organisations (fields not yet confirmed by
 * the backend). Absent values stay null so the card shows "No data" / "Not reported"
 * instead of an invented zero.
 */
export function orgPerformance(record = {}) {
  const budgetBlock = record.budget && typeof record.budget === 'object' ? record.budget : {};
  const budget = toNumber(pickValue(budgetBlock.approved, budgetBlock.amount, typeof record.budget === 'object' ? undefined : record.budget,
    record.approvedBudget, record.approved_budget, record.budgetAmount, record.budget_amount));
  const spent = toNumber(pickValue(budgetBlock.spent, budgetBlock.actual, record.spent, record.spentAmount, record.spent_amount,
    record.expenditure, record.actualExpenditure, record.actual_expenditure));
  let absorption = toNumber(pickValue(record.budgetAbsorption, record.budget_absorption, record.absorptionPercent,
    record.absorption_percent, budgetBlock.absorption, budgetBlock.absorptionPercent));
  if (absorption === null && budget && spent !== null) absorption = (spent / budget) * 100;
  return {
    absorption,
    budget,
    spent,
    approved: toNumber(pickValue(record.approvedCount, record.approved_count, record.approvedSubmissions, record.approved)),
    submitted: toNumber(pickValue(record.submittedCount, record.submitted_count, record.submittedSubmissions, record.submitted)),
    published: toNumber(pickValue(record.publishedDatasetCount, record.published_dataset_count, record.publishedDatasets)),
  };
}

/** Text search on name / code / short name. */
export const orgMatches = (org, search) => !String(search ?? '').trim() ||
  [org.name, org.code, org.short_name, org.shortName].join(' ').toLowerCase().includes(String(search).trim().toLowerCase());

/** Financial years present in review submissions, newest first. */
export const queueYears = rows => [...new Set((rows ?? []).map(row => row?.financialYear).filter(Boolean))].sort().reverse();
