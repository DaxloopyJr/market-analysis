/**
 * FILE: src/pages/Admin/auditReportExport.js
 * Browser-side downloads for the rows already authorized and loaded by AuditTrail.
 * IMPORTANT: These exports contain ONLY the currently displayed/filtered page.
 * The API must enforce institution/role scope and redact sensitive audit values.
 * We intentionally NEVER export oldValues or newValues.
 */

const EAT_TIMEZONE = "Africa/Dar_es_Salaam";
const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function humanize(value) {
  if (value == null || value === "") return "-";
  return String(value)
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatEAT(value) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: EAT_TIMEZONE,
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(parsed);
}

// Build an Excel date whose displayed wall time is explicitly EAT (+03:00).
// Excel stores timezone-free serial dates, so shift the UTC value into EAT
// before assigning the date and use a real date number format in the sheet.
function excelEATDate(value) {
  const parsed = new Date(value);
  if (!value || Number.isNaN(parsed.getTime())) return excelText(value);
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: EAT_TIMEZONE, year: "numeric", month: "2-digit",
      day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
      hour12: false,
    }).formatToParts(parsed).filter(({ type }) => type !== "literal")
      .map(({ type, value: part }) => [type, part])
  );
  return new Date(Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(parts.hour), Number(parts.minute), Number(parts.second)
  ));
}

function fileStamp(date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: EAT_TIMEZONE, year: "numeric", month: "2-digit",
      day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
    }).formatToParts(date).filter(({ type }) => type !== "literal")
      .map(({ type, value }) => [type, value])
  );
  return `${parts.year}${parts.month}${parts.day}_${parts.hour}${parts.minute}_EAT`;
}

function textOrDash(value) {
  return value === null || value === undefined || value === "" ? "-" : String(value);
}

function actorText(event) {
  return event.userId != null ? `User #${event.userId}` : humanize(event.actorType);
}

function reportRows(events) {
  return events.map((event) => ({
    id: textOrDash(event.id),
    actor: actorText(event),
    actorType: humanize(event.actorType),
    event: humanize(event.eventType),
    entity: humanize(event.entityType),
    entityId: textOrDash(event.entityId),
    ipAddress: textOrDash(event.ipAddress),
    timestamp: formatEAT(event.createdAt),
    requestId: textOrDash(event.requestId),
  }));
}

function scopeInfo(context, recordCount) {
  return [
    ["Scope", "Current loaded page only (after on-page filters)"],
    ["Portal page", `${context.page} of ${context.lastPage}`],
    ["Records exported", String(recordCount)],
    ["Search", context.search || "All"],
    ["Event filter", context.eventFilter ? humanize(context.eventFilter) : "All"],
    ["Entity filter", context.entityFilter ? humanize(context.entityFilter) : "All"],
    ["Generated (EAT)", formatEAT(context.generatedAt)],
  ];
}

// Built-in jsPDF Helvetica does not include arbitrary Unicode glyphs.
function pdfText(value) {
  return String(value ?? "-")
    .replace(/[\u2013\u2014\u2212]/g, "-")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, "?");
}

// ExcelJS writes string values, not formulas. Also quote formula-looking text
// defensively to avoid spreadsheet formula injection in downstream conversions.
function excelText(value) {
  const stringValue = String(value ?? "-");
  return /^[\s\u0000-\u001F]*[=+@-]/.test(stringValue)
    ? `'${stringValue}`
    : stringValue;
}

function colorHex(hex) {
  return `FF${hex.replace("#", "").toUpperCase()}`;
}

function countBy(events, name) {
  const counts = new Map();
  for (const event of events) {
    const value = humanize(event[name]);
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

export async function exportAuditPdf(events, context) {
  if (!events.length) throw new Error("There are no records to export.");
  const [{ jsPDF }, { autoTable }] = await Promise.all([
    import("jspdf"), import("jspdf-autotable"),
  ]);
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const records = reportRows(events);

  doc.setFillColor(12, 43, 87);
  doc.rect(0, 0, pageWidth, 24, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("MINISTRY OF INDUSTRY AND TRADE", 14, 10);
  doc.setFontSize(10);
  doc.text("VIWANDA PORTAL - AUDIT TRAIL REPORT", 14, 17);
  doc.setFontSize(8);
  doc.text("INTERNAL USE ONLY", pageWidth - 14, 16, { align: "right" });

  doc.setTextColor(37, 58, 82);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  const details = scopeInfo(context, records.length);
  details.forEach(([key, value], index) => {
    const col = index < 4 ? 0 : 1;
    const row = col === 0 ? index : index - 4;
    const x = col === 0 ? 15 : 156;
    doc.setFont("helvetica", "bold");
    doc.text(pdfText(`${key}:`), x, 33 + row * 6);
    doc.setFont("helvetica", "normal");
    const maxWidth = col === 0 ? 96 : 99;
    doc.text(pdfText(value).slice(0, 140), x + 29, 33 + row * 6, { maxWidth });
  });
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.text("Report includes only the visible records from this page; no before/after JSON is exported.", 15, 60);

  const headers = ["ID", "Actor", "Event / Action", "Entity", "Entity ID", "IP Address", "Date & Time (EAT)"];
  const body = records.map((row) => [
    row.id, row.actor, row.event, row.entity, row.entityId, row.ipAddress, row.timestamp,
  ].map(pdfText));

  autoTable(doc, {
    head: [headers],
    body,
    startY: 65,
    margin: { left: 14, right: 14, top: 19, bottom: 19 },
    theme: "striped",
    showHead: "everyPage",
    styles: { font: "helvetica", fontSize: 8, cellPadding: 2.9, overflow: "linebreak", textColor: [34, 56, 80] },
    headStyles: { fillColor: [17, 79, 153], textColor: [255, 255, 255], fontStyle: "bold" },
    alternateRowStyles: { fillColor: [241, 246, 252] },
    columnStyles: {
      0: { cellWidth: 15 }, 1: { cellWidth: 34 }, 2: { cellWidth: 51 },
      3: { cellWidth: 43 }, 4: { cellWidth: 23 }, 5: { cellWidth: 36 },
    },
  });

  const pages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pages; i += 1) {
    doc.setPage(i);
    doc.setDrawColor(212, 224, 237);
    doc.line(14, pageHeight - 15, pageWidth - 14, pageHeight - 15);
    doc.setTextColor(100, 116, 139);
    doc.setFontSize(7.5);
    doc.text("Viwanda Portal | Audit report | Current page only", 14, pageHeight - 10);
    doc.text(`Page ${i} of ${pages}`, pageWidth - 14, pageHeight - 10, { align: "right" });
  }

  doc.save(`viwanda_audit_page_${context.page}_${fileStamp(context.generatedAt)}.pdf`);
}

export async function exportAuditExcel(events, context) {
  if (!events.length) throw new Error("There are no records to export.");
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Viwanda Portal";
  workbook.subject = "Audit trail - currently displayed page only";
  workbook.title = "Viwanda Portal Audit Trail";
  workbook.created = context.generatedAt;

  const summary = workbook.addWorksheet("Report Summary", {
    pageSetup: { paperSize: 9, orientation: "portrait", fitToPage: true, fitToWidth: 1 },
  });
  summary.columns = [{ width: 25 }, { width: 52 }, { width: 18 }, { width: 18 }];
  summary.mergeCells("A1:D1");
  summary.getCell("A1").value = "VIWANDA PORTAL | AUDIT TRAIL REPORT";
  summary.getCell("A1").font = { name: "Calibri", size: 16, bold: true, color: { argb: "FFFFFFFF" } };
  summary.getCell("A1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: colorHex("0C2B57") } };
  summary.getRow(1).height = 34;
  summary.mergeCells("A2:D2");
  summary.getCell("A2").value = "Ministry of Industry and Trade | INTERNAL USE ONLY";
  summary.getCell("A2").font = { bold: true, color: { argb: colorHex("325E8C") } };
  summary.getRow(2).height = 22;

  const details = scopeInfo(context, events.length);
  details.forEach(([name, value], idx) => {
    const row = summary.getRow(idx + 4);
    row.getCell(1).value = name;
    row.getCell(1).font = { bold: true, color: { argb: colorHex("234462") } };
    row.getCell(2).value = excelText(value);
  });
  summary.mergeCells("A12:D12");
  summary.getCell("A12").value = "Only the records currently displayed after filtering were exported. Old/new JSON values are excluded.";
  summary.getCell("A12").font = { italic: true, color: { argb: colorHex("7A5361") } };
  summary.getCell("A12").alignment = { wrapText: true };
  summary.getRow(12).height = 32;

  const tableHeading = (cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: colorHex("114F99") } };
    cell.alignment = { vertical: "middle" };
  };
  summary.getCell("A15").value = "Event type";
  summary.getCell("B15").value = "Count";
  summary.getCell("C15").value = "Entity type";
  summary.getCell("D15").value = "Count";
  ["A15", "B15", "C15", "D15"].forEach((key) => tableHeading(summary.getCell(key)));
  summary.getRow(15).height = 25;

  const countsByEvent = countBy(events, "eventType");
  const countsByEntity = countBy(events, "entityType");
  for (let i = 0; i < Math.max(countsByEvent.length, countsByEntity.length); i += 1) {
    const row = summary.getRow(16 + i);
    if (countsByEvent[i]) {
      row.getCell(1).value = excelText(countsByEvent[i][0]);
      row.getCell(2).value = countsByEvent[i][1];
    }
    if (countsByEntity[i]) {
      row.getCell(3).value = excelText(countsByEntity[i][0]);
      row.getCell(4).value = countsByEntity[i][1];
    }
    if (i % 2 === 1) row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: colorHex("F2F6FB") } };
  }

  const sheet = workbook.addWorksheet("Audit Events", {
    views: [{ state: "frozen", ySplit: 7 }],
    pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1 },
    properties: { defaultRowHeight: 20 },
  });
  const headers = ["Event ID", "Actor", "Actor Type", "Event / Action", "Entity Type", "Entity ID", "IP Address", "Date & Time (EAT)", "Request ID"];
  const widths = [15, 21, 18, 28, 25, 16, 20, 25, 34];
  widths.forEach((width, index) => { sheet.getColumn(index + 1).width = width; });

  sheet.mergeCells("A1:I1");
  sheet.getCell("A1").value = "MINISTRY OF INDUSTRY AND TRADE  |  VIWANDA PORTAL";
  sheet.getCell("A1").font = { bold: true, size: 15, color: { argb: "FFFFFFFF" } };
  sheet.getCell("A1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: colorHex("0C2B57") } };
  sheet.getRow(1).height = 34;
  sheet.mergeCells("A2:I2");
  sheet.getCell("A2").value = "Audit Trail Report - current filtered page only";
  sheet.getCell("A2").font = { bold: true, size: 12, color: { argb: colorHex("234462") } };
  sheet.getRow(2).height = 24;
  sheet.mergeCells("A3:I3");
  sheet.getCell("A3").value = `Page ${context.page} of ${context.lastPage} | ${events.length} records | Generated ${formatEAT(context.generatedAt)} EAT`;
  sheet.mergeCells("A4:I4");
  sheet.getCell("A4").value = `Search: ${context.search || "All"} | Event: ${context.eventFilter ? humanize(context.eventFilter) : "All"} | Entity: ${context.entityFilter ? humanize(context.entityFilter) : "All"}`;
  sheet.getCell("A4").alignment = { wrapText: true };
  sheet.getRow(4).height = 29;
  sheet.mergeCells("A5:I5");
  sheet.getCell("A5").value = "INTERNAL USE ONLY | No before/after JSON values included.";
  sheet.getCell("A5").font = { italic: true, color: { argb: colorHex("8E5160") } };
  sheet.getRow(5).height = 21;

  const headerRow = sheet.getRow(7);
  headerRow.values = headers;
  headerRow.height = 29;
  headerRow.eachCell((cell) => {
    tableHeading(cell);
    cell.alignment = { vertical: "middle", wrapText: true };
  });

  reportRows(events).forEach((record, index) => {
    const row = sheet.getRow(8 + index);
    row.values = [
      record.id, record.actor, record.actorType, record.event, record.entity,
      record.entityId, record.ipAddress, "", record.requestId,
    ].map(excelText);
    row.getCell(8).value = excelEATDate(events[index].createdAt);
    row.getCell(8).numFmt = "dd mmm yyyy, hh:mm";
    row.height = 22;
    row.eachCell((cell) => {
      cell.alignment = { vertical: "middle", wrapText: true };
      if (index % 2 === 1) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: colorHex("F2F6FB") } };
      }
    });
  });
  sheet.autoFilter = { from: "A7", to: `I${Math.max(7, 7 + events.length)}` };

  const buffer = await workbook.xlsx.writeBuffer();
  const file = new Blob([buffer], { type: XLSX_MIME });
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = `viwanda_audit_page_${context.page}_${fileStamp(context.generatedAt)}.xlsx`;
  document.body.appendChild(link);
  try {
    link.click();
  } finally {
    link.remove();
    // Revoke asynchronously so the browser has time to start the download.
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
}
