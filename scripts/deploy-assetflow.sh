#!/usr/bin/env bash
# Run by the deployment account on the AssetFlow host.
set -euo pipefail
ROOT=/opt/apps/assetflow
SHA="${1:?Expected verified GitHub commit SHA}"
[[ "$SHA" =~ ^[a-f0-9]{40}$ ]] || { echo "Invalid commit SHA"; exit 2; }
cd "$ROOT"
flock -n /var/lock/assetflow-deploy.lock bash -s -- "$SHA" <<'DEPLOY'
set -euo pipefail
SHA="$1"
cd /opt/apps/assetflow
test -z "$(git status --porcelain --untracked-files=no)" || { echo "Tracked server changes prevent deployment"; exit 1; }
git fetch origin main
test "$(git rev-parse origin/main)" = "$SHA" || { echo "HEAD changed after CI; refusing stale deploy"; exit 1; }
previous=$(git rev-parse HEAD)
stamp=$(date -u +%Y%m%dT%H%M%SZ)
mkdir -p backups
docker exec pesapal-db pg_dump -U postgres -Fc -d ams > "backups/deploy-$stamp.dump"
test -s "backups/deploy-$stamp.dump"
chmod 600 "backups/deploy-$stamp.dump"
git merge --ff-only "$SHA"
# Only apply migrations in this automated release range. Keep a journal to avoid repeating them.
docker exec pesapal-db psql -U postgres -d ams -v ON_ERROR_STOP=1 -q -c "CREATE TABLE IF NOT EXISTS public.assetflow_deployment_migrations(filename text primary key, applied_at timestamptz not null default now())"
for migration in supabase/migrations/20*.sql; do
  [[ -f "$migration" ]] || continue
  name=$(basename "$migration")
  [[ "$name" > "20261015000000" ]] || continue
  already=$(docker exec pesapal-db psql -U postgres -d ams -Atqc "SELECT 1 FROM public.assetflow_deployment_migrations WHERE filename='$name'")
  if [[ "$already" != 1 ]]; then
    echo "Applying $name"
    docker exec -i pesapal-db psql -X -1 -v ON_ERROR_STOP=1 -U postgres -d ams < "$migration"
    docker exec pesapal-db psql -U postgres -d ams -v ON_ERROR_STOP=1 -q -c "INSERT INTO public.assetflow_deployment_migrations(filename) VALUES ('$name') ON CONFLICT DO NOTHING"
  fi
done
docker compose -f standalone.compose.yml build pesapal-app
docker compose -f standalone.compose.yml up -d --no-deps pesapal-app
healthy=0
for i in $(seq 1 40); do
  if curl -fsS --max-time 4 http://127.0.0.1:4300/ >/dev/null; then healthy=1; break; fi
  sleep 3
done
if [[ $healthy -ne 1 ]]; then
  echo "Health check failed, rebuilding previous image from previous revision"
  git checkout -B main "$previous"
  docker compose -f standalone.compose.yml build pesapal-app
  docker compose -f standalone.compose.yml up -d --no-deps pesapal-app
  echo "Database migration rollback, if required, must be handled from the backup."
  exit 1
fi
echo "Deployed verified commit: $SHA"
DEPLOY
