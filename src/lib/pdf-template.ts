// Organization-wide PDF branding/template helper.
// Loads `document_templates` (active row) and produces jsPDF documents pre-styled
// with the user's logo, header, footer, watermark, font, margins, and orientation.

import jsPDF from "jspdf";
import { supabase } from "@/integrations/supabase/client";

export type LogoPosition = "left" | "center" | "right" | "none";
export type WatermarkPosition = "center" | "diagonal" | "repeated" | "none";
export type FontFamily = "helvetica" | "times" | "courier";
export type Orientation = "portrait" | "landscape";
export type PaperSize = "a4" | "letter" | "legal";

export interface DocumentTemplate {
  id: string;
  name: string;
  is_active: boolean;
  logo_data_url: string | null;
  logo_position: LogoPosition;
  logo_max_height: number;
  organization_name: string;
  header_text: string;
  header_show: boolean;
  footer_text: string;
  footer_show: boolean;
  show_page_numbers: boolean;
  show_generated_at: boolean;
  watermark_text: string;
  watermark_image_data_url: string | null;
  watermark_opacity: number;
  watermark_position: WatermarkPosition;
  font_family: FontFamily;
  base_font_size: number;
  margin_top: number;
  margin_right: number;
  margin_bottom: number;
  margin_left: number;
  orientation: Orientation;
  paper_size: PaperSize;
  primary_color: string;
}

export const DEFAULT_TEMPLATE: DocumentTemplate = {
  id: "default",
  name: "Default",
  is_active: true,
  logo_data_url: null,
  logo_position: "left",
  logo_max_height: 14,
  organization_name: "Your Organization",
  header_text: "",
  header_show: true,
  footer_text: "",
  footer_show: true,
  show_page_numbers: true,
  show_generated_at: true,
  watermark_text: "",
  watermark_image_data_url: null,
  watermark_opacity: 0.1,
  watermark_position: "diagonal",
  font_family: "helvetica",
  base_font_size: 10,
  margin_top: 20,
  margin_right: 14,
  margin_bottom: 20,
  margin_left: 14,
  orientation: "portrait",
  paper_size: "a4",
  primary_color: "#1e293b",
};

let cache: { t: DocumentTemplate; at: number } | null = null;
const CACHE_TTL_MS = 60_000;

export async function loadTemplate(force = false): Promise<DocumentTemplate> {
  if (!force && cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.t;
  const { data } = await supabase
    .from("document_templates" as any)
    .select("*")
    .eq("is_active", true)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const t = (data as any) ? { ...DEFAULT_TEMPLATE, ...(data as any) } : DEFAULT_TEMPLATE;
  cache = { t, at: Date.now() };
  return t;
}

export function invalidateTemplateCache() {
  cache = null;
}

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.trim());
  if (!m) return [30, 41, 59];
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
}

export function primaryColorRgb(t: DocumentTemplate): [number, number, number] {
  return hexToRgb(t.primary_color);
}

export interface CreateBrandedPdfOpts {
  template: DocumentTemplate;
  orientation?: Orientation;
  title?: string;
  subtitle?: string;
}

export interface BrandedPdf {
  doc: jsPDF;
  startY: number;
  template: DocumentTemplate;
  pageWidth: number;
  pageHeight: number;
}

/** Create a jsPDF instance with header (logo + title) drawn on the first page. */
export function createBrandedPdf(opts: CreateBrandedPdfOpts): BrandedPdf {
  const t = opts.template;
  const orientation = opts.orientation ?? t.orientation;
  const doc = new jsPDF({ orientation, unit: "mm", format: t.paper_size });
  doc.setFont(t.font_family, "normal");
  doc.setFontSize(t.base_font_size);
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const startY = drawHeader(doc, t, opts.title, opts.subtitle, pageWidth);
  return { doc, startY, template: t, pageWidth, pageHeight };
}

function drawHeader(
  doc: jsPDF,
  t: DocumentTemplate,
  title: string | undefined,
  subtitle: string | undefined,
  pageWidth: number,
): number {
  let y = t.margin_top;
  const left = t.margin_left;
  const right = pageWidth - t.margin_right;

  // Logo
  let logoBottom = y;
  if (t.logo_data_url && t.logo_position !== "none") {
    try {
      const h = t.logo_max_height;
      const w = h * 2.2; // rough; jsPDF stretches—acceptable for branding placeholder
      let x = left;
      if (t.logo_position === "center") x = (pageWidth - w) / 2;
      else if (t.logo_position === "right") x = right - w;
      doc.addImage(t.logo_data_url, "PNG", x, y, w, h, undefined, "FAST");
      logoBottom = y + h;
    } catch {
      /* ignore broken image */
    }
  }

  // Header text (right-aligned)
  if (t.header_show && (t.header_text || t.organization_name)) {
    doc.setFont(t.font_family, "bold");
    doc.setFontSize(t.base_font_size);
    const headerText = t.header_text || t.organization_name;
    const lines = doc.splitTextToSize(headerText, pageWidth / 2 - 4);
    const align = t.logo_position === "right" ? "left" : "right";
    const tx = align === "right" ? right : left;
    doc.text(lines, tx, y + 4, { align });
    logoBottom = Math.max(logoBottom, y + 4 + lines.length * 4);
  }

  y = Math.max(logoBottom, t.margin_top) + 4;

  if (title) {
    const [r, g, b] = primaryColorRgb(t);
    doc.setTextColor(r, g, b);
    doc.setFont(t.font_family, "bold");
    doc.setFontSize(t.base_font_size + 5);
    doc.text(title, left, y);
    doc.setTextColor(0, 0, 0);
    y += 7;
  }
  if (subtitle) {
    doc.setFont(t.font_family, "normal");
    doc.setFontSize(t.base_font_size - 1);
    doc.text(subtitle, left, y);
    y += 5;
  }
  if (t.show_generated_at) {
    doc.setFont(t.font_family, "normal");
    doc.setFontSize(t.base_font_size - 2);
    doc.setTextColor(120, 120, 120);
    doc.text(`Generated ${new Date().toLocaleString()}`, left, y);
    doc.setTextColor(0, 0, 0);
    y += 4;
  }
  return y + 2;
}

function setOpacity(doc: jsPDF, opacity: number) {
  try {
    const gs = (doc as any).GState({ opacity });
    (doc as any).setGState(gs);
  } catch {
    /* ignore if not supported */
  }
}
function resetOpacity(doc: jsPDF) {
  setOpacity(doc, 1);
}

function drawWatermark(doc: jsPDF, t: DocumentTemplate, pageWidth: number, pageHeight: number) {
  if (t.watermark_position === "none") return;
  if (!t.watermark_text && !t.watermark_image_data_url) return;

  setOpacity(doc, Math.max(0, Math.min(1, t.watermark_opacity)));

  if (t.watermark_image_data_url) {
    try {
      const w = pageWidth * 0.6;
      const h = w; // square-ish
      const x = (pageWidth - w) / 2;
      const y = (pageHeight - h) / 2;
      doc.addImage(t.watermark_image_data_url, "PNG", x, y, w, h, undefined, "SLOW");
    } catch {
      /* ignore */
    }
  }

  if (t.watermark_text) {
    doc.setFont(t.font_family, "bold");
    const baseSize = t.watermark_position === "repeated" ? 36 : 90;
    doc.setFontSize(baseSize);
    doc.setTextColor(120, 120, 120);
    if (t.watermark_position === "center") {
      doc.text(t.watermark_text, pageWidth / 2, pageHeight / 2, { align: "center", angle: 0 });
    } else if (t.watermark_position === "diagonal") {
      doc.text(t.watermark_text, pageWidth / 2, pageHeight / 2, { align: "center", angle: 45 });
    } else if (t.watermark_position === "repeated") {
      const stepX = pageWidth / 3;
      const stepY = pageHeight / 5;
      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 5; j++) {
          doc.text(t.watermark_text, stepX * (i + 0.5), stepY * (j + 0.5), { align: "center", angle: 30 });
        }
      }
    }
    doc.setTextColor(0, 0, 0);
  }
  resetOpacity(doc);
}

function drawFooter(doc: jsPDF, t: DocumentTemplate, pageWidth: number, pageHeight: number, page: number, total: number) {
  const y = pageHeight - Math.max(8, t.margin_bottom - 8);
  doc.setFont(t.font_family, "normal");
  doc.setFontSize(t.base_font_size - 2);
  doc.setTextColor(120, 120, 120);
  if (t.footer_show && t.footer_text) {
    doc.text(t.footer_text, t.margin_left, y);
  }
  if (t.show_page_numbers) {
    doc.text(`Page ${page} of ${total}`, pageWidth - t.margin_right, y, { align: "right" });
  }
  doc.setTextColor(0, 0, 0);
}

/** Walk every page applying watermark + footer. Call right before save/output. */
export function applyTemplateChrome(doc: jsPDF, t: DocumentTemplate) {
  const total = doc.getNumberOfPages();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    drawWatermark(doc, t, pageWidth, pageHeight);
    drawFooter(doc, t, pageWidth, pageHeight, i, total);
  }
}

/** Convenience: finalize and save. */
export function saveBranded(doc: jsPDF, t: DocumentTemplate, filename: string) {
  applyTemplateChrome(doc, t);
  doc.save(filename);
}

/** Returns autoTable head fill color matching template primary color. */
export function tableHeadFill(t: DocumentTemplate): [number, number, number] {
  return primaryColorRgb(t);
}
