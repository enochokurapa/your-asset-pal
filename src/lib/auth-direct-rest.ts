/** Authentication follow-up queries use the access token returned by GoTrue.
 * These calls do not acquire another supabase-js auth storage lock. PostgREST
 * still enforces the real JWT, tenant isolation and all RLS policies. */
export async function directAuthRest<T>(
  path: string, token: string, method: "GET"|"POST" = "GET",
):Promise<T>{
  if(!token || !path.startsWith("/") || path.startsWith("//"))
    throw new Error("Authentication session unavailable");
  const support=typeof window!=="undefined"?window.sessionStorage.getItem("af-platform-tenant-session"):null;
  const headers:Record<string,string>={
    Authorization:`Bearer ${token}`,
    Accept:"application/json",
    "Content-Type":"application/json",
  };
  if(support)headers["x-assetflow-support-session"]=support;
  const response=await fetch("/rest/v1"+path,{
    method,
    headers,
    ...(method==="POST"?{body:"{}"}:{}),
    signal:AbortSignal.timeout(11000),
    cache:"no-store",
  });
  if(!response.ok)throw new Error(`Workspace API error (${response.status})`);
  return await response.json() as T;
}
