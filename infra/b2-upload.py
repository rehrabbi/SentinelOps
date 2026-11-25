"""Uploads one file to the Backblaze B2 bucket the key is limited to.

Usage: python3 infra/b2-upload.py <local file> <name in the bucket>

The second, independent copy of the nightly backup (.github/workflows/backup.yml).
The key comes from B2_KEY_ID and B2_APPLICATION_KEY in the environment, never
from the command line, and is a write-only key limited to one bucket: it cannot
read, list or delete anything, so even if it leaked it could not destroy or
read a backup. The file is already encrypted with age before it gets here.

Python's standard library only. B2 is told the file's SHA-1 and refuses an
upload that does not match it; the reply is checked again here.
"""

import base64
import hashlib
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

API = "https://api.backblazeb2.com/b2api/v2"


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
        sys.exit("the key is not limited to one bucket; use the write-only key made for backups")

    upload = call(
        auth["apiUrl"] + "/b2api/v2/b2_get_upload_url",
        {"Authorization": auth["authorizationToken"], "Content-Type": "application/json"},
        json.dumps({"bucketId": bucket_id}).encode(),
    )

    with open(path, "rb") as f:
        data = f.read()
    sha1 = hashlib.sha1(data).hexdigest()
    result = call(
        upload["uploadUrl"],
        {
            "Authorization": upload["authorizationToken"],
            "X-Bz-File-Name": urllib.parse.quote(name, safe="/"),
            "Content-Type": "application/octet-stream",
            "Content-Length": str(len(data)),
            "X-Bz-Content-Sha1": sha1,
        },
        data,
    )
    if result.get("contentSha1") != sha1 or int(result.get("contentLength", -1)) != len(data):
        sys.exit("B2 stored something other than what was sent")
    print(f"Copied to B2 bucket {auth['allowed'].get('bucketName')}: {result['fileName']} ({len(data)} bytes, sha1 {sha1})")


if __name__ == "__main__":
    main()
