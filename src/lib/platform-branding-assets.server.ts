import sharp from "sharp";
import { createHash } from "node:crypto";
import { queryPostgres } from "@/lib/postgres.server";

/**
 * Serve the administrator's saved platform icon at standard PWA dimensions.
 * Never depend on a browser-created blob manifest: installed apps must be able
 * to request the same images directly, before JavaScript or authentication.
 */
const prefix = "/api/branding/";
const cache = new Map<string, Promise<Uint8Array>>();
const defaultName = "AssetFlow 360";

type Branding = {
  platform_name?: string | null;
  platform_icon_data_url?: string | null;
  platform_logo_data_url?: string | null;
  platform_primary_color?: string | null;
};

async function readBranding(): Promise<Branding | null> {
  const rows = await queryPostgres<Branding>(
    "SELECT platform_name, platform_icon_data_url, platform_logo_data_url, platform_primary_color FROM public.saas_settings WHERE id = TRUE LIMIT 1",
  );
  return rows[0] || null;
}

function uploadedLogo(data:Branding|null):Uint8Array|null{
  return decodeUploadedImage(data?.platform_logo_data_url||data?.platform_icon_data_url);
}
function decodeUploadedImage(raw:string|null|undefined):Uint8Array|null{
  if(typeof raw!=="string"||raw.length>2_800_000)return null;
  const match=/^data:image\\/(?:png|webp|svg\\+xml);base64,([A-Za-z0-9+/=]+)$/.exec(raw);
  if(!match)return null;
  const bin=Buffer.from(match[1],"base64");
  return bin.length>0&&bin.length<=2_000_000?bin:null;
}
function uploadedImage(data: Branding | null): Uint8Array | null {
  const raw = data?.platform_icon_data_url || data?.platform_logo_data_url;
  if (typeof raw !== "string" || raw.length > 2_800_000) return null;
  const match = /^data:image\/(?:png|webp|svg\+xml);base64,([A-Za-z0-9+/=]+)$/.exec(raw);
  if (!match) return null;
  const binary = Buffer.from(match[1], "base64");
  if (!binary.length || binary.length > 2_000_000) return null;
  return binary;
}

export function resizedIcon(input: Uint8Array, size: 192 | 512): Promise<Uint8Array> {
  const fingerprint = createHash("sha256").update(input).digest("hex") + ":" + size;
  const existing = cache.get(fingerprint);
  if (existing) return existing;
  const generated = sharp(input, { limitInputPixels: 16_000_000 })
    .resize(size, size, {
      fit: "contain",
      background: { r: 255, g: 255, b: 255, alpha: 0 },
      withoutEnlargement: false,
    })
    .png()
    .toBuffer()
    .then((buffer) => new Uint8Array(buffer));
  cache.set(fingerprint, generated);
  // Keep only a few sizes/versions in memory after branding replacements.
  while (cache.size > 8) cache.delete(cache.keys().next().value!);
  return generated;
}

function defaultIcon(request: Request, size: 192 | 512): Response {
  return Response.redirect(new URL("/assetflow-approved-mark.svg",request.url),302);
}

export async function maybeHandlePlatformBrandingAsset(request: Request): Promise<Response | null> {
  const pathname = new URL(request.url).pathname;
  const manifest = pathname === prefix + "manifest.webmanifest";
  const logo = pathname === prefix + "logo.png";
  const size: 192 | 512 | null = pathname === prefix + "icon-192.png"
    ? 192
    : pathname === prefix + "icon-512.png" ? 512 : null;
  if (!manifest && !size && !logo) return null;
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response(null, { status: 405, headers: { allow: "GET, HEAD" } });
  }

  let branding: Branding | null = null;
  try {
    branding = await readBranding();
  } catch (error) {
    console.error("[Branding] Unable to read platform branding", error);
  }

  if (manifest) {
    const name = (branding?.platform_name || defaultName).slice(0, 80);
    const color = /^#[0-9a-fA-F]{6}$/.test(branding?.platform_primary_color || "")
      ? branding!.platform_primary_color : "#C77435";
    const body = {
      name: name + " - Fixed Asset Management",
      short_name: name.slice(0, 30),
      id: "/",
      start_url: "/",
      scope: "/",
      display: "standalone",
      background_color: "#ffffff",
      theme_color: color,
      description: "Manage and verify your fixed assets.",
      icons: [
        { src: prefix + "icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
        { src: prefix + "icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      ],
    };
    return new Response(request.method === "HEAD" ? null : JSON.stringify(body), {
      headers: {
        "content-type": "application/manifest+json; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  }

  if(logo){
    const raw=uploadedLogo(branding);
    if(!raw)return Response.redirect(new URL("/assetflow-approved-logo.svg",request.url),302);
    try{
      const fingerprint=createHash("sha256").update(raw).digest("hex")+":logo";
      let cached=cache.get(fingerprint);
      if(!cached){
        cached=sharp(raw,{limitInputPixels:16_000_000})
          .resize({width:560,height:360,fit:"inside",withoutEnlargement:true})
          .png().toBuffer().then(buf=>new Uint8Array(buf));
        cache.set(fingerprint,cached);
      }
      const bytes=await cached;
      return new Response(request.method==="HEAD"?null:new Uint8Array(bytes),{
        headers:{"content-type":"image/png","cache-control":"public, max-age=300",
          "content-length":String(bytes.byteLength)},
      });
    }catch(error){
      console.error("[Branding] Unable to render logo",error);
      return Response.redirect(new URL("/assetflow-approved-logo.svg",request.url),302);
    }
  }
  const input = uploadedImage(branding);
  if (!input) return defaultIcon(request, size!);
  try {
    const bytes = await resizedIcon(input, size!);
    return new Response(request.method === "HEAD" ? null : new Uint8Array(bytes), {
      headers: {
        "content-type": "image/png",
        "cache-control": "public, max-age=300",
        "content-length": String(bytes.byteLength),
      },
    });
  } catch (error) {
    console.error("[Branding] Invalid uploaded icon", error);
    return defaultIcon(request, size!);
  }
}
