import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";

export const TEMPLATE_COLUMNS = [
  "asset_tag", "serial_number", "name", "description",
  "category", "sub_category", "location", "sub_location",
  "branch", "status",
  "purchase_date", "purchase_value_ugx",
  "custodian", "department",
];

export const STATUS_VALUES = ["in_use", "in_storage", "under_repair", "retired", "missing", "disposed"];

const SAMPLE_ROW: Record<string, any> = {
  asset_tag: "LAP-001",
  serial_number: "SN-123456",
  name: "Dell Latitude 7420",
  description: "14-inch business laptop",
  category: "IT Equipment",
  sub_category: "Laptops",
  location: "Head Office",
  sub_location: "Floor 2 - IT Room",
  branch: "HQ",
  status: "in_use",
  purchase_date: "2024-01-15",
  purchase_value_ugx: 4500000,
  custodian: "Jane Doe",
  department: "Finance",
};

export type RegisterTemplate={id:string,name:string,configuration:{fields?:Array<{key:string,label:string,type:string,required:boolean,options?:string[]}>}};
export function downloadTemplate(register?:RegisterTemplate, includeLocation=false) {
  const wb = XLSX.utils.book_new();
  const extra=register?.configuration?.fields??[];
  const columns=register?[...extra.map(field=>field.label),...(includeLocation&&!extra.some(f=>["location","assetlocation"].includes(f.key.toLowerCase()))?["Location"]:[])]:TEMPLATE_COLUMNS;
  if(!columns.length)throw new Error("Add at least one field before downloading this custom template.");
  const ws=register?XLSX.utils.aoa_to_sheet([columns]):XLSX.utils.json_to_sheet([SAMPLE_ROW],{header:columns});
  // Append an "instructions" sheet
  const notes = [
    ["Column", "Required?", "Notes"],
    ["asset_tag", "Yes", "Unique tag, e.g. LAP-001"],
    ["serial_number", "No", "Manufacturer serial"],
    ["name", "Yes", "Asset name"],
    ["description", "No", "Free text"],
    ["category", "No", "Top-level category (auto-created if missing)"],
    ["sub_category", "No", "Sub-category under category"],
    ["location", "No", "Top-level location (auto-created)"],
    ["sub_location", "No", "Sub-location under location"],
    ["branch", "Yes", "Branch name or code (auto-created if missing)"],
    ["status", "No", `One of: ${STATUS_VALUES.join(", ")} (default: in_storage)`],
    ["purchase_date", "No", "YYYY-MM-DD"],
    ["purchase_value_ugx", "No", "Number, no commas"],
    ["custodian", "No", "Person responsible (creates an assignment record)"],
    ["department", "No", "Department of the custodian"],
  ];
  if(register){notes.splice(1);extra.forEach(f=>notes.push([f.label,f.required?"Yes":"No",`${f.type}${f.options?.length?": "+f.options.join(" / "):""}`]));}
  const wsNotes = XLSX.utils.aoa_to_sheet(notes);
  XLSX.utils.book_append_sheet(wb, ws, "Assets");
  if(!register)XLSX.utils.book_append_sheet(wb, wsNotes, "Instructions");
  XLSX.writeFile(wb, `${register?.name.replace(/[^a-z0-9]+/gi,"_")??"assetflow"}-import-template.xlsx`);
}

export type ImportResult = {
  total: number;
  success: number;
  errors: { row: number; tag?: string; error: string }[];
};

export async function importAssetsFromFile(file: File, userId: string | null,register?:RegisterTemplate, importBranchId?:string,includeLocation=false): Promise<ImportResult> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: "" });

  // Preload lookup data
  const [{ data: cats = [] }, { data: locs = [] }, { data: brs = [] }] = await Promise.all([
    supabase.from("categories").select("id,name,parent_id"),
    supabase.from("locations").select("id,name,parent_id"),
    supabase.from("branches").select("id,name,code"),
  ]);
  const catMap = new Map<string, any>((cats ?? []).map((c: any) => [c.name.toLowerCase(), c]));
  const locMap = new Map<string, any>((locs ?? []).map((l: any) => [l.name.toLowerCase(), l]));
  const brMap = new Map<string, any>();
  (brs ?? []).forEach((b: any) => {
    brMap.set(b.name.toLowerCase(), b);
    if (b.code) brMap.set(b.code.toLowerCase(), b);
  });

  const ensureBranch = async (name: string) => {
    const k = name.trim().toLowerCase();
    if (brMap.has(k)) return brMap.get(k);
    const { data, error } = await supabase.from("branches").insert({ name: name.trim(), is_active: true }).select().single();
    if (error) throw error;
    brMap.set(data.name.toLowerCase(), data);
    return data;
  };
  const ensureCategory = async (name: string, parentId: string | null = null) => {
    const k = name.trim().toLowerCase();
    const existing = catMap.get(k);
    if (existing && (existing.parent_id ?? null) === parentId) return existing;
    const { data, error } = await supabase.from("categories").insert({ name: name.trim(), parent_id: parentId }).select().single();
    if (error) throw error;
    catMap.set(data.name.toLowerCase(), data);
    return data;
  };
  const ensureLocation = async (name: string, parentId: string | null = null) => {
    const k = name.trim().toLowerCase();
    const existing = locMap.get(k);
    if (existing && (existing.parent_id ?? null) === parentId) return existing;
    const { data, error } = await supabase.from("locations").insert({ name: name.trim(), parent_id: parentId }).select().single();
    if (error) throw error;
    locMap.set(data.name.toLowerCase(), data);
    return data;
  };

  const result: ImportResult = { total: rows.length, success: 0, errors: [] };

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const rowNum = i + 2; // header is row 1
    try {
      const extra=register?.configuration?.fields??[];
      const normalized=(value:string)=>value.toLowerCase().replace(/[^a-z0-9]/g,"");
      const findField=(...aliases:string[])=>extra.find(f=>aliases.includes(normalized(f.label))||aliases.includes(normalized(f.key)));
      const customTagField=findField("assettag","tagnumber","tag","tagno");
      const customNameField=findField("assetname","itemname","name","itemdescription","itemcode");
      const custom:Record<string,string|number|boolean|null>={};
      for(const field of extra){const raw=r[field.label]??r[field.key];const value=raw==null?"":String(raw).trim();if(field.required&&!value&&field.key!==customTagField?.key)throw Error(`${field.label} is required`);if(!value){custom[field.key]=null;continue;}if(field.type==="number"||field.type==="currency"){const n=Number(value);if(!Number.isFinite(n))throw Error(`${field.label} must be a number`);custom[field.key]=n;}else if(field.type==="boolean"){if(!["true","false","yes","no","1","0"].includes(value.toLowerCase()))throw Error(`${field.label} must be true or false`);custom[field.key]=["true","yes","1"].includes(value.toLowerCase());}else if(field.type==="date"){if(!/^\d{4}-\d{2}-\d{2}$/.test(value))throw Error(`${field.label} must use YYYY-MM-DD`);custom[field.key]=value;}else if(field.type==="select"&&field.options?.length&&!field.options.includes(value))throw Error(`${field.label}: invalid option ${value}`);else custom[field.key]=value;}
      const explicitTag=customTagField?String(custom[customTagField.key]??"").trim():"";
      const tag=register?(explicitTag||`AUTO-${crypto.randomUUID()}`):String(r.asset_tag??"").trim();
      const name=register?(String(customNameField?custom[customNameField.key]??"":Object.values(custom).find(v=>typeof v==="string"&&v.trim())??"").trim()||explicitTag||"Registered asset"):String(r.name??"").trim();
      const branchName=String(r.branch??"").trim();
      if(!tag)throw new Error("Asset tag is required");
      if(!name)throw new Error("A text/name field must contain an asset name");
      if(!register&&!branchName)throw new Error("branch is required");
      const branch=branchName?await ensureBranch(branchName):importBranchId?(brs as any[]).find(b=>b.id===importBranchId):brs?.length===1?(brs as any[])[0]:null;
      if(register&&!branch&&(brs?.length??0)>1)throw new Error("Choose an import branch before uploading to this register.");

      let categoryId: string | null = null;
      if (r.category) {
        const cat = await ensureCategory(String(r.category));
        categoryId = cat.id;
        if (r.sub_category) {
          const sub = await ensureCategory(String(r.sub_category), cat.id);
          categoryId = sub.id;
        }
      }

      let locationId: string | null = null;
      if (r.location || (register&&includeLocation&&r.Location)) {
        const loc = await ensureLocation(String(r.location||r.Location));
        locationId = loc.id;
        if (r.sub_location) {
          const sub = await ensureLocation(String(r.sub_location), loc.id);
          locationId = sub.id;
        }
      }

      const statusRaw = String(r.status ?? "in_storage").trim().toLowerCase().replace(/\s+/g, "_");
      const status = STATUS_VALUES.includes(statusRaw) ? statusRaw : "in_storage";

      let purchaseDate: string | null = null;
      if (r.purchase_date) {
        const d = r.purchase_date;
        if (typeof d === "number") {
          const dd = XLSX.SSF.parse_date_code(d);
          if (dd) purchaseDate = `${dd.y}-${String(dd.m).padStart(2,"0")}-${String(dd.d).padStart(2,"0")}`;
        } else {
          purchaseDate = String(d).slice(0, 10);
        }
      }
      const purchaseValue = r.purchase_value_ugx !== "" && r.purchase_value_ugx != null ? Number(r.purchase_value_ugx) : null;

      const { data: created, error: insErr } = await supabase.from("assets").insert({
        register_definition_id:register?.id??null,custom_fields:custom,
        asset_tag: tag,
        serial_number: r.serial_number ? String(r.serial_number).trim() : null,
        name,
        description: r.description ? String(r.description) : null,
        category_id: categoryId,
        location_id: locationId,
        branch_id: branch?.id??null,
        status: status as any,
        purchase_value: Number.isFinite(purchaseValue as number) ? purchaseValue : null,
        purchase_date: purchaseDate,
        created_by: userId,
      }).select().single();
      if (insErr) throw insErr;

      if ((r.custodian || r.department) && created) {
        await supabase.from("asset_assignments").insert({
          asset_id: created.id,
          assigned_to_name: r.custodian ? String(r.custodian).trim() : null,
          department: r.department ? String(r.department).trim() : null,
          branch_id: branch?.id??null,
          assignment_date: new Date().toISOString().slice(0, 10),
          created_by: userId,
        });
      }

      result.success++;
    } catch (e: any) {
      result.errors.push({ row: rowNum, tag: r.asset_tag, error: e?.message ?? String(e) });
    }
  }

  await supabase.from("asset_imports" as any).insert({
    file_name: file.name,
    total_rows: result.total,
    success_rows: result.success,
    error_rows: result.errors.length,
    errors: result.errors as any,
    imported_by: userId,
  });

  return result;
}
