#!/bin/sh
set -eu
: "${SUPABASE_AUTH_DB_PASSWORD:?SUPABASE_AUTH_DB_PASSWORD is required}"
: "${POSTGREST_DB_PASSWORD:?POSTGREST_DB_PASSWORD is required}"

# PostgreSQL's initdb process runs this once after the schema files create roles.
# Pass secrets through psql variable substitution, not shell-constructed SQL.
psql -X -v ON_ERROR_STOP=1 \
  --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -v auth_password="$SUPABASE_AUTH_DB_PASSWORD" \
  -v rest_password="$POSTGREST_DB_PASSWORD" <<'SQL'
ALTER ROLE supabase_auth_admin WITH PASSWORD :'auth_password';
ALTER ROLE authenticator WITH PASSWORD :'rest_password';
SQL
