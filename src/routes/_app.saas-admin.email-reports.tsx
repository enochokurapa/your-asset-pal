import {createFileRoute,Navigate} from "@tanstack/react-router";
import {useAuth} from "@/hooks/use-auth";
export const Route=createFileRoute("/_app/saas-admin/email-reports")({component:ReportsPage});
function ReportsPage(){const {loading,isSaasAdmin}=useAuth();if(loading)return null;if(!isSaasAdmin)return <Navigate to="/dashboard"/>;return <div><h1 className="text-2xl font-bold">Automated Email Reports</h1></div>}
