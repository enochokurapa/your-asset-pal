import {useState} from "react";
import {useQuery,useQueryClient} from "@tanstack/react-query";
import {useServerFn} from "@tanstack/react-start";
import {getSaasContext,getPricingPlans,startYoAddonPurchase,checkYoAddonPurchase} from "@/lib/saas.functions";
import {getServerAuthHeaders} from "@/lib/auth-headers";
import {normalizeUgandanMobileMoneyPhone} from "@/lib/uganda-mobile-money";
import {useAuth} from "@/hooks/use-auth";
import {Button} from "@/components/ui/button";
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription,DialogFooter} from "@/components/ui/dialog";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {toast} from "sonner";

export function AddOnInlineCheckout({moduleKey}:{moduleKey:string}){
 const {isTenantAdmin}=useAuth();const qc=useQueryClient();
 const getCtx=useServerFn(getSaasContext),getPlans=useServerFn(getPricingPlans);
 const start=useServerFn(startYoAddonPurchase),check=useServerFn(checkYoAddonPurchase);
 const {data:ctx,refetch}=useQuery({queryKey:["saas-context"],queryFn:async()=>getCtx({headers:await getServerAuthHeaders()})});
 const {data:prices}=useQuery({queryKey:["pricing-plans"],queryFn:()=>getPlans()});
 const [open,setOpen]=useState(false),[phone,setPhone]=useState(""),[busy,setBusy]=useState(false),[checking,setChecking]=useState(false);
 const [tx,setTx]=useState<string|null>(null);
 const addon=ctx?.addOns?.find((item:any)=>item.key===moduleKey);
 const rate=Number(prices?.fxRate||0);
 const usd=Number(addon?.price||0);
 const amount=rate>0&&usd>0?new Intl.NumberFormat("en-UG",{style:"currency",currency:"UGX",maximumFractionDigits:0}).format(Math.round(usd*rate)):null;
 const active=Boolean(ctx?.enabledModules?.includes(moduleKey));
 const pay=async()=>{
  const number=normalizeUgandanMobileMoneyPhone(phone);
  if(!number){toast.error("Enter a valid Uganda mobile-money number");return;}
  setBusy(true);
  try{
   const result=await start({data:{module_key:moduleKey,phone:number},headers:await getServerAuthHeaders()});
   setTx(result.transactionId);setOpen(false);toast.success("Payment request sent. Approve the amount on your phone.");
  }catch(error:any){toast.error(error?.message||"Payment request unavailable");}
  finally{setBusy(false);}
 };
 const verify=async()=>{
  if(!tx)return;setChecking(true);
  try{
   const result=await check({data:{transaction_id:tx},headers:await getServerAuthHeaders()});
   if(result.successful){toast.success("Add-on activated");setTx(null);await refetch();await qc.invalidateQueries({queryKey:["saas-context"]});window.location.reload();}
   else toast.message(`Payment status: ${result.status||"Pending"}`);
  }catch(error:any){toast.error(error?.message||"Could not check payment");}
  finally{setChecking(false);}
 };
 return <div className="mx-auto mt-5 max-w-sm space-y-3 rounded-xl border bg-[#f8fbfc] p-4 text-left">
   <div className="flex items-start justify-between gap-2"><div><p className="font-semibold">{addon?.name||"Optional add-on"}</p><p className="text-xs text-muted-foreground">One-time checkout through your configured gateway</p></div><strong className="text-base">{addon?`$${usd.toLocaleString()}`:"—"}</strong></div>
   {amount&&<p className="text-sm text-muted-foreground">Mobile money estimate: <strong>{amount}</strong></p>}
   {active?<p className="text-sm text-emerald-700">Already activated</p>:<Button className="w-full" disabled={!isTenantAdmin||!addon?.available||!ctx?.paymentConfigured||!amount||usd<=0} onClick={()=>setOpen(true)}>Buy add-on</Button>}
   {!isTenantAdmin&&<p className="text-xs text-muted-foreground">Only a business administrator can purchase add-ons.</p>}
   {!ctx?.paymentConfigured&&<p className="text-xs text-muted-foreground">Checkout is unavailable until payment settings are configured.</p>}
   {tx&&<Button variant="outline" className="w-full" disabled={checking} onClick={verify}>{checking?"Checking…":"Check payment status"}</Button>}
   <Dialog open={open} onOpenChange={v=>{if(!busy)setOpen(v)}}><DialogContent className="max-w-sm"><DialogHeader><DialogTitle>Buy {addon?.name||"add-on"}</DialogTitle><DialogDescription>{amount} payable in UGX. Approve the request using your mobile-money provider.</DialogDescription></DialogHeader>
     <div className="space-y-2"><Label htmlFor="addon-pay-number">Mobile money number</Label><Input id="addon-pay-number" type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={e=>setPhone(e.target.value)} placeholder="0772 123 456"/><p className="text-xs text-muted-foreground">Never enter your mobile-money PIN on this website.</p></div>
     <DialogFooter><Button disabled={busy||!normalizeUgandanMobileMoneyPhone(phone)} onClick={pay}>{busy?"Sending…":"Send payment request"}</Button></DialogFooter>
   </DialogContent></Dialog>
 </div>;
}
