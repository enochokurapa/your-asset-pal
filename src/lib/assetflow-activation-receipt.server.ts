import {jsPDF} from "jspdf";
import {approvedAssetFlowLogoPng} from "./assetflow-branding.server";

export type ActivationReceipt={
 receiptNo:string;workspace:string;plan:string;activatedAt:Date;expiresAt:Date;
 users:string;assets:string;method:string;amount:number|null;currency:string;
 paymentReference:string|null;paid:boolean;issuedAt?:Date;features?:string[];
};

const ISSUER="OWLTECH Solutions Ltd.";
const INDIGO:[number,number,number]=[78,81,219];  // AssetFlow360 #4E51DB
const OCHRE:[number,number,number]=[200,120,49];  // AssetFlow360 #C87831
const INK:[number,number,number]=[35,43,62];
const SECONDARY:[number,number,number]=[101,109,125];
const EDGE:[number,number,number]=[221,223,231];
const PALE:[number,number,number]=[249,248,253];
const WARM:[number,number,number]=[255,249,242];
const clean=(v:string,max=200)=>String(v||"").replace(/[\r\n\x00-\x1f]/g," ").trim().slice(0,max);
const shortDate=(v:Date)=>new Intl.DateTimeFormat("en-GB",{day:"2-digit",month:"short",year:"numeric",timeZone:"Africa/Kampala"}).format(v);
const cash=(v:number,currency:string)=>clean(currency,8)+" "+v.toLocaleString("en-UG",{maximumFractionDigits:2});

/** Print-friendly A5 receipt: all financial and delivery details, no empty A4 half-page. */
export function createAssetFlowActivationReceipt(data:ActivationReceipt):Buffer{
 if(data.paid&&(!Number.isFinite(data.amount)||data.amount===null||data.amount<=0))
  throw Error("A payment receipt requires a verified positive payment amount");
 if(!data.receiptNo||!data.workspace||!data.plan)
  throw Error("Receipt identity and subscription details required");

 const doc=new jsPDF({unit:"mm",format:"a5",orientation:"portrait",compress:true});
 const txt=(value:string,x:number,y:number,size=8.5,bold=false,color=INK)=>{
  doc.setFont("helvetica",bold?"bold":"normal");
  doc.setFontSize(size);doc.setTextColor(...color);doc.text(clean(value),x,y);
 };
 const right=(value:string,x:number,y:number,size=8.5,bold=false,color=INK)=>{
  doc.setFont("helvetica",bold?"bold":"normal");
  doc.setFontSize(size);doc.setTextColor(...color);doc.text(clean(value),x,y,{align:"right"});
 };
 const fitted=(value:string,x:number,y:number,maxWidth:number,size=8.5,bold=false,color=INK)=>{
  const v=clean(value);
  doc.setFont("helvetica",bold?"bold":"normal");
  let current=size;doc.setFontSize(current);
  while(doc.getTextWidth(v)>maxWidth&&current>6.1){current-=.2;doc.setFontSize(current);}
  if(doc.getTextWidth(v)<=maxWidth){
   doc.setTextColor(...color);doc.text(v,x,y,{align:"right"});
  }else{
   const pieces=doc.splitTextToSize(v,maxWidth) as string[];
   right(pieces[0]||"",x,y,current,bold,color);
   if(pieces[1])right(pieces[1],x,y+3.0,current-.3,bold,color);
  }
 };
 const wrapped=(value:string,x:number,y:number,maxWidth:number,size=8.5,bold=false,maxLines=2,color=INK)=>{
  doc.setFont("helvetica",bold?"bold":"normal");
  doc.setFontSize(size);doc.setTextColor(...color);
  const lines=(doc.splitTextToSize(clean(value,360),maxWidth) as string[]).slice(0,maxLines);
  doc.text(lines,x,y);return lines.length;
 };
 const rule=(x1:number,y:number,x2:number)=>{
  doc.setLineWidth(.24);doc.setDrawColor(...EDGE);doc.line(x1,y,x2,y);
 };
 const frame=(x:number,y:number,w:number,h:number,shade?:[number,number,number])=>{
  doc.setLineWidth(.27);doc.setDrawColor(...EDGE);
  if(shade){doc.setFillColor(...shade);doc.roundedRect(x,y,w,h,1.5,1.5,"FD");}
  else doc.roundedRect(x,y,w,h,1.5,1.5,"S");
 };
 const label=(v:string,x:number,y:number)=>txt(v.toUpperCase(),x,y,6.5,true,SECONDARY);

 doc.setFillColor(255,255,255);doc.rect(0,0,148,210,"F");
 frame(7,7,134,200);
 doc.setFillColor(...INDIGO);doc.rect(7,7,107,1.6,"F");
 doc.setFillColor(...OCHRE);doc.rect(114,7,27,1.6,"F");

 // Preserve the official AssetFlow360 mark and approved colours.
 doc.addImage(new Uint8Array(approvedAssetFlowLogoPng()),"PNG",10,12,16,16,undefined,"FAST");
 txt("AssetFlow360",29,19.4,11.8,true,INDIGO);
 txt("FIXED ASSET MANAGEMENT",29,25.1,6.9,true,SECONDARY);
 right(ISSUER,138,15.4,7.5,true,INDIGO);
 right("info@assetflow360.com",138,21.1,6.9,false,INK);
 right("Tel: +256 741 303496",138,26.5,6.9,false,INK);
 right("www.assetflow360.com",138,31.9,6.8,false,SECONDARY);
 rule(10,34.3,138);
 txt("Asset Registration  |  Verification  |  Depreciation  |  Reporting",11,39.2,6.7,false,INDIGO);

 frame(9,43,130,13,PALE);
 doc.setFillColor(...OCHRE);doc.rect(9,43,2.0,13,"F");
 txt(data.paid?"OFFICIAL PAYMENT RECEIPT":"WORKSPACE ACTIVATION CONFIRMATION",
     14,51.5,data.paid?10.2:8.9,true,INDIGO);
 frame(115,46.1,21,6.7,data.paid?PALE:WARM);
 right(data.paid?"PAID":"GRANT",132.5,50.7,7.5,true,data.paid?INDIGO:OCHRE);

 frame(9,59,130,18);
 doc.setDrawColor(...EDGE);doc.line(62,59,62,77);doc.line(101,59,101,77);
 label(data.paid?"Receipt number":"Document number",12,65.1);
 txt(data.receiptNo,12,73.4,9.5,true,INDIGO);
 label("Issued",65,65.1);txt(shortDate(data.issuedAt??new Date()),65,73.4,8.3,true);
 label("Renewal",104,65.1);txt(shortDate(data.expiresAt),104,73.4,8.3,true);

 frame(9,80,63,24);frame(76,80,63,24);
 doc.setFillColor(...PALE);
 doc.roundedRect(9.25,80.25,62.5,7.3,1.1,1.1,"F");
 doc.roundedRect(76.25,80.25,62.5,7.3,1.1,1.1,"F");
 label("ISSUED BY",12,85.9);label("ISSUED TO",79,85.9);
 wrapped(ISSUER,12,94.4,57,9.1,true,2);
 wrapped(data.workspace,79,93.2,56,8.5,true,3);

 frame(9,107,130,27);
 doc.setFillColor(...PALE);doc.roundedRect(9.25,107.25,129.5,8.0,1.0,1.0,"F");
 doc.setDrawColor(...EDGE);doc.line(73,107,73,134);doc.line(110,107,110,134);
 label("SERVICE / DESCRIPTION",12,112.8);
 label("PERIOD",76,112.8);
 label(data.paid?"PAID":"STATUS",113,112.8);
 wrapped("AssetFlow360 - "+data.plan,12,122,58,8.2,true,2);
 txt("Subscription and enabled services",12,130.1,6.6,false,SECONDARY);
 txt(shortDate(data.activatedAt),76,122.1,7.8,true);
 txt("to "+shortDate(data.expiresAt),76,129.8,7.5,false,SECONDARY);
 fitted(data.paid?cash(Number(data.amount),data.currency):"No charge",136,124.4,24,8.8,true,INDIGO);

 frame(9,137,63,41);frame(76,137,63,41);
 doc.setFillColor(...PALE);
 doc.roundedRect(9.25,137.25,62.5,7.6,1.0,1.0,"F");
 doc.roundedRect(76.25,137.25,62.5,7.6,1.0,1.0,"F");
 label("DELIVERABLES",12,143);label("PAYMENT DETAILS",79,143);
 txt("Workspace",12,152.3,7.7);right("Included",69,152.3,7.4,true,INDIGO);rule(12,155.3,69);
 txt("Users",12,161.2,7.7);fitted(data.users,69,161.2,26,7.7,true);rule(12,164.4,69);
 txt("Asset capacity",12,170.0,7.7);fitted(data.assets,69,170.0,31,7.7,true);
 const features=(data.features??[]).filter(v=>typeof v==="string"&&v.trim()).slice(0,2);
 if(features.length)wrapped(features.map(v=>clean(v,30)).join(" | "),12,175.1,56,6.1,false,1,SECONDARY);

 txt("Method",79,152.3,7.5,false,SECONDARY);
 fitted(data.method,136,152.3,36,7.7,true);rule(79,155.3,136);
 txt("Reference",79,161.2,7.5,false,SECONDARY);
 const ref=data.paid?(data.paymentReference||"Confirmed payment"):"Not applicable";
 wrapped(ref,79,169.1,56,6.5,true,2,INK);

 frame(9,181,130,13,WARM);
 doc.setFillColor(...OCHRE);doc.rect(9,181,2,13,"F");
 txt(data.paid?"TOTAL PAID":"PAYMENT STATUS",14,189.4,8.8,true,INDIGO);
 fitted(data.paid?cash(Number(data.amount),data.currency):"NO PAYMENT RECORDED",
      135,189.5,64,data.paid?11.5:9.0,true,INDIGO);

 rule(11,197.3,137);
 txt(data.paid?"Payment recorded for the subscription above.":"Administrator-granted access; no payment certified.",
    11,201,6.6,false,SECONDARY);
 right("Issued by "+ISSUER,137,205.2,6.7,false,SECONDARY);

 const pdf=Buffer.from(doc.output("arraybuffer"));
 if(!pdf.subarray(0,4).equals(Buffer.from("%PDF"))||pdf.length>512*1024)
  throw Error("Compact receipt PDF generation failed");
 return pdf;
}
