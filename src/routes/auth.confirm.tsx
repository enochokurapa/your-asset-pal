import {createFileRoute} from "@tanstack/react-router";
import {ConfirmRegistration} from "@/components/confirm-registration";
export const Route=createFileRoute("/auth/confirm")({component:ConfirmRegistration,
 head:()=>({meta:[{title:"Verify email | AssetFlow360"},{name:"robots",content:"noindex,nofollow"}]})});
