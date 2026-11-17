#!/usr/bin/env python3
"""Private AssetFlow file snapshots with integrity verification and optional R2 copy."""
import datetime
import hashlib
import io
import os
import pathlib
import tarfile
import tempfile
import shutil
import sys

SOURCE=pathlib.Path("/opt/apps/assetflow/private-files")
DEST=pathlib.Path("/opt/apps/assetflow/backups/asset-files")
DEST.mkdir(parents=True,exist_ok=True)
os.chmod(DEST,0o700)
date=datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%d")
target=DEST/("asset-files-"+date+".tar.gz")
temp=DEST/("asset-files-"+date+".partial.tar.gz")
with tarfile.open(temp,"w:gz") as archive:
    for f in SOURCE.rglob("*"):
        if f.is_file() and not f.is_symlink():
            archive.add(f,arcname=str(f.relative_to(SOURCE)),recursive=False)
with tarfile.open(temp,"r:gz") as archive:
    if archive.getmembers():
        for m in archive.getmembers():
            if not m.isfile() or m.name.startswith("/") or ".." in pathlib.PurePosixPath(m.name).parts:
                raise RuntimeError("Unsafe backup content")
    archive.getmembers()
os.replace(temp,target)
os.chmod(target,0o600)
sha=hashlib.sha256()
with target.open("rb") as fh:
    for block in iter(lambda:fh.read(1024*1024),b""):sha.update(block)
checksum=sha.hexdigest()
(target.with_suffix(target.suffix+".sha256")).write_text(checksum+"  "+target.name+"\n")
print("LOCAL_ASSET_BACKUP_OK",target.name,target.stat().st_size,checksum[:12])
for older in sorted(DEST.glob("asset-files-*.tar.gz"))[:-7]:
    older.unlink(missing_ok=True)
    older.with_suffix(older.suffix+".sha256").unlink(missing_ok=True)
# Offsite copy requires permissions to WRITE to the configured Cloudflare R2 bucket.
try:
    import boto3
    env={}
    p=pathlib.Path("/opt/apps/assetflow/.env")
    if p.exists():
        for line in p.read_text().splitlines():
            if "=" in line and not line.lstrip().startswith("#"):
                k,v=line.split("=",1)
                env[k.strip()]=v.strip().strip('"').strip("'")
    keys=("R2_ACCOUNT_ID","R2_ACCESS_KEY_ID","R2_SECRET_ACCESS_KEY","R2_BUCKET")
    if not all(env.get(k) for k in keys):
        print("OFFSITE_ASSET_BACKUP_NOT_CONFIGURED")
        sys.exit(0)
    endpoint=env.get("R2_ENDPOINT") or "https://"+env["R2_ACCOUNT_ID"]+".r2.cloudflarestorage.com"
    client=boto3.client("s3",endpoint_url=endpoint,region_name="auto",
        aws_access_key_id=env["R2_ACCESS_KEY_ID"],aws_secret_access_key=env["R2_SECRET_ACCESS_KEY"])
    key="asset-files-backups/"+target.name
    client.upload_file(str(target),env["R2_BUCKET"],key)
    head=client.head_object(Bucket=env["R2_BUCKET"],Key=key)
    if head.get("ContentLength")!=target.stat().st_size:raise RuntimeError("Remote size mismatch")
    print("OFFSITE_ASSET_BACKUP_OK",key)
except Exception as exc:
    print("OFFSITE_ASSET_BACKUP_FAILED",type(exc).__name__,file=sys.stderr)
