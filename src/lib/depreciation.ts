// Depreciation calculation engine. Pure functions — no I/O.

export type DepreciationMethod = "straight_line" | "reducing_balance" | "units_of_production";
export type DepreciationFrequency = "monthly" | "quarterly" | "annually";

export const METHOD_LABEL: Record<DepreciationMethod, string> = {
  straight_line: "Straight line",
  reducing_balance: "Reducing balance",
  units_of_production: "Units of production",
};
export const FREQ_LABEL: Record<DepreciationFrequency, string> = {
  monthly: "Monthly", quarterly: "Quarterly", annually: "Annually",
};

export interface AssetDepCfg {
  purchase_value: number | null | undefined;
  residual_value: number | null | undefined;
  useful_life_months: number | null | undefined;
  depreciation_method: DepreciationMethod | null | undefined;
  depreciation_frequency: DepreciationFrequency | null | undefined;
  depreciation_start_date: string | null | undefined; // ISO date
  total_units?: number | null;
  units_consumed?: number | null;
  accumulated_depreciation?: number | null;
  impairment_amount?: number | null;
  status?: string | null;
}

export function periodMonths(f: DepreciationFrequency): number {
  return f === "monthly" ? 1 : f === "quarterly" ? 3 : 12;
}
export function periodFraction(f: DepreciationFrequency): number {
  return periodMonths(f) / 12;
}

export function netBookValue(a: AssetDepCfg): number {
  const cost = Number(a.purchase_value ?? 0);
  const acc = Number(a.accumulated_depreciation ?? 0);
  const imp = Number(a.impairment_amount ?? 0);
  const res = Number(a.residual_value ?? 0);
  return Math.max(cost - acc - imp, res);
}

export function isDepreciable(a: AssetDepCfg): boolean {
  if (!a.purchase_value || !a.depreciation_method || !a.useful_life_months) return false;
  if (a.status === "disposed" || a.status === "retired") return false;
  return netBookValue(a) > Number(a.residual_value ?? 0);
}

/** Compute depreciation for a single period. */
export function computePeriod(
  a: AssetDepCfg,
  unitsThisPeriod?: number,
): { opening: number; depreciation: number; accumulated: number; closing: number } {
  const cost = Number(a.purchase_value ?? 0);
  const residual = Number(a.residual_value ?? 0);
  const lifeMonths = Number(a.useful_life_months ?? 0);
  const freq: DepreciationFrequency = (a.depreciation_frequency ?? "monthly") as DepreciationFrequency;
  const method: DepreciationMethod = (a.depreciation_method ?? "straight_line") as DepreciationMethod;
  const accStart = Number(a.accumulated_depreciation ?? 0);
  const imp = Number(a.impairment_amount ?? 0);
  const opening = Math.max(cost - accStart - imp, residual);

  if (!isDepreciable(a)) {
    return { opening, depreciation: 0, accumulated: accStart, closing: opening };
  }

  let dep = 0;
  if (method === "straight_line") {
    const totalDep = Math.max(cost - residual, 0);
    const perMonth = totalDep / lifeMonths;
    dep = perMonth * periodMonths(freq);
  } else if (method === "reducing_balance") {
    const lifeYears = Math.max(lifeMonths / 12, 1 / 12);
    const ratePerYear = 1 / lifeYears; // simple reducing balance
    dep = opening * ratePerYear * periodFraction(freq);
  } else if (method === "units_of_production") {
    const totalUnits = Number(a.total_units ?? 0);
    const used = Number(unitsThisPeriod ?? 0);
    if (totalUnits > 0) {
      const perUnit = Math.max(cost - residual, 0) / totalUnits;
      dep = perUnit * used;
    }
  }

  // Floor at residual
  const closingRaw = opening - dep;
  const closing = Math.max(closingRaw, residual);
  const actualDep = opening - closing;
  return {
    opening,
    depreciation: round2(actualDep),
    accumulated: round2(accStart + actualDep),
    closing: round2(closing),
  };
}

function round2(n: number) { return Math.round(n * 100) / 100; }

/** Build a full forward-looking schedule from current state. */
export function buildSchedule(a: AssetDepCfg, maxPeriods?: number): Array<{
  index: number; periodStart: string; periodEnd: string;
  opening: number; depreciation: number; accumulated: number; closing: number;
}> {
  const rows: ReturnType<typeof buildSchedule> = [] as any;
  if (!isDepreciable(a)) return rows;
  const freq: DepreciationFrequency = (a.depreciation_frequency ?? "monthly") as DepreciationFrequency;
  // Cap horizon to the asset's configured useful life (in periods), unless caller overrides.
  const lifeMonths = Number(a.useful_life_months ?? 0);
  const cap = maxPeriods ?? (lifeMonths > 0 ? Math.ceil(lifeMonths / periodMonths(freq)) : 240);
  const startStr = a.depreciation_start_date || a.depreciation_start_date || new Date().toISOString().slice(0, 10);
  let cursor = new Date(startStr);
  let state: AssetDepCfg = { ...a };
  for (let i = 0; i < cap; i++) {
    if (!isDepreciable(state)) break;
    const pStart = new Date(cursor);
    const pEnd = addMonths(pStart, periodMonths(freq));
    const r = computePeriod(state);
    if (r.depreciation <= 0) break;
    rows.push({
      index: i + 1,
      periodStart: pStart.toISOString().slice(0, 10),
      periodEnd: new Date(pEnd.getTime() - 86400000).toISOString().slice(0, 10),
      opening: r.opening, depreciation: r.depreciation,
      accumulated: r.accumulated, closing: r.closing,
    });
    state = { ...state, accumulated_depreciation: r.accumulated };
    cursor = pEnd;
  }
  return rows;
}

function addMonths(d: Date, m: number): Date {
  const x = new Date(d);
  x.setMonth(x.getMonth() + m);
  return x;
}

export function currentPeriodWindow(freq: DepreciationFrequency, ref: Date = new Date()): { start: string; end: string } {
  const y = ref.getUTCFullYear();
  const m = ref.getUTCMonth();
  if (freq === "monthly") {
    const s = new Date(Date.UTC(y, m, 1));
    const e = new Date(Date.UTC(y, m + 1, 0));
    return { start: s.toISOString().slice(0, 10), end: e.toISOString().slice(0, 10) };
  }
  if (freq === "quarterly") {
    const qStart = Math.floor(m / 3) * 3;
    const s = new Date(Date.UTC(y, qStart, 1));
    const e = new Date(Date.UTC(y, qStart + 3, 0));
    return { start: s.toISOString().slice(0, 10), end: e.toISOString().slice(0, 10) };
  }
  const s = new Date(Date.UTC(y, 0, 1));
  const e = new Date(Date.UTC(y, 12, 0));
  return { start: s.toISOString().slice(0, 10), end: e.toISOString().slice(0, 10) };
}

export function previousPeriodWindow(freq: DepreciationFrequency, ref: Date = new Date()): { start: string; end: string } {
  const months = periodMonths(freq);
  const prev = new Date(ref);
  prev.setUTCMonth(prev.getUTCMonth() - months);
  return currentPeriodWindow(freq, prev);
}
