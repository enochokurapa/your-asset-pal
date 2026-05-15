# Implementation Plan

## 1. Currency: USD → UGX
- Replace every `$` and `USD` formatter with `UGX` (e.g. `UGX 1,250,000`).
- Central helper `formatUGX(n)` in `src/lib/utils.ts`; swap in dashboard, assets list, asset detail, reports, disposals.

## 2. Dashboard changes
- Remove "Total value" tile/row.
- Add new tiles: **Branches**, **Assets per branch** (small table), **Total assets across all branches**.
- Add **Asset condition** pie + **Asset status** bar (Recharts).

## 3. Branches (new)
- New table `branches` (name, code, address, created_by, is_active). Admin-only writes via RLS (`has_role admin`); no delete (soft-disable only).
- Add `branch_id` to: `assets`, `asset_movements` (from_branch_id, to_branch_id), `asset_assignments`.
- New page `/branches` (admin only) for create/edit/disable.
- Asset form: branch selector (required).

## 4. Asset additions
- Add `serial_number` column on assets (nullable, unique-when-present index).
- Asset form gets Serial Number field.
- **Duplicate-scan guard**: when scanner returns a code, query assets by `asset_tag` OR `serial_number`; if found, show "Already registered" dialog with link to that asset instead of creating.

## 5. Retire-instead-of-delete + approval
- Remove all delete buttons on assets; replace with **Retire** action.
- Reuse existing disposal/approval flow but add `retirement_reason` + admin approval requirement (status pending → approved/rejected). Asset status flips to `retired` only on admin approval.
- Hide hard-delete from non-admins; admins still have soft action only.

## 6. Audit trail
- New table `audit_log` (entity_type, entity_id, action, actor_user_id, details jsonb, created_at).
- DB triggers on `assets`, `asset_movements`, `asset_assignments`, `asset_disposals`, `branches` to insert audit rows on INSERT/UPDATE.
- New `/audit` page (admin/manager) — filter by entity, actor, date.
- Asset detail: "Activity" tab showing this asset's audit rows.

## 7. Asset movement upgrades
- Add `from_user`, `to_user`, `from_branch_id`, `to_branch_id`, `transfer_type` ('internal'|'external') to `asset_movements`.
- Movement form captures all of the above; defaults `transfer_type` based on whether branches differ.

## 8. Reports overhaul (`/reports`)
Enrich the existing reports with joined columns:
- **Asset Register**: Tag, Serial #, Name, Category, Sub-category, Location, Sub-location, Branch, Assigned to, Department, Status, Condition, Purchase date, Purchase value (UGX).
- **Movement Report**: From branch/location/user → To branch/location/user, date, reason, moved by.
- **Assigned Assets**: asset, assignee, department, branch, assignment date, return date.
- **Disposal/Retirement Report**: asset, reason, date, value, requested by, approved by, status.
- **Maintenance History**: (existing).
- New **Branch Report**: per-branch asset counts + value.
- New **Departmental Report**: per-department asset counts.
- New **Condition Report**: charts (pie by condition, bar by status), filterable by branch.
- All reports: PDF + Excel export already wired; extend to new columns + new reports.

## 9. RLS / Policy updates
- `branches`: admin-only writes; everyone authenticated can read.
- `audit_log`: insert via trigger (security definer); read by admin/manager only.
- Block hard DELETE on assets (revoke delete policy; only retire path).

## Technical notes
- Migrations: one consolidated migration adds `branches`, columns on `assets`/`asset_movements`/`asset_assignments`, `audit_log`, triggers, RLS, and a unique partial index on `assets.serial_number`.
- Charts: use existing `recharts` (already in shadcn `chart` component).
- Approval reasons UI already exists on disposals; reuse for retirements.
- No `client.server` imports in components; reads stay on browser client (RLS-respecting).

## Out of scope for this pass (flag if needed)
- Migrating historical data into branches (will set a default "Head Office" branch and assign existing assets to it).
- Email notifications on approval.

Shall I proceed?