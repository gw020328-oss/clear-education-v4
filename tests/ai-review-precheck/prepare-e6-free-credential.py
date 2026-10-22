"""Human-run local preparation only. Never executed by the evaluation CLI/tests.

No argv/env key, paid source, overwrite or provider request. Keys are entered on
the controlling terminal and stored only in the dedicated ignored private slot.
"""
import getpass
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import sys


def main():
    if len(sys.argv) != 1 or not sys.stdin.isatty():
        raise ValueError("INTERACTIVE_TERMINAL_REQUIRED")
    root = Path(__file__).resolve().parents[2]
    directory = root / "private" / "e6-python-free-tier-v1"
    directory.mkdir(parents=True, mode=0o700, exist_ok=True)
    st = directory.lstat()
    if directory.resolve() != directory or not stat.S_ISDIR(st.st_mode) or st.st_uid != os.getuid() or st.st_mode & 0o077:
        raise ValueError("PRIVATE_DIRECTORY_PERMISSIONS")
    project = getpass.getpass("Confirmed unlinked Free project ID (hidden): ").strip()
    key = getpass.getpass("Key belonging to that Free project (hidden): ").strip()
    if not project or not re.fullmatch(r"[A-Za-z0-9_-]{16,256}", key):
        raise ValueError("INVALID_INPUT")
    scope = hashlib.sha256(project.encode("utf-8")).hexdigest()
    path = directory / "credential.json"
    # Existing slot is never read, reset or overwritten.
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as output:
        json.dump({"version": "clear-e6-free-credential.1", "keySourceId": "clear-e6-python-free-only-file.1",
                   "projectScopeSha256": scope, "apiKey": key}, output)
        output.flush()
        os.fsync(output.fileno())
    parent = os.open(directory, os.O_RDONLY)
    try:
        os.fsync(parent)
    finally:
        os.close(parent)
    print(json.dumps({"status": "LOCAL_SLOT_PREPARED_NOT_APPROVED", "projectScopeSha256": scope}))


if __name__ == "__main__":
    try:
        main()
    except Exception:
        print("BLOCKED: use a controlling terminal and a new private slot; no overwrite or provider call.")
        sys.exit(1)
