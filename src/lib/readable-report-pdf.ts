import autoTable from "jspdf-autotable";
import type jsPDF from "jspdf";
import type {DocumentTemplate} from "@/lib/pdf-template";

type ReadableColumn={header:string;key:string};
type ReadableReport={title:string;columns:ReadableColumn[];rows:any[]};
/** Render a wide report in readable horizontal groups. Each group retains
 * the record identifier, and every selected field is exported exactly once.
 * Excel is left full-width for analysis. PDF never crushes 22 fields into
 * a single A4 row or spills one asset over multiple huge-height pages. */
export function renderReadableReportTables(doc:jsPDF,report:ReadableReport,template:DocumentTemplate,startY:number,formatter:(row:any,col:ReadableColumn)=>string){
 const landscape=doc.internal.pageSize.getWidth()>doc.internal.pageSize.getHeight();
 const maxColumns=landscape?8:5;
 const available=doc.internal.pageSize.getWidth()-template.margin_left-template.margin_right;
 const repeated=report.columns.filter(c=>["asset_tag","name"].includes(c.key));
 let sections:ReadableColumn[][]=[];
 // For the standard asset register, group coherent parts of the record.
 if(report.title==="Fixed Asset Register"&&report.columns.length>9){
  const keyGroups=[
   ["asset_tag","serial_number","name","description","category","sub_category","branch","location"],
   ["asset_tag","name","sub_location","geography","assigned_to","department","status"],
   ["asset_tag","name","purchase_date","purchase_value","registered_at","registered_by","capture_method"],
   ["asset_tag","name","inspection_result","inspected_at","inspected_by","inspection_evidence"],
  ];
  const seen=new Set<string>();
  for(const keys of keyGroups){
   const cols=keys.flatMap(key=>report.columns.filter(c=>c.key===key));
   if(cols.length){sections.push(cols);cols.forEach(c=>seen.add(c.key));}
  }
  const leftover=report.columns.filter(c=>!seen.has(c.key));
  if(leftover.length){
   for(let i=0;i<leftover.length;i+=Math.max(1,maxColumns-repeated.length))sections.push([...repeated,...leftover.slice(i,i+maxColumns-repeated.length)]);
  }
 }else if(report.columns.length<=maxColumns){sections=[report.columns];}
 else{
  const core=report.columns.filter(c=>!["asset_tag","name"].includes(c.key));
  const anchors=repeated.length?repeated:report.columns.slice(0,1);
  const unique=report.columns.filter(c=>!anchors.some(a=>a.key===c.key));
  const batch=Math.max(1,maxColumns-anchors.length);
  for(let i=0;i<unique.length;i+=batch)sections.push([...anchors,...unique.slice(i,i+batch)]);
  if(!sections.length)sections=[core];
 }
 if(!landscape){
  // On portrait paper, rebatch wide register sections with repeated identity.
  sections=sections.flatMap(group=>{
   if(group.length<=maxColumns)return [group];
   const anchors=group.filter(c=>["asset_tag","name"].includes(c.key));
   const rest=group.filter(c=>!anchors.includes(c));
   const chunks:ReadableColumn[][]=[];
   for(let i=0;i<rest.length;i+=Math.max(1,maxColumns-anchors.length))chunks.push([...anchors,...rest.slice(i,i+maxColumns-anchors.length)]);
   return chunks;
  });
 }
 const titles=report.title==="Fixed Asset Register"?["Asset inventory","Location & assignment","Acquisition & registration","Inspection history"]:[];
 let endY=startY;
 sections.forEach((cols,index)=>{
  if(index>0)doc.addPage();
  const begin=index===0?startY:template.margin_top+8;
  const label=titles[index]||`Report fields · ${index+1} of ${sections.length}`;
  doc.setFont(template.font_family,"bold");doc.setFontSize(9);doc.setTextColor(37,54,85);
  doc.text(label,template.margin_left,begin);
  doc.setFont(template.font_family,"normal");doc.setTextColor(0,0,0);
  const geoIndex=cols.findIndex(c=>c.key==="geography");
  const evidenceIndex=cols.findIndex(c=>c.key==="inspection_evidence");
  const descIndex=cols.findIndex(c=>c.key==="description");
  const widths:Record<number,{cellWidth:number}>={};
  if(geoIndex>=0)widths[geoIndex]={cellWidth:Math.min(66,available*.28)};
  if(evidenceIndex>=0)widths[evidenceIndex]={cellWidth:Math.min(76,available*.34)};
  if(descIndex>=0)widths[descIndex]={cellWidth:Math.min(43,available*.19)};
  autoTable(doc,{
   startY:begin+4,
   head:[cols.map(c=>c.header)],
   body:report.rows.map(row=>cols.map(c=>formatter(row,c))),
   theme:"grid",
   styles:{font:template.font_family,fontSize:8,cellPadding:2.3,overflow:"linebreak",valign:"middle",lineColor:[225,231,236],lineWidth:.15,textColor:[40,51,67],minCellHeight:8},
   headStyles:{fillColor:[35,54,82],textColor:[255,255,255],fontStyle:"bold",fontSize:8},
   alternateRowStyles:{fillColor:[249,250,252]},
   margin:{left:template.margin_left,right:template.margin_right,bottom:template.margin_bottom+5,top:template.margin_top+7},
   tableWidth:available,
   columnStyles:widths,
   rowPageBreak:"avoid",
   showHead:"everyPage",
  });
  endY=(doc as any).lastAutoTable?.finalY??begin+10;
 });
 return endY;
}
