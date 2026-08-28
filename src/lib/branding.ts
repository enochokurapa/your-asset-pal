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
  const company = template.organization_name.trim() || "AssetFlow";
  document.title = `${company} — Asset Management`;
  setMetaColor(template.primary_color);

  if (template.logo_data_url) {
    setLink("icon", template.logo_data_url);
    setLink("shortcut icon", template.logo_data_url);
    setLink("apple-touch-icon", template.logo_data_url);
  }

  // Browsers use this manifest for future installs. Existing installed icons are
  // controlled by the OS and may require reinstalling the app to refresh its icon.
  const manifest = {
    name: `${company} — Asset Management`, short_name: company.slice(0, 30), id: "/",
    description: `Manage ${company}'s fixed assets.`, start_url: "/", scope: "/",
    display: "standalone", orientation: "any",
    background_color: "#ffffff", theme_color: template.primary_color,
    categories: ["business", "productivity", "utilities"],
    icons: template.logo_data_url ? [
      { src: template.logo_data_url, sizes: "any", purpose: "any" },
    ] : [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any maskable" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
    ],
  };
  const oldUrl = document.documentElement.dataset.brandManifestUrl;
  if (oldUrl) URL.revokeObjectURL(oldUrl);
  const url = URL.createObjectURL(new Blob([JSON.stringify(manifest)], { type: "application/manifest+json" }));
  document.documentElement.dataset.brandManifestUrl = url;
  setLink("manifest", url);
}

function setLink(rel: string, href: string) {
  let link = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!link) {
    link = document.createElement("link");
    link.rel = rel;
    document.head.appendChild(link);
  }
  link.href = href;
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
