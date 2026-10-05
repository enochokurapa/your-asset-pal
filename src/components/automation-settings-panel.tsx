import { useEffect, useState } from "react";
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
};

const DEFAULTS: AutomationSettings = {
  approval_reminders_enabled: true,
  approval_after_hours: 24,
  gate_pass_return_reminders_enabled: false,
  gate_pass_days_after_due: 1,
  depreciation_due_reminders_enabled: false,
  verification_due_reminders_enabled: false,
  verification_interval_days: 180,
};

export function AutomationSettingsPanel() {
  const { tenantId, isTenantAdmin } = useAuth();
  const [form, setForm] = useState(DEFAULTS);
  const [saving, setSaving] = useState(false);

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
    if (data) setForm({ ...DEFAULTS, ...(data as any) });
  }, [data]);

  const patch = <K extends keyof AutomationSettings>(key: K, value: AutomationSettings[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const save = async () => {
    if (!tenantId || !isTenantAdmin) return;
    setSaving(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await (supabase as any).from("tenant_automation_settings").upsert({
        tenant_id: tenantId,
        ...form,
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
    title:string; description:string; checked:boolean; onCheckedChange:(v:boolean)=>void; children?:React.ReactNode;
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
          Choose which routine checks AssetFlow should perform automatically. Notifications are delivered in-app.
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
          description="Notify administrators and managers when active assets have not been physically verified within the selected interval."
          checked={form.verification_due_reminders_enabled}
          onCheckedChange={(v)=>patch("verification_due_reminders_enabled",v)}
        >
          <div className="max-w-xs space-y-2">
            <Label>Verification interval (days)</Label>
            <Input type="number" min={7} max={730} value={form.verification_interval_days}
              onChange={(e)=>patch("verification_interval_days",Math.min(730,Math.max(7,Number(e.target.value)||180)))} />
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
