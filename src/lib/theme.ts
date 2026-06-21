// Lightweight runtime theme customization stored in localStorage.
// Overrides CSS variables on :root so Tailwind v4 picks them up immediately.

export interface ThemePreset {
  id: string;
  name: string;
  primary: string;
  accent: string;
  sidebar: string;
  sidebarPrimary: string;
}

export const THEME_PRESETS: ThemePreset[] = [
  { id: "ocean",   name: "Ocean (default)", primary: "#1e6fbf", accent: "#7fd3e8", sidebar: "#1f3550", sidebarPrimary: "#3aa0e0" },
  { id: "forest",  name: "Forest",          primary: "#2f8f4e", accent: "#a8e3b8", sidebar: "#1e3a2b", sidebarPrimary: "#4dbd6c" },
  { id: "sunset",  name: "Sunset",          primary: "#d9534f", accent: "#ffd6a5", sidebar: "#3a1f2b", sidebarPrimary: "#ff7a59" },
  { id: "violet",  name: "Violet",          primary: "#7c3aed", accent: "#ddc7ff", sidebar: "#2a1f44", sidebarPrimary: "#a78bfa" },
  { id: "graphite",name: "Graphite",        primary: "#475569", accent: "#cbd5e1", sidebar: "#1e293b", sidebarPrimary: "#64748b" },
  { id: "gold",    name: "Royal Gold",      primary: "#b8860b", accent: "#f5d98e", sidebar: "#2b2415", sidebarPrimary: "#e0b34a" },
];

export interface FontOption {
  id: string;
  name: string;
  /** CSS font-family value used on :root */
  stack: string;
}

// All loaded via Google Fonts <link> in src/routes/__root.tsx so they
// render correctly across the app, exports, and PDFs.
export const FONT_OPTIONS: FontOption[] = [
  { id: "system",     name: "System default",  stack: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" },
  { id: "inter",      name: "Inter",           stack: "'Inter', sans-serif" },
  { id: "roboto",     name: "Roboto",          stack: "'Roboto', sans-serif" },
  { id: "open-sans",  name: "Open Sans",       stack: "'Open Sans', sans-serif" },
  { id: "lato",       name: "Lato",            stack: "'Lato', sans-serif" },
  { id: "poppins",    name: "Poppins",         stack: "'Poppins', sans-serif" },
  { id: "nunito",     name: "Nunito",          stack: "'Nunito', sans-serif" },
  { id: "montserrat", name: "Montserrat",      stack: "'Montserrat', sans-serif" },
  { id: "raleway",    name: "Raleway",         stack: "'Raleway', sans-serif" },
  { id: "work-sans",  name: "Work Sans",       stack: "'Work Sans', sans-serif" },
  { id: "dm-sans",    name: "DM Sans",         stack: "'DM Sans', sans-serif" },
  { id: "manrope",    name: "Manrope",         stack: "'Manrope', sans-serif" },
  { id: "outfit",     name: "Outfit",          stack: "'Outfit', sans-serif" },
  { id: "figtree",    name: "Figtree",         stack: "'Figtree', sans-serif" },
  { id: "plus-jakarta", name: "Plus Jakarta Sans", stack: "'Plus Jakarta Sans', sans-serif" },
  { id: "ibm-plex",   name: "IBM Plex Sans",   stack: "'IBM Plex Sans', sans-serif" },
  { id: "source-sans",name: "Source Sans 3",   stack: "'Source Sans 3', sans-serif" },
  { id: "noto-sans",  name: "Noto Sans",       stack: "'Noto Sans', sans-serif" },
  { id: "rubik",      name: "Rubik",           stack: "'Rubik', sans-serif" },
  { id: "karla",      name: "Karla",           stack: "'Karla', sans-serif" },
  { id: "merriweather", name: "Merriweather (serif)", stack: "'Merriweather', serif" },
  { id: "playfair",   name: "Playfair Display (serif)", stack: "'Playfair Display', serif" },
  { id: "lora",       name: "Lora (serif)",    stack: "'Lora', serif" },
  { id: "jetbrains",  name: "JetBrains Mono (mono)", stack: "'JetBrains Mono', monospace" },
];

const STORAGE_KEY = "af.theme";

export interface StoredTheme {
  presetId: string;
  primary?: string;
  fontId?: string;
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
  const font = FONT_OPTIONS.find((f) => f.id === t.fontId) ?? FONT_OPTIONS[0];
  root.setProperty("--font-sans", font.stack);
  document.documentElement.style.fontFamily = font.stack;
}
