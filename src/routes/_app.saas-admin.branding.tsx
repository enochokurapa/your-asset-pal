import { ChangeEvent, useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ImageIcon, RotateCcw, Save, Upload } from "lucide-react";
import { getPublicSaasBranding, updateSaasBranding } from "@/lib/saas.functions";
import { getServerAuthHeaders } from "@/lib/auth-headers";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/saas-admin/branding")({
  component: SaasAdminBrandingPage,
});

const ACCEPTED = new Set(["image/png", "image/webp", "image/svg+xml"]);
const MAX_BYTES = 2_000_000;

function SaasAdminBrandingPage() {
  const { isSaasAdmin } = useAuth();
  const getBranding = useServerFn(getPublicSaasBranding);
  const saveBranding = useServerFn(updateSaasBranding);
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [logo, setLogo] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["public-saas-branding"],
    queryFn: () => getBranding(),
    enabled: isSaasAdmin,
  });

  useEffect(() => {
    if (data) setLogo(data.logoDataUrl);
  }, [data]);

  const chooseLogo = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (!ACCEPTED.has(file.type)) {
      toast.error("Use PNG, WebP or SVG.");
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error("Logo must be under 2 MB.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => setLogo(typeof reader.result === "string" ? reader.result : null);
    reader.onerror = () => toast.error("Could not read this logo.");
    reader.readAsDataURL(file);
  };

  const save = async () => {
    setSaving(true);
    try {
      const headers = await getServerAuthHeaders();
      const result = await saveBranding({ data: { logo_data_url: logo }, headers });
      setLogo(result.logoDataUrl);
      await qc.invalidateQueries({ queryKey: ["public-saas-branding"] });
      toast.success("Platform logo updated");
    } catch (e: any) {
      toast.error(e?.message || "Could not save platform logo");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Platform branding</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Change the AssetFlow 360 platform logo shown on public and SaaS administration screens.
        </p>
      </div>

      <Card className="max-w-3xl p-6">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <ImageIcon className="h-5 w-5" />
          </span>
          <div>
            <h2 className="font-semibold">Platform logo</h2>
            <p className="mt-1 text-sm text-muted-foreground">PNG, WebP or SVG. Maximum file size: 2 MB.</p>
          </div>
        </div>

        {error && <p className="mt-5 text-sm text-destructive">{(error as Error).message}</p>}

        <div className="mt-6 grid gap-6 md:grid-cols-[220px_1fr] md:items-start">
          <div className="flex aspect-square items-center justify-center overflow-hidden rounded-2xl border bg-muted/30 p-5">
            {isLoading ? (
              <div className="h-7 w-7 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            ) : logo ? (
              <img src={logo} alt="Platform logo preview" className="max-h-full max-w-full object-contain" />
            ) : (
              <div className="text-center text-muted-foreground">
                <ImageIcon className="mx-auto h-10 w-10" />
                <p className="mt-2 text-xs">No custom logo</p>
              </div>
            )}
          </div>

          <div className="space-y-4">
            <div>
              <Label>Upload logo</Label>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Use a transparent PNG/WebP or a clean SVG for the sharpest result. SVG files with scripts or active content are rejected.
              </p>
            </div>

            <input
              ref={inputRef}
              type="file"
              accept=".png,.webp,.svg,image/png,image/webp,image/svg+xml"
              className="hidden"
              onChange={chooseLogo}
            />

            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={() => inputRef.current?.click()}>
                <Upload className="mr-2 h-4 w-4" /> Choose logo
              </Button>
              <Button type="button" variant="outline" onClick={() => setLogo(null)} disabled={!logo}>
                <RotateCcw className="mr-2 h-4 w-4" /> Remove
              </Button>
            </div>

            <Button type="button" onClick={save} disabled={saving || isLoading}>
              <Save className="mr-2 h-4 w-4" />
              {saving ? "Saving…" : "Save platform logo"}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
