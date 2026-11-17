import {jsPDF} from "jspdf";
import {approvedAssetFlowLogoPng} from "./assetflow-branding.server";

export type ActivationReceipt={
 receiptNo:string;workspace:string;plan:string;activatedAt:Date;expiresAt:Date;
 users:string;assets:string;method:string;amount:number|null;currency:string;
 paymentReference:string|null;paid:boolean;
};
const clean=(v:string,max=170)=>String(v||"").replace(/[\r\n\x00-\x1f]/g," ").trim().slice(0,max);
const formatDate=(v:Date)=>new Intl.DateTimeFormat("en-GB",{day:"2-digit",month:"short",year:"numeric",timeZone:"Africa/Kampala"}).format(v);
const money=(v:number,currency:string)=>clean(currency,6)+" "+v.toLocaleString("en-UG",{minimumFractionDigits:0,maximumFractionDigits:2});
export function createAssetFlowActivationReceipt(data:ActivationReceipt):Buffer{
 if(data.paid&&(!Number.isFinite(data.amount)||data.amount===null||data.amount<=0))
  throw Error("A payment receipt requires a verified positive payment amount");
 const p=new jsPDF({unit:"mm",format:"a5",orientation:"portrait",compress:true});
 const blue:[number,number,number]=[33,55,145],dark:[number,number,number]=[25,40,70],
  muted:[number,number,number]=[83,100,120],border:[number,number,number]=[211,219,231];
 const X=13,W=122,R=135;
 const line=(y:number)=>{p.setDrawColor(...border);p.setLineWidth(.24);p.line(X,y,R,y);};
 const txt=(value:string,x:number,y:number,size=8,bold=false,color=dark)=>{
  p.setTextColor(...color);p.setFont("helvetica",bold?"bold":"normal");p.setFontSize(size);
  p.text(clean(value),x,y);
 };
 const right=(value:string,y:number,size=8,bold=false,x=R)=>{
  p.setTextColor(...dark);p.setFont("helvetica",bold?"bold":"normal");p.setFontSize(size);
  p.text(clean(value),x,y,{align:"right"});
 };
 const label=(value:string,x:number,y:number)=>txt(value.toUpperCase(),x,y,6.6,true,muted);
 // White print-friendly document, single restrained brand accent and proper borders.
 p.setFillColor(255,255,255);p.rect(0,0,148,210,"F");
 p.setDrawColor(...border);p.setLineWidth(.35);p.rect(8,8,132,194,"S");
 p.setFillColor(...blue);p.rect(8,8,132,2.1,"F");
 const logo=approvedAssetFlowLogoPng();
 p.addImage(new Uint8Array(logo),"PNG",13,14,28,17,undefined,"FAST");
 txt("ASSETFLOW360",45,19.5,12,true,blue);
 txt("ASSETFLOW OPERATIONS",45,25,7.3,true,muted);
 txt("assetflow360.com  |  assetflow360.com/contact",45,30,6.4,false,muted);
 line(36);
 txt(data.paid?"OFFICIAL PAYMENT RECEIPT":"WORKSPACE ACTIVATION CONFIRMATION",X,44,12,true,dark);
 label("Receipt / document no.",X,50);
 txt(clean(data.receiptNo,48),X,55,7.5,true);
 label("Date issued",90,50);right(formatDate(new Date()),55,8,true);
 line(60);
 label("Issued by",X,67);txt("AssetFlow360 Operations",X,72,8.4,true);
 txt("AROSOFT Innovations Ltd",X,77,7.1,false,muted);
 label("Issued to",78,67);
 const org=p.splitTextToSize(clean(data.workspace,100),55);
 p.setFont("helvetica","bold");p.setFontSize(8.3);p.setTextColor(...dark);p.text(org.slice(0,2),78,72);
 line(85);
 p.setFillColor(240,244,249);p.rect(X,89,W,8,"F");
 label("SERVICE / SUBSCRIPTION",16,94);
 label("PERIOD",86,94);
 label("AMOUNT",115,94);
 txt(clean(data.plan,48),16,103,8.6,true);
 txt(formatDate(data.activatedAt)+" –",86,102,6.9);
 txt(formatDate(data.expiresAt),86,106,6.9);
 right(data.paid?money(Number(data.amount),data.currency):"—",104,8.2,true);
 line(111);
 label("PAYMENT AND SUBSCRIPTION DETAILS",X,119);
 const row=(y:number,key:string,value:string)=>{
  txt(key,X+2,y,7.9,false,muted);
  const truncated=clean(value,88);
  const split=p.splitTextToSize(truncated,74);
  p.setTextColor(...dark);p.setFont("helvetica","bold");p.setFontSize(8.1);
  p.text(split.slice(0,2),R-2,y,{align:"right"});
 };
 row(126,"Payment method",data.paid?data.method:"Not applicable");
 row(134,"Payment reference",data.paymentReference||clean(data.receiptNo,40));
 row(142,"Activation date",formatDate(data.activatedAt));
 row(150,"Renewal / expiry date",formatDate(data.expiresAt));
 row(158,"Active user allowance",data.users);
 row(166,"Asset allowance",data.assets);
 p.setDrawColor(...border);p.line(X,171,R,171);
 p.setFillColor(235,240,250);p.roundedRect(X,174,W,15,1.3,1.3,"F");
 txt(data.paid?"TOTAL PAYMENT RECEIVED":"WORKSPACE STATUS",X+4,183,9.3,true,dark);
 right(data.paid?money(Number(data.amount),data.currency):"ACTIVE",183,10.3,true,R-4);
 line(194);
 txt("Issued electronically by AssetFlow360 Operations",X,198,6.3,false,muted);
 right("assetflow360.com/contact",198,6.3,false);
 const pdf=Buffer.from(p.output("arraybuffer"));
 if(!pdf.subarray(0,4).equals(Buffer.from("%PDF")))throw Error("Receipt PDF generation failed");
 return pdf;
}
