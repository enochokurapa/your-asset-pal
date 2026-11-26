# License transfer release checks

Apply the migration to a disposable database restored from the current schema. Do not test against customer accounts. The new SQL functions require the trusted backend database role; browser/anon/authenticated/service_role must have no execution or ledger-write access.

1. Full 4-seat workspace: transfer one active employee to a new unique email. Verify active users remain 4, old profile inactive, new identity active, new role exactly selected, billing unchanged and one immutable ledger row with reason and both identities.
2. Attempt cross-tenant source, self transfer, expired trial/paid plan, target not securely staged, duplicate email, and last-admin transfer to a non-admin; each must leave source and seat counts unchanged.
3. Two concurrent requests for the same source (different replacement addresses): only one succeeds; the rejected replacement is safely cleaned up or remains banned/unassigned for support reconciliation. Two separate sources can transfer without increasing capacity.
4. Replay the same request ID: exactly one event; mismatched payload must fail. Simulate failure after DB commit and confirm retry returns the existing receipt without deleting the assigned replacement.
5. Force an audit insert or role assignment failure in the test DB. Transaction must roll back both accounts, auth ban state, sessions and ledger. Staged account remains banned/unassigned until cleanup.
6. Use the old employee's pre-transfer token against protected server, PostgREST and storage routes. All customer data access must be denied; sign-in, refresh and trusted device reuse must fail. Verify new employee can sign in/change temporary password and MFA remains enforced for admins.
7. Validate active/available counts for trial overrides, paid overrides, add-ons, unlimited, plan renewal, downgrade, existing new-workspace onboarding and standard user create/reactivate/deactivate. Test two simultaneous additions at a single remaining seat.
8. Verify tenant administrator cannot view another tenant's transfer records; SaaS administrator requires authorized support session. Verify database app role can insert through trusted connection but direct browser writes/updates/deletes/truncate and RPC execution fail.
9. Confirm archived/deactivated accounts and prior asset audit history remain intact. Review existing production-only source changes before merge (especially password and session enforcement). Reconcile schema/role ownership, run TypeScript build and isolated integration tests before deploying.
10. Existing ordinary create/deactivate/reactivate/remove endpoints still require separate audit/atomicity reconciliation; this migration provides a dedicated immutable ledger for explicit transfers only.
