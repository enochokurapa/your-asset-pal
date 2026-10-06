export const CURRENT_ADMIN_SOURCE: Record<string,string> = {
  UG: "UBOS NPHC 2024",
  KE: "KNBS current counties",
  TZ: "Tanzania NBS 2025",
  RW: "Rwanda NISR 2026",
  ZM: "ZamStats 2026",
  MW: "Malawi NSO 2024",
  ZW: "ZIMSTAT 2023-24",
};

export const CURRENT_ADMIN_CONFIG: Record<string,{level:number;label:string}> = {
  UG:{level:2,label:"District"},
  KE:{level:1,label:"County"},
  TZ:{level:1,label:"Region"},
  RW:{level:2,label:"District"},
  ZM:{level:1,label:"Province"},
  MW:{level:2,label:"District"},
  ZW:{level:1,label:"Province"},
};

export function currentAdminSource(countryCode:string) {
  return CURRENT_ADMIN_SOURCE[countryCode] ?? null;
}
