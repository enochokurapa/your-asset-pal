import autoTable from "jspdf-autotable";
import type jsPDF from "jspdf";
import type {DocumentTemplate} from "@/lib/pdf-template";

type ReadableColumn={header:string;key:string};
type ReadableReport={title:string;columns:ReadableColumn[];rows:any[]};

/** Keep every field of an asset in the SAME row/page instead of splitting
 * wide registers into unrelated horizontal groups. Paper size controls readability.
 * Long cells wrap; the full table repeats its header on every page.
 */
export function renderReadableReportTables(
 doc:jsPDF,report:ReadableReport,template:DocumentTemplate,startY:number,
 formatter:(row:any,col:ReadableColumn)=>string
){
 const columns=report.columns;
 if(!columns.length)return startY;
 const width=doc.internal.pageSize.getWidth();
 const available=width-template.margin_left-template.margin_right;
 const weights=columns.map(c=>{
  if(["description","geography","inspection_evidence","notes"].includes(c.key))return 1.6;
  if(["name","location","branch","assigned_to","category"].includes(c.key))return 1.2;
  return 1;
 });
 const units=weights.reduce((a,b)=>a+b,0);
 const widths=weights.map(w=>available*w/units);
 // A3 landscape keeps a regular-sized font even for wide registers.
 // Smaller paper scales down, but NEVER splits a record into column-group pages.
 const smallest=Math.min(...widths);
 const fontSize=Math.min(9,Math.max(3.5,smallest/1.35));
 const styles:Record<number,{cellWidth:number}>={};
 widths.forEach((w,i)=>{styles[i]={cellWidth:w};});
 autoTable(doc,{
  startY,
  head:[columns.map(col=>col.header)],
  body:report.rows.map(row=>columns.map(col=>formatter(row,col))),
  theme:"grid",
  styles:{
   font:template.font_family,fontSize,cellPadding:Math.max(.7,Math.min(2,smallest*.08)),
   overflow:"linebreak",valign:"middle",lineColor:[225,231,236],lineWidth:.13,
   textColor:[35,48,68],minCellHeight:5.5
  },
  headStyles:{fillColor:[36,52,104],textColor:[255,255,255],fontStyle:"bold",
   fontSize:Math.max(3.7,Math.min(8,fontSize))},
  alternateRowStyles:{fillColor:[249,250,253]},
  margin:{left:template.margin_left,right:template.margin_right,
   bottom:template.margin_bottom+6,top:template.margin_top+10},
  tableWidth:available,
  columnStyles:styles,
  horizontalPageBreak:false,
  rowPageBreak:"avoid",
  showHead:"everyPage",
 });
 return (doc as any).lastAutoTable?.finalY??startY;
}
