# AssetFlow SaaS policy

## Free trial
- 28 days (4 weeks)
- Maximum 4 active tenant users; the SaaS administrator account does not consume a tenant seat
- Assets and Settings can remain fully enabled by SaaS module policy
- Reports are viewable during trial, but built-in PDF/Excel downloads are blocked
- Custom domains/subdomains require an active paid subscription

## Administration layers
- **SaaS Admin**: platform-level pricing, module availability, tenant subscription status. The seeded `tesobrain@gmail.com` account is promoted to SaaS Admin by `saas_policy.sql`.
- **Tenant Admin**: manages their own tenant users, roles, module access, actions, approvals and branch access. Tenant admins cannot change SaaS pricing/module policy or manage the SaaS administrator account.

## Password policy
- Tenant admins create users with a temporary password.
- New users are forced to change that password after first successful sign-in.
- Users can later change their own password from My Profile.

## Billing
- Upgrade flow is prepared for Yo! Payments Uganda.
- No email delivery integration is required at this stage.
- API credentials are read only from deployment environment variables: `YO_API_USERNAME`, `YO_API_PASSWORD`, optional `YO_API_MODE` and `YO_API_URL`.
- The SaaS Admin sets the paid price and currency from the SaaS Administration page.

## Custom domains
- Trial/expired/suspended tenants see an Upgrade prompt.
- Paid tenant admins can add a domain/subdomain and verify ownership with a TXT record.
- Final proxy/HTTPS routing is handled by the hosting gateway and should be integrated with the production proxy before offering automatic activation to customers.

## Existing database upgrade
`saas_policy.sql` is idempotent for the current schema and should be applied once to an existing database before deploying the SaaS-enabled application build.
