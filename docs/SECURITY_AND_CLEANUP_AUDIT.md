# AssetFlow360 repository audit and cleanup notes (2026-11-05)

## Verified application stack
- Runtime: Bun, React 19, TanStack Start, TypeScript/Vite.
- Authentication/database: self-hosted Supabase GoTrue + PostgREST + PostgreSQL.
- Client/server integration: `@supabase/supabase-js` in application code.
- `src/integrations/supabase/` contains actively imported clients and authentication middleware.
- `supabase/migrations/` contains the PostgreSQL tenant isolation, authorization and asset data migrations.
- `standalone.compose.yml` launches the authentication and REST services.
- There are no `.php` files, `artisan`, or `composer.json` in the audited tracked tree.

**Do not delete Supabase dependencies or migrations.** They are production dependencies, not dead code.
A migration away from them would be a deliberate, separate replacement project.

## Cleanup candidates requiring dependency/lifecycle confirmation
- SQL snapshots: `all_migrations.sql`, `complete_init.sql`, `saas_policy.sql`, `server_roles.sql`, `server_seed.sql`.
  Some are actively referenced in Docker Compose initialization; do not delete blindly.
- Historical README, templates, scripts, and generated files should only be removed after cross-checking import, deployment, and CI references.
- Secret-containing Git history must be considered exposed even after removing inline secrets in the current branch.

## Critical release gates
1. Rotate all previously committed database credentials, JWT signing secrets and service role keys. Confirm environment-based secrets exist before deploying revised Compose settings.
2. Run the production build, typecheck, unit tests, security tests, tenant-isolation tests, and database migrations against a disposable environment.
3. Test new-registration email verification end-to-end with the configured SMTP provider.
4. Verify password recovery and mandatory admin MFA; these features must not be considered complete merely because routes exist.
5. Verify Cloudflare R2 scheduler, backup integrity, restore, retention and alerts.
6. Validate Yo Uganda sandbox transactions, idempotency and settlement; ioTec collection integration is **not complete** yet.
7. Verify inactivity session expiry is enforced server-side, not only by the browser guard.
8. Verify the active production commit matches the approved release; do not deploy code merely because a branch builds.

No arbitrary files should be deleted until their runtime and deployment references have been verified.
