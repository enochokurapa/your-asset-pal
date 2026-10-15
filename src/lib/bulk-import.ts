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
export type RegisterLocationConfig={location_mode?:"internal"|"branch"|"geographic"|"hybrid",show_in_custom_register?:boolean,show_coordinates?:boolean,require_gps?:boolean,allow_custom_area?:boolean};
export const CUSTOM_SYSTEM_COLUMNS=[
 "System Asset Tag","System Asset Name","System Serial Number","System Description",
 "Category","Sub Category","Status","Purchase Date","Purchase Value","Custodian","Department","Branch",
 "Country","Region","District","County","Sub County","Parish","Ward","Village",
 "Location","Building","Floor","Office / Room","Custom Area","Internal Location ID","Geo Place ID","Latitude","Longitude"
] as const;
const COMMON_SYSTEM_COLUMNS=["System Asset Tag","System Asset Name","System Serial Number","System Description","Category","Sub Category","Status","Purchase Date","Purchase Value","Custodian","Department"];
const INTERNAL_COLUMNS=["Branch","Location","Building","Floor","Office / Room","Custom Area","Internal Location ID"];
const GEOGRAPHIC_COLUMNS=["Country","Region","District","County","Sub County","Parish","Ward","Village","Geo Place ID"];
export function locationColumns(config?:RegisterLocationConfig){if(config?.show_in_custom_register===false)return [];const mode=config?.location_mode??"internal";const out=mode==="branch"?["Branch"]:mode==="geographic"?GEOGRAPHIC_COLUMNS:mode==="hybrid"?[...INTERNAL_COLUMNS,...GEOGRAPHIC_COLUMNS]:INTERNAL_COLUMNS;return [...out.filter(x=>x!=="Custom Area"||config?.allow_custom_area!==false),...(config?.show_coordinates||config?.require_gps?["Latitude","Longitude"]:[])];}
const normalizeHeader=(name:string)=>name.trim().toLowerCase().replace(/[^a-z0-9]/g,"");
export function getCustomRegisterHeaders(register:RegisterTemplate,config?:RegisterLocationConfig){
 const labels=(register.configuration.fields??[]).map(f=>f.label.trim());
 const used=new Set(labels.map(normalizeHeader));
 return [...labels,...[...COMMON_SYSTEM_COLUMNS,...locationColumns(config)].filter(name=>!used.has(normalizeHeader(name)))];
}
export function downloadTemplate(register?:RegisterTemplate, config?:RegisterLocationConfig) {
  const wb = XLSX.utils.book_new();
  const extra=register?.configuration?.fields??[];
  const columns=register?getCustomRegisterHeaders(register,config):TEMPLATE_COLUMNS;
  if(!columns.length)throw new Error("Add at least one field before downloading this custom template.");
  const ws=register?XLSX.utils.aoa_to_sheet([columns]):XLSX.utils.json_to_sheet([SAMPLE_ROW],{header:columns});
  // Append an "instructions" sheet
  const notes = [
    ["Column", "Required?", "Notes"],
    ["asset_tag", "No", "Optional physical tag; the system assigns a permanent asset number"],
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
  if(register){const info=[["1. SETUP","Open Settings > Asset locations and choose Internal, Branch, Geographic or Hybrid before downloading."],["2. COMPLETE","Fill whichever columns you have; leave unknown location and other optional details blank."],["3. IMPORT","Select the same register in Assets > Import. The system validates matching locations and reports errors."]];const guide=XLSX.utils.aoa_to_sheet([...info,[],...notes,...columns.filter(name=>!extra.some(f=>normalizeHeader(f.label)===normalizeHeader(name))).map(name=>[name,"Optional","Built-in form field. Match your configured locations."])]);guide["!cols"]=[{wch:26},{wch:100},{wch:60}];XLSX.utils.book_append_sheet(wb,guide,"Read Me");}else XLSX.utils.book_append_sheet(wb, wsNotes, "Instructions");
  XLSX.writeFile(wb, `${register?.name.replace(/[^a-z0-9]+/gi,"_")??"assetflow"}-import-template.xlsx`);
}

export type ImportResult = {
  total: number;
  success: number;
  errors: { row: number; tag?: string; error: string }[];
};

export async function importAssetsFromFile(file: File, userId: string | null,register?:RegisterTemplate, importBranchId?:string,config?:RegisterLocationConfig): Promise<ImportResult> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: "" });
  const getValue=(r:Record<string,any>,...names:string[])=>{
    const keys=new Map(Object.keys(r).map(k=>[normalizeHeader(k),k]));
    for(const name of names){const key=keys.get(normalizeHeader(name));if(key!==undefined&&r[key]!==""&&r[key]!=null)return r[key];}
    return "";
  };
  const textValue=(r:Record<string,any>,...names:string[])=>String(getValue(r,...names)).trim();
  if(register){
    const known=new Set([...getCustomRegisterHeaders(register,config),...TEMPLATE_COLUMNS,"Asset Name","Asset Tag","Serial Number","Country Code"].map(normalizeHeader));
    const unknown=Object.keys(rows[0]??{}).filter(k=>!known.has(normalizeHeader(k)));
    if(unknown.length)throw Error("Unmapped spreadsheet columns: "+unknown.join(", ")+". Add matching fields in Register Builder or rename these columns.");
  }

  // Preload lookup data
  const [{ data: cats = [] }, { data: locs = [] }, { data: brs = [] }] = await Promise.all([
    supabase.from("categories").select("id,name,parent_id"),
    supabase.from("locations").select("id,name,parent_id"),
    supabase.from("branches").select("id,name,code"),
  ]);
  const catMap = new Map<string, any>((cats ?? []).map((c: any) => [c.name.toLowerCase(), c]));
  const locMap = new Map<string, any>((locs ?? []).map((l: any) => [`${(l.parent_id??"root")}:${l.name.toLowerCase()}`, l]));
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
    const k = `${parentId??"root"}:${name.trim().toLowerCase()}`;
    const existing = locMap.get(k);
    if (existing && (existing.parent_id ?? null) === parentId) return existing;
    const { data, error } = await supabase.from("locations").insert({ name: name.trim(), parent_id: parentId }).select().single();
    if (error) throw error;
    locMap.set(`${parentId??"root"}:${data.name.toLowerCase()}`, data);
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
      for(const field of extra){const raw=getValue(r,field.label,field.key);const value=raw==null?"":String(raw).trim();if(field.required&&!value&&field.key!==customTagField?.key)throw Error(`${field.label} is required`);if(!value){custom[field.key]=null;continue;}if(field.type==="number"||field.type==="currency"){const n=Number(value);if(!Number.isFinite(n))throw Error(`${field.label} must be a number`);custom[field.key]=n;}else if(field.type==="boolean"){if(!["true","false","yes","no","1","0"].includes(value.toLowerCase()))throw Error(`${field.label} must be true or false`);custom[field.key]=["true","yes","1"].includes(value.toLowerCase());}else if(field.type==="date"){if(!/^\d{4}-\d{2}-\d{2}$/.test(value))throw Error(`${field.label} must use YYYY-MM-DD`);custom[field.key]=value;}else if(["select","radio"].includes(field.type)&&field.options?.length&&!field.options.includes(value))throw Error(`${field.label}: invalid option ${value}`);else custom[field.key]=value;}
      const explicitTag=textValue(r,"System Asset Tag","asset_tag")||(customTagField?String(custom[customTagField.key]??"").trim():"");
      const tag=explicitTag||null;
      const name=register?(textValue(r,"System Asset Name","name")||String(customNameField?custom[customNameField.key]??"":Object.values(custom).find(v=>typeof v==="string"&&v.trim())??"").trim()||explicitTag||"Registered asset"):String(r.name??"").trim();
      const branchName=textValue(r,"Branch","branch");
      if(!tag&&register?.configuration?.tag_policy==="required")throw new Error("Asset tag is required by this register");
      if(!name)throw new Error("A text/name field must contain an asset name");
      if(!register&&!branchName)throw new Error("branch is required");
      const branch=branchName?await ensureBranch(branchName):importBranchId?(brs as any[]).find(b=>b.id===importBranchId):brs?.length===1?(brs as any[])[0]:null;
      if(register&&!branch&&(brs?.length??0)>1)throw new Error("Choose an import branch before uploading to this register.");

      let categoryId: string | null = null;
      if (textValue(r,"Category","category")) {
        const cat = await ensureCategory(textValue(r,"Category","category"));
        categoryId = cat.id;
        if (textValue(r,"Sub Category","sub_category")) {
          const sub = await ensureCategory(textValue(r,"Sub Category","sub_category"), cat.id);
          categoryId = sub.id;
        }
      }

      let locationId: string | null = null;
      const segments=register?["Location","Building","Floor","Office / Room","Custom Area"].map(k=>textValue(r,k)).filter(Boolean):
        [textValue(r,"location"),textValue(r,"sub_location")].filter(Boolean);
      let parent:string|null=null;
      for(const segment of segments){const resolved=await ensureLocation(segment,parent);parent=resolved.id;locationId=resolved.id;}
      const selectedLocationId=textValue(r,"Internal Location ID");
      if(register&&selectedLocationId){
        const {data:known,error:knownError}=await supabase.from("locations").select("id,name").eq("id",selectedLocationId).maybeSingle();
        if(knownError||!known)throw Error("Internal Location ID not found in this business.");
        locationId=known.id;
      }
      const geoLevels=["Country","Region","District","County","Sub County","Parish","Ward","Village"];
      const geographic=register?geoLevels.map(level=>textValue(r,level)).filter(Boolean):[];
      let geoPlaceId:number|null=null;
      const explicitGeoId=textValue(r,"Geo Place ID");
      if(explicitGeoId){const numericId=Number(explicitGeoId);if(!Number.isSafeInteger(numericId))throw Error("Geo Place ID must be a valid number");const {data:geo,error:ge}=await (supabase as any).from("geo_places").select("geoname_id,name,display_path").eq("geoname_id",numericId).maybeSingle();if(ge||!geo)throw Error("Geo Place ID not found");const path=String(geo.display_path??"").toLowerCase();if(geographic.some(x=>!path.includes(x.toLowerCase())&&!String(geo.name).toLowerCase().includes(x.toLowerCase())))throw Error("Geo Place ID does not match supplied geographic columns");geoPlaceId=numericId;}
      else if(geographic.length){
        const deepest=geographic[geographic.length-1];
        const {data:matches,error:geoError}=await (supabase as any).from("geo_places")
         .select("geoname_id,name,display_path").ilike("name",deepest).limit(200);
        if(geoError)throw geoError;
        const candidates=(matches??[]).filter((place:any)=>{
          const levels=String(place.display_path??"").split("·").map((v:string)=>v.trim().toLowerCase());
          return geographic.every(name=>levels.includes(name.toLowerCase())||String(place.name).toLowerCase()===name.toLowerCase());
        });
        if(candidates.length!==1)throw Error(candidates.length?"Geographic location is ambiguous: include more geographic levels.":"Geographic place not found: verify country, district, ward and other supplied levels.");
        geoPlaceId=Number(candidates[0].geoname_id);
      }
      const latRaw=textValue(r,"Latitude"),lngRaw=textValue(r,"Longitude");
      const latitude=latRaw?Number(latRaw):null,longitude=lngRaw?Number(lngRaw):null;
      if(latitude!==null&&(!Number.isFinite(latitude)||latitude < -90||latitude>90))throw Error("Latitude must be between -90 and 90.");
      if(longitude!==null&&(!Number.isFinite(longitude)||longitude < -180||longitude>180))throw Error("Longitude must be between -180 and 180.");
      const statusRaw = (textValue(r,"Status","status")||"in_storage").toLowerCase().replace(/\s+/g, "_");
      if(statusRaw&&!STATUS_VALUES.includes(statusRaw))throw Error("Invalid Status: "+statusRaw);
      const status = statusRaw;

      let purchaseDate: string | null = null;
      if (getValue(r,"Purchase Date","purchase_date")) {
        const d = getValue(r,"Purchase Date","purchase_date");
        if (typeof d === "number") {
          const dd = XLSX.SSF.parse_date_code(d);
          if (dd) purchaseDate = `${dd.y}-${String(dd.m).padStart(2,"0")}-${String(dd.d).padStart(2,"0")}`;
        } else {
          purchaseDate = String(d).slice(0, 10);
        }
      }
      const purchaseRaw=getValue(r,"Purchase Value","purchase_value_ugx");
      const purchaseValue = purchaseRaw!=="" ? Number(purchaseRaw) : null;
      if(purchaseRaw!==""&&!Number.isFinite(purchaseValue))throw Error("Purchase Value must be numeric");

      const { data: created, error: insErr } = await supabase.from("assets").insert({
        register_definition_id:register?.id??null,custom_fields:custom,
        asset_tag: tag,
        serial_number: textValue(r,"System Serial Number","serial_number")||null,
        name,
        description: textValue(r,"System Description","description")||null,
        category_id: categoryId,
        location_id: locationId,
        geo_place_id:geoPlaceId,
        location_latitude:latitude,
        location_longitude:longitude,
        location_source:latitude!==null&&longitude!==null?"manual":"import",
        branch_id: branch?.id??null,
        status: status as any,
        purchase_value: Number.isFinite(purchaseValue as number) ? purchaseValue : null,
        purchase_date: purchaseDate,
        created_by: userId,
      }).select().single();
      if (insErr) throw insErr;

      if ((textValue(r,"Custodian","custodian") || textValue(r,"Department","department")) && created) {
        await supabase.from("asset_assignments").insert({
          asset_id: created.id,
          assigned_to_name: textValue(r,"Custodian","custodian")||null,
          department: textValue(r,"Department","department")||null,
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
