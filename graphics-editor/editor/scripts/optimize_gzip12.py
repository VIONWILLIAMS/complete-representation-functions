#!/usr/bin/env python3
"""Improve disposable gzip transport while preserving every public asset byte.

The source tree is never modified. Deterministic compressed streams are cached in
the ignored build/ directory. All cache hits are independently decompressed and
hashed, and a candidate is used only when smaller than the existing gzip stream.
"""
from __future__ import annotations
import argparse
from concurrent.futures import ProcessPoolExecutor
import gzip
import hashlib
import json
from pathlib import Path
import time


def improve(task):
    import zopfli.gzip
    client, cache, relative, expected_sha = task
    target = (Path(client) / relative.lstrip('/')).resolve()
    if not target.is_relative_to(Path(client).resolve()):
        raise ValueError('Transport path escapes disposable build')
    original = target.read_bytes()
    raw = gzip.decompress(original)
    if hashlib.sha256(raw).hexdigest() != expected_sha:
        raise ValueError('Existing gzip does not match source hash: ' + relative)
    cached = Path(cache) / (expected_sha + '-zopfli-0.2.3.post1-i3.gz')
    cache_hit = cached.is_file()
    candidate = cached.read_bytes() if cache_hit else zopfli.gzip.compress(raw, numiterations=3)
    if gzip.decompress(candidate) != raw:
        raise ValueError('Lossless gzip verification failed: ' + relative)
    if not cache_hit:
        cached.parent.mkdir(parents=True, exist_ok=True)
        cached.write_bytes(candidate)
    if len(candidate) < len(original):
        target.write_bytes(candidate)
        stored = len(candidate)
    else:
        stored = len(original)
    return {'file': relative, 'sha256': expected_sha, 'beforeBytes': len(original),
            'storedBytes': stored, 'savedBytes': len(original)-stored,
            'cacheHit': cache_hit, 'byteExact': True}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--client', required=True)
    parser.add_argument('--manifest', required=True)
    parser.add_argument('--cache', required=True)
    parser.add_argument('--report', required=True)
    args = parser.parse_args()
    try:
        import zopfli.gzip  # noqa: F401
    except ImportError as error:
        raise SystemExit('Build dependency missing: python3 -m pip install -r requirements-build.txt') from error
    start = time.perf_counter()
    packed = json.loads(Path(args.manifest).read_text())
    seen, tasks = set(), []
    for entry in packed['manifest'].values():
        if entry['encoding'] != 'gzip' or entry['bytes'] < 256*1024 or entry['file'] in seen:
            continue
        seen.add(entry['file'])
        tasks.append((args.client, args.cache, entry['file'], entry['sha256']))
    with ProcessPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(improve, tasks))
    report = {'schema': 'crf.lossless_gzip_optimization.v1',
              'algorithm': 'zopfli 0.2.3.post1, 3 iterations, retain smaller gzip stream',
              'sourceModified': False, 'allByteExact': True,
              'files': results, 'savedBytes': sum(x['savedBytes'] for x in results),
              'elapsedSeconds': round(time.perf_counter()-start, 3)}
    output = Path(args.report)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, indent=2)+'\n')
    print(json.dumps({key: value for key, value in report.items() if key != 'files'}))


if __name__ == '__main__':
    main()
