-- SECURITY: historical demo-user seed deliberately disabled.
-- Never create production users with fixed, repository-known passwords.
-- Keep this migration filename as an inert placeholder for migration ordering.
-- Provision the first platform administrator through a controlled, verified
-- bootstrap process with MFA and a one-time credential reset.
-- Previously created demo users require separate production account review,
-- password reset, session revocation, and removal/deactivation as appropriate.
SELECT 1;
