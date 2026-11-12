import {createFileRoute,Navigate} from "@tanstack/react-router";
import {useEffect} from "react";

// Legacy temporary route; no second dashboard. Always open the original tenant portal.
export const Route=createFileRoute("/_app/saas-admin/business-dashboard")({
 validateSearch:(search:Record<string,unknown>)=>({session:typeof search.session==="string"?search.session:""}),
 component:OpenExistingBusinessPortal,
});
function OpenExistingBusinessPortal(){
 const {session}=Route.useSearch();
 useEffect(()=>{
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(session))return;
  window.sessionStorage.setItem("af-platform-tenant-session",session);
  window.location.replace("/dashboard");
 },[session]);
 if(!session)return <Navigate to="/saas-admin/organizations"/>;
 return <div className="p-6 text-sm text-muted-foreground">Opening the business's original dashboard…</div>;
}
