import {createServerFn} from "@tanstack/react-start";
import {queryPostgres} from "@/lib/postgres.server";

export type FeatureSummary={key:string;label:string;description:string;access:"included"|"add_on"};
const descriptions:Record<string,string>={
 assets:"Register assets, categorise fixed equipment and manage lifecycle records.",
 audit:"Review recorded changes, actor activity, approvals and asset history.",
 branches:"Group assets and teams by business branch and organisation structure.",
 categories:"Organise assets under defined classifications and reporting groups.",
 dashboard:"See the core asset registers and operational overview.",
 dashboard_builder:"Configure dashboards using supported widgets and data views.",
 depreciation:"Calculate and review depreciation records and reporting periods.",
 document_builder:"Create reusable document templates for operational records.",
 form_builder:"Build forms around your organisation's asset workflows.",
 gate_pass:"Create and manage approvals for equipment leaving or entering locations.",
 geolocation:"Record and review supported asset location information.",
 live_tracking:"Optional real-time tracking, subject to device and integration configuration.",
 locations:"Organise assets and responsibilities by registered location.",
 register_builder:"Configure custom asset registers and fields.",
 report_builder:"Design reporting layouts using available reports and data.",
 reports:"Generate supported fixed asset and operational reports.",
 settings:"Manage organisation settings and permitted controls.",
 users:"Manage team access and organisational roles.",
 verification:"Plan physical asset checks, record findings and track renewals.",
 api_access:"Optional API access subject to plan and credentials.",
};
export const getPublicFeatureCatalog=createServerFn({method:"GET"}).handler(async()=>{
 const rows=await queryPostgres<{module_key:string;label:string;billing_model:string}>(`
   SELECT module_key,label,billing_model FROM public.saas_modules
   WHERE globally_enabled=TRUE ORDER BY sort_order,module_key LIMIT 50`);
 return rows.map(row=>({
  key:row.module_key,label:row.label,
  description:descriptions[row.module_key]||"Available workflow and administrative functionality.",
  access:row.billing_model==="add_on"?"add_on":"included",
 })) as FeatureSummary[];
});
