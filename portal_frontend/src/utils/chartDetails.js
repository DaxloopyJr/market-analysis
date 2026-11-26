/** FILE: src/utils/chartDetails.js — Key Details for the chart pop-up (components/insights/InsightModal.jsx). */
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };
const round = (n) => Math.round(n * 10) / 10;
const fmt = (n, unit = '') => (n === null ? '—' : `${round(n).toLocaleString()}${unit ? (unit === '%' ? '%' : ` ${unit}`) : ''}`);

/**
 * Key Details taken from the chart's own figures (8 Nov 2026), so every chart explains itself:
 *  - donut : each slice with its share, total, largest slice
 *  - bar / line of counts (measure 'count', default): total per series, highest point, points shown
 *  - line of levels (measure 'level', e.g. CPU %): latest, average and peak per series, readings
 * The caller's own details (filters, window, notes) follow; a caller label replaces the same automatic label.
 */
export function chartDetails(insight = {}) {
  const data = Array.isArray(insight.data) ? insight.data : [];
  if (!data.length) return [];
  const unit = insight.unit || '';
  const xKey = insight.xKey || 'name';
  if (insight.kind === 'donut') {
    const slices = data.map((d) => ({ name: d.name, value: num(d.value) ?? 0 }));
    const total = slices.reduce((a, b) => a + b.value, 0);
    const rows = slices.map((d) => ({ label: d.name, value: `${fmt(d.value, unit)}${total ? ` · ${round(d.value * 100 / total)}%` : ''}` }));
    rows.push({ label: 'Total', value: fmt(total, unit) });
    const top = slices.reduce((a, b) => (b.value > a.value ? b : a), slices[0]);
    if (total && slices.length > 1) rows.push({ label: 'Largest share', value: top.name });
    return rows;
  }
  if (insight.kind !== 'bar' && insight.kind !== 'line') return [];
  const series = (Array.isArray(insight.series) && insight.series.length ? insight.series : [{ key: 'value', label: 'Value' }]);
  const rows = [];
  const many = series.length > 1;
  for (const item of series) {
    const label = item.label || item.key;
    const values = data.map((d) => num(d?.[item.key])).filter((v) => v !== null);
    if (!values.length) continue;
    if (insight.measure === 'level') {
      rows.push({ label: `${label} · latest`, value: fmt(values[values.length - 1], unit) });
      rows.push({ label: `${label} · average`, value: fmt(values.reduce((a, b) => a + b, 0) / values.length, unit) });
      rows.push({ label: `${label} · peak`, value: fmt(Math.max(...values), unit) });
    } else {
      rows.push({ label: many ? `Total ${label.toLowerCase()}` : 'Total', value: fmt(values.reduce((a, b) => a + b, 0), unit) });
    }
  }
  if (insight.measure !== 'level') {
    const sumOf = (d) => series.reduce((a, item) => a + (num(d?.[item.key]) ?? 0), 0);
    const top = data.reduce((a, d) => (sumOf(d) > sumOf(a) ? d : a), data[0]);
    if (sumOf(top) > 0 && data.length > 1) rows.push({ label: xKey === 'month' ? 'Busiest month' : insight.kind === 'line' || xKey === 'period' ? 'Busiest period' : 'Highest', value: `${top?.[xKey] ?? '—'} (${fmt(sumOf(top), unit)})` });
    const empty = data.filter((d) => sumOf(d) === 0).length;
    if (empty) rows.push({ label: 'With no records', value: empty.toLocaleString() });
  }
  rows.push({ label: insight.measure === 'level' ? 'Readings' : 'Points shown', value: data.length.toLocaleString() });
  return rows;
}
