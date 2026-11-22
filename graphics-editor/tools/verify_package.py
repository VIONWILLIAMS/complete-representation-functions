#!/usr/bin/env python3
"""Check the original handoff payload and recovered baseline using SHA-256."""
import argparse
import hashlib
import json
from pathlib import Path
import sys


def digest(file_path):
    value = hashlib.sha256()
    with file_path.open('rb') as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b''):
            value.update(block)
    return value.hexdigest()


def verify(root):
    failures = []
    counts = {}
    for label, filename in [
        ('payload', 'MANIFEST.json'),
        ('recovered_source', 'provenance/source-manifest.json'),
        ('recovered_documents', 'provenance/recovered-document-manifest.json'),
    ]:
        manifest_path = root / filename
        if not manifest_path.is_file():
            failures.append({'path': filename, 'reason': 'missing manifest'})
            continue
        manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
        entries = manifest['files']
        counts[label] = len(entries)
        for entry in entries:
            relative = Path(entry['path'])
            target = root / relative
            if relative.is_absolute() or '..' in relative.parts or not target.resolve().is_relative_to(root.resolve()):
                failures.append({'path': entry['path'], 'reason': 'unsafe path'})
            elif not target.is_file():
                failures.append({'path': entry['path'], 'reason': 'missing file'})
            elif target.stat().st_size != entry['size_bytes'] or digest(target) != entry['sha256']:
                failures.append({'path': entry['path'], 'reason': 'size or SHA-256 mismatch'})
    return {'ok': not failures, 'checked': counts, 'failures': failures}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parent.parent)
    args = parser.parse_args()
    result = verify(args.root.resolve())
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if result['ok'] else 1


if __name__ == '__main__':
    sys.exit(main())
