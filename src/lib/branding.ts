import { supabase } from "@/integrations/supabase/client";
import { DEFAULT_TEMPLATE, type DocumentTemplate } from "@/lib/pdf-template";

export const BRANDING_CHANGED_EVENT = "assetflow:branding-changed";

export async function loadTenantBranding(tenantId: string): Promise<DocumentTemplate> {
  const { data, error } = await supabase
    .from("document_templates" as any)
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ? { ...DEFAULT_TEMPLATE, ...(data as any) } : DEFAULT_TEMPLATE;
}

export function announceBrandingChanged(template: DocumentTemplate) {
  window.dispatchEvent(new CustomEvent(BRANDING_CHANGED_EVENT, { detail: template }));
}

export function applyBrowserBranding(template: DocumentTemplate) {
  const company = template.organization_name.trim() && template.organization_name !== "Your Organization" ? template.organization_name.trim() : "AssetFlow 360";
  document.title = `${company} - Asset Management`;
  setMetaColor(template.primary_color);
  // Company color applies to workspace controls as well as document exports.
  // Use strict hex validation to avoid injecting invalid CSS from saved settings.
  if (/^#[0-9a-fA-F]{6}$/.test(template.primary_color)) {
    document.documentElement.style.setProperty("--primary", template.primary_color);
    document.documentElement.style.setProperty("--ring", template.primary_color);
    document.documentElement.style.setProperty("--sidebar-primary", template.primary_color);
    document.documentElement.style.setProperty("--sidebar-ring", template.primary_color);
    const rgb = [1,3,5].map(i=>parseInt(template.primary_color.slice(i,i+2),16)/255);
    const linear = rgb.map(v=>v<=0.04045?v/12.92:Math.pow((v+0.055)/1.055,2.4));
    const luminance = 0.2126*linear[0]+0.7152*linear[1]+0.0722*linear[2];
    const foreground = luminance>0.179?"#111827":"#ffffff";
    document.documentElement.style.setProperty("--primary-foreground", foreground);
    document.documentElement.style.setProperty("--sidebar-primary-foreground", foreground);
  }

  // Tenant logo and document colors are workspace-specific. Browser/PWA icons
  // are platform-level branding and must not be overwritten by tenant templates.

}

function setMetaColor(color: string) {
  let meta = document.head.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement("meta");
    meta.name = "theme-color";
    document.head.appendChild(meta);
  }
  meta.content = color;
}
