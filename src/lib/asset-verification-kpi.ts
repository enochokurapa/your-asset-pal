/** Shared verification groupings for dashboard KPIs, exported asset lists,
 * and report wizard. Physical inspection is never inferred from registration. */
export type VerificationGroup="registered"|"inspected"|"attention";
export type VerificationSchedule={asset_id:string;verification_state?:string|null;verification_basis?:string|null;latest_verification_status?:string|null};
export function verificationGroup(record:VerificationSchedule|undefined):VerificationGroup{
 if(record&&(record.verification_state==="current"||record.verification_state==="due_soon")){
  if(record.verification_basis==="registration_baseline")return "registered";
  if(record.latest_verification_status==="verified")return "inspected";
 }
 return "attention";
}
export const verificationGroupLabel:Record<VerificationGroup,string>={
 registered:"Registered — Current",inspected:"Inspection Verified",attention:"Due / Needs Attention"
};
