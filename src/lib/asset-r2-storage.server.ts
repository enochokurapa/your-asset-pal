import {createHmac,timingSafeEqual} from "node:crypto";
import {mkdir,readFile,writeFile} from "node:fs/promises";
import {join} from "node:path";
import {supabaseAdmin} from "@/integrations/supabase/client.server";
import {createR2PresignedUrl} from "./backup-core.server";

const db=supabaseAdmin as any;
const maxBytes=10*1024*1024;
const safeSegment=/^[a-zA-Z0-9_-][a-zA-Z0-9_.-]{0,160}$/;
function parseStoragePath(path:string):{tenantId:string;name:string}|null{
 const parts=path.split("/");
 if(parts.length<3||parts.some(v=>!safeSegment.test(v)||v==="."||v===".."))return null;
 const tenantId=parts[0];
 if(!/^[0-9a-f]{8}-[0-9a-f-]{27,36}$/i.test(tenantId))return null;
 return {tenantId,name:parts.join("/")};
}
export function signedAssetFileUrl(tenantId:string,storagePath:string,expiresSeconds=300){
 const parsed=parseStoragePath(storagePath);
 if(!parsed||parsed.tenantId!==tenantId)throw Error("Invalid tenant asset file");
 const expiry=Date.now()+Math.min(900,Math.max(30,expiresSeconds))*1000;
 const r2key="asset-files/"+storagePath;
 return "/storage/v1/object/sign/asset-files/"+storagePath+"?expires="+expiry+"&token="+signed(r2key,expiry);
}
function signed(key:string,expire:number){
 const secret=process.env.R2_SECRET_ACCESS_KEY;
 if(!secret)throw Error("Private storage unavailable");
 return createHmac("sha256",secret).update(key+"|"+expire).digest("hex");
}
function json(status:number,data:unknown){return Response.json(data,{status,headers:{"cache-control":"no-store"}});}
async function userTenant(request:Request){
 const bearer=request.headers.get("authorization")||"";
 const token=bearer.startsWith("Bearer ")?bearer.slice(7).trim():"";
 if(!token)return null;
 const {data:{user},error}=await db.auth.getUser(token);
 if(error||!user)return null;
 const {data:profile}=await db.from("profiles").select("tenant_id,is_active,is_saas_admin").eq("id",user.id).maybeSingle();
 if(!profile||!profile.is_active)return null;
 return profile as {tenant_id:string,is_active:boolean,is_saas_admin:boolean};
}
const localRoot=process.env.PRIVATE_ASSET_STORAGE_ROOT||"/app/private-files";
function localFilePath(storagePath:string){
 const parsed=parseStoragePath(storagePath);
 if(!parsed)throw Error("Invalid private file path");
 return join(localRoot,"asset-files",...parsed.name.split("/"));
}
async function storePrivateFile(storagePath:string,body:ArrayBuffer|Uint8Array,contentType:string){
 const key="asset-files/"+storagePath;
 if(process.env.ASSET_FILE_BACKEND!=="local")try{
   const response=await fetch(createR2PresignedUrl("PUT",key,180),{
     method:"PUT",headers:{"content-type":contentType},body,
     signal:AbortSignal.timeout(20000)
   });
   if(response.ok)return "r2";
   console.warn("[Asset Storage] Remote write unavailable",response.status);
 }catch(e){console.warn("[Asset Storage] Remote write failed",e instanceof Error?e.message:"unavailable");}
 if(!process.env.PRIVATE_ASSET_STORAGE_ROOT)throw Error("Persistent local storage is not configured");
 const local=localFilePath(storagePath);
 await mkdir(localFilePath(storagePath).slice(0,-storagePath.split("/").at(-1)!.length-1),{recursive:true,mode:0o700});
 await writeFile(local,body,{flag:"wx",mode:0o600});
 return "local";
}
async function readPrivateFile(storagePath:string){
 const local=async()=>{
  if(!process.env.PRIVATE_ASSET_STORAGE_ROOT)return null;
  try{
   const bytes=await readFile(localFilePath(storagePath));
   const type=/\.webp$/i.test(storagePath)?"image/webp":/\.png$/i.test(storagePath)?"image/png":
    /\.jpe?g$/i.test(storagePath)?"image/jpeg":/\.pdf$/i.test(storagePath)?"application/pdf":"application/octet-stream";
   return new Response(bytes,{status:200,headers:{"content-type":type}});
  }catch{return null;}
 };
 // Prefer persistent local files for low latency; older R2 files remain accessible.
 const cached=await local();
 if(cached)return cached;
 try{
   const response=await fetch(createR2PresignedUrl("GET","asset-files/"+storagePath,60),
      {signal:AbortSignal.timeout(12000)});
   if(response.ok)return new Response(response.body,{status:200,
      headers:{"content-type":response.headers.get("content-type")||"application/octet-stream"}});
 }catch{}
 return null;
}
export async function storeAssetApiFile(storagePath:string,bytes:Uint8Array,contentType:string){
 return storePrivateFile(storagePath,bytes,contentType);
}
const storagePrefix="/storage/v1/object/";
export async function handleAssetStorage(request:Request):Promise<Response|null>{
 const url=new URL(request.url);
 if(!url.pathname.startsWith(storagePrefix))return null;
 const path=url.pathname.slice(storagePrefix.length);
 const isSign=path.startsWith("sign/asset-files/");
 const isUpload=path.startsWith("asset-files/");
 if(!isSign&&!isUpload)return json(404,{message:"Storage bucket not found"});
 let raw:string;
 try{raw=decodeURIComponent(path.slice((isSign?"sign/asset-files/":"asset-files/").length));}
 catch{return json(400,{message:"Invalid storage path"});}
 const parsed=parseStoragePath(raw);
 if(!parsed)return json(400,{message:"Invalid storage path"});
 const r2key="asset-files/"+parsed.name;
 if(isSign&&request.method==="GET"){
  const expiry=Number(url.searchParams.get("expires")||"0");
  const token=url.searchParams.get("token")||"";
  if(!Number.isInteger(expiry)||expiry<Date.now()||expiry>Date.now()+24*3600_000||!/^[a-f0-9]{64}$/.test(token))
   return json(403,{message:"Invalid or expired file link"});
  const expected=Buffer.from(signed(r2key,expiry),"hex"),actual=Buffer.from(token,"hex");
  if(!timingSafeEqual(expected,actual))return json(403,{message:"Invalid file link"});
  const response=await readPrivateFile(parsed.name);
  if(!response)return json(404,{message:"Stored file unavailable"});
  return new Response(response.body,{status:200,headers:{
    "content-type":response.headers.get("content-type")||"application/octet-stream",
    "cache-control":"private, no-store","x-content-type-options":"nosniff",
    "content-disposition":(/\.(png|jpe?g|webp)$/i.test(parsed.name)?"inline":"attachment")+
      "; filename="+JSON.stringify(parsed.name.split("/").at(-1)?.replace(/[^a-zA-Z0-9._-]/g,"_")||"file"),

  }});
 }
 const profile=await userTenant(request);
 if(!profile||profile.tenant_id!==parsed.tenantId)return json(403,{message:"Access to this workspace is denied"});
 if(isSign&&request.method==="POST"){
  const {data:attachment}=await db.from("asset_attachments").select("id,asset_id").eq("storage_path",parsed.name).maybeSingle();
  if(!attachment){
    // Files can also belong to approved gate passes or custom register uploads.
    const {data:gate}=await db.from("gate_passes").select("id").eq("tenant_id",parsed.tenantId).eq("attachment_url",parsed.name).maybeSingle();
    if(!gate&&!parsed.name.includes("/custom-register/"))return json(404,{message:"File record not found"});
  }
  const expiry=Date.now()+5*60_000;
  const signedURL="/storage/v1/object/sign/asset-files/"+parsed.name+"?expires="+expiry+"&token="+signed(r2key,expiry);
  return json(200,{signedURL,signedUrl:signedURL});
 }
 if(isUpload&&request.method==="POST"){
  const length=Number(request.headers.get("content-length")||0);
  if(length>maxBytes+10240)return json(413,{message:"File exceeds 10 MB"});
  let contentType="",body:ArrayBuffer;
  const requestMime=(request.headers.get("content-type")||"").toLowerCase();
  if(requestMime.startsWith("multipart/form-data")){
    const form=await request.formData();
    const file=form.get("file");
    if(!(file instanceof File))return json(400,{message:"File field is required"});
    if(!file.size||file.size>maxBytes)return json(413,{message:"File size must be below 10 MB"});
    contentType=file.type.toLowerCase();
    body=await file.arrayBuffer();
  }else{
    contentType=requestMime.split(";")[0].trim();
    body=await request.arrayBuffer();
  }
  const allowed=["image/jpeg","image/png","image/webp","application/pdf","text/plain",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"];
  if(!allowed.includes(contentType))return json(415,{message:"File type not permitted"});
  if(!body.byteLength||body.byteLength>maxBytes)return json(413,{message:"File size must be between 1 byte and 10 MB"});
  try{
    const backend=await storePrivateFile(parsed.name,body,contentType);
    return json(200,{Key:"asset-files/"+parsed.name,Id:parsed.name,storageBackend:backend});
  }catch(error){
    console.error("[Asset Storage] Upload failed",error instanceof Error?error.message:"unknown");
    return json(503,{message:"Private file storage unavailable"});
  }
 }
 return json(405,{message:"Unsupported storage method"});
}
