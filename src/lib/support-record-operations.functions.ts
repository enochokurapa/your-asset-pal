import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getPostgresPool } from "@/lib/postgres.server";

// A limited, explicit support capability. Arbitrary SQL, account impersonation,
// mass changes, billing and user-security operations are never delegated.
const uuid = z.string().uuid();
const recordType = z.enum(["assets", "categories", "locations"]);
const editableFields = {
  assets: ["name", "description", "serial_number", "asset_tag", "status",  "purchase_date", "purchase_value", "category_id", "location_id"],
  categories: ["name", "description"],
  locations: ["name", "address"],
} as const;
const changeSchema = z.object({
  sessionId: uuid,
  recordType,
  recordId: uuid,
  field: z.string(),
  value: z.union([z.string().max(2000), z.null()]),
  explanation: z.string().trim().min(15).max(1000),
});

export const listSupportRecords = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({sessionId: uuid, recordType}).parse(input))
  .handler(async ({context,data}) => {
    const client = await getPostgresPool().connect();
    try {
      await client.query("BEGIN");
      const {rows:[session]}=await client.query<{tenant_id:string}>(`
        SELECT s.tenant_id FROM public.tenant_support_sessions s
        JOIN public.profiles p ON p.id=$2 AND p.is_saas_admin=TRUE AND p.is_active=TRUE
        WHERE s.id=$1 AND s.administrator_id=$2 AND s.state='approved'
          AND s.expires_at>NOW() AND s.approved_by IS NOT NULL
          AND s.scope IN ('diagnostics_read','operational_support')
        FOR SHARE OF s`,[data.sessionId,context.userId]);
      if(!session)throw new Error("An active approved support session is required");
      // SQL identifier comes strictly from this server-side enum.
      const columns=data.recordType==="assets"
        ?"id,name,asset_tag,serial_number,status,description,category_id,location_id,purchase_value,purchase_date,updated_at"
        : data.recordType==="categories"?"id,name,description":"id,name,address";
      const {rows}=await client.query(`SELECT ${columns} FROM public.${data.recordType}
        WHERE tenant_id=$1 ORDER BY name ASC LIMIT 150`,[session.tenant_id]);
      await client.query(`INSERT INTO public.tenant_support_audit
        (support_session_id,tenant_id,actor_id,action,details)
        VALUES ($1,$2,$3,'support_records_listed',$4::jsonb)`,
        [data.sessionId,session.tenant_id,context.userId,JSON.stringify({type:data.recordType,count:rows.length})]);
      await client.query("COMMIT");
      return {rows,limitedTo:150};
    } catch(e) {await client.query("ROLLBACK");throw e;} finally {client.release();}
  });

export const updateSupportRecord = createServerFn({method:"POST"})
  .middleware([requireSupabaseAuth])
  .inputValidator((input)=>changeSchema.parse(input))
  .handler(async({context,data})=>{
    const allowed:readonly string[]=editableFields[data.recordType];
    if(!allowed.includes(data.field))throw new Error("This field cannot be changed by platform support");
    let value:string|null=data.value;
    if(["name"].includes(data.field)&&(!value||!value.trim()||value.length>200))
      throw new Error("A record name is required (maximum 200 characters)");
    if(data.field==="status" && !["in_use","in_storage","under_repair","retired","missing","disposed","checked_out"].includes(value||""))
      throw new Error("Invalid asset status");
    if(["category_id","location_id"].includes(data.field)&&value!==null&&!uuid.safeParse(value).success)
      throw new Error("Invalid related record identifier");
    if(data.field==="purchase_value"&&value!==null&&(!/^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/.test(value)||Number(value)>9999999999.99))
      throw new Error("Invalid purchase value");
    if(data.field==="purchase_date"&&value!==null&&!/^\d{4}-\d{2}-\d{2}$/.test(value))
      throw new Error("Use a valid YYYY-MM-DD date");
    const client=await getPostgresPool().connect();
    try{
      await client.query("BEGIN");
      const {rows:[session]}=await client.query<{tenant_id:string}>(`
        SELECT s.tenant_id FROM public.tenant_support_sessions s
        JOIN public.profiles p ON p.id=$2 AND p.is_saas_admin=TRUE AND p.is_active=TRUE
        WHERE s.id=$1 AND s.administrator_id=$2 AND s.state='approved'
          AND s.expires_at>NOW() AND s.approved_by IS NOT NULL
          AND s.scope='operational_support'
        FOR SHARE OF s`,[data.sessionId,context.userId]);
      if(!session)throw new Error("Approved operational support access expired or was revoked");
      if(value!==null && (data.field==="category_id"||data.field==="location_id")){
        const lookup=data.field==="category_id"?"categories":"locations";
        const {rowCount}=await client.query(`SELECT id FROM public.${lookup} WHERE id=$1 AND tenant_id=$2`,[value,session.tenant_id]);
        if(!rowCount)throw new Error("Related record does not belong to this business");
      }
      const {rows:[before]}=await client.query(`SELECT * FROM public.${data.recordType}
        WHERE id=$1 AND tenant_id=$2 FOR UPDATE`,[data.recordId,session.tenant_id]);
      if(!before)throw new Error("Record not found in approved business");
      // Column identifier is validated against a hard-coded server allowlist.
      const {rows:[after]}=await client.query(`UPDATE public.${data.recordType}
        SET ${data.field}=$1 WHERE id=$2 AND tenant_id=$3 RETURNING *`,
        [value,data.recordId,session.tenant_id]);
      const oldValue=before[data.field]??null;
      const newValue=after[data.field]??null;
      await client.query(`INSERT INTO public.tenant_support_audit
        (support_session_id,tenant_id,actor_id,action,details)
        VALUES ($1,$2,$3,'support_record_updated',$4::jsonb)`,[
          data.sessionId,session.tenant_id,context.userId,
          JSON.stringify({recordType:data.recordType,recordId:data.recordId,
            field:data.field,before:oldValue,after:newValue,explanation:data.explanation})
        ]);
      await client.query("COMMIT");
      return {ok:true,recordId:data.recordId,field:data.field,before:oldValue,after:newValue};
    }catch(e){await client.query("ROLLBACK");throw e;}finally{client.release();}
  });
