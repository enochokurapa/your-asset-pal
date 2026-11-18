import {jsPDF} from "jspdf";
import {approvedAssetFlowLogoPng} from "./assetflow-branding.server";

export type ActivationReceipt={
 receiptNo:string;workspace:string;plan:string;activatedAt:Date;expiresAt:Date;
 users:string;assets:string;method:string;amount:number|null;currency:string;
 paymentReference:string|null;paid:boolean;issuedAt?:Date;features?:string[];
};

const ISSUER="OWLTECH Solutions Ltd.";
const SUPPORT_EMAIL="info@assetflow360.com";
const SUPPORT_PHONE="+256 741 303496";
const WEBSITE="www.assetflow360.com";
// These colours match the approved public AssetFlow360 brand palette,
// not the unrelated dark-navy artwork used in an earlier draft.
const INDIGO:[number,number,number]=[78,81,219];   // #4E51DB
const OCHRE:[number,number,number]=[200,120,49];   // #C87831
const BODY:[number,number,number]=[38,43,62];
const MUTED:[number,number,number]=[100,105,122];
const BORDER:[number,number,number]=[224,219,215];
const PALE:[number,number,number]=[249,247,254];
const CREAM:[number,number,number]=[255,249,242];

const clean=(v:string,max=180)=>String(v||"").replace(/[\r\n\x00-\x1f]/g," ").trim().slice(0,max);
const date=(v:Date)=>new Intl.DateTimeFormat("en-GB",{day:"2-digit",month:"short",year:"numeric",timeZone:"Africa/Kampala"}).format(v);
const money=(v:number,currency:string)=>clean(currency,8)+" "+v.toLocaleString("en-UG",{minimumFractionDigits:0,maximumFractionDigits:2});

export function createAssetFlowActivationReceipt(data:ActivationReceipt):Buffer {
 if(data.paid&&(!Number.isFinite(data.amount)||data.amount===null||data.amount<=0))
  throw Error("A payment receipt requires a verified positive payment amount");
 if(!data.receiptNo||!data.workspace||!data.plan)throw Error("Receipt identity and subscription details required");
 const p=new jsPDF({unit:"mm",format:"a4",orientation:"portrait",compress:true});
 const x=13,w=184,right=197;
 const box=(bx:number,by:number,bw:number,bh:number,fill?:[number,number,number],stroke=BORDER,radius=2)=>{
  p.setLineWidth(.32);p.setDrawColor(...stroke);
  if(fill)p.setFillColor(...fill);
  p.roundedRect(bx,by,bw,bh,radius,radius,fill?"FD":"S");
 };
 const tx=(value:string,xp:number,yp:number,size=8.5,bold=false,color=BODY)=>{
  p.setFont("helvetica",bold?"bold":"normal");p.setFontSize(size);p.setTextColor(...color);
  p.text(clean(value,220),xp,yp);
 };
 const rt=(value:string,xp:number,yp:number,size=8.5,bold=false,color=BODY)=>{
  p.setFont("helvetica",bold?"bold":"normal");p.setFontSize(size);p.setTextColor(...color);
  p.text(clean(value,220),xp,yp,{align:"right"});
 };
 const fitRight=(value:string,xp:number,yp:number,maxWidth:number,size=8.3,bold=false,color=BODY)=>{
  const v=clean(value,125);
  p.setFont("helvetica",bold?"bold":"normal");
  let actual=size;p.setFontSize(actual);
  while(actual>6.3&&p.getTextWidth(v)>maxWidth){actual-=.3;p.setFontSize(actual);}
  if(p.getTextWidth(v)>maxWidth){
   const parts=p.splitTextToSize(v,maxWidth) as string[];
   rt(parts[0]||"",xp,yp,actual,bold,color);
   if(parts[1])rt(parts[1],xp,yp+3.3,actual-.4,bold,color);
  }else rt(v,xp,yp,actual,bold,color);
 };
 const wrapped=(value:string,xp:number,yp:number,maxWidth:number,size=8.6,bold=false,maxLines=2,color=BODY)=>{
  p.setFont("helvetica",bold?"bold":"normal");p.setFontSize(size);p.setTextColor(...color);
  const lines=(p.splitTextToSize(clean(value,300),maxWidth) as string[]).slice(0,maxLines);
  p.text(lines,xp,yp);return lines.length;
 };
 const tag=(value:string,xp:number,yp:number)=>tx(value.toUpperCase(),xp,yp,7.1,true,MUTED);

 p.setFillColor(255,255,255);p.rect(0,0,210,297,"F");
 box(x,11,w,273,undefined,BORDER,3);
 p.setFillColor(...INDIGO);p.rect(x,11,w-25,2.1,"F");
 p.setFillColor(...OCHRE);p.rect(right-25,11,25,2.1,"F");

 // Compact, original-brand letterhead: genuine AssetFlow360 mark and brand colours.
 p.addImage(new Uint8Array(approvedAssetFlowLogoPng()),"PNG",18,17.5,19.5,19.8,undefined,"FAST");
 tx("AssetFlow360",42,24.5,15.5,true,INDIGO);
 tx("FIXED ASSET MANAGEMENT",42,31.7,8.3,true,MUTED);
 rt(ISSUER,191,21.5,9.5,true,INDIGO);
 rt(SUPPORT_EMAIL,191,28.3,8.0,false,BODY);
 rt("Tel: "+SUPPORT_PHONE,191,34.3,8.0,false,BODY);
 rt(WEBSITE,191,40.3,7.9,false,MUTED);
 p.setDrawColor(...BORDER);p.line(18,44,192,44);
 tx("Asset Registration  |  Verification  |  Depreciation  |  Reporting  |  Asset Management",
    18,49,7.8,false,INDIGO);

 // Receipt heading with small ochre accent; no unfamiliar navy colour blocks.
 box(17,54.5,176,15,[255,255,255],BORDER,2);
 p.setFillColor(...OCHRE);p.roundedRect(17,54.5,2.9,15,1,1,"F");
 tx(data.paid?"OFFICIAL PAYMENT RECEIPT":"WORKSPACE ACTIVATION CONFIRMATION",
    23,64.4,data.paid?13.1:11.7,true,INDIGO);
 box(160,57.5,30,9,data.paid?PALE:CREAM,data.paid?INDIGO:OCHRE,1.8);
 rt(data.paid?"PAID":"ADMIN GRANT",186,63.5,8.3,true,data.paid?INDIGO:OCHRE);

 // Compact metadata strip.
 box(17,73,176,22,undefined,BORDER,2);
 p.setDrawColor(...BORDER);p.line(92,73,92,95);p.line(141,73,141,95);
 tag(data.paid?"Receipt no.":"Document no.",21,80);
 tx(data.receiptNo,21,89.5,10.6,true,INDIGO);
 tag("Issue date",96,80);tx(date(data.issuedAt??new Date()),96,89.5,9.2,true);
 tag("Renewal date",145,80);tx(date(data.expiresAt),145,89.5,9.2,true);

 // Bill-from / bill-to pair with strong separation and tidy borders.
 box(17,99,85.5,26,undefined,BORDER,2);
 box(107.5,99,85.5,26,undefined,BORDER,2);
 p.setFillColor(...PALE);p.roundedRect(17.3,99.3,84.9,8,1.5,1.5,"F");
 p.roundedRect(107.8,99.3,84.9,8,1.5,1.5,"F");
 tag("ISSUED BY",21,105.2);tag("ISSUED TO",111.5,105.2);
 wrapped(ISSUER,21,114.5,75,10.0,true,2);
 wrapped(data.workspace,111.5,114.5,76,10.0,true,2);
 tx("AssetFlow360 subscription services",21,121,7.0,false,MUTED);
 tx("Customer / activated workspace",111.5,121,7.0,false,MUTED);

 // One-line invoice table showing what was purchased and for what period.
 box(17,129,176,36,undefined,BORDER,2);
 p.setFillColor(...PALE);p.roundedRect(17.3,129.3,175.4,9.2,1.5,1.5,"F");
 p.setDrawColor(...BORDER);p.line(111,129,111,165);p.line(158,129,158,165);p.line(17,139,193,139);
 tag("SERVICE / DESCRIPTION",21,135.4);
 tag("SUBSCRIPTION PERIOD",115,135.4);
 tag(data.paid?"AMOUNT PAID":"PAYMENT",162,135.4);
 wrapped("AssetFlow360 - "+data.plan,21,147.2,86,9.3,true,2);
 tx("Subscription access and enabled modules",21,157.7,7.6,false,MUTED);
 tx(date(data.activatedAt),115,147.2,8.3,true);
 tx("to "+date(data.expiresAt),115,157,7.9,false,MUTED);
 fitRight(data.paid?money(Number(data.amount),data.currency):"No charge",189,151,28,10,true,INDIGO);

 // Two short, aligned information panels instead of oversized stacked sections.
 box(17,169,85.5,65,undefined,BORDER,2);
 box(107.5,169,85.5,65,undefined,BORDER,2);
 p.setFillColor(...PALE);p.roundedRect(17.3,169.3,84.9,9,1.5,1.5,"F");
 p.roundedRect(107.8,169.3,84.9,9,1.5,1.5,"F");
 tag("INCLUDED DELIVERABLES",21,175.4);
 tag("PAYMENT & DATES",111.5,175.4);

 const line=(l:number,y:number,r:number)=>{p.setDrawColor(...BORDER);p.setLineWidth(.2);p.line(l,y,r,y);};
 tx("Workspace access",21,187,8.3);rt("Included",98,187,8.2,true,INDIGO);line(21,190,99);
 tx("User allowance",21,198.5,8.3);fitRight(data.users,98,198.5,30,8.4,true);line(21,201.2,99);
 tx("Asset capacity",21,210,8.3);fitRight(data.assets,98,210,34,8.4,true);line(21,212.7,99);
 tag("Plan features",21,220);
 const features=(data.features??[]).filter(v=>typeof v==="string"&&v.trim()).slice(0,3);
 const featuresText=features.length?features.map(v=>clean(v,36)).join("; "):"Modules included in your active package";
 wrapped(featuresText,21,226,76,7.4,false,2,MUTED);

 tx("Method",111.5,187,8.1,false,MUTED);
 fitRight(data.method,189,187,47,8.5,true);line(111.5,190,189);
 tx("Payment ref.",111.5,198.5,8.1,false,MUTED);
 fitRight(data.paid?(data.paymentReference||"Confirmed payment"):"Not applicable",189,198.5,49,8.0,true);line(111.5,201.2,189);
 tx("Activation",111.5,210,8.1,false,MUTED);
 rt(date(data.activatedAt),189,210,8.5,true);line(111.5,212.7,189);
 tx("Renewal",111.5,221.5,8.1,false,MUTED);
 rt(date(data.expiresAt),189,221.5,8.5,true);

 box(17,239,176,19,CREAM,BORDER,2);
 p.setFillColor(...OCHRE);p.roundedRect(17.3,239.3,2.9,18.3,1,1,"F");
 tx(data.paid?"TOTAL PAYMENT RECEIVED":"PAYMENT STATUS",24,250.9,10.4,true,INDIGO);
 fitRight(data.paid?money(Number(data.amount),data.currency):"NO PAYMENT RECORDED",
   188,251,76,data.paid?13.2:10.0,true,INDIGO);

 tx(data.paid?"Payment recorded against the subscription shown above.":
    "An administrator activated this workspace; no payment is certified by this document.",
    19,265.2,7.5,false,MUTED);
 line(19,270,191);
 tx("Thank you for choosing AssetFlow360.",19,278.2,8.6,true,INDIGO);
 rt("Issued electronically by "+ISSUER,191,278.2,7.4,false,MUTED);

 const result=Buffer.from(p.output("arraybuffer"));
 if(!result.subarray(0,4).equals(Buffer.from("%PDF"))||result.length>512*1024)
  throw Error("AssetFlow360 receipt PDF generation failed");
 return result;
}
