// East African Time (EAT, UTC+3) — 24-hour formatting used app-wide.
const TZ = "Africa/Nairobi";

const dateFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
});
const dateTimeFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", hour12: false,
});
const dateTimeSecFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
});

function parse(v: string | number | Date | null | undefined): Date | null {
  if (v === null || v === undefined || v === "") return null;
  const d = v instanceof Date ? v : new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

/** "21/06/2026" in EAT */
export function fmtDateEAT(v: string | number | Date | null | undefined): string {
  const d = parse(v); return d ? dateFmt.format(d) : "";
}
/** "21/06/2026 14:30" in EAT, 24h */
export function fmtDateTimeEAT(v: string | number | Date | null | undefined): string {
  const d = parse(v); if (!d) return "";
  return dateTimeFmt.format(d).replace(",", "");
}
/** "21/06/2026 14:30:55" in EAT, 24h */
export function fmtDateTimeSecEAT(v: string | number | Date | null | undefined): string {
  const d = parse(v); if (!d) return "";
  return dateTimeSecFmt.format(d).replace(",", "");
}
/** ISO date (YYYY-MM-DD) in EAT — useful for date-only filtering. */
export function isoDateEAT(v: string | number | Date | null | undefined): string {
  const d = parse(v); if (!d) return "";
  const [day, month, year] = dateFmt.format(d).split("/");
  return `${year}-${month}-${day}`;
}
