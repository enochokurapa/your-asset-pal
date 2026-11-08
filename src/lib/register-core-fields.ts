/** One underlying asset record field, one visible control. Never create duplicate
 * custom JSON fields for identifiers already provided by the asset schema. */
export const REGISTER_NATIVE_FIELDS=[
 {key:"asset_tag",label:"Asset tag",hint:"Barcode / QR scanner"},
 {key:"serial_number",label:"Serial number",hint:"Camera scanner"},
 {key:"name",label:"Asset name",hint:"Built-in identification"},
 {key:"description",label:"Description",hint:"Built-in notes"},
 {key:"category_id",label:"Category",hint:"Uses your saved asset categories"},
 {key:"branch_id",label:"Branch",hint:"Uses your organisation branches"},
 {key:"location_id",label:"Organisation location",hint:"Choose saved office, store or site"},
 {key:"geo_place_id",label:"Geographic location",hint:"Country → region → district"},
] as const;
export type RegisterNativeKey=typeof REGISTER_NATIVE_FIELDS[number]["key"];
export const normalizeRegisterLabel=(v:string)=>String(v||"").toLowerCase().replace(/[^a-z0-9]/g,"");
const mapped:Record<string,RegisterNativeKey>={
 assettag:"asset_tag",tagnumber:"asset_tag",tagno:"asset_tag",tag:"asset_tag",
 serialnumber:"serial_number",manufacturerserial:"serial_number",serialno:"serial_number",
 assetname:"name",itemname:"name",name:"name",
 description:"description",assetdescription:"description",
 category:"category_id",assetcategory:"category_id",categoryid:"category_id",
 branch:"branch_id",branchid:"branch_id",
 organisationlocation:"location_id",organizationlocation:"location_id",internallocation:"location_id",locationid:"location_id",
 geographiclocation:"geo_place_id",geographicalarea:"geo_place_id",geographicarea:"geo_place_id",geoplaceid:"geo_place_id",
};
export function nativeRegisterKey(field:{key?:string;label?:string}):RegisterNativeKey|null{
 return mapped[normalizeRegisterLabel(field.key||"")]||mapped[normalizeRegisterLabel(field.label||"")]||null;
}
