import { ChangeEvent, useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ImageIcon, Palette, RotateCcw, Save, Smartphone, Upload } from "lucide-react";
import { getPublicSaasBranding, updateSaasBranding } from "@/lib/saas.functions";
import { getServerAuthHeaders } from "@/lib/auth-headers";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/saas-admin/branding")({
  component: SaasAdminBrandingPage,
});

const ACCEPTED = new Set(["image/png", "image/webp", "image/svg+xml"]);
const MAX_BYTES = 2_000_000;
const HEX = /^#[0-9A-Fa-f]{6}$/;

function fileToDataUrl(file: File, done: (value: string) => void) {
  if (!ACCEPTED.has(file.type)) {
    toast.error("Use PNG, WebP or SVG.");
    return;
  }
  if (file.size > MAX_BYTES) {
    toast.error("Image must be under 2 MB.");
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    if (typeof reader.result === "string") done(reader.result);
  };
  reader.onerror = () => toast.error("Could not read this image.");
  reader.readAsDataURL(file);
}

function PreviewBox({ value, fallback, label }: { value: string | null; fallback: string; label: string }) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="flex h-40 items-center justify-center overflow-hidden rounded-2xl border bg-white p-5">
        <img src={value || fallback} alt={label} className="max-h-full max-w-full object-contain" />
      </div>
    </div>
  );
}

function SaasAdminBrandingPage() {
  const { isSaasAdmin } = useAuth();
  const getBranding = useServerFn(getPublicSaasBranding);
  const saveBranding = useServerFn(updateSaasBranding);
  const qc = useQueryClient();
  const logoInput = useRef<HTMLInputElement>(null);
  const iconInput = useRef<HTMLInputElement>(null);

  const [platformName, setPlatformName] = useState("AssetFlow 360");
  const [logo, setLogo] = useState<string | null>(null);
  const [icon, setIcon] = useState<string | null>(null);
  const [primary, setPrimary] = useState("#C77435");
  const [secondary, setSecondary] = useState("#4B47DC");
  const [saving, setSaving] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["public-saas-branding"],
    queryFn: () => getBranding(),
    enabled: isSaasAdmin,
  });

  useEffect(() => {
    if (!data) return;
    setPlatformName(data.name || "AssetFlow 360");
    setLogo(data.logoDataUrl);
    setIcon(data.iconDataUrl);
    setPrimary(data.primaryColor || "#C77435");
    setSecondary(data.secondaryColor || "#4B47DC");
  }, [data]);

  const chooseImage = (
    event: ChangeEvent<HTMLInputElement>,
    setter: (value: string | null) => void,
  ) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) fileToDataUrl(file, setter);
  };

  const save = async () => {
    if (!platformName.trim()) return toast.error("Platform name is required.");
    if (!HEX.test(primary) || !HEX.test(secondary)) {
      return toast.error("Brand colors must be full 6-digit hex values.");
    }

    setSaving(true);
    try {
      const headers = await getServerAuthHeaders();
      const result = await saveBranding({
        data: {
          platform_name: platformName.trim(),
          logo_data_url: logo,
          icon_data_url: icon,
          primary_color: primary.toUpperCase(),
          secondary_color: secondary.toUpperCase(),
        },
        headers,
      });

      setPlatformName(result.name);
      setLogo(result.logoDataUrl);
      setIcon(result.iconDataUrl);
      setPrimary(result.primaryColor);
      setSecondary(result.secondaryColor);

      document.documentElement.style.setProperty("--platform-primary", result.primaryColor);
      document.documentElement.style.setProperty("--platform-secondary", result.secondaryColor);

      await qc.invalidateQueries({ queryKey: ["public-saas-branding"] });
      toast.success("Platform branding saved and applied");
    } catch (e: any) {
      toast.error(e?.message || "Could not save platform branding");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="platform-brand space-y-6"
      style={{
        ["--platform-primary" as any]: primary,
        ["--platform-secondary" as any]: secondary,
      }}
    >
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Platform branding</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Control the public AssetFlow 360 identity, logo, browser/app icon and platform colors.
        </p>
      </div>

      {error && (
        <Card className="border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {(error as Error).message}
        </Card>
      )}

      <div className="grid gap-5 xl:grid-cols-[1.1fr_.9fr]">
        <Card className="p-6">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><ImageIcon className="h-5 w-5" /></span>
            <div>
              <h2 className="font-semibold">Brand assets</h2>
              <p className="mt-1 text-sm text-muted-foreground">PNG, WebP or safe SVG. Maximum 2 MB per image.</p>
            </div>
          </div>

          <div className="mt-6 space-y-5">
            <div className="space-y-2">
              <Label>Platform name</Label>
              <Input value={platformName} onChange={(e) => setPlatformName(e.target.value)} maxLength={80} />
            </div>

            <input ref={logoInput} type="file" accept=".png,.webp,.svg,image/png,image/webp,image/svg+xml" className="hidden" onChange={(e) => chooseImage(e, setLogo)} />
            <input ref={iconInput} type="file" accept=".png,.webp,.svg,image/png,image/webp,image/svg+xml" className="hidden" onChange={(e) => chooseImage(e, setIcon)} />

            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <PreviewBox value={logo} fallback="/assetflow360-logo.svg" label="Main logo / lockup" />
                <div className="mt-3 flex gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => logoInput.current?.click()}><Upload className="mr-2 h-4 w-4" /> Upload</Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setLogo(null)} disabled={!logo}><RotateCcw className="mr-2 h-4 w-4" /> Default</Button>
                </div>
              </div>

              <div>
                <PreviewBox value={icon} fallback="/assetflow360-mark.svg" label="App icon / favicon" />
                <div className="mt-3 flex gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => iconInput.current?.click()}><Upload className="mr-2 h-4 w-4" /> Upload</Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setIcon(null)} disabled={!icon}><RotateCcw className="mr-2 h-4 w-4" /> Default</Button>
                </div>
              </div>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><Palette className="h-5 w-5" /></span>
            <div>
              <h2 className="font-semibold">Brand colors</h2>
              <p className="mt-1 text-sm text-muted-foreground">These colors drive public pages and the SaaS administration interface.</p>
            </div>
          </div>

          <div className="mt-6 space-y-5">
            <div className="grid grid-cols-[72px_1fr] items-end gap-3">
              <input type="color" value={HEX.test(primary) ? primary : "#C77435"} onChange={(e) => setPrimary(e.target.value.toUpperCase())} className="h-10 w-[72px] cursor-pointer rounded-lg border bg-transparent p-1" />
              <div className="space-y-2"><Label>Primary</Label><Input value={primary} onChange={(e) => setPrimary(e.target.value)} maxLength={7} /></div>
            </div>
            <div className="grid grid-cols-[72px_1fr] items-end gap-3">
              <input type="color" value={HEX.test(secondary) ? secondary : "#4B47DC"} onChange={(e) => setSecondary(e.target.value.toUpperCase())} className="h-10 w-[72px] cursor-pointer rounded-lg border bg-transparent p-1" />
              <div className="space-y-2"><Label>Secondary</Label><Input value={secondary} onChange={(e) => setSecondary(e.target.value)} maxLength={7} /></div>
            </div>

            <div className="overflow-hidden rounded-2xl border">
              <div className="bg-sidebar p-5 text-sidebar-foreground">
                <p className="text-xs uppercase tracking-wide text-sidebar-foreground/60">Live preview</p>
                <div className="mt-3 flex items-center gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-sidebar-primary text-sidebar-primary-foreground"><Smartphone className="h-5 w-5" /></span>
                  <div><p className="font-bold">{platformName || "AssetFlow 360"}</p><p className="text-xs text-sidebar-foreground/60">SaaS Control</p></div>
                </div>
              </div>
              <div className="bg-background p-5">
                <p className="text-sm font-semibold">Primary action</p>
                <p className="mt-1 text-xs text-muted-foreground">Secondary accents use the second brand color.</p>
                <div className="mt-4 flex gap-2">
                  <Button type="button">Start free trial</Button>
                  <span className="brand-secondary-soft inline-flex items-center rounded-lg px-3 text-xs font-semibold">Secondary</span>
                </div>
              </div>
            </div>
          </div>
        </Card>
      </div>

      <div className="sticky bottom-4 flex justify-end">
        <Card className="flex items-center gap-3 p-3 shadow-xl">
          <p className="hidden text-xs text-muted-foreground sm:block">Preview changes above, then apply globally.</p>
          <Button onClick={save} disabled={saving || isLoading}>
            <Save className="mr-2 h-4 w-4" />
            {saving ? "Saving…" : "Save & apply branding"}
          </Button>
        </Card>
      </div>
    </div>
  );
}
