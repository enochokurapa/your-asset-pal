/** One underlying asset record field, one visible control. Never create duplicate
 * custom JSON fields for identifiers already provided by the asset schema. */
export const REGISTER_NATIVE_FIELDS=[
 {key:"asset_tag",label:"Asset tag",hint:"Barcode / QR scanner"},
 {key:"serial_number",label:"Serial number",hint:"Camera scanner"},
 {key:"name",label:"Asset name",hint:"Built-in identification"},
 {key:"description",label:"Description",hint:"Built-in notes"},
] as const;
export type RegisterNativeKey=typeof REGISTER_NATIVE_FIELDS[number]["key"];
export const normalizeRegisterLabel=(v:string)=>String(v||"").toLowerCase().replace(/[^a-z0-9]/g,"");
const mapped:Record<string,RegisterNativeKey>={
 assettag:"asset_tag",tagnumber:"asset_tag",tagno:"asset_tag",tag:"asset_tag",
 serialnumber:"serial_number",manufacturerserial:"serial_number",serialno:"serial_number",
 assetname:"name",itemname:"name",name:"name",
 description:"description",assetdescription:"description",
};
export function nativeRegisterKey(field:{key?:string;label?:string}):RegisterNativeKey|null{
 return mapped[normalizeRegisterLabel(field.key||"")]||mapped[normalizeRegisterLabel(field.label||"")]||null;
}
