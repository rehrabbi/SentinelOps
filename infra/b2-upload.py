"""Uploads one file to the Backblaze B2 bucket the key is limited to.

Usage: python3 infra/b2-upload.py <local file> <name in the bucket>

The second, independent copy of the nightly backup (.github/workflows/backup.yml).
The key comes from B2_KEY_ID and B2_APPLICATION_KEY in the environment, never
from the command line, and is limited to one bucket. It cannot read files, but
Backblaze's "Write Only" preset also lets it delete files and change bucket
settings, the default retention included. So every upload sets its own Object
Lock: compliance mode until 90 days from now. A compliance lock cannot be
shortened or removed by anyone, this key and the account owner included, so the
file cannot be deleted or overwritten before then, whatever the bucket's default
says. The file is already encrypted with age before it gets here.

Python's standard library only. B2 is told the file's SHA-1 and refuses an
upload that does not match it; the reply is checked again here.
"""

import base64
import hashlib
import time
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

API = "https://api.backblazeb2.com/b2api/v2"

# How long each copy is locked: the same 90 days the GitHub artifacts are kept.
# The bucket's lifecycle rule hides a file after 90 days and deletes it a day
# later, once the lock has expired.
LOCK_DAYS = 90


def call(url, headers, body=None, method="POST"):
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            return json.load(resp)
    except urllib.error.HTTPError as e:
        # B2's error body names the problem ("unauthorized", "bad_request")
        # and never echoes credentials.
        detail = e.read().decode("utf-8", "replace")[:300]
        sys.exit(f"B2 refused {urllib.parse.urlsplit(url).path}: HTTP {e.code} {detail}")


def main():
    if len(sys.argv) != 3:
        sys.exit("usage: b2-upload.py <local file> <name in the bucket>")
    path, name = sys.argv[1], sys.argv[2]
    key_id = os.environ.get("B2_KEY_ID", "")
    app_key = os.environ.get("B2_APPLICATION_KEY", "")
    if not key_id or not app_key:
        sys.exit("B2_KEY_ID and B2_APPLICATION_KEY must be set")

    basic = base64.b64encode(f"{key_id}:{app_key}".encode()).decode()
    auth = call(f"{API}/b2_authorize_account", {"Authorization": "Basic " + basic}, method="GET")
    bucket_id = auth.get("allowed", {}).get("bucketId")
    if not bucket_id:
        sys.exit("the key is not limited to one bucket; use the key made for backups")

    upload = call(
        auth["apiUrl"] + "/b2api/v2/b2_get_upload_url",
        {"Authorization": auth["authorizationToken"], "Content-Type": "application/json"},
        json.dumps({"bucketId": bucket_id}).encode(),
    )

    with open(path, "rb") as f:
        data = f.read()
    sha1 = hashlib.sha1(data).hexdigest()
    retain_until_ms = int((time.time() + LOCK_DAYS * 86400) * 1000)
    result = call(
        upload["uploadUrl"],
        {
            "Authorization": upload["authorizationToken"],
            "X-Bz-File-Name": urllib.parse.quote(name, safe="/"),
            "Content-Type": "application/octet-stream",
            "Content-Length": str(len(data)),
            "X-Bz-Content-Sha1": sha1,
            # This file's own lock, independent of the bucket's default.
            "X-Bz-File-Retention-Mode": "compliance",
            "X-Bz-File-Retention-Retain-Until-Timestamp": str(retain_until_ms),
        },
        data,
    )
    if result.get("contentSha1") != sha1 or int(result.get("contentLength", -1)) != len(data):
        sys.exit("B2 stored something other than what was sent")
    # The key may not be allowed to read retention back; when it is, check it.
    retention = (result.get("fileRetention") or {})
    if retention.get("isClientAuthorizedToRead"):
        value = retention.get("value") or {}
        if value.get("mode") != "compliance" or int(value.get("retainUntilTimestamp") or 0) < retain_until_ms:
            sys.exit(f"B2 did not apply the requested lock: {value}")
        lock = "locked in compliance mode, confirmed"
    else:
        lock = "lock requested in compliance mode (this key cannot read it back)"
    until = time.strftime("%Y-%m-%d", time.gmtime(retain_until_ms / 1000))
    print(f"Copied to B2 bucket {auth['allowed'].get('bucketName')}: {result['fileName']} "
          f"({len(data)} bytes, sha1 {sha1}); {lock} until {until}")


if __name__ == "__main__":
    main()
