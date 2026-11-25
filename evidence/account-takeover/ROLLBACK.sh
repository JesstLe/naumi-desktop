#!/usr/bin/env bash
set -euo pipefail
HERE="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ARCHIVE="$HERE/MODIFIED_FILE.zip"
if command -v cygpath >/dev/null; then ARCHIVE="$(cygpath -m "$ARCHIVE")"; fi
python - "$ARCHIVE" "${1:?Pass a marked disposable source copy}" <<'PY'
import pathlib,sys,json,hashlib,zipfile
archive,target=pathlib.Path(sys.argv[1]),pathlib.Path(sys.argv[2]).resolve()
assert (target/'.naumi-account-takeover-copy').is_file(),'COPY_ONLY_MARKER_REQUIRED'
assert not (target/'.git').exists() and not (target/'.dsh').exists(),'LIVE_TARGET_REJECTED'
with zipfile.ZipFile(archive) as z:
 m=json.loads(z.read('MANIFEST.json'))
 for r in m['files']:
  p=(target/r['path']).resolve();assert target in p.parents and p.is_file() and not p.is_symlink(),'COPY_TARGET_INVALID'
  assert hashlib.sha256(p.read_bytes()).hexdigest()==r['after'],'COPY_DRIFT'
 for r in m['files']:
  p=target/r['path']
  if r['before'] is None:p.unlink()
  else:
   b=z.read('original/'+r['path']);assert hashlib.sha256(b).hexdigest()==r['before'];p.write_bytes(b)
 for r in m['files']:
  p=target/r['path'];assert (not p.exists()) if r['before'] is None else hashlib.sha256(p.read_bytes()).hexdigest()==r['before']
 print('ROLLBACK_PASS files='+str(len(m['files']))+' sourceCopyOnly=true')
PY
