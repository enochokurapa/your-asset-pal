#!/usr/bin/env bash
# Route-only cutover. Never stops the currently serving application container.
set -euo pipefail
cd /opt/apps/assetflow
IMAGE="${1:?Usage: deploy-bluegreen.sh image-tag release-suffix}"
SUFFIX="${2:?Release suffix required}"
[[ "$SUFFIX" =~ ^[a-f0-9]{7,12}$ ]] || { echo 'Invalid release suffix'; exit 1; }
docker image inspect "$IMAGE" >/dev/null
NEW="assetflow-release-${SUFFIX}"
if docker inspect "$NEW" >/dev/null 2>&1; then echo "Release container already exists"; exit 2;fi
OVERRIDE=$(mktemp /tmp/assetflow-next.XXXXXX.yml)
cat > "$OVERRIDE" <<YAML
services:
  pesapal-app:
    image: $IMAGE
YAML
BACKUP_DIR="/opt/infrastructure/proxy/nginx/backup-assetflow-${SUFFIX}"
CONF_DIR="/opt/infrastructure/proxy/nginx/conf.d"
mkdir -p "$BACKUP_DIR"
for config in https.conf routes.conf;do cp -p "$CONF_DIR/$config" "$BACKUP_DIR/$config";done
ROLLBACK_NEEDED=0
cleanup(){
 rm -f "$OVERRIDE"
 if [ "$ROLLBACK_NEEDED" = 1 ];then
  echo 'Reverting AssetFlow Nginx traffic target'
  for config in https.conf routes.conf;do cp -p "$BACKUP_DIR/$config" "$CONF_DIR/$config";done
  docker exec edge-nginx nginx -t && docker exec edge-nginx nginx -s reload
  echo 'Previous live application remains available'
 fi
}
trap cleanup EXIT
echo "Starting new release: $NEW"
docker compose -f standalone.compose.yml -f "$OVERRIDE" run -d --no-deps --name "$NEW" pesapal-app >/dev/null
for attempt in $(seq 1 15);do
 if docker exec edge-nginx wget -q -T 3 -O /dev/null --header "Host: assetflow360.com" "http://$NEW:3000/api/health";then break;fi
 sleep 2
done
docker exec edge-nginx wget -q -T 5 -O /dev/null --header "Host: assetflow360.com" "http://$NEW:3000/api/health"
docker exec edge-nginx wget -q -T 5 -O /dev/null --header "Host: assetflow360.com" "http://$NEW:3000/login"
# Keep the new production instance available after host/Docker restarts.
docker update --restart unless-stopped "$NEW" >/dev/null
echo 'New application passed internal edge-proxy health tests'
ROLLBACK_NEEDED=1
python3 - "$CONF_DIR" "$NEW" <<'PY'
from pathlib import Path
import re,sys
root=Path(sys.argv[1]);new=sys.argv[2]
for name in ('https.conf','routes.conf'):
 p=root/name;s=p.read_text()
 next,count=re.subn(r'(set \$assetflow360_backend ")[^"]+(";)','\\g<1>'+new+'\\g<2>',s)
 if count==0:raise RuntimeError(f'AssetFlow backend missing in {p}')
 p.write_text(next)
 print('ROUTE_UPDATED',name,count)
PY
docker exec edge-nginx nginx -t
docker exec edge-nginx nginx -s reload
for attempt in $(seq 1 5);do
 if curl -fsS --max-time 12 https://assetflow360.com/api/health >/dev/null &&
    curl -fsS --max-time 12 -o /dev/null https://assetflow360.com/login;then
  ROLLBACK_NEEDED=0
  printf '%s\n' "$NEW" > /opt/apps/assetflow/.active-edge-release
  echo "CUTOVER_OK $NEW; prior release kept online"
  exit 0
 fi
 sleep 2
done
echo "New release failed public health check"
exit 4
