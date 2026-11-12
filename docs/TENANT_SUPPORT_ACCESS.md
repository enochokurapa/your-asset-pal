# Tenant Support Access (approval-gated)

## Current behavior
- SaaS administrator requests a session for exactly one tenant with a reason and scope.
- An authenticated administrator of that tenant must explicitly approve or decline the request within 24 hours.
- Approval grants **15 minutes maximum** of support access. Revocation works immediately.
- Every diagnostic request validates the authenticated platform administrator, session ownership, permitted scope, tenant, expiry and state using trusted PostgreSQL; the browser cannot supply an arbitrary tenant ID.
- Support actions are recorded in append-only `tenant_support_audit`; the customer's admin can review the events.
- No customer account credentials are shared or impersonated. No general support access is added to existing tenant CRUD/API routes.

## Important limitation
The `operational_support` scope is reserved for future **individual allowlisted mutations**. It **does not authorize writes** in this change. Do not make ordinary tenant CRUD operations use the platform administrator role or support-session ID as an authorization bypass. Each permitted mutation must check the support session and business approval, capture before/after values, and audit transactionally.

## Deployment steps (not performed by this PR)
1. Review and test SQL migration `migrations/20261112_secure_tenant_support.sql` on a staging database, including database role privileges.
2. Build and type-check the application on staging.
3. Verify platform and tenant MFA policies (the existing `requireSupabaseAuth` middleware is reused).
4. Open `/saas-admin/support-access` as SaaS Admin; submit a request.
5. Open `/support-requests` as the **target tenant's administrator**; approve, decline, inspect audit, or revoke.
6. Verify wrong-tenant approval fails, missing user session fails, expiration fails, and all diagnostic reads appear in the audit.
7. Deploy via the normal `main` branch pipeline after security review and staging verification.

## Security / regression checks
- Verify tenant A cannot approve tenant B's request.
- Verify SaaS Admin cannot approve their own request unless they are genuinely a business administrator for that tenant.
- Verify every read endpoint denies a pending, denied, revoked, or expired session.
- Verify an unrelated SaaS administrator cannot use another administrator's session.
- Verify audit records survive revocation and cannot be modified through application roles.
- Verify repeated requests do not change user roles, subscriptions, or tenant data.
- Verify user and admin email/MFA session policies remain required.
- Confirm database backup and rollback procedure before applying the migration.

This change is intentionally fail-closed, defaults to read-only, and does not create a secret master account.
