// Lightweight runtime theme customization stored in localStorage.
// Overrides CSS variables on :root so Tailwind v4 picks them up immediately.

export interface ThemePreset {
  id: string;
  name: string;
  primary: string;       // hex
  accent: string;        // hex
  sidebar: string;       // hex (dark)
  sidebarPrimary: string;// hex
}

export const THEME_PRESETS: ThemePreset[] = [
  { id: "ocean",   name: "Ocean (default)", primary: "#1e6fbf", accent: "#7fd3e8", sidebar: "#1f3550", sidebarPrimary: "#3aa0e0" },
  { id: "forest",  name: "Forest",          primary: "#2f8f4e", accent: "#a8e3b8", sidebar: "#1e3a2b", sidebarPrimary: "#4dbd6c" },
  { id: "sunset",  name: "Sunset",          primary: "#d9534f", accent: "#ffd6a5", sidebar: "#3a1f2b", sidebarPrimary: "#ff7a59" },
  { id: "violet",  name: "Violet",          primary: "#7c3aed", accent: "#ddc7ff", sidebar: "#2a1f44", sidebarPrimary: "#a78bfa" },
  { id: "graphite",name: "Graphite",        primary: "#475569", accent: "#cbd5e1", sidebar: "#1e293b", sidebarPrimary: "#64748b" },
  { id: "gold",    name: "Royal Gold",      primary: "#b8860b", accent: "#f5d98e", sidebar: "#2b2415", sidebarPrimary: "#e0b34a" },
];

const STORAGE_KEY = "af.theme";

export interface StoredTheme {
  presetId: string;
  primary?: string; // optional custom override
}

export function loadStoredTheme(): StoredTheme {
  if (typeof window === "undefined") return { presetId: "ocean" };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { presetId: "ocean" };
    return JSON.parse(raw);
  } catch { return { presetId: "ocean" }; }
}

export function saveStoredTheme(t: StoredTheme) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(t));
  applyStoredTheme(t);
  window.dispatchEvent(new CustomEvent("af:theme-changed", { detail: t }));
}

export function applyStoredTheme(t: StoredTheme = loadStoredTheme()) {
  if (typeof document === "undefined") return;
  const preset = THEME_PRESETS.find((p) => p.id === t.presetId) ?? THEME_PRESETS[0];
  const root = document.documentElement.style;
  const primary = t.primary || preset.primary;
  root.setProperty("--primary", primary);
  root.setProperty("--ring", primary);
  root.setProperty("--accent", preset.accent);
  root.setProperty("--sidebar", preset.sidebar);
  root.setProperty("--sidebar-primary", preset.sidebarPrimary);
  root.setProperty("--sidebar-ring", preset.sidebarPrimary);
}
