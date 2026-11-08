import {getCustomRegisterHeaders,type RegisterTemplate,type RegisterLocationConfig} from "@/lib/bulk-import";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import { formatUGX } from "@/lib/utils";
import { loadTemplate, createBrandedPdf, saveBranded, tableHeadFill } from "@/lib/pdf-template";
import {verificationGroupLabel,type VerificationGroup} from "@/lib/asset-verification-kpi";

const ASSET_COLUMNS: { key: string; header: string; currency?: boolean }[] = [
  { key: "asset_tag", header: "Tag" },
  { key: "name", header: "Name" },
  { key: "serial_number", header: "Serial" },
  { key: "status", header: "Status" },
  { key: "category", header: "Category" },
  { key: "location", header: "Location" },
  { key: "branch", header: "Branch" },
  { key: "custodian", header: "Custodian" },
  { key: "department", header: "Department" },
  { key: "purchase_date", header: "Purchase date" },
  { key: "purchase_value", header: "Purchase value", currency: true },
];

const AUDIT_COLUMNS:{key:string;header:string}[]=[
 {key:"registered_at",header:"Registered on"},
 {key:"registered_by",header:"Registered by"},
 {key:"capture_method",header:"Capture method"},
 {key:"inspection_result",header:"Inspection result"},
 {key:"inspected_at",header:"Verified on"},
 {key:"inspected_by",header:"Verified by"},
 {key:"inspection_evidence",header:"Verification evidence"},
];
function normalize(a: any) {
  return {
    asset_tag: a.asset_tag ?? "",
    name: a.name ?? "",
    serial_number: a.serial_number ?? "",
    status: (a.status ?? "").replace(/_/g, " "),
    verification: a.verification_group ? verificationGroupLabel[a.verification_group as VerificationGroup] : (a.verification_status??""),
    registered_at:a.registered_at??a.created_at??"",
    registered_by:a.registered_by??"Not recorded",
    capture_method:a.capture_method??"Not recorded",
    inspection_result:a.inspection_result??"Not inspected",
    inspected_at:a.inspected_at??"",
    inspected_by:a.inspected_by??"Not recorded",
    inspection_evidence:a.inspection_evidence??"No inspection recorded",
    category: a.categories?.name ?? a.category ?? "",
    location: a.locations?.name ?? a.location ?? "",
    branch: a.branches?.name ?? a.branch ?? "",
    custodian: a.custodian ?? "",
    department: a.department ?? "",
    purchase_date: a.purchase_date ?? "",
    purchase_value: a.purchase_value ?? "",
  };
}

function fmt(v: any, currency?: boolean) {
  if (v === null || v === undefined || v === "") return "";
  if (currency) return formatUGX(v);
  return String(v);
}

const safe = (s: string) => s.replace(/[^a-z0-9_-]+/gi, "_");

export function exportAssetsXLSX(title:string,assets:any[],customFields:Array<{key:string,label:string}>=[],locationConfig?:RegisterLocationConfig){
 const custom=customFields.length>0;
 const visibleColumns=[...ASSET_COLUMNS,{key:"verification",header:"Verification"},...AUDIT_COLUMNS];
 const originalHeaders=custom?getCustomRegisterHeaders({id:"export",name:title,configuration:{fields:customFields.map(f=>({...f,type:"text",required:false}))}},locationConfig):visibleColumns.map(c=>c.header);
 const headers=["Asset ID",...originalHeaders.filter(h=>h!=="Asset ID"),...(custom?AUDIT_COLUMNS.map(c=>c.header):[])];
 const row=(asset:any)=>{
  const base=normalize(asset);
  const geoParts=String(asset.geo_places?.display_path??"").split("·").map((v:string)=>v.trim()).filter(Boolean);
  const lookup:Record<string,any>={
   "System Asset Tag":asset.asset_tag,"System Asset Name":asset.name,
   "System Serial Number":asset.serial_number,"System Description":asset.description,
   "Category":asset.categories?.name,"Sub Category":"","Status":asset.status,
   "Purchase Date":asset.purchase_date,"Purchase Value":asset.purchase_value,
   "Custodian":asset.custodian,"Department":asset.department,"Branch":asset.branches?.name,
   "Country":geoParts.at(-1)??"", "Region":geoParts.at(-2)??"",
   "District":geoParts.at(-3)??"", "County":geoParts.at(-4)??"",
   "Sub County":geoParts.at(-5)??"", "Parish":geoParts.at(-6)??"",
   "Ward":geoParts.at(-7)??"", "Village":geoParts.at(-8)??"",
   "Location":asset.locations?.name,"Building":"","Floor":"","Office / Room":"",
   "Custom Area":"","Internal Location ID":asset.location_id,
   "Geo Place ID":asset.geo_place_id,"Latitude":asset.location_latitude,"Longitude":asset.location_longitude
  };
  const customValues=Object.fromEntries(customFields.map(f=>[f.label,asset.custom_fields?.[f.key]??""]));
  return headers.map(name=>name==="Asset ID"?asset.id:custom?(AUDIT_COLUMNS.some(c=>c.header===name)?fmt((base as any)[AUDIT_COLUMNS.find(c=>c.header===name)!.key]):customValues[name]??lookup[name]??""):fmt((base as any)[visibleColumns.find(c=>c.header===name)?.key??""]));
 };
 const wb=XLSX.utils.book_new();
 XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([headers,...assets.map(row)]),"Assets");
 XLSX.writeFile(wb,`${safe(title)||"assets"}.xlsx`);
}

export async function exportAssetsPDF(title: string, assets: any[]) {
  const template = await loadTemplate();
  const { doc, startY } = createBrandedPdf({
    template,
    orientation: "landscape",
    title,
    subtitle: `${assets.length} asset(s)`,
  });
  const rows = assets.map(normalize);
  const main=[...ASSET_COLUMNS,{key:"verification",header:"Verification"}];
  autoTable(doc, {
    startY,
    head: [main.map((c) => c.header)],
    body: rows.map((r) => main.map((c) => fmt((r as any)[c.key], c.currency))),
    styles: { fontSize: 7, font: template.font_family },
    headStyles: { fillColor: tableHeadFill(template) },
    margin: { left: template.margin_left, right: template.margin_right, bottom: template.margin_bottom },
  });
  doc.addPage();
  doc.setFontSize(11);doc.text("Registration & verification audit",template.margin_left,template.margin_top+4);
  const audit=[{key:"asset_tag",header:"Tag"},{key:"name",header:"Asset"},...AUDIT_COLUMNS];
  autoTable(doc, {
    startY:template.margin_top+9,
    head:[audit.map(c=>c.header)],
    body:rows.map(a=>audit.map(c=>fmt((a as any)[c.key]))),
    styles:{fontSize:7,font:template.font_family},
    headStyles:{fillColor:tableHeadFill(template)},
    margin:{left:template.margin_left,right:template.margin_right,bottom:template.margin_bottom},
  });
  saveBranded(doc, template, `${safe(title) || "assets"}.pdf`);
}

function detailPairs(a: any): [string, string][] {
  const n = normalize(a);
  return [
    ["Tag", n.asset_tag],
    ["Name", n.name],
    ["Serial", n.serial_number],
    ["Status", n.status],
    ["Category", n.category],
    ["Location", n.location],
    ["Branch", n.branch],
    ["Custodian", n.custodian],
    ["Department", n.department],
    ["Purchase date", n.purchase_date],
    ["Purchase value", n.purchase_value ? formatUGX(n.purchase_value) : ""],
    ["Description", a.description ?? ""],
    ...Object.entries(a.custom_fields??{}).map(([key,value]):[string,string]=>[key,String(value??"")]),
    ["Set for disposal", a.set_for_disposal ? "Yes" : "No"],
    ["Registered on", n.registered_at],
    ["Registered by", n.registered_by],
    ["Capture method", n.capture_method],
    ["Inspection result", n.inspection_result],
    ["Verified on", n.inspected_at],
    ["Verified by", n.inspected_by],
    ["Verification evidence", n.inspection_evidence],
  ];
}

export function exportAssetDetailXLSX(a: any) {
  const ws = XLSX.utils.aoa_to_sheet([["Field", "Value"], ...detailPairs(a)]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Asset");
  XLSX.writeFile(wb, `${safe(a.asset_tag || a.name || "asset")}.xlsx`);
}

export async function exportAssetDetailPDF(a: any) {
  const template = await loadTemplate();
  const { doc, startY } = createBrandedPdf({
    template,
    title: a.name ?? "Asset",
    subtitle: `Tag: ${a.asset_tag ?? ""}`,
  });
  autoTable(doc, {
    startY,
    head: [["Field", "Value"]],
    body: detailPairs(a),
    styles: { fontSize: 9, font: template.font_family },
    headStyles: { fillColor: tableHeadFill(template) },
    columnStyles: { 0: { cellWidth: 50, fontStyle: "bold" } },
    margin: { left: template.margin_left, right: template.margin_right, bottom: template.margin_bottom },
  });
  saveBranded(doc, template, `${safe(a.asset_tag || a.name || "asset")}.pdf`);
}
