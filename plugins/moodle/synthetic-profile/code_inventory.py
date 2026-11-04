"""Hash public Moodle source only. Never inspect config.php or runtime data.
Usage: python3 code_inventory.py /path/to/public/moodle/source
Output is a hash of path/content inventory. Approval must be provisioned separately.
"""
import hashlib
import json
import pathlib
import sys

root = pathlib.Path(sys.argv[1]).resolve()
allowed = {'.php', '.js', '.json', '.xml', '.mustache', '.css', '.yml', '.yaml'}
entries = []
for path in sorted(root.rglob('*')):
    relative = path.relative_to(root)
    if relative.parts[0] in {'.git', 'moodledata'} or relative.as_posix() == 'config.php':
        continue
    if path.is_symlink():
        raise SystemExit('SOURCE_SYMLINK_UNSUPPORTED')
    if path.is_file() and path.suffix in allowed:
        entries.append([relative.as_posix(), hashlib.sha256(path.read_bytes()).hexdigest()])
print(json.dumps({'mode': 'SYNTHETIC_ONLY', 'files': len(entries), 'inventorySha256': hashlib.sha256(
    json.dumps(entries, ensure_ascii=True, separators=(',', ':')).encode()).hexdigest()}))
