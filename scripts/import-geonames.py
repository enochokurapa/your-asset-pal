#!/usr/bin/env python3
"""Download GeoNames country extracts and emit AssetFlow geography TSV.

Keeps all current administrative divisions (ADM1-ADM5) and populated places,
then derives a parent relationship from GeoNames admin codes. Source:
https://download.geonames.org/export/dump/
"""
from __future__ import annotations
import argparse, csv, io, os, sys, urllib.request, zipfile

FIELDS = [
    "geoname_id","country_code","parent_geoname_id","name","ascii_name",
    "feature_class","feature_code","admin_level","admin1_code","admin2_code",
    "admin3_code","admin4_code","latitude","longitude","population","timezone",
]

def download(country: str) -> bytes:
    url = f"https://download.geonames.org/export/dump/{country}.zip"
    req = urllib.request.Request(url, headers={"User-Agent": "AssetFlow360-GeoImporter/1.0"})
    with urllib.request.urlopen(req, timeout=120) as response:
        return response.read()

def parse(country: str, raw: bytes):
    with zipfile.ZipFile(io.BytesIO(raw)) as z:
        txt_name = next(name for name in z.namelist() if name.upper().endswith(".TXT"))
        with z.open(txt_name) as fh:
            rows = []
            for bline in fh:
                cols = bline.decode("utf-8", "replace").rstrip("\n").split("\t")
                if len(cols) < 18:
                    continue
                feature_class, feature_code = cols[6], cols[7]
                keep_admin = feature_class == "A" and feature_code.startswith("ADM") and feature_code[3:].isdigit()
                keep_place = feature_class == "P"
                if not (keep_admin or keep_place):
                    continue
                rows.append(cols)
    return rows

def build(country: str, rows):
    adm = {}
    for c in rows:
        fc, fcode = c[6], c[7]
        if fc != "A" or not fcode.startswith("ADM") or not fcode[3:].isdigit():
            continue
        level = int(fcode[3:])
        if level == 1:
            key = (c[8], c[10])
        elif level == 2:
            key = (c[8], c[10], c[11])
        elif level == 3:
            key = (c[8], c[10], c[11], c[12])
        elif level == 4:
            key = (c[8], c[10], c[11], c[12], c[13])
        else:
            continue
        adm[(level, key)] = int(c[0])

    def parent_for(c):
        fc, fcode = c[6], c[7]
        if fc == "A" and fcode.startswith("ADM") and fcode[3:].isdigit():
            level = int(fcode[3:])
            if level <= 1:
                return None
            parts = [c[8], c[10], c[11], c[12], c[13]]
            for target in range(min(level - 1, 4), 0, -1):
                key = tuple(parts[: target + 1])
                found = adm.get((target, key))
                if found:
                    return found
            return None
        parts = [c[8], c[10], c[11], c[12], c[13]]
        for target in range(4, 0, -1):
            code = parts[target]
            if not code:
                continue
            key = tuple(parts[: target + 1])
            found = adm.get((target, key))
            if found:
                return found
        return None

    out = []
    for c in rows:
        fc, fcode = c[6], c[7]
        level = int(fcode[3:]) if fc == "A" and fcode.startswith("ADM") and fcode[3:].isdigit() else None
        population = c[14] or "0"
        out.append([
            c[0], c[8], parent_for(c), c[1], c[2], fc, fcode, level,
            c[10], c[11], c[12], c[13], c[4], c[5], population, c[17], path_for(int(c[0]), c[1]),
        ])
    return out

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("countries", nargs="+")
    ap.add_argument("--output", required=True)
    args = ap.parse_args()
    os.makedirs(os.path.dirname(os.path.abspath(args.output)), exist_ok=True)
    total = 0
    with open(args.output, "w", newline="", encoding="utf-8") as out:
        writer = csv.writer(out, delimiter="\t", quoting=csv.QUOTE_MINIMAL, lineterminator="\n")
        for country in args.countries:
            code = country.upper()
            raw = download(code)
            rows = build(code, parse(code, raw))
            writer.writerows(rows)
            total += len(rows)
            print(f"{code}: {len(rows):,} geography rows", file=sys.stderr)
    print(f"total: {total:,}", file=sys.stderr)

if __name__ == "__main__":
    main()
