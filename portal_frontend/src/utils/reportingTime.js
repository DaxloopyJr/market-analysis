/**
 * Reporting time of a submission (financial year, frequency, period) read the SAME way on every page,
 * so the Reporting Year / Frequency / Period filters match what the tables show (28 Oct 2026).
 * The year written in the period label wins ("2025/2026 Q4"), then financialYear, then startYear.
 */
const first = (...values) => values.find(v => v !== undefined && v !== null && String(v).trim() !== '');
const YEAR = /(20\d{2})\s*[/-]\s*(\d{2,4})/;

/** "2025/26", "2025-2026", "2025/2026" or 2025 -> "2025/2026". */
export function normalizeYear(text) {
  const value = String(text ?? '');
  const match = value.match(YEAR);
  if (match) {
    const start = Number(match[1]);
    const end = match[2].length === 2 ? Number(String(start).slice(0, 2) + match[2]) : Number(match[2]);
    return `${start}/${end}`;
  }
  const single = value.match(/^\s*(20\d{2})\s*$/);
  return single ? `${single[1]}/${Number(single[1]) + 1}` : '';
}

function frequencyFromShort(short) {
  if (/^q[1-4]$/i.test(short) || /quarter/i.test(short)) return 'quarterly';
  if (/^h[12]$/i.test(short) || /half|semi/i.test(short)) return 'semi-annual';
  if (/^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(short) || /month/i.test(short)) return 'monthly';
  if (/annual|year/i.test(short)) return 'annual';
  return '';
}

/** reportingYear may be a label or {id,label}. */
const yearLabel = value => (value && typeof value === 'object' ? value.label ?? value.name : value);

/** {year:'2026/2027', frequency:'quarterly', short:'Q1', period:'2026/2027 Q1'} */
export function reportingTime(row) {
  const raw = row?.raw ?? row ?? {};
  const calendar = raw.reportingCalendar ?? raw.reporting_calendar ?? {};
  const reportingPeriod = raw.reportingPeriod ?? raw.reporting_period ?? calendar.reportingPeriod ?? calendar.reporting_period ?? {};
  const label = String(first(row?.period, raw.periodLabel, raw.period_label, reportingPeriod.label, reportingPeriod.periodLabel,
    reportingPeriod.period_label, calendar.periodLabel, calendar.period_label) ?? '');
  const year = normalizeYear(label)
    || normalizeYear(first(row?.financialYear, raw.financialYear, raw.financial_year, yearLabel(raw.reportingYear),
      yearLabel(raw.reporting_year), yearLabel(calendar.reportingYear), yearLabel(calendar.reporting_year),
      calendar.financialYear, calendar.financial_year, reportingPeriod.financialYear, reportingPeriod.financial_year))
    || normalizeYear(first(raw.startYear, raw.start_year, calendar.startYear, calendar.start_year, reportingPeriod.startYear));
  let short = label.replace(new RegExp(YEAR.source, 'g'), '').replace(/[·,]/g, ' ').replace(/\s+/g, ' ').trim();
  const number = first(raw.periodNumber, raw.period_number, calendar.periodNumber, calendar.period_number, reportingPeriod.periodNumber);
  const frequency = String(first(row?.frequency, raw.frequency, raw.periodType, calendar.frequency, calendar.periodType,
    calendar.period_type, reportingPeriod.periodType, reportingPeriod.period_type) ?? '').toLowerCase().replace('semiannual', 'semi-annual')
    || frequencyFromShort(short);
  if (!short && number !== undefined && frequency === 'quarterly') short = `Q${number}`;
  return {year, frequency, short, period: [year, short].filter(Boolean).join(' ')};
}

const PERIOD_ORDER = short => {
  const q = String(short).match(/^[QH](\d)/i);
  return q ? Number(q[1]) : 0;
};
const distinct = values => [...new Set(values.filter(Boolean))];

/** Filter options narrowed by the current choice (year -> frequency -> period). filter: {year,frequency,period} */
export function reportingTimeOptions(rows, filter = {year: 'all', frequency: 'all'}) {
  const times = (rows ?? []).map(reportingTime);
  const years = distinct(times.map(t => t.year)).sort().reverse();
  const inYear = times.filter(t => filter.year === 'all' || t.year === filter.year);
  const frequencies = distinct(inYear.map(t => t.frequency)).sort();
  const inFrequency = inYear.filter(t => filter.frequency === 'all' || t.frequency === filter.frequency);
  const periods = [...new Map(inFrequency.filter(t => t.period).map(t => [t.period, t])).values()]
    .sort((a, b) => b.year.localeCompare(a.year) || PERIOD_ORDER(a.short) - PERIOD_ORDER(b.short))
    .map(t => t.period);
  return {years, frequencies, periods};
}

export const frequencyLabel = value => String(value || '').replace(/[-_]/g, ' ').replace(/\b\w/g, ch => ch.toUpperCase());

/** true when the row matches the applied filter ('all' = any). */
export function matchesReportingTime(row, filter = {}) {
  const time = reportingTime(row);
  return (!filter.year || filter.year === 'all' || time.year === filter.year)
    && (!filter.frequency || filter.frequency === 'all' || time.frequency === filter.frequency)
    && (!filter.period || filter.period === 'all' || time.period === filter.period);
}
