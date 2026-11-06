import {createFileRoute,Navigate} from "@tanstack/react-router";
import {useEffect,useRef,useState} from "react";
import {useQuery,useQueryClient} from "@tanstack/react-query";
import {useServerFn} from "@tanstack/react-start";
import {useAuth} from "@/hooks/use-auth";
import {getServerAuthHeaders} from "@/lib/auth-headers";
import {
 getAcquisitionConnections,getAcquisitionReport,startSearchConsoleOAuth,
 completeSearchConsoleOAuth,disconnectSearchConsole,saveCloudflareAcquisition,disconnectCloudflareAcquisition,
} from "@/lib/external-acquisition.functions";
import {Card} from "@/components/ui/card";
import {Input} from "@/components/ui/input";
import {Button} from "@/components/ui/button";
import {toast} from "sonner";
import {BarChart3,Cloud,Search,Link2,BrainCircuit,Globe,RefreshCw,ExternalLink,ShieldCheck} from "lucide-react";

export const Route=createFileRoute("/_app/saas-admin/traffic")({component:AcquisitionPage});

type Metric={label:string;clicks:number;impressions:number;ctr:number;position:number};
type Referral={label:string;views:number;visits:number};
function SourceTable({title,rows,mode}:{title:string;rows:Metric[]|Referral[];mode:"google"|"referrals"}){
 return <Card className="min-w-0 overflow-hidden p-4 sm:p-5">
  <h3 className="text-sm font-semibold text-[#244453]">{title}</h3>
  <div className="mt-3 w-full overflow-x-auto">
   <table className="w-full min-w-[350px] text-left text-xs">
    <thead className="border-b bg-muted/40 text-muted-foreground">
     <tr><th className="px-2 py-2">Source / destination</th>
      {mode==="google"?<>
        <th className="px-2 py-2 text-right">Clicks</th><th className="px-2 py-2 text-right">Impressions</th>
        <th className="px-2 py-2 text-right">CTR</th>
      </>:<><th className="px-2 py-2 text-right">Page views</th><th className="px-2 py-2 text-right">Visits</th></>}
     </tr>
    </thead>
    <tbody>
     {rows.map((item,i)=><tr key={item.label+":"+i} className="border-b last:border-0">
      <td className="max-w-[240px] break-words px-2 py-2.5">{item.label}</td>
      {mode==="google"?"clicks" in item&&<>
       <td className="px-2 py-2.5 text-right tabular-nums">{item.clicks.toLocaleString()}</td>
       <td className="px-2 py-2.5 text-right tabular-nums">{item.impressions.toLocaleString()}</td>
       <td className="px-2 py-2.5 text-right tabular-nums">{(item.ctr*100).toFixed(1)}%</td>
      </>:"views" in item&&<>
       <td className="px-2 py-2.5 text-right tabular-nums">{item.views.toLocaleString()}</td>
       <td className="px-2 py-2.5 text-right tabular-nums">{item.visits.toLocaleString()}</td>
      </>}
     </tr>)}
    </tbody>
   </table>
   {!rows.length&&<p className="py-5 text-xs text-muted-foreground">No records returned from this provider for the selected period.</p>}
  </div>
 </Card>;
}
function AcquisitionPage(){
 const {isSaasAdmin,loading}=useAuth();
 const qc=useQueryClient();
 const connections=useServerFn(getAcquisitionConnections),report=useServerFn(getAcquisitionReport);
 const start=useServerFn(startSearchConsoleOAuth),finish=useServerFn(completeSearchConsoleOAuth);
 const disconnectGoogle=useServerFn(disconnectSearchConsole);
 const saveCloudflare=useServerFn(saveCloudflareAcquisition);
 const disconnectCloudflare=useServerFn(disconnectCloudflareAcquisition);
 const [accountId,setAccountId]=useState("");
 const [siteTag,setSiteTag]=useState("");
 const [apiToken,setApiToken]=useState("");
 const [busy,setBusy]=useState(false);
 const processed=useRef(false);
 const auth=async()=>await getServerAuthHeaders();
 const {data:connected,error:connectedError,isLoading:loadingConnections}=useQuery({
   queryKey:["acquisition-connections"],enabled:isSaasAdmin,
   queryFn:async()=>connections({headers:await auth()}),staleTime:60_000,
 });
 const {data,error,isLoading,isFetching,refetch}=useQuery({
   queryKey:["verified-acquisition-report"],enabled:isSaasAdmin,
   queryFn:async()=>report({headers:await auth()}),staleTime:5*60_000,
 });
 useEffect(()=>{
  if(connected?.cloudflare){
   setAccountId(connected.cloudflare.accountId);
   setSiteTag(connected.cloudflare.siteTag);
  }
 },[connected?.cloudflare?.accountId,connected?.cloudflare?.siteTag]);
 useEffect(()=>{
  if(!isSaasAdmin||processed.current||typeof window==="undefined")return;
  const url=new URL(window.location.href);
  const code=url.searchParams.get("code"),state=url.searchParams.get("state");
  const googleError=url.searchParams.get("error");
  if(!code&&!googleError)return;
  processed.current=true;
  url.searchParams.delete("code");url.searchParams.delete("state");url.searchParams.delete("scope");
  url.searchParams.delete("error");
  window.history.replaceState(window.history.state,"",url.pathname+url.search+url.hash);
  if(googleError){toast.error("Google Search Console access was not granted.");return}
  if(!code||!state){toast.error("Google returned incomplete authorization information.");return}
  void (async()=>{
   setBusy(true);
   try{
     const result=await finish({headers:await auth(),data:{code,state}});
     toast.success(result.site?"Google Search Console connected":"Google connected, but AssetFlow 360 is not a verified property in that account.");
     await Promise.all([qc.invalidateQueries({queryKey:["acquisition-connections"]}),
       qc.invalidateQueries({queryKey:["verified-acquisition-report"]})]);
   }catch(err:any){toast.error(err?.message||"Google connection failed");}
   finally{setBusy(false)}
  })();
 },[isSaasAdmin,finish,qc]);
 if(loading)return null;
 if(!isSaasAdmin)return <Navigate to="/dashboard"/>;
 const google=data?.google,cf=data?.cloudflare;
 return <main className="mx-auto max-w-7xl min-w-0 space-y-6">
  <header className="flex flex-wrap items-start justify-between gap-3">
   <div>
    <p className="text-xs font-semibold uppercase tracking-[.16em] text-[#b96c40]">SaaS Admin · Acquisition intelligence</p>
    <h1 className="mt-2 flex items-center gap-2 text-xl font-semibold tracking-tight sm:text-2xl">
     <BarChart3 className="h-5 w-5 text-[#b96c40]"/>Search, traffic & AI referrals
    </h1>
    <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Authenticated data from Google Search Console and Cloudflare Web Analytics. No manual visitor totals or self-reported traffic counters.</p>
   </div>
   <Button variant="outline" disabled={isFetching||busy} onClick={()=>{void refetch()}}>
    <RefreshCw className="mr-2 h-4 w-4"/>{isFetching?"Refreshing…":"Refresh sources"}
   </Button>
  </header>
  {connectedError&&<p role="alert" className="text-sm text-destructive">Unable to read analytics connections. Check SaaS Admin access.</p>}
  {error&&<p role="alert" className="text-sm text-destructive">Unable to load the external analytics reports.</p>}
  <div className="grid min-w-0 gap-4 xl:grid-cols-2">
   <Card className="min-w-0 space-y-4 p-4 sm:p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
     <div><h2 className="flex items-center gap-2 text-base font-semibold"><Search className="h-5 w-5 text-[#4285f4]"/>Google Search Console</h2>
      <p className="mt-1 text-xs text-muted-foreground">Google organic discovery: search keywords, ranking, clicks and impressions.</p>
     </div>
     <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-semibold">{connected?.google.connected?"Connected":"Not connected"}</span>
    </div>
    {connected?.google.site&&<p className="break-all text-xs text-muted-foreground">Verified property: {connected.google.site}</p>}
    {connected?.google.connected&&<Button variant="outline" size="sm" disabled={busy}
       onClick={async()=>{if(!window.confirm("Disconnect Google Search Console? Reports will stop, but account data stays in Google."))return;
        try{await disconnectGoogle({headers:await auth()});await Promise.all([
          qc.invalidateQueries({queryKey:["acquisition-connections"]}),
          qc.invalidateQueries({queryKey:["verified-acquisition-report"]})]);toast.success("Disconnected");}
        catch(e:any){toast.error(e?.message||"Unable to disconnect");}}}>Disconnect</Button>}
    {!connected?.google.oauthReady&&<p className="text-xs leading-5 text-amber-700">Google OAuth credentials are not yet configured on the application server. A Google Cloud OAuth web client is required before connecting.</p>}
    <Button size="sm" disabled={busy||!connected?.google.oauthReady||loadingConnections}
      onClick={async()=>{setBusy(true);try{
        const response=await start({headers:await auth()});window.location.assign(response.url);
      }catch(e:any){toast.error(e?.message||"Unable to start Google authorization");setBusy(false)}}}>
      <Link2 className="mr-2 h-4 w-4"/>{connected?.google.connected?"Reconnect Google":"Connect Google Search Console"}
    </Button>
   </Card>
   <Card className="min-w-0 space-y-3 p-4 sm:p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
     <div><h2 className="flex items-center gap-2 text-base font-semibold"><Cloud className="h-5 w-5 text-[#e48231]"/>Cloudflare Web Analytics</h2>
      <p className="mt-1 text-xs text-muted-foreground">Measured web sessions, referring domains, top pages and known AI referrals.</p>
     </div>
     <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-semibold">{connected?.cloudflare.connected?"Connected":"Not connected"}</span>
    </div>
    <label className="block text-xs font-medium">Cloudflare account ID
     <Input className="mt-1" value={accountId} maxLength={32} onChange={e=>setAccountId(e.target.value.trim())} placeholder="32-character account ID"/>
    </label>
    <label className="block text-xs font-medium">Web Analytics site tag
     <Input className="mt-1" value={siteTag} maxLength={70} onChange={e=>setSiteTag(e.target.value.trim())} placeholder="Site tag from Cloudflare Web Analytics"/>
    </label>
    <label className="block text-xs font-medium">Analytics read-only API token
     <Input className="mt-1" type="password" autoComplete="off" value={apiToken} maxLength={500}
       onChange={e=>setApiToken(e.target.value)} placeholder={connected?.cloudflare.connected?"Saved securely; leave empty to keep existing token":"Cloudflare API token"}/>
    </label>
    <div className="flex flex-wrap gap-2">
     <Button size="sm" disabled={busy||loadingConnections||!accountId||!siteTag}
       onClick={async()=>{setBusy(true);try{
        await saveCloudflare({headers:await auth(),data:{accountId,siteTag,apiToken}});
        setApiToken("");await Promise.all([
          qc.invalidateQueries({queryKey:["acquisition-connections"]}),
          qc.invalidateQueries({queryKey:["verified-acquisition-report"]})]);
        toast.success("Cloudflare settings saved");
       }catch(e:any){toast.error(e?.message||"Unable to save Cloudflare settings")}
       finally{setBusy(false)}}}>Save Cloudflare connection</Button>
     {connected?.cloudflare.connected&&<Button variant="outline" size="sm" disabled={busy}
       onClick={async()=>{if(!window.confirm("Disconnect Cloudflare analytics?"))return;try{
        await disconnectCloudflare({headers:await auth()});
        await Promise.all([qc.invalidateQueries({queryKey:["acquisition-connections"]}),
          qc.invalidateQueries({queryKey:["verified-acquisition-report"]})]);
        toast.success("Disconnected");
       }catch(e:any){toast.error(e?.message||"Unable to disconnect")}}}>Disconnect</Button>}
    </div>
    <p className="text-xs leading-5 text-muted-foreground">Requires Cloudflare Web Analytics for assetflow360.com and a token with Account Analytics Read. Credentials are encrypted and never displayed after saving.</p>
   </Card>
  </div>
  {isLoading&&<p className="text-sm text-muted-foreground">Checking available external analytics sources…</p>}
  {data&&<>
    <p className="text-xs text-muted-foreground">Google Search reporting period: {data.period.start} to {data.period.end}. Google data is delayed and may omit low-volume queries.</p>
    {google?.state==="error"&&<p role="alert" className="rounded-lg border border-amber-200 p-3 text-xs text-amber-700">Google Search Console: {google.error}</p>}
    {google?.state==="property_missing"&&<p className="rounded-lg border border-amber-200 p-3 text-xs text-amber-700">The connected Google account has not granted access to the assetflow360.com property. Add the user in Search Console and reconnect.</p>}
    {google?.state==="ready"&&<>
     <section className="grid min-w-0 grid-cols-2 gap-3 md:grid-cols-4" aria-label="Google search performance">
      {[
       {label:"Google search clicks",value:google.total?.clicks.toLocaleString()||"0"},
       {label:"Search impressions",value:google.total?.impressions.toLocaleString()||"0"},
       {label:"Google search CTR",value:((google.total?.ctr||0)*100).toFixed(2)+"%"},
       {label:"Average Google position",value:(google.total?.position||0).toFixed(1)},
      ].map(metric=><Card className="min-w-0 p-4" key={metric.label}>
       <p className="text-xl font-semibold tabular-nums sm:text-2xl">{metric.value}</p>
       <p className="mt-1 text-xs text-muted-foreground">{metric.label}</p>
      </Card>)}
     </section>
     <section className="grid min-w-0 gap-4 xl:grid-cols-2">
      <SourceTable title="Google search queries used to find AssetFlow" rows={google.queries} mode="google"/>
      <SourceTable title="Pages receiving Google search clicks" rows={google.pages} mode="google"/>
      <SourceTable title="Search countries" rows={google.countries} mode="google"/>
      <SourceTable title="Search device types" rows={google.devices} mode="google"/>
     </section>
    </>}
    {cf?.state==="error"&&<p role="alert" className="rounded-lg border border-amber-200 p-3 text-xs text-amber-700">Cloudflare: {cf.error}</p>}
    {cf?.state==="ready"&&<>
     <section className="grid min-w-0 grid-cols-2 gap-3 md:grid-cols-3" aria-label="Cloudflare measured traffic">
      {[
       {label:"Cloudflare page views",value:cf.total?.views||0},
       {label:"Cloudflare visits",value:cf.total?.visits||0},
       {label:"Identifiable AI referral visits",value:cf.aiReferrers.reduce((sum,r)=>sum+r.visits,0)},
      ].map(metric=><Card className="min-w-0 p-4" key={metric.label}>
       <p className="text-xl font-semibold tabular-nums sm:text-2xl">{metric.value.toLocaleString()}</p>
       <p className="mt-1 text-xs text-muted-foreground">{metric.label}</p>
      </Card>)}
     </section>
     <section className="grid min-w-0 gap-4 xl:grid-cols-2">
      <SourceTable title="Websites referring visitors" rows={cf.referrers} mode="referrals"/>
      <SourceTable title="Known AI / agent referral domains" rows={cf.aiReferrers} mode="referrals"/>
      <SourceTable title="Landing and popular pages" rows={cf.pages} mode="referrals"/>
      <SourceTable title="Visitor countries" rows={cf.countries} mode="referrals"/>
     </section>
     <p className="text-xs leading-5 text-muted-foreground">AI referrals are traffic with an identifiable referrer hostname. This does not count all AI recommendations, chatbot citations, agents, automated crawls or visits whose referrer is hidden. Cloudflare Web Analytics may sample or omit some visits.</p>
    </>}
    {google?.state!=="ready"&&cf?.state!=="ready"&&<Card className="p-5">
      <div className="flex items-center gap-3"><ShieldCheck className="h-5 w-5 text-[#b96c40]"/>
       <h2 className="text-base font-semibold">Connect a verified source to begin</h2></div>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">There are no verified traffic or Google search figures to display yet. Connect Search Console and/or Cloudflare above. This page will not substitute manually entered counters, internal page views or estimates for external attribution.</p>
    </Card>}
  </>}
  <p className="text-xs leading-5 text-muted-foreground">Google Search Console search clicks and Cloudflare website visits have different definitions and must not be added together. AI referrals reflect referrer information, not a complete record of AI-driven discovery. All connection actions require SaaS Admin access.</p>
 </main>;
}
