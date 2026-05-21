# Implementation Plan

This is a large set of changes. I'll break it into clearly separated workstreams and confirm a couple of decisions before building. The work touches the database, auth, server functions, and several UI screens.

## 1. Admin delete rights (data only, not features)
- Add RLS `DELETE` policies (admin-only via `has_role(auth.uid(),'admin')`) on: `assets`, `categories`, `locations`, `branches`, `asset_assignments`, `asset_movements`, `asset_disposals`, `asset_attachments`, `approval_requests`, `notifications`, `audit_log`.
- For `user_roles` and `profiles`: admin can delete role rows; deleting a user account is done via a server function using `supabaseAdmin.auth.admin.deleteUser`.
- Add a "Delete" action (with confirm dialog) in the Assets, Categories, Locations, Branches, and Users pages — only visible when `isAdmin`.

## 2. Granular module/approval permissions per user
- New table `user_permissions(user_id, module text, can_view bool, can_approve bool)`.
- Modules: `dashboard`, `assets`, `categories`, `locations`, `branches`, `users`, `reports`, `audit`, `approvals`.
- Approval types: `movement`, `retirement`, `disposal`, `reactivation`, `set_for_disposal`.
- New table `user_approval_rights(user_id, approval_kind)`.
- In the Users page, when admin opens a user, show a checkbox grid for modules (view) + approval rights. Admin role still implies all permissions.
- `useAuth` exposes `permissions` map; sidebar in `_app.tsx` hides items the user can't view; pending-approvals card filters to kinds the user can approve.

## 3. Request workflows for Movement & Disposal
- Movements panel: instead of writing directly to `asset_movements`, submit an `approval_requests` row of kind `movement` with full payload (already supported on approval side).
- Add a "Request Disposal" button on the asset detail (kind `disposal`); existing retirement flow already submits approvals.
- "Set for disposal" remains its own kind.

## 4. Notification fix for retirement
- Investigate why admin's own retirement request didn't produce a bell/dashboard entry. The `notify_on_approval` trigger inserts notifications for users with `admin`/`manager` role — when the requester *is* the only admin the row is created but the `useNotifications` realtime subscription may filter it by `user_id`. Verify and ensure self-notifications are inserted too (admin gets notified of their own pending request when they're also an approver).
- Ensure trigger is actually attached (`<db-triggers>` section shows none — likely missing on `approval_requests` and the asset-level retirement flow). Re-attach `AFTER INSERT OR UPDATE` trigger on `approval_requests`.

## 5. Email invites + first-login password change
- Admin creates user via a new server function (`createUser.functions.ts`) using `supabaseAdmin.auth.admin.inviteUserByEmail` with a generated temporary password stored in user metadata `{ temp_password, must_change_password: true }`.
- Auth email template ("invite") shows the temp password and a link to `/welcome`.
- New `/welcome` route reads metadata, shows temp password + change-password form, then sets `must_change_password=false`.
- Requires email infrastructure — I'll trigger the setup dialog.

## 6. Password reset by admin only
- Server function `adminResetPassword(userId)` using `supabaseAdmin.auth.admin.generateLink('recovery', ...)` and sends email.
- "Reset password" button in Users page, admin-only. Remove any user-facing "Forgot password" link from /login (or leave it but route to "contact your admin").

## 7. Active / inactive users
- Add `is_active bool default true` on `profiles`.
- Server function `setUserActive(userId, active)` uses `supabaseAdmin.auth.admin.updateUserById(id, { ban_duration })` to lock/unlock sign-in, and updates the profile flag.
- New permission `can_manage_user_status` granted via the permissions grid; admin always has it.

## 8. Show-password eye on /login
- Add toggle button inside password input.

## 9. Excel bulk import template
- "Download template" button generates an XLSX with headers matching the asset form: `asset_tag, serial_number, name, description, category, sub_category, location, sub_location, branch, status, purchase_date, purchase_value_ugx, custodian_email, department`.
- "Import" parses XLSX via SheetJS, resolves category/location/branch by name (creating sub-categories/sub-locations under the named parents when needed), and inserts assets in a single server function `bulkImportAssets`. Errors recorded into `asset_imports`.

## Technical sequencing
1. Database migration: delete policies, `user_permissions`, `user_approval_rights`, `is_active`, `must_change_password`, trigger re-attach.
2. Auth email setup dialog (needed for invites + reset).
3. Server functions: createUser, resetPassword, setUserActive, bulkImportAssets, deleteUser.
4. UI: Users page (permissions grid, active toggle, reset btn, delete btn), Assets page (delete + import + template), Categories/Locations/Branches (delete), Movements panel (request flow), /welcome route, /login eye icon.
5. Hook `useAuth` to load permissions and expose helpers.

## Decisions I need from you
1. **Module-permission default for new users**: should new staff start with **no** module access (admin must tick boxes), or with view-only on Dashboard + Assets by default?
2. **Inactive users**: when marked inactive, should existing sessions be force-signed-out immediately, or only blocked at next login?
3. **Bulk import — unknown reference values**: if the Excel has a category/location/branch name that doesn't exist yet, should I (a) auto-create it, or (b) reject the row with an error?
4. **Email domain**: Lovable Emails needs a sender domain. Do you have a domain you want to use (e.g. `notify.yourcompany.com`), or should I open the setup dialog now?

Once you answer these 4, I'll execute the plan end-to-end.