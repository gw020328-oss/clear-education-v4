#!/usr/bin/env python3
"""Reproducible plugin ZIP; exclude fixture/owner/schema tools from web deployment."""
from pathlib import Path
import sys, zipfile, hashlib
source = Path(__file__).resolve().parent.parent / 'local_clearbridge'
output = Path(sys.argv[1])
with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED) as archive:
    for path in sorted(source.rglob('*')):
        if not path.is_file() or 'tests' in path.relative_to(source).parts:
            continue
        info = zipfile.ZipInfo('clearbridge/' + path.relative_to(source).as_posix(), (2026, 11, 4, 0, 0, 0))
        info.compress_type = zipfile.ZIP_DEFLATED
        info.external_attr = 0o100644 << 16
        archive.writestr(info, path.read_bytes())
print(hashlib.sha256(output.read_bytes()).hexdigest(), output)
