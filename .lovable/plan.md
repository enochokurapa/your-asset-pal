# Depreciation Module Plan

A complete depreciation subsystem integrated into the asset lifecycle, with schedules, runs, reports, RBAC, audit, and UGX formatting.

## 1. Database (migration)

New enum + columns + tables:

- `depreciation_method` enum: `straight_line`, `reducing_balance`, `units_of_production`.
- `depreciation_frequency` enum: `monthly`, `quarterly`, `annually`.
- `assets` add: `depreciation_method`, `useful_life_months int`, `residual_value numeric`, `depreciation_start_date date`, `depreciation_frequency`, `total_units numeric` (UoP), `units_consumed numeric`, `accumulated_depreciation numeric default 0`, `last_depreciation_date date`, `impairment_amount numeric default 0`.
- `category_depreciation_defaults` (per category default method/life/residual/frequency).
- `depreciation_runs` (id, period_start, period_end, run_type [scheduled|manual], triggered_by, created_at, totals jsonb, status). Unique on `(period_start, period_end)` to prevent duplicate runs.
- `depreciation_entries` (id, run_id, asset_id, period_start, period_end, opening_value, depreciation_amount, accumulated_after, closing_value, method, notes). Unique on `(asset_id, period_end)` to prevent per-asset duplicates.
- `depreciation_overrides` (id, asset_id, effective_date, type [impairment|manual_adjustment|residual_change], amount, reason, created_by).
- New `action_kind` values: `manage_depreciation`, `run_depreciation`, `override_depreciation`.
- New permission module: `depreciation`.
- Standard GRANTs, RLS (read for authenticated, write gated by `can_do`/admin/manager).
- Audit trigger reused via `write_audit`.

## 2. Calculation engine (`src/lib/depreciation.ts`)

Pure TS helpers:

- `periodFraction(frequency)` → 1/12, 1/4, 1.
- `straightLine(cost, residual, lifeMonths, frequency)`.
- `reducingBalance(bookValue, ratePerYear, frequency)`; rate derived from useful life (e.g. `2/lifeYears` double-declining option or `1/lifeYears` simple).
- `unitsOfProduction(cost, residual, totalUnits, unitsThisPeriod)`.
- `computePeriod(asset, periodStart, periodEnd, unitsConsumed?)` → returns `{opening, depreciation, accumulated, closing}` honoring residual floor and impairment.
- `buildSchedule(asset)` → array of all future periods until NBV hits residual; used in UI preview & reports.
- Guards: skip if asset disposed/retired; transfers still depreciate (location/branch changes do not affect calc).

## 3. UI

- `src/components/depreciation-form-section.tsx`: form section for asset create/edit (method, useful life, residual, start date, frequency, total units when UoP). Validations: residual < cost, useful life > 0, residual ≥ 0.
- `src/components/asset-detail-tabs.tsx`: add **Depreciation** tab showing config, current NBV, accumulated, last run, schedule table (Period / Opening / Depreciation / Accumulated / Closing), override/impair button, "Recompute schedule" preview. Export schedule PDF/Excel.
- Show NBV badge in asset table & asset detail header. Alert when NBV ≈ residual or fully depreciated.
- Dashboard: new tile **Depreciation (YTD)** showing sum of depreciation for current FY; clickable to report.

## 4. Depreciation runs page (`src/routes/_app.depreciation.tsx`)

- List of runs with totals, status, who triggered.
- "Run depreciation" button (admin / `run_depreciation`): pick period (defaults to next unrun month). Server-side dedupe via unique constraint + `is_admin_or_manager` check.
- Server fn `runDepreciation({periodStart, periodEnd, runType})` in `src/lib/depreciation.functions.ts`:
  - Lock against duplicate using the unique constraint (catch 23505 → "already run").
  - For each active, non-disposed asset with depreciation config, compute entry, insert into `depreciation_entries`, update `assets.accumulated_depreciation` and `last_depreciation_date`.
  - Write audit row.

## 5. Scheduled automation

- Server route `src/routes/api/public/hooks/depreciation-cron.ts` validating `apikey` header, calling the same run helper for the previous month.
- pg_cron job (insert tool) calling that URL monthly on the 1st at 02:00.

## 6. Reports (`src/routes/_app.reports.tsx`)

Add **Depreciation** report tabs: Summary, NBV, Accumulated, By Category. Each with Excel + PDF export reusing existing `asset-export` patterns (new `depreciation-export.ts`).

## 7. RBAC

- `useAuth`: extend `ALL_ACTION_KINDS` with `manage_depreciation`, `run_depreciation`, `override_depreciation`; extend `ALL_MODULES` with `depreciation`.
- `_app.users.tsx`: surface the new module + action toggles automatically (uses the same arrays).
- Admin: all rights. Others: assigned.

## 8. Audit

Existing `write_audit` trigger applied to `depreciation_runs`, `depreciation_entries`, `depreciation_overrides`, plus updates to depreciation fields on `assets` (already triggered).

## 9. Lifecycle hooks

- Approving disposal/retirement: set asset status; run helper skips disposed/retired.
- Impairment: `depreciation_overrides` row with `type='impairment'` reduces book value at next computation.
- Residual floor enforced inside `computePeriod`.

## 10. UGX

All amounts formatted via existing `formatUGX`.

## Out of scope (acknowledged but deferred unless asked)

Bulk depreciation templating UI beyond category defaults; multi-currency.

---

## Technical notes

- All monetary math uses `Number` with `Math.max(closing, residual)` clamping.
- `period_end` rounding: end of month / quarter / year boundary.
- Server fn uses `requireSupabaseAuth`; `attachSupabaseAuth` already wired.
- Migration creates everything in one shot with GRANTs and RLS.

Approve to proceed and I'll ship the migration first, then code in the following turn.