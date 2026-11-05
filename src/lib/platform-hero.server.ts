import { supabaseAdmin } from "@/integrations/supabase/client.server";

const db = supabaseAdmin as any;
export const HERO_PAGES = ["home","features","solutions","pricing","about"] as const;
export type HeroPage = typeof HERO_PAGES[number];
type ImageFormat = "image/png" | "image/webp" | "image/svg+xml";
const MAX_BYTES = 3_000_000;
const MIN_WIDTH = 1280;
const MIN_HEIGHT = 600;
const MAX_WIDTH = 3840;
const MAX_HEIGHT = 2400;

function pngDimensions(b: Buffer): [number,number] {
  if (b.length < 24 || b.subarray(0,8).toString("hex") !== "89504e470d0a1a0a" ||
    b.subarray(12,16).toString() !== "IHDR") throw new Error("Invalid PNG image");
  return [b.readUInt32BE(16),b.readUInt32BE(20)];
}
function webpDimensions(b: Buffer): [number,number] {
  if (b.length < 30 || b.toString("ascii",0,4) !== "RIFF" ||
      b.toString("ascii",8,12) !== "WEBP" ||
      b.readUInt32LE(4)+8 !== b.length)
    throw new Error("Invalid WebP image");
  const fourcc=b.toString("ascii",12,16);
  if (fourcc === "VP8X") return [1+b.readUIntLE(24,3),1+b.readUIntLE(27,3)];
  if (fourcc === "VP8L") {
    if (b[20] !== 0x2f) throw new Error("Invalid lossless WebP image");
    return [1+(((b[22]&0x3f)<<8)|b[21]),1+(((b[24]&0xf)<<10)|(b[23]<<2)|((b[22]&0xc0)>>6))];
  }
  if (fourcc === "VP8 " && b.length>=30 && b.toString("hex",23,26)==="9d012a")
    return [b.readUInt16LE(26)&0x3fff,b.readUInt16LE(28)&0x3fff];
  throw new Error("Unsupported WebP encoding");
}

function validateSvg(b: Buffer): [number,number] {
  const xml=b.toString("utf8");
  // SVG is embedded as an <img> data URL, never injected as HTML. We also
  // reject scripting, foreign content, external fetches and CSS constructs.
  if (b.toString("utf8") !== xml || xml.includes("\uFFFD") ||
      /<!|<\?|&|[\u0000-\u0008\u000b\u000e-\u001f]/.test(xml) ||
      /\b(?:script|foreignObject|iframe|object|embed|image|use|animate|set|style|filter|pattern|metadata|link|audio|video)\b/i.test(xml) ||
      /(?:javascript:|data:|https?:|@import|expression\s*\(|url\s*\(\s*[^#])/i.test(xml))
    throw new Error("SVG contains unsupported or unsafe content");

  const tags=new Set(["svg","g","path","rect","circle","ellipse","line",
    "polyline","polygon","text","tspan","defs","linearGradient","radialGradient",
    "stop","clipPath","mask","title","desc"]);
  const attrs=new Set(["xmlns","width","height","viewBox","preserveAspectRatio",
    "x","y","x1","y1","x2","y2","cx","cy","r","rx","ry","d","points",
    "fill","fill-opacity","fill-rule","stroke","stroke-width",
    "stroke-linecap","stroke-linejoin","stroke-opacity","stroke-dasharray",
    "stroke-dashoffset","opacity","transform","id","class","clip-path","mask",
    "offset","stop-color","stop-opacity","font-family","font-size",
    "font-weight","text-anchor","dominant-baseline"]);
  const re=/<(\/?)([A-Za-z][A-Za-z0-9]*)([^<>]*)>/g;
  let m:RegExpExecArray|null, count=0, scrubbed=xml;
  let root:RegExpExecArray|null=null;
  while((m=re.exec(xml))!==null){
    if(++count>2500) throw new Error("SVG is too complex");
    const tag=m[2];
    if(!tags.has(tag)) throw new Error("SVG includes an unsupported element");
    if(!root && m[1]!=="/") root=m;
    if(m[1]==="/") {
      if(m[3].trim()) throw new Error("Invalid SVG end tag");
    } else {
      const raw=m[3].replace(/\/\s*$/,"");
      const attrPattern=/\s+([A-Za-z][A-Za-z0-9-]*)\s*=\s*"([^"]*)"/g;
      let rest=raw, a:RegExpExecArray|null;
      while((a=attrPattern.exec(raw))!==null) {
        if(!attrs.has(a[1]) || /^on/i.test(a[1]) ||
          (/(?:url|clip-path|mask)/i.test(a[1]) && /url\s*\(/i.test(a[2]) &&
           !/^url\(#[-A-Za-z0-9_]+\)$/.test(a[2])) ||
           /[<>\\]/.test(a[2]))
          throw new Error("SVG contains unsafe attributes");
        rest=rest.replace(a[0],"");
      }
      if(rest.trim()) throw new Error("Invalid or unsafe SVG attribute");
    }
    scrubbed=scrubbed.replace(m[0],"");
  }
  if(!root || root[2]!=="svg" || /[<>]/.test(scrubbed)) throw new Error("Invalid SVG structure");
  const view=root[3].match(/\bviewBox\s*=\s*"([^"]+)"/);
  const vals=view?.[1].trim().split(/[\s,]+/).map(Number);
  if(!vals || vals.length!==4 || !vals.every(Number.isFinite)) throw new Error("SVG requires a numeric viewBox");
  return [Math.round(vals[2]),Math.round(vals[3])];
}
function decodeAndValidate(dataUrl:string) {
  const match=/^data:(image\/png|image\/webp|image\/svg\+xml);base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl);
  if(!match) throw new Error("Upload a PNG, WebP or vector SVG image");
  const mime=match[1] as ImageFormat;
  if(match[2].length>Math.ceil(MAX_BYTES/3)*4+4) throw new Error("Image must be 3 MB or smaller");
  const binary=Buffer.from(match[2],"base64");
  if(!binary.length || binary.length>MAX_BYTES || binary.toString("base64")!==match[2])
    throw new Error("Image encoding is invalid or file exceeds 3 MB");
  const [width,height]=mime==="image/png"?pngDimensions(binary):
    mime==="image/webp"?webpDimensions(binary):validateSvg(binary);
  if(width<MIN_WIDTH||height<MIN_HEIGHT||width>MAX_WIDTH||height>MAX_HEIGHT ||
     width/height<1.5||width/height>3.2)
    throw new Error("Hero artwork must be 1280–3840 px wide, 600–2400 px high, with a landscape ratio between 1.5:1 and 3.2:1");
  return {mime,image_base64:match[2],width,height};
}
async function requirePlatformAdmin(userId:string) {
  const {data,error}=await db.from("profiles").select("is_active,is_saas_admin").eq("id",userId).single();
  if(error||data?.is_active!==true||data?.is_saas_admin!==true)
    throw new Error("Only an active SaaS administrator may manage homepage and marketing artwork");
}
export async function listHeroSettings(userId:string) {
  await requirePlatformAdmin(userId);
  const {data,error}=await db.from("platform_hero_images")
    .select("page,mime_type,width,height,alt_text,updated_at").order("page");
  if(error) throw new Error("Unable to load hero settings. Apply the database migration.");
  return data??[];
}
export async function getPublicHeroImage(page:HeroPage) {
  const {data,error}=await db.from("platform_hero_images")
    .select("mime_type,image_base64,width,height,alt_text,updated_at")
    .eq("page",page).maybeSingle();
  if(error) {console.error("[Hero] Public lookup failed:",error.code);return null;}
  if(!data)return null;
  return {url:"data:"+data.mime_type+";base64,"+data.image_base64,
    width:data.width as number,height:data.height as number,
    altText:data.alt_text as string,updatedAt:data.updated_at as string};
}
export async function saveHeroImage(userId:string,page:HeroPage,dataUrl:string,altText:string) {
  await requirePlatformAdmin(userId);
  const image=decodeAndValidate(dataUrl);
  const alt=altText.trim();
  if(alt.length<15||alt.length>220)throw new Error("Enter a meaningful 15–220 character image description for accessibility");
  const {error}=await db.from("platform_hero_images").upsert({
    page,mime_type:image.mime,image_base64:image.image_base64,
    width:image.width,height:image.height,alt_text:alt,
    updated_at:new Date().toISOString(),updated_by:userId,
  },{onConflict:"page"});
  if(error)throw new Error("Unable to save the hero image");
  return {saved:true,width:image.width,height:image.height,page};
}
export async function deleteHeroImage(userId:string,page:HeroPage) {
  await requirePlatformAdmin(userId);
  const {error}=await db.from("platform_hero_images").delete().eq("page",page);
  if(error)throw new Error("Unable to restore the page's default hero");
  return {deleted:true};
}
