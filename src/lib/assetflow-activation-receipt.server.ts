import {jsPDF} from "jspdf";

export type ActivationReceipt={
  receiptNo:string; workspace:string; plan:string; activatedAt:Date; expiresAt:Date;
  users:string;assets:string; method:string; amount:number|null;currency:string;
  paymentReference:string|null; paid:boolean;
};
const safe=(value:string,max=110)=>value.replace(/[\r\n\x00-\x1f]/g," ").trim().slice(0,max);
export function createAssetFlowActivationReceipt(data:ActivationReceipt):Buffer{
  if(data.paid&&(!Number.isFinite(data.amount)||data.amount===null||data.amount<0))
    throw Error("Cannot issue a payment receipt without a verified amount");
  const pdf=new jsPDF({orientation:"portrait",unit:"mm",format:"a5",compress:true});
  const pageWidth=148,margin=12,innerWidth=124;
  const label="#526278", navy="#172554",violet="#3f3bc5";
  const date=(d:Date)=>new Intl.DateTimeFormat("en-GB",{day:"2-digit",month:"short",year:"numeric",timeZone:"Africa/Kampala"}).format(d);
  pdf.setFillColor(247,249,252);pdf.rect(0,0,pageWidth,210,"F");
  pdf.setFillColor(255,255,255);pdf.roundedRect(7,7,134,194,3,3,"F");
  pdf.setDrawColor(221,227,235);pdf.roundedRect(7,7,134,194,3,3,"S");
  pdf.setFillColor(60,56,190);pdf.roundedRect(7,7,134,36,3,3,"F");
  pdf.setFillColor(60,56,190);pdf.rect(7,34,134,9,"F");
  pdf.setTextColor(255,255,255);pdf.setFont("helvetica","bold");pdf.setFontSize(17);
  pdf.text("AssetFlow360",margin,23);
  pdf.setFontSize(9);pdf.setFont("helvetica","normal");pdf.text("ASSETFLOW OPERATIONS",margin,30);
  pdf.setTextColor(25,35,75);pdf.setFont("helvetica","bold");pdf.setFontSize(13);
  pdf.text(data.paid?"PAYMENT RECEIPT":"WORKSPACE ACTIVATION",margin,54);
  pdf.setTextColor(75,92,115);pdf.setFont("helvetica","normal");pdf.setFontSize(8.5);
  pdf.text("Reference: "+safe(data.receiptNo,40),margin,61);
  pdf.text("Issued: "+date(new Date()),margin,67);
  pdf.setDrawColor(225,230,238);pdf.line(margin,73,pageWidth-margin,73);
  const row=(y:number,title:string,value:string)=>{
    pdf.setFont("helvetica","normal");pdf.setTextColor(87,100,120);pdf.setFontSize(9);
    pdf.text(title,margin,y);
    pdf.setFont("helvetica","bold");pdf.setTextColor(23,37,84);
    const lines=pdf.splitTextToSize(safe(value),65);
    pdf.text(lines,pageWidth-margin,y,{align:"right"});
    return y+(lines.length>1?lines.length*5+2:10);
  };
  let y=82;
  y=row(y,"Organisation",data.workspace);
  y=row(y,"Subscription",data.plan);
  y=row(y,"Activation date",date(data.activatedAt));
  y=row(y,"Expiry date",date(data.expiresAt));
  y=row(y,"Active users",data.users);
  y=row(y,"Asset capacity",data.assets);
  if(data.paid){
    y=row(y,"Payment method",data.method);
    if(data.paymentReference)y=row(y,"Transaction",data.paymentReference);
    pdf.setDrawColor(220,228,240);pdf.line(margin,y,pageWidth-margin,y);
    pdf.setFillColor(237,239,252);pdf.roundedRect(margin,y+5,innerWidth,17,2,2,"F");
    pdf.setTextColor(23,37,84);pdf.setFont("helvetica","bold");pdf.setFontSize(10);
    pdf.text("TOTAL RECEIVED",margin+5,y+15);
    pdf.text(data.currency+" "+Number(data.amount).toLocaleString("en-UG",{maximumFractionDigits:2,minimumFractionDigits:0}),pageWidth-margin-5,y+15,{align:"right"});
  }
  pdf.setDrawColor(224,228,236);pdf.line(margin,184,pageWidth-margin,184);
  pdf.setTextColor(92,106,129);pdf.setFont("helvetica","normal");pdf.setFontSize(8);
  pdf.text("AssetFlow Operations",margin,191);
  pdf.text("assetflow360.com",pageWidth-margin,191,{align:"right"});
  return Buffer.from(pdf.output("arraybuffer"));
}
