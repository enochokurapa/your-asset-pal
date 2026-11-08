/** Report-only representation; existing asset and inspection data is never modified. */
export type VerificationEvidence={status?:string|null;verified_by?:string|null;verified_at?:string|null;changes?:Record<string,unknown>|null};
export const historicalBaseline=(v:VerificationEvidence|undefined)=>Boolean(v&&(v.changes?.source==="owner_attested_legacy"||v.changes?.inspection_date_confirmed===false));
export function assetReportAudit(asset:any,evidence:VerificationEvidence|undefined,userName:(id:string|null|undefined)=>string){
 const legacy=historicalBaseline(evidence);
 const inspected=Boolean(evidence?.status==="verified"&&!legacy&&evidence.verified_at);
 return {
  registered_at:asset.created_at??"",
  registered_by:userName(asset.created_by)||"Not recorded",
  capture_method:typeof asset.custom_fields?.capture_method==="string"?asset.custom_fields.capture_method:"Not recorded",
  inspected_at:inspected?evidence?.verified_at??"":"",
  inspected_by:inspected?(userName(evidence?.verified_by)||"Not recorded"):"Not recorded",
  inspection_evidence:legacy?"Owner-attested historical baseline; inspection not confirmed":evidence?"Inspection record":"No inspection recorded",
  inspection_result:legacy?"Historical baseline":evidence?.status??"Not inspected",
 };
}
