#!/usr/bin/env bash
# Refresh only public geographic reference tables. Never touch tenant assets.
set -Eeuo pipefail
exec 9>/run/lock/assetflow-geography.lock
flock -n 9 || exit 0
WORK=$(mktemp -d /tmp/assetflow-geography-XXXXXXXX)
trap 'rm -rf "$WORK"' EXIT
for file in countryInfo.txt admin1CodesASCII.txt admin2Codes.txt; do
  curl --fail --silent --show-error --location --retry 3 --connect-timeout 15 --max-time 150     "https://download.geonames.org/export/dump/${file}" --output "$WORK/$file"
done
export AF_GEO_WORKDIR="$WORK"
python3 /usr/local/libexec/assetflow-geography/prepare-feed.py
# An incomplete or empty provider download must never wipe data or succeed silently.
for entry in countries regions districts; do
  test -s "$WORK/$entry.tsv"
done
[ "$(wc -l < "$WORK/countries.tsv")" -ge 200 ]
[ "$(wc -l < "$WORK/regions.tsv")" -ge 3000 ]
[ "$(wc -l < "$WORK/districts.tsv")" -ge 30000 ]
for entry in countries regions districts; do
  docker cp "$WORK/$entry.tsv" "pesapal-db:/tmp/assetflow-world-${entry}.tsv"
done
docker cp /usr/local/libexec/assetflow-geography/import.sql pesapal-db:/tmp/assetflow-world-geo-import.sql
docker exec pesapal-db psql -v ON_ERROR_STOP=1 -U postgres -d ams   -f /tmp/assetflow-world-geo-import.sql
for entry in countries regions districts; do
  docker exec pesapal-db rm -f "/tmp/assetflow-world-${entry}.tsv"
done
docker exec pesapal-db rm -f /tmp/assetflow-world-geo-import.sql
printf 'GeoNames global reference refresh passed: %s UTC\n' "$(date -u '+%F %T')"
