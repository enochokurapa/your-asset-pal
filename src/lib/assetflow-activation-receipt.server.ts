import {jsPDF} from "jspdf";
import {approvedAssetFlowLogoPng} from "./assetflow-branding.server";

export type ActivationReceipt={
 receiptNo:string;workspace:string;plan:string;activatedAt:Date;expiresAt:Date;
 users:string;assets:string;method:string;amount:number|null;currency:string;
 paymentReference:string|null;paid:boolean;issuedAt?:Date;features?:string[];
};

type RGB=[number,number,number];
// Purple/orange colours of the APPROVED receipt design, not navy or blue.
const PURPLE:RGB=[108,11,194];
const PURPLE_BRIGHT:RGB=[124,20,215];
const PURPLE_DARK:RGB=[75,0,140];
const ORANGE:RGB=[247,126,6];
const ORANGE_DARK:RGB=[226,99,0];
const INK:RGB=[20,19,30];
const GRAY:RGB=[90,84,104];
const BORDER:RGB=[100,71,123];
const SOFT:RGB=[249,244,255];
const PALE:RGB=[242,231,251];
const GREEN:RGB=[22,137,19];
const PAID_BG:RGB=[221,247,215];
const WHITE:RGB=[255,255,255];

const ISSUER="OWLTECH Solutions Ltd.";
const EMAIL="info@assetflow360.com";
const PHONE="+256 741 303496";
const WEBSITE="www.assetflow360.com";
const clear=(v:string,max=300)=>String(v??"").replace(/[\u0000-\u001f]/g," ").trim().slice(0,max);
const date=(v:Date)=>new Intl.DateTimeFormat("en-GB",{day:"2-digit",month:"short",year:"numeric",timeZone:"Africa/Kampala"}).format(v);
const money=(amount:number,currency:string)=>clear(currency,8)+" "+amount.toLocaleString("en-UG",{maximumFractionDigits:2});

export function createAssetFlowActivationReceipt(data:ActivationReceipt):Buffer {
 if(data.paid&&(!Number.isFinite(data.amount)||data.amount===null||data.amount<=0))
  throw Error("A paid receipt requires a verified positive payment amount");
 if(!data.receiptNo||!data.workspace||!data.plan)
  throw Error("A receipt number, customer and subscription plan are required");
 const pdf=new jsPDF({orientation:"portrait",unit:"mm",format:"a4",compress:true});
 const setFill=(c:RGB)=>pdf.setFillColor(...c);
 const setStroke=(c:RGB)=>pdf.setDrawColor(...c);
 const txt=(v:string,x:number,y:number,size=9,bold=false,c:RGB=INK)=>{
  pdf.setFont("helvetica",bold?"bold":"normal");
  pdf.setFontSize(size);pdf.setTextColor(...c);pdf.text(clear(v),x,y);
 };
 const rt=(v:string,x:number,y:number,size=9,bold=false,c:RGB=INK)=>{
  pdf.setFont("helvetica",bold?"bold":"normal");
  pdf.setFontSize(size);pdf.setTextColor(...c);pdf.text(clear(v),x,y,{align:"right"});
 };
 const centered=(v:string,x:number,y:number,size=9,bold=false,c:RGB=INK)=>{
  pdf.setFont("helvetica",bold?"bold":"normal");
  pdf.setFontSize(size);pdf.setTextColor(...c);pdf.text(clear(v),x,y,{align:"center"});
 };
 const fitted=(v:string,x:number,y:number,maxWidth:number,size=9,bold=false,c:RGB=INK,minSize=6.5)=>{
  const val=clear(v);
  pdf.setFont("helvetica",bold?"bold":"normal");
  let sz=size;pdf.setFontSize(sz);
  while(sz>minSize&&pdf.getTextWidth(val)>maxWidth){sz-=0.2;pdf.setFontSize(sz);}
  if(pdf.getTextWidth(val)>maxWidth){
   const lines=(pdf.splitTextToSize(val,maxWidth) as string[]).slice(0,2);
   pdf.setTextColor(...c);pdf.text(lines,x,y,{align:"right"});
  } else {pdf.setTextColor(...c);pdf.text(val,x,y,{align:"right"});}
 };
 const wrap=(v:string,x:number,y:number,maxWidth:number,size=9,bold=false,maxLines=2,c:RGB=INK)=>{
  pdf.setFont("helvetica",bold?"bold":"normal");
  pdf.setFontSize(size);pdf.setTextColor(...c);
  const parts=(pdf.splitTextToSize(clear(v,520),maxWidth) as string[]).slice(0,maxLines);
  pdf.text(parts,x,y);return parts.length;
 };
 const round=(x:number,y:number,w:number,h:number,fill:RGB=WHITE,stroke:RGB=BORDER,radius=2)=>{
  setFill(fill);setStroke(stroke);pdf.setLineWidth(.27);pdf.roundedRect(x,y,w,h,radius,radius,"FD");
 };
 const line=(x1:number,y1:number,x2:number,y2:number,c:RGB=BORDER,weight=.25)=>{
  setStroke(c);pdf.setLineWidth(weight);pdf.line(x1,y1,x2,y2);
 };
 const banner=(x:number,y:number,w:number,h:number,fill:RGB=PURPLE)=>{
  setFill(fill);pdf.roundedRect(x,y,w,h,2.3,2.3,"F");
 };
 const iconEnvelope=(x:number,y:number,c:RGB=PURPLE,s=4)=>{
  setStroke(c);pdf.setLineWidth(.4);pdf.roundedRect(x,y,s*1.4,s,0.35,0.35,"S");
  line(x,y,x+s*.7,y+s*.53,c,.4);line(x+s*1.4,y,x+s*.7,y+s*.53,c,.4);
 };
 const iconGlobe=(x:number,y:number,c:RGB=PURPLE,s=4)=>{
  setStroke(c);pdf.setLineWidth(.42);pdf.circle(x+s*.5,y+s*.5,s*.5,"S");
  line(x+s*.5,y,x+s*.5,y+s,c,.25);line(x,y+s*.5,x+s,y+s*.5,c,.25);
  pdf.ellipse(x+s*.5,y+s*.5,s*.22,s*.5,"S");
 };
 const iconPhone=(x:number,y:number,c:RGB=PURPLE,s=4)=>{
  setStroke(c);pdf.setLineWidth(.7);
  pdf.line(x+s*.13,y+s*.12,x+s*.42,y+s*.4);
  pdf.line(x+s*.42,y+s*.4,x+s*.66,y+s*.61);
  pdf.line(x+s*.66,y+s*.61,x+s*.85,y+s*.72);
  pdf.line(x+s*.12,y+s*.12,x+s*.12,y+s*.4);
  pdf.line(x+s*.86,y+s*.72,x+s*.66,y+s*.93);
 };
 const iconReceipt=(x:number,y:number,c:RGB=PURPLE,s=6)=>{
  setStroke(c);pdf.setLineWidth(.5);
  pdf.rect(x,y,s*.75,s*.95,"S");
  for(let i=0;i<3;i++)line(x+s*.13,y+s*(.22+i*.19),x+s*.62,y+s*(.22+i*.19),c,.35);
 };
 const iconCalendar=(x:number,y:number,c:RGB=PURPLE,s=5.8)=>{
  setStroke(c);pdf.setLineWidth(.5);pdf.roundedRect(x,y+s*.15,s,s*.85,.45,.45,"S");
  line(x,y+s*.38,x+s,y+s*.38,c,.4);
  line(x+s*.23,y,x+s*.23,y+s*.26,c,.7);
  line(x+s*.76,y,x+s*.76,y+s*.26,c,.7);
  for(const dx of [.25,.55,.8])for(const dy of [.56,.77]){setFill(c);pdf.circle(x+s*dx,y+s*dy,.21,"F");}
 };
 const iconBuilding=(x:number,y:number,c:RGB=WHITE)=>{
  setFill(c);pdf.triangle(x,y+1.8,x+3.6,y,x+7.2,y+1.8,"F");
  for(const dx of [1,3.1,5.2])pdf.rect(x+dx,y+2.1,1.05,3.4,"F");
  pdf.rect(x+.2,y+5.6,6.8,.8,"F");
 };
 const iconUsers=(x:number,y:number,c:RGB=WHITE)=>{
  setFill(c);
  pdf.circle(x+3.7,y+1.5,1.3,"F");
  pdf.circle(x+1.0,y+2.4,.85,"F");
  pdf.circle(x+6.4,y+2.4,.85,"F");
  pdf.ellipse(x+3.7,y+5.25,2.2,1.5,"F");
  pdf.ellipse(x+.8,y+5.1,1.0,1.15,"F");
  pdf.ellipse(x+6.6,y+5.1,1.0,1.15,"F");
 };
 const iconCard=(x:number,y:number,c:RGB=PURPLE)=>{
  setStroke(c);pdf.setLineWidth(.5);pdf.roundedRect(x,y,6.3,4.3,.5,.5,"S");
  line(x+.3,y+1.3,x+6,y+1.3,c,.6);
  line(x+.8,y+3.1,x+2.5,y+3.1,c,.4);
 };
 const iconLayers=(x:number,y:number,c:RGB=WHITE)=>{
  setStroke(c);pdf.setLineWidth(.55);
  const linePoly=(dx:number,dy:number)=>{
   line(x+3.5,y+dy,x+7,y+dy+1.8,c,.55);
   line(x+7,y+dy+1.8,x+3.5,y+dy+3.5,c,.55);
   line(x+3.5,y+dy+3.5,x,y+dy+1.8,c,.55);
   line(x,y+dy+1.8,x+3.5,y+dy,c,.55);
  };
  linePoly(0,0);linePoly(0,2.4);
 };
 const iconCheck=(x:number,y:number,s=4.5)=>{
  setFill(GREEN);pdf.circle(x,y,s*.5,"F");
  line(x-s*.25,y,x-s*.065,y+s*.18,WHITE,.7);
  line(x-s*.065,y+s*.18,x+s*.27,y-s*.2,WHITE,.7);
 };
 const iconInfo=(x:number,y:number)=>{
  setStroke(PURPLE);pdf.setLineWidth(.55);pdf.circle(x,y,2.3,"S");
  setFill(PURPLE);pdf.circle(x,y-1.25,.3,"F");
  line(x,y-.35,x,y+1.35,PURPLE,.7);
 };
 const cap=(x:number,y:number,width:number,h:number)=>{
  // Flat purple and orange panels; never use dark blue/navy.
  setFill(ORANGE);pdf.triangle(x,y,x+width,y,x+width,y+h,"F");
  pdf.triangle(x,y,x+width,y+h,x+width-3,y+h,"F");
 };

 // Narrow outer frame, with the exact approved purple-orange layout.
 setFill(WHITE);pdf.rect(0,0,210,297,"F");
 setStroke(PURPLE);pdf.setLineWidth(.45);pdf.roundedRect(3,3,204,291,4.3,4.3,"S");

 pdf.addImage(new Uint8Array(approvedAssetFlowLogoPng()),"PNG",11,10,22,22,undefined,"FAST");
 txt("AssetFlow",35.5,20.0,19.2,true,PURPLE_DARK);
 pdf.setFont("helvetica","bold");pdf.setFontSize(19.2);
 const wordWidth=pdf.getTextWidth("AssetFlow");
 txt("360",35.5+wordWidth+.7,20.0,19.2,true,ORANGE);
 txt("FIXED ASSET MANAGEMENT",36,27.2,8.7,true,INK);
 line(106,9.2,106,33,PURPLE,.35);
 txt(ISSUER,113,13.4,11.2,true,PURPLE_DARK);
 iconEnvelope(113,18.5,PURPLE,3.4);txt(EMAIL,120,21.6,8.2);
 iconPhone(113,24.0,PURPLE,3.2);txt(PHONE,120,27.1,8.2);
 iconGlobe(113,29.5,PURPLE,3.3);txt(WEBSITE,120,32.6,8.1);
 // Orange decorative top-right corner follows the reference image.
 setFill(ORANGE);pdf.triangle(194,3.4,206.5,3.4,206.5,17.1,"F");
 setFill(PURPLE);pdf.triangle(204.8,3.4,206.5,3.4,206.5,10.5,"F");

 banner(8,37,193,10,PURPLE);
 txt("Asset Registration   |   Verification   |   Depreciation   |   Reporting   |   Fixed Asset Management",
     13,43.6,9.0,true,WHITE);
 setFill(ORANGE);pdf.rect(192.5,37,8.2,10,"F");
 line(194.5,37.3,190.8,46.4,WHITE,.8);
 line(198.6,37.3,195.0,46.4,WHITE,.8);

 // Large title banner: use PURPLE, not navy.
 banner(8,52,194,17,PURPLE);
 iconReceipt(22,56.0,WHITE,9.3);
 txt(data.paid?"OFFICIAL PAYMENT RECEIPT":"WORKSPACE ACTIVATION CONFIRMATION",
    data.paid?50:40,63.4,data.paid?20:14.2,true,WHITE);
 setFill(ORANGE);pdf.triangle(188,52,201.5,52,201.5,69,"F");
 pdf.triangle(188,52,201.5,69,184,69,"F");

 // Receipt metadata, matching the 3-column reference, with green PAID status.
 round(8,73.5,194,21,WHITE,PURPLE,2.5);
 line(81,74.5,81,93.5,PURPLE,.33);
 line(140,74.5,140,93.5,PURPLE,.33);
 iconReceipt(13,79,PURPLE,7);
 txt(data.paid?"Receipt No.":"Document No.",27,81.2,10.2,true);
 round(26,83.4,52.3,8.2,PALE,PALE,1.7);
 txt(data.receiptNo,28.1,89.3,11.2,true,PURPLE_DARK);
 iconCalendar(86,79,PURPLE,7);
 txt("Issue Date",97,81.3,10.2,true);
 txt(date(data.issuedAt??new Date()),97,90.4,10.7,true);
 round(146,76.3,53.2,15, data.paid?PAID_BG:SOFT, data.paid?GREEN:ORANGE,2.2);
 if(data.paid){setStroke(GREEN);pdf.setLineWidth(.7);pdf.circle(155,83.8,4.5,"S");iconCheck(155,83.8,7);}
 txt("Payment Status",164,82.1,9.2,true);
 txt(data.paid?"PAID":"GRANT",164,89.3,13.8,true,data.paid?GREEN:ORANGE_DARK);

 // Issuer and customer: full purple headers, orange inner stroke.
 const party=(x:number,title:string,company:string,sub:string,building:boolean)=>{
  round(x,100,93,29,WHITE,PURPLE,2.5);
  banner(x,100,93,9,PURPLE);
  if(building)iconBuilding(x+6.2,101.2,WHITE);else iconUsers(x+6.4,101.3,WHITE);
  txt(title,x+19,106.3,11.6,true,WHITE);
  setFill(ORANGE);pdf.rect(x+3.3,112.5,1.1,12.4,"F");
  wrap(company,x+7.6,118.0,81,10.9,true,2,INK);
  txt(sub,x+7.5,125.2,8.2,false,INK);
 };
 party(8,"ISSUED BY",ISSUER,"AssetFlow360 Subscription Services",true);
 party(109,"ISSUED TO",data.workspace,"Customer / Activated Workspace",false);

 // Subscription line item / table with purple heading.
 round(8,134,194,31,WHITE,PURPLE,2.4);
 setFill(PURPLE);pdf.rect(8.2,134,193.6,10,"F");
 line(20,134,20,165,PURPLE,.32);
 line(108,134,108,165,PURPLE,.32);
 line(159,134,159,165,PURPLE,.32);
 centered("#",14,140.8,9.2,true,WHITE);
 txt("SERVICE / DESCRIPTION",26,140.8,10.6,true,WHITE);
 txt("PERIOD",120,140.8,10.6,true,WHITE);
 txt("AMOUNT ("+clear(data.currency,8)+")",163,140.8,9.3,true,WHITE);
 centered("1",14,154.3,11.4,true);
 wrap("AssetFlow360 - "+data.plan,25,151.7,78,10.0,true,2);
 txt("Access to AssetFlow360 workspace and features",25,160.5,7.6);
 txt(date(data.activatedAt)+" -",113,150.0,8.9,true);
 txt(date(data.expiresAt),113,156.5,8.9,true);
 const months=Math.round((data.expiresAt.getTime()-data.activatedAt.getTime())/ (365.2425*86400000)*12);
 if(months>0&&months<=120)txt("("+months+" Month"+(months!==1?"s":"")+")",113,162,7.8);
 fitted(data.paid?money(Number(data.amount),data.currency):"No charge",198,155.2,35,11.7,true,PURPLE_DARK);

 // Symmetrical detail panels - match the reference exactly.
 const head=(x:number,w:number,title:string,icon:"card"|"layers")=>{
  round(x,171,w,70,WHITE,PURPLE,2.6);
  banner(x,171,w,10,PURPLE);
  if(icon==="card")iconCard(x+6.5,174,WHITE);else iconLayers(x+6.7,173.4,WHITE);
  txt(title,x+19,178.3,10.3,true,WHITE);
 };
 head(8,95,"PAYMENT DETAILS","card");
 head(108,94,"INCLUDED DELIVERABLES","layers");

 const payRows:[string,string][]=[
  ["Payment Method",data.method],
  ["Payment Reference",data.paid?(data.paymentReference||"Confirmed payment"):"Not applicable"],
  ["Activation Date",date(data.activatedAt)],
  ["Expiry / Renewal",date(data.expiresAt)],
  ["Active User Allowance",data.users],
  ["Asset Capacity",data.assets],
 ];
 const ys=[187.7,198.0,209.0,219.5,230.0,238.0];
 payRows.forEach(([label,value],i)=>{
  const y=ys[i];
  if(i===1){
   txt(label+":",13.4,y,8.3);
   // Two lines, so UUID-sized payment references remain fully legible.
   const labelWidth=pdf.getTextWidth(label+":");
   const maxW=Math.max(40,88-(13.4+labelWidth+1.5));
   pdf.setFont("helvetica","bold");pdf.setFontSize(7.5);
   const refs=pdf.splitTextToSize(clear(value,135),maxW) as string[];
   const refX=98;
   if(refs.length===1)fitted(value,refX,y,50,8.0,true);
   else {rt(refs[0],refX,y-1.2,7.0,true);rt(refs[1]||"",refX,y+2.3,7.0,true);}
  }else{
   txt(label+":",13.4,y,8.0);
   fitted(value,98,y,46,8.7,true,INK,7.0);
  }
  if(i<5)line(13.3,y+3.5,98.7,y+3.5,[216,207,220],.2);
 });

 const featureLines=[
  "Access to AssetFlow360 workspace",
  "User accounts (up to "+clear(data.users,20)+")",
  (clear(data.assets,22)==="Unlimited"?"Unlimited":clear(data.assets,22))+" asset registration & management",
  "Access for the subscription period",
  ...(data.features??[]).filter(v=>typeof v==="string"&&v.trim()).slice(0,3).map(v=>clear(v,105)),
 ];
 // Render only included features, never invent PesaPal or plan entitlements.
 featureLines.slice(0,7).forEach((feature,i)=>{
  const y=187.7+i*8.3;
  iconCheck(115.1,y-1.2,4.5);
  pdf.setFont("helvetica","normal");
  let sz=8.9;pdf.setFontSize(sz);
  while(sz>7&&pdf.getTextWidth(feature)>74){sz-=.2;pdf.setFontSize(sz);}
  txt(feature,120.2,y,sz,false,INK);
 });

 // Two-part TOTAL RECEIVED banner, with the reference's orange diagonal.
 round(8,246,194,17,PALE,PURPLE,2.4);
 banner(8,246,108,17,PURPLE);
 setFill(ORANGE);pdf.triangle(110,246,119,246,110,263,"F");
 txt(data.paid?"TOTAL RECEIVED":"PAYMENT STATUS",16,257.5,14.4,true,WHITE);
 fitted(data.paid?money(Number(data.amount),data.currency):"NO PAYMENT RECORDED",
     192,258.0,70,data.paid?18.0:11.0,true,PURPLE_DARK);

 round(8,266,194,9.5,PALE,PALE,2.2);
 iconInfo(15,270.8);
 txt(data.paid?"Payment recorded against the subscription shown above.":
  "Administrator-approved activation. This document does not certify payment.",
  21.5,272.6,8.4,false,INK);

 // Footer, matching left thank-you/right contact arrangement.
 setFill(ORANGE);pdf.rect(10.5,279,1,11.4,"F");
 txt("Thank you for choosing AssetFlow360.",15,285.0,11.3,true,PURPLE_DARK);
 txt("Your trusted Fixed Asset Management Solution.",15,290.0,8.1);
 line(130,279,130,291,PURPLE,.4);
 txt(WEBSITE,136,283.4,8.8,true,PURPLE_DARK);
 iconEnvelope(136,286.2,PURPLE,2.9);
 txt(EMAIL,143,289.2,8.3);
 // Thin purple/orange curve-inspired footer edges; no blue assets.
 setFill(ORANGE);
 pdf.triangle(3.7,294.3,207,291,207,296.4,"F");
 setFill(PURPLE);
 pdf.triangle(3.7,295.4,207,293,207,297,"F");
 pdf.rect(3.6,295.6,203.3,1.2,"F");

 const pdfData=Buffer.from(pdf.output("arraybuffer"));
 if(pdfData.subarray(0,4).toString()!=="%PDF"||pdfData.length>600_000)
  throw Error("Official receipt rendering failed");
 return pdfData;
}
