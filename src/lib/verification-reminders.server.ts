import { queryPostgres } from "@/lib/postgres.server";
import { sendPlatformReportEmail } from "@/lib/platform-smtp.server";

type ScheduleRow = {
  asset_id:string; verification_due_at:Date | string;
  verification_state:string;
};
type ClaimedRow = {id:string};
export type VerificationMilestone =
  "six_months" | "three_months" | "two_weeks" | "one_week" | "one_day" | "due" |
  "overdue_1" | "overdue_2" | "overdue_3" | "overdue_4" | "overdue_5" | "overdue_6";

function calendarMonthShift(date:Date,delta:number){
  const d=new Date(date);
  const day=d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth()+delta);
  const daysInMonth=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();
  d.setUTCDate(Math.min(day,daysInMonth));
  return d;
}
export function verificationMilestone(due:Date, now:Date):VerificationMilestone|null{
  if(!Number.isFinite(due.valueOf())||!Number.isFinite(now.valueOf()))return null;
  const day=86_400_000;
  if(now<due){
    if(now>=new Date(due.getTime()-day))return "one_day";
    if(now>=new Date(due.getTime()-7*day))return "one_week";
    if(now>=new Date(due.getTime()-14*day))return "two_weeks";
    if(now>=calendarMonthShift(due,-3))return "three_months";
    if(now>=calendarMonthShift(due,-6))return "six_months";
    return null;
  }
  if(now<calendarMonthShift(due,1))return "due";
  for(let month=6;month>=1;month--){
    if(now>=calendarMonthShift(due,month)){
      // Stop after six monthly reminders; do not email indefinitely.
      return now<calendarMonthShift(due,7)
        ? (`overdue_${month}` as VerificationMilestone) : null;
    }
  }
  return null;
}
const milestoneLabels:Record<VerificationMilestone,string>={
  six_months:"Six months before renewal",
  three_months:"Three months before renewal",
  two_weeks:"Two weeks before renewal",
  one_week:"One week before renewal",
  one_day:"One day before renewal",
  due:"Verification due",
  overdue_1:"One month overdue",
  overdue_2:"Two months overdue",
  overdue_3:"Three months overdue",
  overdue_4:"Four months overdue",
  overdue_5:"Five months overdue",
  overdue_6:"Six months overdue",
};
const emailPattern=/^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;
export function parseVerificationEmails(values:string[]):string[]{
  const normalized=[...new Set(values.map(v=>v.trim().toLowerCase()).filter(Boolean))];
  if(normalized.length>10||normalized.some(v=>v.length>250||!emailPattern.test(v)))
    throw new Error("Configure at most 10 valid notification email addresses");
  return normalized;
}
/**
 * Called once per day by the existing tenant automation scheduler.
 * Only explicitly configured email recipients are contacted.
 * The persisted claim is unique per asset, deadline, recipient and milestone.
 */
export async function sendVerificationScheduleEmails(tenantId:string,configuredEmails:string[]){
  const emails=parseVerificationEmails(configuredEmails);
  if(!emails.length)return {sent:0};
  const schedule=await queryPostgres<ScheduleRow>(`
    SELECT asset_id,verification_due_at,verification_state
    FROM public.asset_verification_schedule
    WHERE tenant_id=$1 AND verification_due_at IS NOT NULL
      AND verification_state <> 'attention'
      AND verification_due_at > NOW()-INTERVAL '7 months'
      AND verification_due_at <= NOW()+INTERVAL '6 months'
    ORDER BY verification_due_at ASC LIMIT 10000
  `,[tenantId]);
  const now=new Date();
  const groups=new Map<VerificationMilestone,ScheduleRow[]>();
  for(const asset of schedule){
    const milestone=verificationMilestone(new Date(asset.verification_due_at),now);
    if(!milestone)continue;
    const group=groups.get(milestone)||[];
    group.push(asset);
    groups.set(milestone,group);
  }
  let sent=0;
  for(const to of emails){
    for(const [milestone,assets] of groups){
      const claimed=await queryPostgres<ClaimedRow>(`
        INSERT INTO public.asset_verification_email_log
          (tenant_id,asset_id,recipient_email,cycle_due_at,milestone)
        SELECT $1, s.asset_id, $2, s.verification_due_at, $3
        FROM public.asset_verification_schedule s
        WHERE s.tenant_id=$1 AND s.asset_id=ANY($4::uuid[])
          AND s.verification_due_at IS NOT NULL
        ON CONFLICT DO NOTHING RETURNING id::text
      `,[tenantId,to,milestone,assets.map(a=>a.asset_id)]);
      if(!claimed.length)continue;
      const ids=claimed.map(row=>row.id);
      const subject=`AssetFlow | ${milestoneLabels[milestone]} — asset verification`;
      const message=[
        `AssetFlow verification reminder: ${milestoneLabels[milestone]}.`,
        `${claimed.length} asset${claimed.length===1?"":"s"} need attention in your organisation's verification schedule.`,
        "Sign in to AssetFlow 360 and open Verification to review the relevant assets and record physical checks.",
        "Registration-current status is not proof of a completed physical inspection.",
        "This is an automated reminder for the email recipients selected in your organisation's settings.",
      ].join("\n\n");
      try{
        await sendPlatformReportEmail(to,subject,message);
        await queryPostgres(
          "UPDATE public.asset_verification_email_log SET sent_at=NOW() WHERE id=ANY($1::bigint[])",
          [ids],
        );
        sent++;
      }catch(error){
        // Release unsent claims for a later attempt. Never claim email was delivered.
        await queryPostgres(
          "DELETE FROM public.asset_verification_email_log WHERE id=ANY($1::bigint[]) AND sent_at IS NULL",
          [ids],
        );
        throw error;
      }
    }
  }
  return {sent};
}
