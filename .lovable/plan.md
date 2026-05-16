This is a large multi-part change. I'll group it into logical phases so each piece is reviewable and ships without breaking the rest.

## Phase 1 — Schema & data model

New tables / columns (single migration):

- `notifications` — `id, user_id (target), type, title, body, entity_type, entity_id, requires_action (bool), action_status ('pending'|'approved'|'rejected'|'acknowledged'), beep (bool), read_at, created_at`. RLS: user reads/updates own; managers+admins can also read role-targeted rows. Realtime enabled.
- `approval_requests` — unified queue for things needing admin/super-admin approval: `kind ('movement'|'retirement'|'disposal'|'reactivation'|'update'), asset_id, requested_by, status, reason (for rejection), approver_id, decided_at, payload jsonb`. Triggers create notifications on insert / status change.
- `asset_imports` — log of bulk imports (file name, row count, success/error counts, by user).
- `categories.is_active boolean default true`, `locations.is_active boolean default true`, `branches` already has it. Block hard DELETE on all three via RLS (only UPDATE is_active).
- `assets`: rename status enum value `lost` → `missing` (add `missing`, migrate rows, drop `lost`). Add `set_for_disposal boolean default false`.
- `asset_movements`: ensure `from_user` auto-populates from current custodian (handled in app code).
- Trigger: any insert into `asset_movements`, `asset_disposals`, `approval_requests` writes a notification row (for managers/admins on submission; for requester on decision).

## Phase 2 — Notifications system

- `useNotifications()` hook (React Query + Supabase realtime subscription to `notifications`).
- **Bell** in top bar (`_app.tsx`), with unread badge. Dropdown lists items; clicking marks read and navigates to entity.
- **Beep**: small WebAudio loop (light tone every ~6s) while there's any unread `requires_action && action_status='pending'` notification. Stops once acknowledged/decided. Movements & updates create notifications **without** beep.
- Email: use Lovable Emails. I'll set up email infra + scaffold transactional templates: `approval-requested`, `approval-decided` (approved/rejected with reason). Triggered from app code after insert/decision. (Needs a verified sender domain — I'll surface the setup dialog if none exists.)

## Phase 3 — Approvals workflow overhaul

- All retirement, disposal, movement, reactivation, and edits-on-locked-fields create an `approval_requests` row instead of writing directly.
- Dashboard "Recently added" tile **replaced** with **Pending Approvals** list, each row with dropdown: **Approve / Review / Reject** (Reject opens dialog requiring reason). On decision: update target entity, notify requester, log audit.
- **Reactivation of retired assets**: manager/branch head submits → super admin (admin role) approves → status returns to previous.
- **Admin-only audit clear**: button on `/audit` visible only to admins; soft-clears by archiving (we keep a `cleared_at` flag rather than hard delete to preserve trail integrity).

## Phase 4 — Dashboard updates

- Tiles: add **Missing** (renamed from Lost) and **Set for Disposal**. Keep existing.
- Replace "Recently added" card with **Pending approvals** card (with action dropdown).
- Notification bell with unread count + beep behavior.
- Status enum display updated everywhere `lost` appeared → `missing`.

## Phase 5 — Assets module

- **Filters bar**: name, tag, serial, location, branch, category, department, status — combinable. Multi-select chips, URL-synced.
- **Add Asset dialog**: extend with inline Custodian (user picker) + Department fields, so a custodian can be assigned without opening the assignment page. The dedicated assignment page remains.
- **Scanner**: switch from current barcode-only to combined barcode+QR using `@zxing/browser` (supports both). Add scan buttons next to **both** asset tag and serial number inputs in create/edit form, and on the global scanner.
- **Import**: new "Import" button → upload `.xlsx`. Sample template downloadable (`/assets/sample-asset-register.xlsx`) with columns: tag, serial, name, description, category, location, branch, status, purchase_date, purchase_value, custodian_email, department. Parse with `xlsx` lib, validate, insert in batch, log to `asset_imports`. Show row-by-row errors.

## Phase 6 — Movements

- "From person" auto-fills from asset's current custodian (last `asset_assignments` row) and is read-only unless overridden.
- Movement submission creates an `approval_requests` row (kind=`movement`) → notification (no beep) → on approval, the move applies and assignment record is created/updated.

## Phase 7 — Inactive instead of delete

- Branches, locations, categories, sub-categories: replace Delete buttons with **Active** checkbox (toggles `is_active`).
- Default list views filter `is_active=true`; add "Show inactive" toggle. Inactive items shown in a muted style for audit reference.
- DB: RLS already blocks delete on branches; add policies blocking DELETE on categories/locations (admin-only at most, but UI removes it entirely).

## Phase 8 — Drill-down dashboards (Branch / Location / Category)

- New routes: `/branches/$id`, `/locations/$id`, `/categories/$id`. Each shows:
  - Summary tiles (asset count, by status/condition)
  - Charts (status pie, condition bar)
  - Asset list (filtered)
  - Audit trail for that scope
  - Reports section with **Excel** + **PDF** export buttons
- Reuse existing report-builder helpers from `_app.reports.tsx`.

## Phase 9 — Audit & Reports filters

- `/audit`: filters by entity_type, action, actor, date range, asset (with combobox). Each row links to `/assets/$id` (or branch/location for those entities). Export to Excel + PDF.
- `/reports`: add filter sidebar (branch, location, category, department, status, date range). All reports get Excel + PDF.

## Technical notes

- **Charts**: Recharts (already installed).
- **Excel**: `xlsx` (SheetJS) — install.
- **PDF**: `jspdf` + `jspdf-autotable` (already in use in reports).
- **Scanner**: replace ZBar with `@zxing/browser` for combined 1D+QR.
- **Email**: Lovable Emails. Will trigger the domain setup dialog if no verified sender domain exists.
- **Realtime**: enable on `notifications` and `approval_requests` via `ALTER PUBLICATION supabase_realtime ADD TABLE …`.
- **No hard deletes** anywhere; existing `admin delete assets` RLS will be removed too (retire instead).

## Suggested rollout order

Because this is ~9 phases I'll ship in this order to keep each diff testable:

1. Migration (Phase 1) + RLS
2. Notifications + bell + beep (Phase 2 minus email)
3. Approvals workflow + dashboard pending list + tile changes (Phases 3 & 4)
4. Asset filters + inline custodian + import + scanner upgrade (Phase 5)
5. Movement from-person autofill + approval routing (Phase 6)
6. Active toggles on branches/locations/categories (Phase 7)
7. Drill-down dashboards for branch/location/category (Phase 8)
8. Audit/Reports filters + linking + exports (Phase 9)
9. Email notifications (requires domain) — last, since DNS verification is async

## Open questions (answer any, or say "go" to use defaults)

1. **Email sender domain**: do you already have a domain you want emails to come from? If not, I'll show the setup dialog. (Default: ask before sending emails.)
2. **Beep behavior**: a single light tone every ~6s until acknowledged — OK? Or only beep once per new notification?
3. **Reactivation approval**: should "super admin" mean the existing `admin` role, or do you want a new `super_admin` role above admin?
4. **Audit "clear"**: hard delete vs. soft-archive (hidden by default but recoverable). I recommend soft-archive — confirm?
5. **Import file format**: Excel only, or also CSV?