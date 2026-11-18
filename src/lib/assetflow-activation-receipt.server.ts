import {jsPDF} from "jspdf";
import {approvedAssetFlowLogoPng} from "./assetflow-branding.server";

export type ActivationReceipt={
 receiptNo:string;workspace:string;plan:string;activatedAt:Date;expiresAt:Date;
 users:string;assets:string;method:string;amount:number|null;currency:string;
 paymentReference:string|null;paid:boolean;issuedAt?:Date;features?:string[];
};
const issuer="OWLTECH Solutions Ltd.";
const clean=(v:string,max=180)=>String(v||"").replace(/[\r\n\x00-\x1f]/g," ").trim().slice(0,max);
const formatDate=(v:Date)=>new Intl.DateTimeFormat("en-GB",{day:"2-digit",month:"short",year:"numeric",timeZone:"Africa/Kampala"}).format(v);
const money=(v:number,currency:string)=>clean(currency,8)+" "+v.toLocaleString("en-UG",{minimumFractionDigits:0,maximumFractionDigits:2});

export function createAssetFlowActivationReceipt(data:ActivationReceipt):Buffer {
 if(data.paid&&(!Number.isFinite(data.amount)||data.amount===null||data.amount<=0))
  throw Error("A payment receipt requires a verified positive payment amount");
 if(!data.receiptNo||!data.workspace||!data.plan)throw Error("Receipt identity and subscription details required");
 const p=new jsPDF({unit:"mm",format:"a4",orientation:"portrait",compress:true});
 const indigo:[number,number,number]=[40,55,158],
       dark:[number,number,number]=[23,37,63],
       muted:[number,number,number]=[91,107,126],
       border:[number,number,number]=[213,221,232];
 const left=19,right=191,width=right-left;
 const line=(y:number)=>{p.setDrawColor(...border);p.setLineWidth(.26);p.line(left,y,right,y)};
 const text=(v:string,x:number,y:number,size=9,bold=false,color=dark)=>{
  p.setFont("helvetica",bold?"bold":"normal");p.setFontSize(size);p.setTextColor(...color);
  p.text(clean(v),x,y);
 };
 const rightText=(v:string,y:number,x=right,size=9,bold=false,color=dark)=>{
  p.setFont("helvetica",bold?"bold":"normal");p.setFontSize(size);p.setTextColor(...color);
  p.text(clean(v),x,y,{align:"right"});
 };
 const label=(v:string,x:number,y:number)=>text(v.toUpperCase(),x,y,7.4,true,muted);
 const wrap=(v:string,x:number,y:number,maxWidth:number,size=9,bold=false,maxLines=3,color=dark)=>{
  p.setFont("helvetica",bold?"bold":"normal");p.setFontSize(size);p.setTextColor(...color);
  const lines=p.splitTextToSize(clean(v,400),maxWidth).slice(0,maxLines) as string[];
  p.text(lines,x,y);return y+(lines.length-1)*size*.43;
 };
 p.setFillColor(255,255,255);p.rect(0,0,210,297,"F");
 p.setFillColor(...indigo);p.rect(0,0,210,4,"F");
 p.addImage(new Uint8Array(approvedAssetFlowLogoPng()),"PNG",left,17,20,20,undefined,"FAST");
 text("ASSETFLOW360",44,25,16,true,indigo);
 text("SUBSCRIPTIONS & BILLING",44,32,8,true,muted);
 rightText("assetflow360.com",25,right,8,false,muted);
 rightText("Issued by "+issuer,32,right,8.5,true,dark);
 line(45);
 text(data.paid?"OFFICIAL PAYMENT RECEIPT":"WORKSPACE ACTIVATION CONFIRMATION",left,58,15,true);
 label(data.paid?"Receipt number":"Document number",left,69);
 text(data.receiptNo,left,77,11,true,indigo);
 label("Issue date",133,69);rightText(formatDate(data.issuedAt??new Date()),77,right,9.4,true);
 line(84);
 label("ISSUED BY",left,95);label("ISSUED TO",109,95);
 wrap(issuer,left,103,81,10.3,true,2);
 wrap(data.workspace,109,103,82,10.3,true,2);
 text("AssetFlow360 subscription services",left,116,8,false,muted);
 text("Customer / activated workspace",109,116,8,false,muted);
 line(125);

 p.setFillColor(240,244,250);p.roundedRect(left,133,width,11,1.4,1.4,"F");
 label("SERVICE / DESCRIPTION",left+4,140);
 label("PERIOD",110,140);
 label(data.paid?"AMOUNT PAID":"PAYMENT",157,140);
 wrap("AssetFlow360 - "+data.plan,left+4,153,80,10,true,2);
 text(formatDate(data.activatedAt),110,151,8.1);
 text("to "+formatDate(data.expiresAt),110,160,8.1);
 rightText(data.paid?money(Number(data.amount),data.currency):"Not recorded",161,right-4,9.2,true);
 line(171);

 label("INCLUDED DELIVERABLES",left,181);
 text("Platform subscription access",left+3,191,9);
 rightText(data.plan,191,right-3,9,true);
 text("User access allowance",left+3,201,9);
 rightText(data.users,201,right-3,9,true);
 text("Asset registration / management capacity",left+3,211,9);
 rightText(data.assets,211,right-3,9,true);
 const features=(data.features??[]).filter(x=>typeof x==="string"&&x.trim()).slice(0,3);
 if(features.length)wrap("Plan features: "+features.map(x=>clean(x,36)).join(" · "),left+3,219,width-6,7.8,false,2,muted);
 line(230);

 label("PAYMENT DETAILS",left,240);
 text("Payment method",left+3,250,8.8,false,muted);
 rightText(data.method,250,right-3,9,true);
 text("Payment reference",left+3,259,8.8,false,muted);
 rightText(data.paid?clean(data.paymentReference||"Confirmed payment",36):"Not applicable - administrator grant",259,right-3,8.2,true);
 p.setFillColor(237,240,251);p.roundedRect(left,266,width,14,2,2,"F");
 text(data.paid?"TOTAL RECEIVED":"PAYMENT STATUS",left+4,275,9.5,true,indigo);
 rightText(data.paid?money(Number(data.amount),data.currency):"No payment recorded",275,right-4,10,true,indigo);
 text(data.paid?"Payment recorded against the subscription shown above.":
  "An administrator activated this workspace. This document does not certify payment.",left,285,7.3,false,muted);
 line(289);
 text("Electronically generated by "+issuer,left,293,7.1,false,muted);
 rightText("assetflow360.com",293,right,7.1,false,muted);
 const pdf=Buffer.from(p.output("arraybuffer"));
 if(!pdf.subarray(0,4).equals(Buffer.from("%PDF"))||pdf.length>512*1024)throw Error("Receipt PDF generation failed");
 return pdf;
}
