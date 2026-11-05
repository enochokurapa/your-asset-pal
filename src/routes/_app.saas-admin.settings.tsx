import {createFileRoute, Navigate} from "@tanstack/react-router";
import {useAuth} from "@/hooks/use-auth";
export const Route=createFileRoute("/_app/saas-admin/settings")({component:SettingsPage});
function SettingsPage(){
 const {isSaasAdmin,loading}=useAuth();
 if(loading)return null;
 if(!isSaasAdmin)return <Navigate to="/dashboard"/>;
 return <div className="space-y-4"><h1 className="text-2xl font-bold">SaaS Settings</h1>
 <p>Platform configuration sections.</p></div>;
}
