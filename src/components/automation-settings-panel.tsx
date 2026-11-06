import { useEffect, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Clock3, Save } from "lucide-react";
import { toast } from "sonner";

type AutomationSettings = {
  approval_reminders_enabled: boolean;
  approval_after_hours: number;
  gate_pass_return_reminders_enabled: boolean;
  gate_pass_days_after_due: number;
  depreciation_due_reminders_enabled: boolean;
  verification_due_reminders_enabled: boolean;
  verification_interval_days: number;
  verification_notification_emails: string[];
};

const DEFAULTS: AutomationSettings = {
  approval_reminders_enabled: true,
  approval_after_hours: 24,
  gate_pass_return_reminders_enabled: false,
  gate_pass_days_after_due: 1,
  depreciation_due_reminders_enabled: false,
  verification_due_reminders_enabled: false,
  verification_interval_days: 365,
  verification_notification_emails: [],
};

export function AutomationSettingsPanel() {
  const { tenantId, isTenantAdmin } = useAuth();
  const [form, setForm] = useState(DEFAULTS);
  const [saving, setSaving] = useState(false);
  const [emailDraft,setEmailDraft] = useState("");

  const { data } = useQuery({
    queryKey: ["tenant-automation-settings", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("tenant_automation_settings")
        .select("*")
        .eq("tenant_id", tenantId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (data) {
    setForm({ ...DEFAULTS, ...(data as any) });
    setEmailDraft(Array.isArray((data as any).verification_notification_emails)
      ? (data as any).verification_notification_emails.join(", ") : "");
  }
  }, [data]);

  const patch = <K extends keyof AutomationSettings>(key: K, value: AutomationSettings[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const save = async () => {
    if (!tenantId || !isTenantAdmin) return;
    setSaving(true);
    try {
      const emails=[...new Set(emailDraft.split(/[,;\n]+/).map(v=>v.trim().toLowerCase()).filter(Boolean))];
      if(emails.length>10||emails.some(v=>v.length>250||!/^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(v)))
        throw new Error("Enter up to 10 valid recipient email addresses");
      if(form.verification_due_reminders_enabled && emails.length===0)
        throw new Error("Set at least one recipient email address before enabling verification reminders");
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await (supabase as any).from("tenant_automation_settings").upsert({
        tenant_id: tenantId,
        ...form,
        verification_notification_emails: emails,
        updated_at: new Date().toISOString(),
        updated_by: auth.user?.id ?? null,
      }, { onConflict: "tenant_id" });
      if (error) throw error;
      toast.success("Automation settings saved");
    } catch (error: any) {
      toast.error(error?.message ?? "Could not save automation settings");
    } finally {
      setSaving(false);
    }
  };

  const Row = ({
    title, description, checked, onCheckedChange, children,
  }:{
    title:string; description:string; checked:boolean; onCheckedChange:(v:boolean)=>void; children?:ReactNode;
  }) => (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-semibold">{title}</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
        </div>
        <Switch checked={checked} onCheckedChange={onCheckedChange} />
      </div>
      {checked && children ? <div className="mt-4 border-t pt-4">{children}</div> : null}
    </Card>
  );

  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center gap-2">
          <Clock3 className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-semibold">Automation</h3>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Choose which routine checks AssetFlow should perform automatically. Notifications are delivered in-app; verification emails can also be sent to your selected recipients.
        </p>
      </div>

      <fieldset disabled={!isTenantAdmin} className="grid gap-4 lg:grid-cols-2">
        <Row
          title="Pending approval reminders"
          description="Remind administrators and managers when approval requests have been waiting too long."
          checked={form.approval_reminders_enabled}
          onCheckedChange={(v)=>patch("approval_reminders_enabled",v)}
        >
          <div className="max-w-xs space-y-2">
            <Label>Remind after (hours)</Label>
            <Input type="number" min={1} max={168} value={form.approval_after_hours}
              onChange={(e)=>patch("approval_after_hours",Math.min(168,Math.max(1,Number(e.target.value)||24)))} />
          </div>
        </Row>

        <Row
          title="Gate pass return reminders"
          description="Notify administrators and managers when an asset has not been returned by the expected date."
          checked={form.gate_pass_return_reminders_enabled}
          onCheckedChange={(v)=>patch("gate_pass_return_reminders_enabled",v)}
        >
          <div className="max-w-xs space-y-2">
            <Label>Remind after due date (days)</Label>
            <Input type="number" min={0} max={30} value={form.gate_pass_days_after_due}
              onChange={(e)=>patch("gate_pass_days_after_due",Math.min(30,Math.max(0,Number(e.target.value)||0)))} />
          </div>
        </Row>

        <Row
          title="Depreciation due reminders"
          description="Check for assets whose configured depreciation frequency appears due and remind the responsible team. This does not post financial entries automatically."
          checked={form.depreciation_due_reminders_enabled}
          onCheckedChange={(v)=>patch("depreciation_due_reminders_enabled",v)}
        />

        <Row
          title="Verification due reminders"
          description="Send in-app and optional email reminders ahead of verification renewal, on the due date, and monthly for six months afterward. The review period comes from your business verification policy."
          checked={form.verification_due_reminders_enabled}
          onCheckedChange={(v)=>patch("verification_due_reminders_enabled",v)}
        >
          <div className="max-w-xl space-y-2">
            <Label htmlFor="verification-recipient-emails">Verification reminder recipients</Label>
            <Input id="verification-recipient-emails" type="text" value={emailDraft}
              onChange={e=>setEmailDraft(e.target.value)}
              placeholder="admin@organisation.com, manager@organisation.com" />
            <p className="text-xs leading-5 text-muted-foreground">
              Up to 10 addresses, separated by commas. Schedule: 6 months, 3 months, 2 weeks,
              1 week, and 1 day before; on the due date; then monthly for up to 6 months.
              Delivery requires working platform SMTP settings.
            </p>
          </div>
        </Row>
      </fieldset>

      <div className="flex justify-end">
        <Button onClick={save} disabled={!isTenantAdmin || saving}>
          <Save className="mr-2 h-4 w-4" />{saving ? "Saving..." : "Save automation settings"}
        </Button>
      </div>
    </div>
  );
}
