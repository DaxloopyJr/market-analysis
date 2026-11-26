/** CSV download without libraries (UTF-8 with BOM so Excel shows Swahili characters correctly). */
const cell = value => {
  if (value === undefined || value === null) return '';
  const text = typeof value === 'object' ? JSON.stringify(value) : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

export function toCsv(headers, rows) {
  return [headers.map(cell).join(','), ...rows.map(row => row.map(cell).join(','))].join('\r\n');
}

export function downloadCsv(filename, headers, rows) {
  const blob = new Blob(['﻿' + toCsv(headers, rows)], {type: 'text/csv;charset=utf-8'});
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
