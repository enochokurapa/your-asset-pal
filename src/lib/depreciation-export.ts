import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import { formatUGX } from "@/lib/utils";

const safe = (s: string) => s.replace(/[^a-z0-9_-]+/gi, "_");

export interface ScheduleRow {
  index: number;
  periodStart: string;
  periodEnd: string;
  opening: number;
  depreciation: number;
  accumulated: number;
  closing: number;
}

export function exportScheduleXLSX(title: string, rows: ScheduleRow[]) {
  const data = rows.map((r) => ({
    "#": r.index,
    "Period start": r.periodStart,
    "Period end": r.periodEnd,
    Opening: formatUGX(r.opening),
    Depreciation: formatUGX(r.depreciation),
    Accumulated: formatUGX(r.accumulated),
    Closing: formatUGX(r.closing),
  }));
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Schedule");
  XLSX.writeFile(wb, `${safe(title) || "depreciation"}.xlsx`);
}

export function exportSchedulePDF(title: string, rows: ScheduleRow[], subtitle?: string) {
  const doc = new jsPDF({ orientation: "landscape" });
  doc.setFontSize(14);
  doc.text(title, 14, 14);
  doc.setFontSize(9);
  doc.text(`Generated ${new Date().toLocaleString()}${subtitle ? " · " + subtitle : ""}`, 14, 20);
  autoTable(doc, {
    startY: 26,
    head: [["#", "Period start", "Period end", "Opening", "Depreciation", "Accumulated", "Closing"]],
    body: rows.map((r) => [
      r.index, r.periodStart, r.periodEnd,
      formatUGX(r.opening), formatUGX(r.depreciation),
      formatUGX(r.accumulated), formatUGX(r.closing),
    ]),
    styles: { fontSize: 8 },
    headStyles: { fillColor: [30, 41, 59] },
  });
  doc.save(`${safe(title) || "depreciation"}.pdf`);
}

export function exportReportXLSX(title: string, headers: string[], rows: (string | number)[][]) {
  const data = rows.map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i]])));
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, title.slice(0, 30) || "Report");
  XLSX.writeFile(wb, `${safe(title) || "report"}.xlsx`);
}

export function exportReportPDF(title: string, headers: string[], rows: (string | number)[][]) {
  const doc = new jsPDF({ orientation: "landscape" });
  doc.setFontSize(14);
  doc.text(title, 14, 14);
  doc.setFontSize(9);
  doc.text(`Generated ${new Date().toLocaleString()} · ${rows.length} row(s)`, 14, 20);
  autoTable(doc, {
    startY: 26,
    head: [headers],
    body: rows.map((r) => r.map((c) => (typeof c === "number" ? formatUGX(c) : c))),
    styles: { fontSize: 8 },
    headStyles: { fillColor: [30, 41, 59] },
  });
  doc.save(`${safe(title) || "report"}.pdf`);
}
