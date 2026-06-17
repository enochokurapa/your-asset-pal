import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import { formatUGX } from "@/lib/utils";
import { loadTemplate, createBrandedPdf, saveBranded, tableHeadFill } from "@/lib/pdf-template";


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

export async function exportSchedulePDF(title: string, rows: ScheduleRow[], subtitle?: string) {
  const template = await loadTemplate();
  const { doc, startY } = createBrandedPdf({ template, orientation: "landscape", title, subtitle });
  autoTable(doc, {
    startY,
    head: [["#", "Period start", "Period end", "Opening", "Depreciation", "Accumulated", "Closing"]],
    body: rows.map((r) => [
      r.index, r.periodStart, r.periodEnd,
      formatUGX(r.opening), formatUGX(r.depreciation),
      formatUGX(r.accumulated), formatUGX(r.closing),
    ]),
    styles: { fontSize: 8, font: template.font_family },
    headStyles: { fillColor: tableHeadFill(template) },
    margin: { left: template.margin_left, right: template.margin_right, bottom: template.margin_bottom },
  });
  saveBranded(doc, template, `${safe(title) || "depreciation"}.pdf`);
}

export function exportReportXLSX(title: string, headers: string[], rows: (string | number)[][]) {
  const data = rows.map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i]])));
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, title.slice(0, 30) || "Report");
  XLSX.writeFile(wb, `${safe(title) || "report"}.xlsx`);
}

export async function exportReportPDF(title: string, headers: string[], rows: (string | number)[][]) {
  const template = await loadTemplate();
  const { doc, startY } = createBrandedPdf({
    template, orientation: "landscape", title, subtitle: `${rows.length} row(s)`,
  });
  autoTable(doc, {
    startY,
    head: [headers],
    body: rows.map((r) => r.map((c) => (typeof c === "number" ? formatUGX(c) : c))),
    styles: { fontSize: 8, font: template.font_family },
    headStyles: { fillColor: tableHeadFill(template) },
    margin: { left: template.margin_left, right: template.margin_right, bottom: template.margin_bottom },
  });
  saveBranded(doc, template, `${safe(title) || "report"}.pdf`);
}

