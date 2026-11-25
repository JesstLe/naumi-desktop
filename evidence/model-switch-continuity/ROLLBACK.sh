#!/usr/bin/env bash
set -euo pipefail
HERE="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ARCHIVE="$HERE/MODIFIED_FILE.zip"
if command -v cygpath >/dev/null; then ARCHIVE="$(cygpath -m "$ARCHIVE")"; fi
python - "$ARCHIVE" "${1:?Provide marked disposable copy}" <<'PY'
import pathlib,sys,zipfile,json,hashlib
root=pathlib.Path(sys.argv[2]).resolve()
assert (root/'.continuity-copy-only').is_file() and not (root/'.git').exists() and not (root/'.dsh').exists(),'COPY_ONLY'
with zipfile.ZipFile(sys.argv[1]) as z:
 m=json.loads(z.read('MANIFEST.json'))
 for r in m['files']:
  p=(root/r['path']).resolve();assert root in p.parents and p.is_file() and not p.is_symlink();assert hashlib.sha256(p.read_bytes()).hexdigest()==r['after']
 for r in m['files']:(root/r['path']).unlink()
 assert all(not (root/r['path']).exists() for r in m['files'])
 print('CONTINUITY_ROLLBACK_PASS removed=2 productChanged=false')
PY
