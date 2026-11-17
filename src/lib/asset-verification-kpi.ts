/** Shared verification groupings for dashboard KPIs, exported asset lists,
 * and report wizard. Physical inspection is never inferred from registration. */
export type VerificationGroup="registered"|"inspected"|"attention";
export type VerificationSchedule={asset_id:string;verification_state?:string|null;verification_basis?:string|null;latest_verification_status?:string|null};
export function verificationGroup(record:VerificationSchedule|undefined,history?:{status?:string|null}):VerificationGroup{
  // Retired/disposed assets do not appear in the active inspection schedule.
  // Preserve their historical inspection result instead of marking them overdue.
  if(!record)return history?.status==="verified"?"inspected":history?.status?"attention":"registered";
  if(record.latest_verification_status==="verified" &&
      ["current","due_soon"].includes(record.verification_state??""))return "inspected";
  if(record.latest_verification_status && record.latest_verification_status!=="verified")return "attention";
  if(record.verification_state==="current"||record.verification_state==="due_soon")return "registered";
  return "attention";
}
export const verificationGroupLabel:Record<VerificationGroup,string>={
 registered:"Registered — Current",inspected:"Inspection Verified",attention:"Due / Needs Attention"
};
