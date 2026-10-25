"""Explicit, public, unauthenticated acquisition; originals remain ignored.
No agreement accepted, no accounts or restricted software downloaded.
"""
from pathlib import Path
from urllib.request import Request, urlopen
from datetime import datetime, timezone
import argparse
import hashlib
import json

ROOT = Path(__file__).resolve().parents[1]

def acquire(pin, directory):
    directory.mkdir(parents=True, exist_ok=True)
    path = directory / pin['file']
    # Do not replace a different previously acquired version.
    if path.exists() and hashlib.sha256(path.read_bytes()).hexdigest() != pin['sha256']:
        raise ValueError('Existing original differs; preserve and investigate: ' + pin['file'])
    req = Request(pin['url'], headers={'User-Agent': 'Arzttarife-public-source-reference/1.0'})
    with urlopen(req, timeout=60) as r:
        raw = r.read(10_000_001)
        metadata = {'url': pin['url'], 'final_url': r.url, 'retrieved_at': datetime.now(timezone.utc).isoformat(), 'headers': dict(r.headers), 'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest(), 'file': pin['file']}
    if len(raw) != pin['bytes'] or metadata['sha256'] != pin['sha256']:
        changed = directory / (pin['file'] + '.unrecognized')
        changed.write_bytes(raw)
        changed.with_suffix(changed.suffix + '.meta.json').write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + '\n')
        raise ValueError('Source changed; saved separately, not imported: ' + pin['file'])
    path.write_bytes(raw)
    path.with_suffix(path.suffix + '.meta.json').write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + '\n')
    return metadata

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--acknowledge-local-use', action='store_true', help='Confirm having reviewed rights and planning only permitted local use.')
    args = parser.parse_args()
    if not args.acknowledge_local_use:
        parser.error('Read DATA.md and OAAT terms first; use --acknowledge-local-use only for permitted local use. This is not legal consent on your behalf.')
    pins = json.loads((ROOT / 'scripts/source-pins.json').read_text())
    for pin in pins:
        record = acquire(pin, ROOT / 'sources')
        print(f"{record['file']}: {record['bytes']} bytes, SHA256 {record['sha256']}")
if __name__ == '__main__':
    main()
