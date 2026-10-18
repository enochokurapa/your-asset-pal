import { useEffect, useMemo, useState } from "react";
import { createFileRoute, useSearch, useNavigate, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Pencil, Search, Package, ScanLine, Archive, AlertCircle, FilterX, Trash2, Download, Upload, Send, Eye, ArrowRightLeft, Wrench, ChevronLeft, ChevronRight, Check, MapPin, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";
import { ScannerDialog } from "@/components/scanner-dialog";
import { AssetDetailTabs } from "@/components/asset-detail-tabs";
import { formatUGX } from "@/lib/utils";
import { submitApproval } from "@/lib/approvals";
import { downloadTemplate, importAssetsFromFile } from "@/lib/bulk-import";
import {getRegisterCatalog} from "@/lib/builders.functions";
import {exportAssetsXLSX} from "@/lib/asset-export";
import {getServerAuthHeaders} from "@/lib/auth-headers";
import {useServerFn} from "@tanstack/react-start";
import { AssetLocationFields } from "@/components/asset-location-fields";
import { loadTenantBranding, BRANDING_CHANGED_EVENT } from "@/lib/branding";
import { GeoHierarchyFilter, type GeoHierarchyPlace } from "@/components/geo-hierarchy-filter";

export const Route = createFileRoute("/_app/assets")({
  component: AssetsPage,
  validateSearch: (s: Record<string, unknown>) => ({
    focus: typeof s.focus === "string" ? s.focus : undefined,
    location: typeof s.location === "string" ? s.location : undefined,
    geo: typeof s.geo === "string" || typeof s.geo === "number" ? String(s.geo) : undefined,
    branch: typeof s.branch === "string" ? s.branch : undefined,
    located: s.located === "1" || s.located === 1 ? "1" : undefined,
    unlocated: s.unlocated === "1" || s.unlocated === 1 ? "1" : undefined,
  }),
});

type Status = "in_use" | "in_storage" | "under_repair" | "retired" | "missing" | "disposed";
const STATUS_LABEL: Record<Status, string> = {
  in_use: "In use", in_storage: "In storage", under_repair: "Under repair",
  retired: "Retired", missing: "Missing", disposed: "Disposed",
};
const STATUS_TONE: Record<Status, string> = {
  in_use: "bg-success/15 text-success",
  in_storage: "bg-secondary text-secondary-foreground",
  under_repair: "bg-warning/20 text-warning-foreground",
  retired: "bg-muted text-muted-foreground",
  missing: "bg-destructive/15 text-destructive",
  disposed: "bg-muted text-muted-foreground line-through",
};

interface AssetForm {
  id?: string;
  asset_tag: string;
  serial_number: string;
  name: string;
  description: string;
  category_id: string | null;
  location_id: string | null;
  branch_id: string | null;
  geo_place_id: number | null;
  location_latitude: string;
  location_longitude: string;
  location_accuracy_m: string;
  location_source: string;
  status: Status;
  purchase_value: string;
  purchase_date: string;
  // Inline custodian (only used on create)
  assigned_to_name: string;
  department: string;
  // Depreciation
  depreciation_method: string;
  useful_life_months: string;
  residual_value: string;
  depreciation_start_date: string;
  depreciation_frequency: string;
  total_units: string;
}

const empty: AssetForm = {
  asset_tag: "", serial_number: "", name: "", description: "",
  category_id: null, location_id: null, branch_id: null,
  geo_place_id: null, location_latitude: "", location_longitude: "", location_accuracy_m: "", location_source: "manual",
  status: "in_storage",
  purchase_value: "", purchase_date: "",
  assigned_to_name: "", department: "",
  depreciation_method: "", useful_life_months: "", residual_value: "",
  depreciation_start_date: "", depreciation_frequency: "monthly", total_units: "",
};

function AssetsPage() {
  const { canWrite, isAdmin, user, canDo, canSeeBranch, canView, tenantId } = useAuth();
  const [companyLogo,setCompanyLogo]=useState<string|null>(null);
  useEffect(()=>{
    if(!tenantId){setCompanyLogo(null);return;}
    let active=true;
    const refresh=()=>loadTenantBranding(tenantId).then(t=>{if(active)setCompanyLogo(t.logo_data_url||null)}).catch(()=>{});
    void refresh();
    const onChange=(event:Event)=>{const template=(event as CustomEvent).detail;if(template?.logo_data_url!==undefined)setCompanyLogo(template.logo_data_url);else void refresh();};
    window.addEventListener(BRANDING_CHANGED_EVENT,onChange);
    return ()=>{active=false;window.removeEventListener(BRANDING_CHANGED_EVENT,onChange)};
  },[tenantId]);

  const canAdd = canWrite || canDo("add_asset");
  const canEdit = canWrite || canDo("edit_asset");
  const canRequestRetire = canWrite || canDo("initiate_retirement");
  const canRequestDispose = canWrite || canDo("initiate_disposal");
  const canRequestMove = canWrite || canDo("initiate_movement");
  const canRequestMaint = canWrite || canDo("initiate_maintenance");
  const canRequestDelete = canDo("request_asset_deletion") || isAdmin;
  const canManageDepreciation = canView("depreciation") &&
    (canWrite || canDo("manage_depreciation") || canDo("override_depreciation"));
  const qc = useQueryClient();
  const search = useSearch({ from: "/_app/assets" });
  const nav = useNavigate();

  const [q, setQ] = useState("");
  const [fBranch, setFBranch] = useState("");
  const [fCategory, setFCategory] = useState("");
  const [fLocation, setFLocation] = useState("");
  const [fGeo, setFGeo] = useState("");
  const [fStatus, setFStatus] = useState("");
  const [fDept, setFDept] = useState("");
  const [locationFiltersOpen, setLocationFiltersOpen] = useState(false);
  const [geoSelection, setGeoSelection] = useState<GeoHierarchyPlace|null>(null);

  const catalogFn=useServerFn(getRegisterCatalog);
  const {data:catalog,refetch:refreshRegisterCatalog,isPending:registerCatalogPending,error:registerCatalogError}=useQuery({queryKey:["register-catalog",tenantId],enabled:!!tenantId,staleTime:0,refetchOnMount:"always",queryFn:async()=>catalogFn({headers:await getServerAuthHeaders()})});
  const [registerChoice,setRegisterChoice]=useState("default");
  const [registerPreview,setRegisterPreview]=useState<string|null>(null);
  const [uploadingField,setUploadingField]=useState<string|null>(null);
  const [importBranchId,setImportBranchId]=useState("");
  const [customValues,setCustomValues]=useState<Record<string,string>>({});
  const registers=(catalog?.definitions??[]) as Array<{id:string,name:string,configuration:{fields?:Array<{key:string,label:string,type:string,required:boolean,options?:string[],section?:string}>,tag_policy?:string}} >;
  const registerFields=registers.find(r=>r.id===registerChoice)?.configuration?.fields??[];
  const sectionForField=(field:{section?:string,label:string,key:string})=>{
    if(field.section==="assignment"||field.section==="assign")return "assignment";
    if(field.section==="identify")return "classify";
    if(["classify","location"].includes(field.section||""))return field.section!;
    return "classify";
  };
  const fieldsInStep=(step:number)=>registerFields.filter(f=>sectionForField(f)===(["identify","classify","location","assignment"][step]||""));

  useEffect(()=>{if(catalog)setRegisterChoice(catalog.primaryId??"default");},[catalog]);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<AssetForm>(empty);
  const [wizardStep, setWizardStep] = useState(0);
  const [financialOpen, setFinancialOpen] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [scanMode, setScanMode] = useState<"lookup" | "tag" | "serial">("lookup");
  const [dupOpen, setDupOpen] = useState(false);
  const [dupAsset, setDupAsset] = useState<any>(null);
  const [retireOpen, setRetireOpen] = useState(false);
  const [retireAsset, setRetireAsset] = useState<any>(null);
  const [retireReason, setRetireReason] = useState("");
  const [viewOpen, setViewOpen] = useState(false);
  const [viewAsset, setViewAsset] = useState<any>(null);
  const [viewTab, setViewTab] = useState<string>("activity");
  const openView = (a: any, tab: string = "activity") => { setViewAsset(a); setViewTab(tab); setViewOpen(true); };


  const { data: assets = [], isLoading } = useQuery({
    queryKey: ["assets"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("assets")
        .select("*, categories(name), locations(name,parent_id), branches(name,code), geo_places!assets_geo_place_id_fkey(geoname_id,name,display_path,country_code)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
  const { data: categories = [] } = useQuery({
    queryKey: ["categories-list"],
    queryFn: async () => (await supabase.from("categories").select("id,name").order("name")).data ?? [],
  });
  const { data: locations = [] } = useQuery({
    queryKey: ["locations-list"],
    queryFn: async () => (await (supabase as any).from("locations").select("id,name,is_active,branch_id,geo_place_id,location_type,is_structured,parent_id").eq("is_active", true).order("name")).data ?? [],
  });
  const { data: selectedGeo } = useQuery({
    queryKey: ["selected-geo-filter", search.geo],
    enabled: !!search.geo,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("geo_places")
        .select("geoname_id,name,display_path,feature_class,feature_code,admin_level,parent_geoname_id,country_code")
        .eq("geoname_id", Number(search.geo))
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const locationFilterIds = useMemo(() => {
    if (!fLocation) return new Set<string>();
    const children = new Map<string, string[]>();
    for (const loc of locations as any[]) {
      if (!loc.parent_id) continue;
      const list = children.get(loc.parent_id) ?? [];
      list.push(loc.id);
      children.set(loc.parent_id, list);
    }
    const ids = new Set<string>([fLocation]);
    const visit = (id: string) => {
      for (const child of children.get(id) ?? []) {
        if (ids.has(child)) continue;
        ids.add(child);
        visit(child);
      }
    };
    visit(fLocation);
    return ids;
  }, [locations, fLocation]);

  const { data: branches = [] } = useQuery({
    queryKey: ["branches-active"],
    queryFn: async () => (await supabase.from("branches").select("id,name,code,is_active").eq("is_active", true).order("name")).data ?? [],
  });
  const { data: locationSettings } = useQuery({
    queryKey: ["tenant-location-settings", tenantId],
    enabled: !!tenantId,
    queryFn: async () => (await (supabase as any).from("tenant_location_settings").select("*").eq("tenant_id", tenantId).maybeSingle()).data,
  });
  const { data: geoCountries = [] } = useQuery({
    queryKey: ["asset-filter-geo-countries"],
    queryFn: async () => (await (supabase as any).from("geo_countries").select("code,name").eq("enabled",true).order("name")).data ?? [],
  });
  const assetFilterCountries = useMemo(()=>{
    const codes=new Set<string>();
    const allowed=(locationSettings as any)?.allowed_country_codes as string[]|undefined;
    const fallback=(locationSettings as any)?.default_country_code as string|undefined;
    for(const code of allowed ?? []) codes.add(code);
    if(fallback) codes.add(fallback);
    for(const asset of assets as any[]) {
      if(asset.geo_places?.country_code) codes.add(asset.geo_places.country_code);
    }
    if(!codes.size) return geoCountries as any[];
    return (geoCountries as any[]).filter((c:any)=>codes.has(c.code));
  },[geoCountries,locationSettings,assets]);
  // Pull current assignments (latest per asset) for custodian/department display & filters
  const { data: assignments = [] } = useQuery({
    queryKey: ["asset-assignments-current"],
    queryFn: async () => (await supabase.from("asset_assignments")
      .select("asset_id, assigned_to_name, department, assignment_date")
      .order("assignment_date", { ascending: false })).data ?? [],
  });
  const currentBy: Record<string, any> = useMemo(() => {
    const m: Record<string, any> = {};
    assignments.forEach((a: any) => { if (!m[a.asset_id]) m[a.asset_id] = a; });
    return m;
  }, [assignments]);

  useEffect(() => {
    if (search.location) setFLocation(search.location);
    if (search.geo) setFGeo(search.geo);
    if (search.branch) setFBranch(search.branch);
  }, [search.location, search.geo, search.branch]);
  useEffect(() => {
    if (selectedGeo) setGeoSelection(selectedGeo as GeoHierarchyPlace);
    if (search.location || search.geo) setLocationFiltersOpen(true);
  }, [selectedGeo, search.location, search.geo]);

  const visibleBranches = useMemo(
    () => (branches as any[]).filter((b) => canSeeBranch(b.id)),
    [branches, canSeeBranch],
  );

  const visibleOrganisationLocations = useMemo(
    () => (locations as any[]).filter((l:any)=>!fBranch || !l.branch_id || l.branch_id===fBranch),
    [locations,fBranch],
  );
  const organisationLocationLabel = (loc:any) => {
    const byId = new Map((locations as any[]).map((x:any)=>[x.id,x]));
    const names:string[]=[];
    let current:any=loc;
    const seen=new Set<string>();
    while(current && !seen.has(current.id)){
      seen.add(current.id);
      names.unshift(current.name);
      current=current.parent_id ? byId.get(current.parent_id) : null;
    }
    return names.join(" / ");
  };

  const enriched = useMemo(() => (assets as any[])
    .filter((a) => canSeeBranch(a.branch_id))
    .map((a) => ({
      ...a,
      custodian: currentBy[a.id]?.assigned_to_name ?? "",
      department: currentBy[a.id]?.department ?? "",
    })), [assets, currentBy, canSeeBranch]);

  const filtered = enriched.filter((a) => {
    if(registerChoice!=="default"&&a.register_definition_id!==registerChoice)return false;
    if (q) {
      const needle = q.toLowerCase();
      const hit = [a.name, a.asset_tag, a.serial_number, a.custodian, a.department, a.locations?.name, a.geo_places?.name, a.geo_places?.display_path]
        .some((v) => (v ?? "").toString().toLowerCase().includes(needle));
      if (!hit) return false;
    }
    if (fBranch && a.branch_id !== fBranch) return false;
    if (fCategory && a.category_id !== fCategory) return false;
    if (fLocation && (!a.location_id || !locationFilterIds.has(a.location_id))) return false;
    if (fGeo) {
      const targetPath = (selectedGeo as any)?.display_path;
      const assetPath = a.geo_places?.display_path;
      const exact = String(a.geo_place_id ?? "") === fGeo;
      const descendant = targetPath && assetPath ? String(assetPath).includes(String(targetPath)) : false;
      if (!exact && !descendant) return false;
    }
    if (search.located === "1" && !a.location_id && !a.geo_place_id) return false;
    if (search.unlocated === "1" && (a.location_id || a.geo_place_id)) return false;
    if (fStatus && a.status !== fStatus) return false;
    if (fDept && !(a.department ?? "").toLowerCase().includes(fDept.toLowerCase())) return false;
    return true;
  }).sort((a,b)=>{
    const extract=(tag:string)=>{const m=String(tag??"").match(/(\\d+)$/);return m?Number(m[1]):null};
    const first=extract(a.asset_tag),second=extract(b.asset_tag);
    if(first!==null&&second!==null&&first!==second)return first-second;
    return String(a.asset_tag??"").localeCompare(String(b.asset_tag??""),undefined,{numeric:true,sensitivity:"base"});
  });

  const clearFilters = () => {
    setQ(""); setFBranch(""); setFCategory(""); setFLocation(""); setFGeo(""); setFStatus(""); setFDept(""); setGeoSelection(null);
    nav({ to: "/assets", search: {} as any, replace: true });
  };

  const openNew = async () => { const result=await refreshRegisterCatalog();if(result.error||!result.data){toast.error("Cannot load your company register. Try again.");return;}const preferred=result.data.primaryId??"default";if(preferred!=="default"&&!result.data.definitions.some((d:any)=>d.id===preferred)){toast.error("Your active register is unavailable. Please contact your administrator.");return;}setRegisterChoice(preferred);setCustomValues({});setForm({...empty,branch_id:visibleBranches.length===1?visibleBranches[0].id:null});setWizardStep(0);setFinancialOpen(false);setOpen(true); };
  const openEdit = (a: any) => {
    setRegisterChoice(a.register_definition_id??"default");
    setCustomValues(Object.fromEntries(Object.entries(a.custom_fields??{}).map(([k,v])=>[k,String(v??"")])));
    setForm({
      id: a.id, asset_tag: a.asset_tag, serial_number: a.serial_number ?? "",
      name: a.name, description: a.description ?? "",
      category_id: a.category_id, location_id: a.location_id, branch_id: a.branch_id,
      geo_place_id: a.geo_place_id ?? null,
      location_latitude: a.location_latitude?.toString() ?? "",
      location_longitude: a.location_longitude?.toString() ?? "",
      location_accuracy_m: a.location_accuracy_m?.toString() ?? "",
      location_source: a.location_source ?? "manual",
      status: a.status,
      purchase_value: a.purchase_value?.toString() ?? "",
      purchase_date: a.purchase_date ?? "",
      assigned_to_name: "", department: "",
      depreciation_method: a.depreciation_method ?? "",
      useful_life_months: a.useful_life_months?.toString() ?? "",
      residual_value: a.residual_value?.toString() ?? "",
      depreciation_start_date: a.depreciation_start_date ?? "",
      depreciation_frequency: a.depreciation_frequency ?? "monthly",
      total_units: a.total_units?.toString() ?? "",
    });
    setWizardStep(0);
    setFinancialOpen(false);
    setOpen(true);
  };

  // Auto-open the asset from ?focus= query
  useEffect(() => {
    if (!search.focus || assets.length === 0) return;
    const a = (assets as any[]).find((x) => x.id === search.focus);
    if (a) {
      openEdit(a);
      nav({ to: "/assets", search: {}, replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.focus, assets]);

  const handleScan = (text: string) => {
    const code = text.trim();
    if (!code) return;
    if (scanMode === "tag" || scanMode === "serial") {
      const existing = (assets as any[]).find((a) =>
        ((a.asset_tag??"").toLowerCase() === code.toLowerCase() ||
         (a.serial_number ?? "").toLowerCase() === code.toLowerCase()) &&
        a.id !== form.id
      );
      if (existing) { setDupAsset(existing); setDupOpen(true); return; }
      if (scanMode === "tag") setForm((f) => ({ ...f, asset_tag: code }));
      else setForm((f) => ({ ...f, serial_number: code }));
      toast.success(`${scanMode === "tag" ? "Tag" : "Serial"} scanned: ${code}`);
      return;
    }
    const found = (assets as any[]).find((a) =>
      (a.asset_tag??"").toLowerCase() === code.toLowerCase() ||
      (a.serial_number ?? "").toLowerCase() === code.toLowerCase()
    );
    if (found) {
      openEdit(found);
      toast.success(`Asset found: ${found.name}`);
    } else if (canAdd) {
      setForm({ ...empty, asset_tag: code });
      setOpen(true);
      toast.message("New tag detected", { description: "Fill in details to register this asset." });
    } else {
      toast.error(`No asset matches "${code}"`);
    }
  };

  const recordLocationEvent = async (assetId: string, eventType: string, notes?: string) => {
    if (!tenantId) return;
    const { error } = await (supabase as any).from("asset_location_events").insert({
      tenant_id: tenantId,
      asset_id: assetId,
      location_id: form.location_id,
      geo_place_id: form.geo_place_id,
      latitude: form.location_latitude ? Number(form.location_latitude) : null,
      longitude: form.location_longitude ? Number(form.location_longitude) : null,
      gps_accuracy_m: form.location_accuracy_m ? Number(form.location_accuracy_m) : null,
      source: form.location_source || "manual",
      event_type: eventType,
      notes: notes || null,
      recorded_by: user?.id ?? null,
      recorded_at: new Date().toISOString(),
    });
    if (error) console.error("Unable to record asset location event", error);
  };

  const save = async (saveAndNext = false) => {
    if (saving) return;
    if(registerCatalogPending||registerCatalogError||!catalog){toast.error("The business register has not loaded. Please retry.");return;}
    const customRegister=registerChoice!=="default";
    const normalizeField=(v:string)=>v.toLowerCase().replace(/[^a-z0-9]/g,"");
    const findCustom=(aliases:string[])=>aliases.map(alias=>registerFields.find(f=>normalizeField(f.label)===alias||normalizeField(f.key)===alias)).find(Boolean);
    const tagField=findCustom(["tagnumber","assettag","tag","tagno"]);
    const nameField=findCustom(["assetname","name","itemname","itemdescription","itemcode"]);
    const resolvedCustomValues={...customValues};
    const existingCategory=(categories as any[]).find(c=>c.id===form.category_id)?.name||"";
    const existingLocation=(locations as any[]).find(l=>l.id===form.location_id)?.name||"";
    const existingBranch=(visibleBranches as any[]).find(b=>b.id===form.branch_id)?.name||"";
    for(const field of registerFields){
      if(String(resolvedCustomValues[field.key]??"").trim())continue;
      const normalized=normalizeField(field.label||field.key);
      const match:Record<string,string>={
        assetname:form.name,itemname:form.name,name:form.name,
        serialnumber:form.serial_number,manufacturerserial:form.serial_number,
        description:form.description,assetdescription:form.description,
        category:existingCategory,location:existingLocation,branch:existingBranch,
        purchasevalue:form.purchase_value,purchasevalueugx:form.purchase_value,
        purchasedate:form.purchase_date,department:form.department,custodian:form.assigned_to_name
      };
      if(match[normalized])resolvedCustomValues[field.key]=match[normalized];
    }
    const enteredTag=tagField?String(resolvedCustomValues[tagField.key]??"").trim():"";
    const enteredName=nameField?String(resolvedCustomValues[nameField.key]??"").trim():String(Object.values(resolvedCustomValues).find(v=>String(v).trim())??"").trim();
    const effectiveTag=form.asset_tag.trim()||enteredTag||null;
    const effectiveName=customRegister?(enteredName||form.name.trim()||enteredTag||"Registered asset"):form.name.trim();
    if(!effectiveName){toast.error("Enter an asset name or item description.");return;}
    if(customRegister&&registers.find(r=>r.id===registerChoice)?.configuration?.tag_policy==="required"&&!effectiveTag){toast.error("This register requires a physical asset tag.");return;}

    if (locationSettings?.require_branch && !form.branch_id) { toast.error("Branch is required"); return; }
    if (locationSettings?.require_geography && !form.geo_place_id) { toast.error("Geographic area is required"); return; }
    if (locationSettings?.require_internal_location && !form.location_id) { toast.error("Office, store or site is required"); return; }
    if (locationSettings?.require_gps && (!form.location_latitude || !form.location_longitude)) { toast.error("GPS capture is required"); return; }

    for(const field of registerFields){const value=String(resolvedCustomValues[field.key]??"").trim();if(field.required&&!value&&field.key!==tagField?.key){toast.error(`${field.label} is required`);return;}if(value&&(field.type==="number"||field.type==="currency")&&!Number.isFinite(Number(value))){toast.error(`${field.label} must be a valid number`);return;}if(value&&["select","radio"].includes(field.type)&&field.options?.length&&!field.options.includes(value)){toast.error(`${field.label} has an invalid option`);return;}}
    const tagLower = (effectiveTag??"").toLowerCase();
    const serialLower = form.serial_number.trim().toLowerCase();
    const dup = (assets as any[]).find((a) =>
      a.id !== form.id && (
        (!!tagLower && (a.asset_tag??"").toLowerCase() === tagLower) ||
        (serialLower && (a.serial_number ?? "").toLowerCase() === serialLower)
      )
    );
    if (dup) { setDupAsset(dup); setDupOpen(true); return; }

    const payload: any = {
      register_definition_id:registerChoice==="default"?null:registerChoice,
      custom_fields:{...resolvedCustomValues,...Object.fromEntries(registerFields.map(field=>{const raw=resolvedCustomValues[field.key]??"";return [field.key,!raw?null:field.type==="number"||field.type==="currency"?Number(raw):field.type==="boolean"?raw==="true":raw];}))},
      asset_tag: effectiveTag,
      serial_number: form.serial_number.trim() || null,
      name: effectiveName,
      description: form.description || null,
      category_id: form.category_id,
      location_id: form.location_id,
      branch_id: form.branch_id,
      geo_place_id: form.geo_place_id,
      location_latitude: form.location_latitude ? Number(form.location_latitude) : null,
      location_longitude: form.location_longitude ? Number(form.location_longitude) : null,
      location_accuracy_m: form.location_accuracy_m ? Number(form.location_accuracy_m) : null,
      location_source: form.location_source || "manual",
      location_verified_at: form.location_latitude && form.location_longitude ? new Date().toISOString() : null,
      location_verified_by: form.location_latitude && form.location_longitude ? user?.id ?? null : null,
      status: form.status,
      purchase_value: form.purchase_value ? Number(form.purchase_value) : null,
      purchase_date: form.purchase_date || null,
    };
    // Users without depreciation access must never be blocked by, or alter,
    // depreciation configuration while carrying out normal asset activity.
    if (canManageDepreciation) {
      if (form.depreciation_method) {
        Object.assign(payload, {
          depreciation_method: form.depreciation_method,
          useful_life_months: form.useful_life_months ? Number(form.useful_life_months) : null,
          residual_value: form.residual_value ? Number(form.residual_value) : 0,
          depreciation_start_date: form.depreciation_start_date || null,
          depreciation_frequency: form.depreciation_frequency || "monthly",
          total_units: form.total_units ? Number(form.total_units) : null,
        });
        if (payload.purchase_value && payload.residual_value >= payload.purchase_value) {
          toast.error("Residual value must be less than purchase value"); return;
        }
        if (payload.useful_life_months !== null && payload.useful_life_months <= 0) {
          toast.error("Useful life must be greater than 0"); return;
        }
      } else {
        // Explicitly selecting None disables depreciation without requiring any
        // of its supporting values.
        Object.assign(payload, {
          depreciation_method: null,
          useful_life_months: null,
          residual_value: 0,
          depreciation_start_date: null,
          depreciation_frequency: "monthly",
          total_units: null,
        });
      }
    }

    setSaving(true);
    try {
      if (form.id) {
        const previous: any = (assets as any[]).find((a) => a.id === form.id);
        const { error } = await supabase.from("assets").update(payload).eq("id", form.id);
        if (error) { toast.error(error.message); return; }
        const locationChanged =
          previous?.location_id !== form.location_id ||
          previous?.geo_place_id !== form.geo_place_id ||
          Number(previous?.location_latitude ?? 0) !== Number(form.location_latitude || 0) ||
          Number(previous?.location_longitude ?? 0) !== Number(form.location_longitude || 0);
        if (locationChanged) await recordLocationEvent(form.id, "updated", "Asset location updated from the asset register.");
        toast.success("Asset updated");
      } else {
        const { data: created, error } = await supabase
          .from("assets").insert({ ...payload, created_by: user?.id ?? null }).select().single();
        if (error || !created) { toast.error(error?.message ?? "Failed"); return; }
        if (form.location_id || form.geo_place_id || (form.location_latitude && form.location_longitude)) {
          await recordLocationEvent(created.id, "registered", "Initial asset location recorded during registration.");
        }
        // Assignment is secondary activity: a failure must not disguise a
        // successfully created asset, but it must be made visible to the user.
        if (form.assigned_to_name.trim() || form.department.trim()) {
          const { error: assignmentError } = await supabase.from("asset_assignments").insert({
            asset_id: created.id,
            assigned_to_name: form.assigned_to_name.trim() || null,
            department: form.department.trim() || null,
            branch_id: form.branch_id,
            assignment_date: new Date().toISOString().slice(0, 10),
            created_by: user?.id ?? null,
          });
          if (assignmentError) {
            toast.warning("Asset created, but custodian assignment failed", { description: assignmentError.message });
          } else {
            toast.success("Asset created");
          }
        } else {
          toast.success("Asset created");
        }
      }
      if (!form.id && saveAndNext) {
        setCustomValues({});
        setForm((previous) => ({
          ...empty,
          category_id: previous.category_id,
          branch_id: previous.branch_id,
          location_id: previous.location_id,
          geo_place_id: previous.geo_place_id,
          status: previous.status,
          department: previous.department,
        }));
        setWizardStep(0);
        setFinancialOpen(false);
        toast.message("Ready for the next asset");
      } else {
        setOpen(false);
        setWizardStep(0);
      }
      qc.invalidateQueries({ queryKey: ["assets"] });
      qc.invalidateQueries({ queryKey: ["asset-assignments-current"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] }); qc.invalidateQueries({ queryKey: ["tile-assets"] });
    } finally {
      setSaving(false);
    }
  };

  const wizardSteps = [
    { title: "Details", short: "Details" },
    { title: "Classification", short: "Classify" },
    { title: "Location", short: "Location" },
    { title: "Assignment & Value", short: "Assign" },
    { title: "Review", short: "Review" },
  ];

  const displayedSteps=registerChoice==="default"?wizardSteps:[wizardSteps[0],wizardSteps[4]];
  const validateWizardStep = (step: number) => {
    if (step === 0) {
      if (!form.asset_tag.trim()&&registers.find(r=>r.id===registerChoice)?.configuration?.tag_policy==="required") { toast.error("An asset tag is required for this register"); return false; }
      if (!form.name.trim()) { toast.error("Asset name is required"); return false; }
      const tagLower = form.asset_tag.trim().toLowerCase();
      const serialLower = form.serial_number.trim().toLowerCase();
      const duplicate = (assets as any[]).find((a) =>
        a.id !== form.id && (
          (!!tagLower && (a.asset_tag??"").toLowerCase() === tagLower) ||
          (serialLower && (a.serial_number ?? "").toLowerCase() === serialLower)
        )
      );
      if (duplicate) { setDupAsset(duplicate); setDupOpen(true); return false; }
    }
    if (step === 2) {
      if (locationSettings?.require_branch && !form.branch_id) { toast.error("Select a branch to continue"); return false; }
      if (locationSettings?.require_geography && !form.geo_place_id) { toast.error("Select the geographic area to continue"); return false; }
      if (locationSettings?.require_internal_location && !form.location_id) { toast.error("Select the office, store or site to continue"); return false; }
      if (locationSettings?.require_gps && (!form.location_latitude || !form.location_longitude)) { toast.error("Capture GPS to continue"); return false; }
    }
    return true;
  };

  const nextWizardStep = () => {
    if(registerChoice!=="default"){for(const field of registerFields){const value=String(customValues[field.key]??"").trim();const label=(field.label||field.key).toLowerCase().replace(/[^a-z0-9]/g,"");if(field.required&&!value&&!["tagnumber","assettag","tag"].includes(label)){toast.error(`${field.label} is required`);return;}}}
    if(registerChoice==="default"&&!validateWizardStep(wizardStep)) return;
    setWizardStep((step) => registerChoice==="default"?Math.min(step+1,wizardSteps.length-1):4);
  };

  const reviewCategory = (categories as any[]).find((c) => c.id === form.category_id)?.name ?? "Not specified";
  const reviewBranch = (visibleBranches as any[]).find((b) => b.id === form.branch_id)?.name ?? "Not specified";
  const reviewLocation = (locations as any[]).find((l) => l.id === form.location_id)?.name ?? (form.geo_place_id ? "Geographic area selected" : "Not specified");

  const [reqKind, setReqKind] = useState<"retirement" | "disposal" | "deletion" | null>(null);
  const [requestSubmitting, setRequestSubmitting] = useState(false);
  const [selectedAssetIds,setSelectedAssetIds]=useState<string[]>([]);
  const [bulkDeleteOpen,setBulkDeleteOpen]=useState(false);
  const [bulkDeleteReason,setBulkDeleteReason]=useState("");
  const [bulkBusy,setBulkBusy]=useState(false);
  const requestBulkDeletion=async()=>{
    if(bulkDeleteReason.trim().length<10){toast.error("Enter a reason of at least 10 characters.");return;}
    if(!selectedAssetIds.length)return;
    setBulkBusy(true);let success=0;const failed:string[]=[];
    for(const id of selectedAssetIds){
      try{await submitApproval({kind:"deletion",assetId:id,reason:bulkDeleteReason.trim()});success++;}
      catch(e:any){failed.push(id);}
    }
    setSelectedAssetIds(failed);
    setBulkBusy(false);setBulkDeleteOpen(false);setBulkDeleteReason("");
    qc.invalidateQueries({queryKey:["pending-approvals"]});qc.invalidateQueries({queryKey:["notifications"]});
    if(success)toast.success(success+" deletion requests submitted for approval.");
    if(failed.length)toast.error(failed.length+" requests failed; unsuccessful items remain selected.");
  };
  const requestRetire = (a: any, kind: "retirement" | "disposal" | "deletion" = "retirement") => { setRetireAsset(a); setRetireReason(""); setReqKind(kind); setRetireOpen(true); };
  const submitRetire = async () => {
    if (requestSubmitting) return;
    if (!retireReason.trim()) { toast.error("Reason is required"); return; }
    setRequestSubmitting(true);
    try {
      await submitApproval({ kind: reqKind ?? "retirement", assetId: retireAsset.id, reason: retireReason.trim() });
      setRetireOpen(false);
      qc.invalidateQueries({ queryKey: ["pending-approvals"] });
      qc.invalidateQueries({ queryKey: ["notifications"] });
    } catch (e: any) {
      toast.error(e?.code === "23505" ? "A request for this asset is already pending" : e?.message ?? "Failed");
    } finally {
      setRequestSubmitting(false);
    }
  };

  const removeAsset = async (a: any) => {
    requestRetire(a, "deletion");
  };

  const [importing, setImporting] = useState(false);
  const onImport = async (f: File) => {
    setImporting(true);
    try {
      if(registerCatalogPending||registerCatalogError||!catalog)throw new Error("The company register has not finished loading.");
      if(registerChoice!=="default"&&visibleBranches.length>1&&!importBranchId)throw new Error("Choose the destination branch before importing.");
      const r = await importAssetsFromFile(f, user?.id ?? null,registers.find(r=>r.id===registerChoice),importBranchId||undefined,locationSettings as any);
      if(r.success===0){toast.error(`No assets imported. ${r.errors[0]?.error??"Check the selected register and spreadsheet."}`);return;}
      toast.success(`Imported ${r.success} of ${r.total} rows`, { description: r.errors.length ? `${r.errors.length} rows failed. First error (row ${r.errors[0].row}): ${r.errors[0].error}` : undefined });
      qc.invalidateQueries({ queryKey: ["assets"] });
    } catch (e: any) { toast.error(e?.message ?? "Import failed"); }
    finally { setImporting(false); }
  };

  return (
    <div className="space-y-6">
      <Card className="space-y-3 p-4"><div><h2 className="text-base font-semibold">Asset register catalog</h2><p className="text-xs text-muted-foreground">Open a register to view its assets or preview its column layout before using it.</p></div><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{[{id:"default",name:"Default asset register",configuration:{fields:[] as any[]} },...registers].map(r=><div key={r.id} className="rounded-lg border p-3"><p className="font-medium">{r.name}</p><p className="mb-2 text-xs text-muted-foreground">{r.id==="default"?"System register":(r.configuration.fields?.length??0)+" custom fields"}</p><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={()=>setRegisterChoice(r.id)}>Open</Button><Button size="sm" variant="outline" onClick={()=>setRegisterPreview(r.id)}>Preview</Button>{canView("register_builder")&&r.id!=="default"&&<Button size="sm" variant="ghost" asChild><Link to="/builders" search={{type:"register_builder"}}>Edit</Link></Button>}</div></div>)}</div></Card>
      {canView("register_builder") && <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card px-4 py-3"><div><p className="text-sm font-medium">Missing columns in your asset register?</p><p className="text-xs text-muted-foreground">Build a named custom register, preview its Excel columns and download its template. Your default register is retained.</p></div><Button asChild size="sm" variant="outline"><Link to="/builders" search={{type:"register_builder"}}>Customize register</Link></Button></div>}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Assets</h1>
          <p className="text-sm text-muted-foreground">Manage your organization's fixed assets. Assets are retired (with admin approval), never deleted.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Select value={registerChoice} onValueChange={setRegisterChoice}><SelectTrigger className="w-52"><SelectValue placeholder="Select register"/></SelectTrigger><SelectContent><SelectItem value="default">Default register</SelectItem>{registers.map(r=><SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}</SelectContent></Select>
          <Button variant="outline" onClick={() => { setScanMode("lookup"); setScanOpen(true); }}>
            <ScanLine className="mr-2 h-4 w-4" /> Scan
          </Button>
          <Button variant="outline" disabled={registerCatalogPending||!!registerCatalogError} onClick={()=>exportAssetsXLSX(registers.find(r=>r.id===registerChoice)?.name??"Default Asset Register", (assets as any[]).filter(a=>registerChoice==="default"||a.register_definition_id===registerChoice),registerFields,locationSettings as any)} title="Export assets for selected register"><Download className="mr-2 h-4 w-4"/> Export register</Button>
          <Button variant="outline" disabled={registerCatalogPending||!!registerCatalogError} onClick={()=>downloadTemplate(registers.find(r=>r.id===registerChoice),locationSettings as any)} title="Download Excel import template">
            <Download className="mr-2 h-4 w-4" /> Template
          </Button>
          {canAdd&&registerChoice!=="default"&&visibleBranches.length>1&&<Select value={importBranchId||"choose"} onValueChange={v=>setImportBranchId(v==="choose"?"":v)}><SelectTrigger className="w-52"><SelectValue placeholder="Import into branch"/></SelectTrigger><SelectContent><SelectItem value="choose">Choose import branch</SelectItem>{visibleBranches.map(branch=><SelectItem key={branch.id} value={branch.id}>{branch.name}</SelectItem>)}</SelectContent></Select>}
          {canAdd && (
            <label className="inline-flex">
              <input type="file" accept=".xlsx,.xls" className="hidden" disabled={importing||registerCatalogPending||!!registerCatalogError}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) onImport(f); e.target.value = ""; }} />
              <Button variant="outline" disabled={importing} type="button" asChild>
                <span><Upload className="mr-2 h-4 w-4" /> {importing ? "Importing…" : "Import"}</span>
              </Button>
            </label>
          )}
          {canAdd && (
          <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) setWizardStep(0); }}>
            <Button onClick={openNew} disabled={registerCatalogPending}><Plus className="mr-2 h-4 w-4" /> {registerCatalogPending?"Loading register…":"New asset"}</Button>
            <DialogContent className="flex max-h-[92vh] max-w-3xl flex-col overflow-hidden p-0">
              <DialogHeader className="border-b px-5 pb-4 pt-5 sm:px-6">
                {companyLogo && <div className="mb-2 flex justify-start"><img src={companyLogo} alt="Company logo" className="h-14 w-auto max-w-[210px] object-contain sm:h-16" /></div>}
                <DialogTitle>{form.id ? "Edit asset" : registerChoice!=="default" ? `New ${registers.find(r=>r.id===registerChoice)?.name??"asset"}` : "Register asset"}</DialogTitle>
                <div className="flex flex-wrap items-center gap-2"><Label className="whitespace-nowrap text-xs">Asset register</Label><Select value={registerChoice} onValueChange={v=>{setRegisterChoice(v);setCustomValues({});setWizardStep(0);if(!form.id)setForm({...empty,branch_id:visibleBranches.length===1?visibleBranches[0].id:null})}}><SelectTrigger className="h-9 flex-1"><SelectValue/></SelectTrigger><SelectContent>{(!catalog?.primaryId||!!form.id)&&<SelectItem value="default">Default register</SelectItem>}{registers.map(r=><SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}</SelectContent></Select></div>
                <DialogDescription className="sm:hidden">Step {registerChoice==="default"?wizardStep+1:wizardStep===4?2:1} of {displayedSteps.length} · {wizardSteps[wizardStep].title}</DialogDescription>

                <div className="hidden pt-4 sm:block">
                  <div className="grid grid-cols-5 gap-2">
                    {displayedSteps.map((step, index) => {
                      const displayStepIndex=registerChoice==="default"?wizardStep:(wizardStep===4?1:0);
                      const done = index < displayStepIndex;
                      const active = index === displayStepIndex;
                      return (
                        <button
                          key={step.title}
                          type="button"
                          onClick={() => index <= (registerChoice==="default"?wizardStep:(wizardStep===4?1:0)) && setWizardStep(registerChoice==="default"?index:index===0?0:4)}
                          className={`min-w-0 text-left ${index <= (registerChoice==="default"?wizardStep:(wizardStep===4?1:0)) ? "cursor-pointer" : "cursor-default"}`}
                        >
                          <div className="flex items-center">
                            <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold ${
                              done ? "border-primary bg-primary text-primary-foreground" :
                              active ? "border-primary text-primary" :
                              "border-border text-muted-foreground"
                            }`}>
                              {done ? <Check className="h-3.5 w-3.5" /> : index + 1}
                            </span>
                            {index < displayedSteps.length - 1 && (
                              <span className={`ml-2 h-px flex-1 ${done ? "bg-primary" : "bg-border"}`} />
                            )}
                          </div>
                          <p className={`mt-1 truncate text-xs ${active ? "font-semibold text-foreground" : "text-muted-foreground"}`}>{step.short}</p>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </DialogHeader>

              <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
                {registerChoice==="default" && wizardStep === 0 && (
                  <div className="space-y-5">
                    <div>
                      <h3 className="text-base font-semibold">Identify the asset</h3>
                      <p className="text-sm text-muted-foreground">Capture the unique details used to identify this asset.</p>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="tag">Asset tag (optional unless required by register)</Label>
                        <div className="flex gap-2">
                          <Input id="tag" autoFocus value={form.asset_tag} onChange={(e) => setForm({ ...form, asset_tag: e.target.value })} placeholder="LAP-001" />
                          <Button type="button" size="icon" variant="outline" title="Scan tag" onClick={() => { setScanMode("tag"); setScanOpen(true); }}>
                            <ScanLine className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="serial">Serial number</Label>
                        <div className="flex gap-2">
                          <Input id="serial" value={form.serial_number} onChange={(e) => setForm({ ...form, serial_number: e.target.value })} placeholder="Optional" />
                          <Button type="button" size="icon" variant="outline" title="Scan serial" onClick={() => { setScanMode("serial"); setScanOpen(true); }}>
                            <ScanLine className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                      <div className="space-y-2 sm:col-span-2">
                        <Label htmlFor="name">Asset name *</Label>
                        <Input id="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Dell Latitude 5420" />
                      </div>
                      <div className="space-y-2 sm:col-span-2">
                        <Label htmlFor="desc">Description</Label>
                        <Textarea id="desc" rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Optional notes or identifying details" />
                      </div>
                    </div>
                  </div>
                )}

                {registerChoice==="default" && wizardStep === 1 && (
                  <div className="space-y-5">
                    <div>
                      <h3 className="text-base font-semibold">Classify the asset</h3>
                      <p className="text-sm text-muted-foreground">Choose its category and current operational status.</p>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Category</Label>
                        <Select value={form.category_id ?? "none"} onValueChange={(v) => setForm({ ...form, category_id: v === "none" ? null : v })}>
                          <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Not specified</SelectItem>
                            {categories.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Status</Label>
                        <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as Status })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {Object.entries(STATUS_LABEL).map(([k, v]) => (
                              <SelectItem key={k} value={k} disabled={(k === "retired" || k === "disposed") && !isAdmin}>{v}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                )}

                {registerChoice==="default" && wizardStep === 2 && (
                  <div className="space-y-5">
                    <div>
                      <h3 className="text-base font-semibold">Set the location</h3>
                      <p className="text-sm text-muted-foreground">Only the location fields configured by your organisation are shown.</p>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <AssetLocationFields
                        value={{
                          branch_id: form.branch_id,
                          location_id: form.location_id,
                          geo_place_id: form.geo_place_id,
                          location_latitude: form.location_latitude,
                          location_longitude: form.location_longitude,
                          location_accuracy_m: form.location_accuracy_m,
                          location_source: form.location_source,
                        }}
                        onChange={(location) => setForm((current) => ({ ...current, ...location }))}
                        branches={visibleBranches}
                        locations={locations as any[]}
                      />
                    </div>
                  </div>
                )}

                {registerChoice==="default" && wizardStep === 3 && (
                  <div className="space-y-5">
                    <div>
                      <h3 className="text-base font-semibold">Assignment & value</h3>
                      <p className="text-sm text-muted-foreground">Add ownership and financial details where they are available.</p>
                    </div>

                    {!form.id && (
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label htmlFor="custodian">Custodian</Label>
                          <Input id="custodian" value={form.assigned_to_name} onChange={(e) => setForm({ ...form, assigned_to_name: e.target.value })} placeholder="Full name" />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="dept">Department</Label>
                          <Input id="dept" value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} placeholder="e.g. Finance" />
                        </div>
                      </div>
                    )}

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="val">Purchase value (UGX)</Label>
                        <Input id="val" type="number" min={0} step="1" value={form.purchase_value} onChange={(e) => setForm({ ...form, purchase_value: e.target.value })} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="date">Purchase date</Label>
                        <Input id="date" type="date" value={form.purchase_date} onChange={(e) => setForm({ ...form, purchase_date: e.target.value })} />
                      </div>
                    </div>

                    {canManageDepreciation && (
                      <div className="rounded-xl border">
                        <button type="button" onClick={() => setFinancialOpen((v) => !v)} className="flex w-full items-center justify-between px-4 py-3 text-left">
                          <div>
                            <p className="text-sm font-medium">Depreciation</p>
                            <p className="text-xs text-muted-foreground">Optional financial configuration</p>
                          </div>
                          <ChevronRight className={`h-4 w-4 transition-transform ${financialOpen ? "rotate-90" : ""}`} />
                        </button>
                        {financialOpen && (
                          <div className="grid gap-4 border-t p-4 sm:grid-cols-2">
                            <div className="space-y-2">
                              <Label>Method</Label>
                              <Select value={form.depreciation_method || "none"} onValueChange={(v) => setForm({ ...form, depreciation_method: v === "none" ? "" : v })}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="none">None</SelectItem>
                                  <SelectItem value="straight_line">Straight line</SelectItem>
                                  <SelectItem value="reducing_balance">Reducing balance</SelectItem>
                                  <SelectItem value="units_of_production">Units of production</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            {form.depreciation_method && (
                              <>
                                <div className="space-y-2">
                                  <Label>Frequency</Label>
                                  <Select value={form.depreciation_frequency} onValueChange={(v) => setForm({ ...form, depreciation_frequency: v })}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="monthly">Monthly</SelectItem>
                                      <SelectItem value="quarterly">Quarterly</SelectItem>
                                      <SelectItem value="annually">Annually</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div className="space-y-2">
                                  <Label>Useful life (months)</Label>
                                  <Input type="number" min={1} value={form.useful_life_months} onChange={(e) => setForm({ ...form, useful_life_months: e.target.value })} />
                                </div>
                                <div className="space-y-2">
                                  <Label>Residual value (UGX)</Label>
                                  <Input type="number" min={0} value={form.residual_value} onChange={(e) => setForm({ ...form, residual_value: e.target.value })} />
                                </div>
                                <div className="space-y-2">
                                  <Label>Start date</Label>
                                  <Input type="date" value={form.depreciation_start_date} onChange={(e) => setForm({ ...form, depreciation_start_date: e.target.value })} />
                                </div>
                                {form.depreciation_method === "units_of_production" && (
                                  <div className="space-y-2">
                                    <Label>Total expected units</Label>
                                    <Input type="number" min={0} value={form.total_units} onChange={(e) => setForm({ ...form, total_units: e.target.value })} />
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {registerChoice!=="default" && wizardStep===0&&<div className="space-y-3"><div className="grid gap-4 sm:grid-cols-2">{registerFields.map(field=><div key={field.key} className="space-y-2"><Label>{field.label}{field.required?" *":""}</Label>{field.type==="select"&&field.options?.length?<Select value={customValues[field.key]??""} onValueChange={value=>setCustomValues(v=>({...v,[field.key]:value}))}><SelectTrigger><SelectValue placeholder="Choose"/></SelectTrigger><SelectContent>{field.options.map(option=><SelectItem key={option} value={option}>{option}</SelectItem>)}</SelectContent></Select>:field.type==="radio"&&field.options?.length?<div role="radiogroup" aria-label={field.label} className="flex flex-wrap gap-3">{field.options.map(option=><label key={option} className="flex cursor-pointer items-center gap-2 rounded-lg border p-3 text-sm"><input type="radio" name={`custom-${field.key}`} checked={customValues[field.key]===option} onChange={()=>setCustomValues(v=>({...v,[field.key]:option}))}/>{option}</label>)}</div>:field.type==="attachment"?<label className="block space-y-2">{customValues[field.key]&&<Button type="button" size="sm" variant="outline" onClick={async e=>{e.preventDefault();const {data,error}=await supabase.storage.from("asset-files").createSignedUrl(customValues[field.key],60);if(error||!data?.signedUrl){toast.error(error?.message||"Cannot open attachment");return;}window.open(data.signedUrl,"_blank","noopener,noreferrer")}}>View attachment</Button>}<span className="text-xs text-muted-foreground">{customValues[field.key]?"Attached: "+customValues[field.key].split("/").pop():"PDF or image (max 10 MB)"}</span><Input type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx" disabled={uploadingField===field.key} onChange={async e=>{const file=e.target.files?.[0];if(!file||!tenantId)return;if(file.size>10*1024*1024){toast.error("File must be under 10 MB");return;}setUploadingField(field.key);try{const clean=file.name.replace(/[^a-zA-Z0-9._-]/g,"_");const path=`${tenantId}/custom-register/${crypto.randomUUID()}-${clean}`;const result=await supabase.storage.from("asset-files").upload(path,file,{contentType:file.type||"application/octet-stream",upsert:false});if(result.error)throw result.error;setCustomValues(v=>({...v,[field.key]:path}));toast.success("Attachment uploaded")}catch(error:any){toast.error(error.message||"Attachment upload failed")}finally{setUploadingField(null)}}}/></label>:field.type==="boolean"?<label className="flex min-h-11 items-center gap-3 rounded-lg border p-3"><input type="checkbox" checked={customValues[field.key]==="true"} onChange={e=>setCustomValues(v=>({...v,[field.key]:String(e.target.checked)}))}/><span className="text-sm">Yes</span></label>:<Input className="h-11" type={field.type==="date"?"date":field.type==="number"||field.type==="currency"?"number":field.type==="email"?"email":field.type==="url"?"url":field.type==="phone"?"tel":"text"} value={customValues[field.key]??""} onChange={event=>setCustomValues(v=>({...v,[field.key]:event.target.value}))}/>}</div>)}</div></div>}
                {wizardStep === 4 && (
                  <div className="space-y-5">
                    <div>
                      <h3 className="text-base font-semibold">Review & save</h3>
                      <p className="text-sm text-muted-foreground">Confirm the important details before saving.</p>
                    </div>
                    {registerChoice!=="default"&&<div className="grid gap-2 rounded-xl border p-3">{registerFields.map(field=><div key={field.key} className="flex justify-between gap-3 text-sm"><span>{field.label}</span><span className="font-semibold">{customValues[field.key]||"—"}</span></div>)}</div>}
                    {registerChoice==="default" && <div className="overflow-hidden rounded-xl border">
                      {[
                        ["Asset", form.name || "-"],
                        ["Asset tag", form.asset_tag || "-"],
                        ["Serial number", form.serial_number || "Not specified"],
                        ["Category", reviewCategory],
                        ["Status", STATUS_LABEL[form.status]],
                        ["Branch", reviewBranch],
                        ["Location", reviewLocation],
                        ...(!form.id ? [["Custodian", form.assigned_to_name || "Not assigned"], ["Department", form.department || "Not specified"]] : []),
                        ["Purchase value", form.purchase_value ? formatUGX(Number(form.purchase_value)) : "Not specified"],
                        ["GPS", form.location_latitude && form.location_longitude ? "Captured" : "Not captured"],
                      ].map(([label, value], index) => (
                        <div key={String(label)} className={`grid grid-cols-[130px_1fr] gap-3 px-4 py-3 text-sm ${index ? "border-t" : ""}`}>
                          <span className="text-muted-foreground">{label}</span>
                          <span className="font-medium">{value}</span>
                        </div>
                      ))}
                    </div>}
                  </div>
                )}
              </div>

              <DialogFooter className="border-t bg-background px-5 py-4 sm:justify-between sm:px-6">
                <div className="flex gap-2">
                  <Button type="button" variant="ghost" onClick={() => { setOpen(false); setWizardStep(0); }}>Cancel</Button>
                  {wizardStep > 0 && (
                    <Button type="button" variant="outline" onClick={() => setWizardStep((step) => registerChoice==="default"?Math.max(0,step-1):0)}>
                      <ChevronLeft className="mr-2 h-4 w-4" /> Back
                    </Button>
                  )}
                </div>

                <div className="flex flex-1 justify-end gap-2">
                  {wizardStep < wizardSteps.length - 1 ? (
                    <Button type="button" onClick={nextWizardStep}>
                      Next <ChevronRight className="ml-2 h-4 w-4" />
                    </Button>
                  ) : (
                    <>
                      {!form.id && (
                        <Button type="button" variant="outline" onClick={() => save(true)} disabled={saving}>
                          {saving ? "Saving…" : "Save & add next"}
                        </Button>
                      )}
                      <Button type="button" onClick={() => save(false)} disabled={saving}>
                        {saving ? "Saving…" : form.id ? "Save changes" : "Save asset"}
                      </Button>
                    </>
                  )}
                </div>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          )}
        </div>
      </div>

      {(search.location || search.geo || search.located || search.unlocated || search.branch) && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-primary/5 px-4 py-3">
          <div>
            <p className="text-sm font-semibold">
              {search.unlocated === "1" ? "Assets without a location" :
               search.located === "1" ? "Assets with a location" :
               search.geo ? `Assets in ${(selectedGeo as any)?.name || "selected geographic area"}` :
               search.location ? `Assets in ${(locations as any[]).find((l:any)=>l.id===search.location)?.name || "selected location"}` :
               search.branch ? `Assets in ${(branches as any[]).find((b:any)=>b.id===search.branch)?.name || "selected branch"}` :
               "Filtered assets"}
            </p>
            <p className="text-xs text-muted-foreground">{filtered.length} matching asset{filtered.length === 1 ? "" : "s"}</p>
          </div>
          <Button variant="outline" size="sm" onClick={clearFilters}><FilterX className="mr-2 h-4 w-4"/>Clear location filter</Button>
        </div>
      )}

      <Card className="p-4">
        {canRequestDelete&&<div className="mb-3 flex flex-wrap items-center gap-2"><span className="text-sm text-muted-foreground">{selectedAssetIds.length} selected</span><Button size="sm" variant="outline" disabled={!selectedAssetIds.length} onClick={()=>setSelectedAssetIds([])}>Clear selection</Button><Button size="sm" variant="destructive" disabled={!selectedAssetIds.length} onClick={()=>setBulkDeleteOpen(true)}><Trash2 className="mr-2 h-4 w-4"/>Request bulk deletion</Button></div>}
        <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-6">
          <div className="relative md:col-span-3 lg:col-span-2">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search name, tag, serial, custodian…" className="pl-9" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <Select value={fBranch || "all"} onValueChange={(v) => setFBranch(v === "all" ? "" : v)}>
            <SelectTrigger><SelectValue placeholder="Branch" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All branches</SelectItem>
              {visibleBranches.map((b: any) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={fCategory || "all"} onValueChange={(v) => setFCategory(v === "all" ? "" : v)}>
            <SelectTrigger><SelectValue placeholder="Category" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {categories.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={fStatus || "all"} onValueChange={(v) => setFStatus(v === "all" ? "" : v)}>
            <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {Object.entries(STATUS_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant={fLocation || fGeo ? "secondary" : "outline"}
            className="justify-start"
            onClick={()=>setLocationFiltersOpen(v=>!v)}
          >
            <MapPin className="mr-2 h-4 w-4"/>
            {fLocation || fGeo ? "Location filtered" : "Filter location"}
            <SlidersHorizontal className="ml-auto h-4 w-4"/>
          </Button>
          <div className="flex gap-2 md:col-span-3 lg:col-span-2">
            <Input placeholder="Department…" value={fDept} onChange={(e) => setFDept(e.target.value)} />
            <Button variant="outline" size="icon" onClick={clearFilters} title="Clear filters"><FilterX className="h-4 w-4" /></Button>
          </div>
        </div>

        {locationFiltersOpen && (
          <div className="mt-4 rounded-xl border bg-muted/20 p-4">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">Location filters</p>
                <p className="text-xs text-muted-foreground">Filter by your organisation structure, geography, or both.</p>
              </div>
              {(fLocation || fGeo) && (
                <Button size="sm" variant="ghost" onClick={()=>{
                  setFLocation(""); setFGeo(""); setGeoSelection(null);
                  nav({to:"/assets",search:{...search,location:undefined,geo:undefined} as any,replace:true});
                }}>
                  <FilterX className="mr-2 h-4 w-4"/>Clear location
                </Button>
              )}
            </div>

            <div className="grid gap-5 lg:grid-cols-2">
              {visibleOrganisationLocations.length > 0 && (
                <div className="space-y-2">
                  <Label>Organisation location</Label>
                  <Select value={fLocation || "all"} onValueChange={(v)=>{
                    const next=v==="all"?"":v;
                    setFLocation(next);
                    nav({to:"/assets",search:{...search,location:next||undefined} as any,replace:true});
                  }}>
                    <SelectTrigger><SelectValue placeholder="All organisation locations"/></SelectTrigger>
                    <SelectContent className="max-h-72">
                      <SelectItem value="all">All organisation locations</SelectItem>
                      {visibleOrganisationLocations.map((l:any)=>(
                        <SelectItem key={l.id} value={l.id}>{organisationLocationLabel(l)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">Selecting a parent includes its floors, rooms, offices and stores.</p>
                </div>
              )}

              {["geographic","hybrid"].includes((locationSettings as any)?.location_mode) && (
                <div className={visibleOrganisationLocations.length ? "" : "lg:col-span-2"}>
                  <GeoHierarchyFilter
                    countries={assetFilterCountries as any[]}
                    value={(geoSelection || selectedGeo || null) as GeoHierarchyPlace|null}
                    initialCountry={(locationSettings as any)?.default_country_code || undefined}
                    onChange={(place)=>{
                      setGeoSelection(place);
                      const id=place ? String(place.geoname_id) : "";
                      setFGeo(id);
                      nav({to:"/assets",search:{...search,geo:id||undefined} as any,replace:true});
                    }}
                    compact
                  />
                </div>
              )}

              {visibleOrganisationLocations.length === 0 && !["geographic","hybrid"].includes((locationSettings as any)?.location_mode) && (
                <p className="text-sm text-muted-foreground">No location filters are configured for this organisation.</p>
              )}
            </div>
          </div>
        )}

        <div className="mt-4 overflow-x-auto">
          {isLoading ? (
            <p className="py-12 text-center text-sm text-muted-foreground">Loading…</p>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center">
              <Package className="mx-auto h-10 w-10 text-muted-foreground/40" />
              <p className="mt-3 text-sm text-muted-foreground">No assets match the filters.</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                   {canRequestDelete&&<th className="px-3 py-3"><input aria-label="Select all filtered assets" type="checkbox" checked={filtered.length>0&&filtered.every(a=>selectedAssetIds.includes(a.id))} onChange={e=>setSelectedAssetIds(old=>e.target.checked?Array.from(new Set([...old,...filtered.map(a=>a.id)])):old.filter(id=>!filtered.some(a=>a.id===id)))}/></th>}
                  {registerChoice==="default"&&<><th className="px-3 py-3 font-medium">Tag</th><th className="px-3 py-3 font-medium">Name</th></>}
                  {registerFields.map(field=><th key={field.key} className="px-3 py-3 font-medium">{field.label}</th>)}{registerChoice!=="default"&&catalog?.includeLocation&&!registerFields.some(f=>f.key.toLowerCase()==="location")&&<th className="px-3 py-3 font-medium">Location</th>}
                  {registerChoice==="default"&&<><th className="hidden px-3 py-3 font-medium md:table-cell">Branch</th><th className="hidden px-3 py-3 font-medium lg:table-cell">Category</th><th className="hidden px-3 py-3 font-medium lg:table-cell">Location</th><th className="hidden px-3 py-3 font-medium md:table-cell">Custodian</th><th className="px-3 py-3 font-medium">Status</th><th className="hidden px-3 py-3 text-right font-medium sm:table-cell">Value</th></>}
                  <th className="px-3 py-3" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((a: any) => (
                  <tr key={a.id} className="border-b last:border-0 hover:bg-muted/40 cursor-pointer" onClick={() => openView(a, "activity")}>
                     {canRequestDelete&&<td className="px-3 py-3" onClick={e=>e.stopPropagation()}><input aria-label={`Select ${a.name}`} type="checkbox" checked={selectedAssetIds.includes(a.id)} onChange={e=>setSelectedAssetIds(old=>e.target.checked?[...old,a.id]:old.filter(id=>id!==a.id))}/></td>}
                    {registerChoice==="default"&&<>                    <td className="px-3 py-3 font-mono text-xs">{a.asset_tag}</td>
                    <td className="px-3 py-3 font-medium">{a.name}{a.serial_number && <span className="ml-2 font-mono text-[10px] text-muted-foreground">SN: {a.serial_number}</span>}</td>
                    <td className="hidden px-3 py-3 text-muted-foreground md:table-cell">{a.branches?.name ?? "-"}</td>
                    <td className="hidden px-3 py-3 text-muted-foreground lg:table-cell">{a.categories?.name ?? "-"}</td>
                    <td className="hidden px-3 py-3 text-muted-foreground lg:table-cell">
                      <span className="block font-medium text-foreground">{a.locations?.name ?? a.geo_places?.name ?? "-"}</span>
                      {a.geo_places?.display_path && (
                        <span className="mt-0.5 block max-w-[260px] truncate text-[11px] text-muted-foreground" title={a.geo_places.display_path}>
                          {a.geo_places.display_path}
                        </span>
                      )}
                    </td>
                    <td className="hidden px-3 py-3 text-muted-foreground md:table-cell">
                      {a.custodian || "-"}{a.department && <span className="block text-[11px]">{a.department}</span>}
                    </td>
                    <td className="px-3 py-3">
                      <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_TONE[a.status as Status]}`}>
                        {STATUS_LABEL[a.status as Status]}
                      </span>
                    </td>
                    <td className="hidden px-3 py-3 text-right tabular-nums sm:table-cell">{formatUGX(a.purchase_value)}</td>
                    </>}
                    {registerChoice!=="default"&&registerFields.map(field=><td key={field.key} className="px-3 py-3 text-sm">{String(a.custom_fields?.[field.key]??"—")}</td>)}{registerChoice!=="default"&&catalog?.includeLocation&&!registerFields.some(f=>f.key.toLowerCase()==="location")&&<td className="px-3 py-3 text-sm">{a.locations?.name??"—"}</td>}
                    <td className="px-3 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-end gap-1">
                        <Button size="icon" variant="ghost" title="View details & history" onClick={() => openView(a, "activity")}>
                          <Eye className="h-4 w-4" />
                        </Button>
                        {canEdit && (
                          <Button size="icon" variant="ghost" title="Edit" onClick={() => openEdit(a)}><Pencil className="h-4 w-4" /></Button>
                        )}
                        {a.status !== "retired" && a.status !== "disposed" && (
                          <>
                            {canRequestMove && (
                              <Button size="icon" variant="ghost" title="Request movement" onClick={() => openView(a, "movements")}>
                                <ArrowRightLeft className="h-4 w-4 text-muted-foreground" />
                              </Button>
                            )}
                            {canRequestMaint && (
                              <Button size="icon" variant="ghost" title="Request maintenance" onClick={() => openView(a, "maintenance")}>
                                <Wrench className="h-4 w-4 text-muted-foreground" />
                              </Button>
                            )}
                            {canRequestRetire && (
                              <Button size="icon" variant="ghost" title="Request retirement" onClick={() => requestRetire(a, "retirement")}>
                                <Archive className="h-4 w-4 text-muted-foreground" />
                              </Button>
                            )}
                            {canRequestDispose && (
                              <Button size="icon" variant="ghost" title="Request disposal" onClick={() => requestRetire(a, "disposal")}>
                                <Send className="h-4 w-4 text-muted-foreground" />
                              </Button>
                            )}
                          </>
                        )}
                        {canRequestDelete && (
                          <Button size="icon" variant="ghost" title="Request deletion" onClick={() => removeAsset(a)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Card>


      <ScannerDialog open={scanOpen} onOpenChange={setScanOpen} onScan={handleScan} />

      <Dialog open={viewOpen} onOpenChange={setViewOpen}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{viewAsset?.name} <span className="ml-2 font-mono text-xs text-muted-foreground">{viewAsset?.asset_tag}</span></DialogTitle>
            <DialogDescription>
              Full history & audit trail{viewAsset?.status ? ` · Status: ${STATUS_LABEL[viewAsset.status as Status]}` : ""}
            </DialogDescription>
          </DialogHeader>
          {viewAsset && <AssetDetailTabs assetId={viewAsset.id} defaultTab={viewTab} />}
        </DialogContent>
      </Dialog>


      <Dialog open={dupOpen} onOpenChange={setDupOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><AlertCircle className="h-5 w-5 text-warning" /> Already registered</DialogTitle>
            <DialogDescription>
              This tag or serial number is already in the system. Open the existing asset instead of creating a duplicate.
            </DialogDescription>
          </DialogHeader>
          {dupAsset && (
            <div className="rounded-lg border p-3 text-sm">
              <p className="font-semibold">{dupAsset.name}</p>
              <p className="text-xs text-muted-foreground">Tag: <span className="font-mono">{dupAsset.asset_tag}</span></p>
              {dupAsset.serial_number && <p className="text-xs text-muted-foreground">Serial: <span className="font-mono">{dupAsset.serial_number}</span></p>}
              <p className="text-xs text-muted-foreground">Status: {STATUS_LABEL[dupAsset.status as Status]}</p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDupOpen(false)}>Cancel</Button>
            <Button onClick={() => { setDupOpen(false); openEdit(dupAsset); }}>Open existing asset</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={registerPreview!==null} onOpenChange={open=>{if(!open)setRegisterPreview(null)}}><DialogContent className="max-w-5xl"><DialogHeader><DialogTitle>{registerPreview==="default"?"Default asset register":registers.find(r=>r.id===registerPreview)?.name} · Preview</DialogTitle><DialogDescription>Illustrative register structure. No asset data will be modified.</DialogDescription></DialogHeader><div className="overflow-x-auto rounded-md border"><table className="w-full text-sm"><thead className="bg-muted"><tr>{(registerPreview==="default"?["Asset number","Asset name","Asset tag","Category","Status","Custodian","Value"]:registers.find(r=>r.id===registerPreview)?.configuration.fields?.map(f=>f.label)??[]).map((label,i)=><th key={i} className="whitespace-nowrap border-b px-3 py-3 text-left">{label}</th>)}</tr></thead><tbody><tr>{(registerPreview==="default"?["Automatic","Sample asset","Optional","Equipment","In use","Employee","100000"]:registers.find(r=>r.id===registerPreview)?.configuration.fields?.map(()=>"Sample value")??[]).map((value,i)=><td key={i} className="whitespace-nowrap px-3 py-3">{value}</td>)}</tr></tbody></table></div><Button onClick={()=>setRegisterPreview(null)}>Close</Button></DialogContent></Dialog>
      <Dialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}><DialogContent><DialogHeader><DialogTitle>Request deletion of {selectedAssetIds.length} assets</DialogTitle><DialogDescription>Each selected asset creates an individual deletion approval request with the same reason. Assets are not removed until an administrator approves them.</DialogDescription></DialogHeader><Label>Reason for bulk deletion *</Label><Textarea rows={4} maxLength={1000} value={bulkDeleteReason} onChange={e=>setBulkDeleteReason(e.target.value)} placeholder="Example: Incorrect spreadsheet import batch"/><DialogFooter><Button variant="outline" disabled={bulkBusy} onClick={()=>setBulkDeleteOpen(false)}>Cancel</Button><Button variant="destructive" disabled={bulkBusy||bulkDeleteReason.trim().length<10} onClick={requestBulkDeletion}>{bulkBusy?"Submitting requests…":"Submit for approval"}</Button></DialogFooter></DialogContent></Dialog>
      <Dialog open={retireOpen} onOpenChange={setRetireOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request {reqKind ?? "retirement"}</DialogTitle>
            <DialogDescription>
              {retireAsset && <>Asset <strong>{retireAsset.name}</strong> ({retireAsset.asset_tag}). An admin must approve before action is taken.</>}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label>Reason *</Label>
            <Textarea rows={3} value={retireReason} onChange={(e) => setRetireReason(e.target.value)} placeholder="End of useful life / damaged beyond repair / lost…" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRetireOpen(false)} disabled={requestSubmitting}>Cancel</Button>
            <Button onClick={submitRetire} disabled={requestSubmitting}>
              {requestSubmitting ? "Submitting…" : "Submit for approval"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
