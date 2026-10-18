export function builderPayload<T = unknown>(value: unknown): T {
  let current: unknown = value;
  for (let i = 0; i < 3; i++) {
    if (current === null || Array.isArray(current) || typeof current !== "object") break;
    const record = current as Record<string, unknown>;
    if (record.error) {
      const err = record.error as { message?: string } | string;
      throw new Error(typeof err === "string" ? err : err.message || "Builder API failed");
    }
    if ("id" in record || "definitions" in record || "primaryId" in record || "ok" in record) break;
    if ("data" in record) { current = record.data; continue; }
    if ("result" in record) { current = record.result; continue; }
    break;
  }
  if (typeof current === "string" && /^\s*(?:<!doctype html|<html)/i.test(current)) {
    throw new Error("Builder API returned an HTML page instead of data");
  }
  return current as T;
}

export function builderList<T extends { id: string }>(response: unknown): T[] {
  const payload = builderPayload(response);
  if (!Array.isArray(payload)) { const shape=payload===null?"null":typeof payload; const keys=payload && typeof payload==="object" ? Object.keys(payload).slice(0,8).join(",") : ""; console.error("[BuilderDiag] Invalid list response", {shape,keys}); throw new Error(`Builder API returned ${shape} instead of a list${keys?` (fields: ${keys})`:""}`); }
  return payload.filter((row): row is T => !!row && typeof row === "object" && typeof row.id === "string");
}
