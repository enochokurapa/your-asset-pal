import jsPDF from "jspdf";
import {renderReadableReportTables} from "../src/lib/readable-report-pdf";
const columns=Array.from({length:17},(_,i)=>({header:"Field "+(i+1),key:"field_"+i}));
const rows=Array.from({length:9},(_,i)=>Object.fromEntries(columns.map((c,j)=>[c.key,"Asset "+i+" value "+j])));
const template:any={margin_left:10,margin_right:10,margin_top:10,margin_bottom:10,font_family:"helvetica"};
for(const paper of ["a3","a4"] as const){
 const pdf=new jsPDF({orientation:"landscape",unit:"mm",format:paper});
 const end=renderReadableReportTables(pdf,{title:"Fixed Asset Register",columns,rows},template,20,(row,c)=>row[c.key]);
 const out=Buffer.from(pdf.output("arraybuffer"));
 if(out.subarray(0,5).toString()!=="%PDF-")throw Error("Report PDF invalid");
 if(!(end>20))throw Error("Report did not render");
 const width=pdf.internal.pageSize.getWidth();
 if(paper==="a3"&&width<400)throw Error("A3 dimensions incorrect");
 if(paper==="a4"&&width>330)throw Error("A4 dimensions incorrect");
 console.log("REPORT_SINGLE_TABLE_PASSED",paper,"pages",pdf.getNumberOfPages(),"bytes",out.length);
}
