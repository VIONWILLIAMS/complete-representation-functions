#!/usr/bin/env python3
"""Reproduce a verified handoff ZIP from the unmodified package manifest."""
import argparse
import hashlib
import json
from pathlib import Path
import sys
import zipfile
from verify_package import verify


def main():
    root = Path(__file__).resolve().parent.parent
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=root.parent / (root.name + '_repacked.zip'))
    args = parser.parse_args()
    output = args.output.expanduser().resolve()
    if output.exists():
        parser.error('Output already exists. Choose a new --output path to preserve the existing file.')
    result = verify(root)
    if not result['ok']:
        print(json.dumps(result, ensure_ascii=False, indent=2))
        print('The original handoff has changed. Repack an unchanged copy or use the development release workflow.', file=sys.stderr)
        return 1
    manifest = json.loads((root / 'MANIFEST.json').read_text(encoding='utf-8'))
    names = [entry['path'] for entry in manifest['files']] + ['MANIFEST.json']
    output.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(output, 'x', compression=zipfile.ZIP_DEFLATED, compresslevel=6, allowZip64=True) as archive:
        for name in sorted(names):
            archive.write(root / name, arcname=root.name + '/' + name)
    with zipfile.ZipFile(output) as archive:
        invalid = archive.testzip()
    if invalid:
        raise RuntimeError('ZIP CRC check failed: ' + invalid)
    value = hashlib.sha256()
    with output.open('rb') as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b''):
            value.update(block)
    checksum = value.hexdigest()
    output.with_suffix(output.suffix + '.sha256').write_text(checksum + '  ' + output.name + '\n', encoding='ascii')
    print(json.dumps({'ok': True, 'file': str(output), 'size_bytes': output.stat().st_size, 'sha256': checksum, 'file_count': len(names)}, ensure_ascii=False, indent=2))
    return 0


if __name__ == '__main__':
    sys.exit(main())
