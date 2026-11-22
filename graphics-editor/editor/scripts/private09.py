#!/usr/bin/env python3
"""Run approved CRF experiments; keep the runtime API credential in memory/stdin."""
import getpass, json, subprocess, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
ALLOWED = {'probe_provider09.mjs', 'run_generation09.mjs', 'run_learning09.mjs', 'run_benchmark09.mjs'}
name = sys.argv[1] if len(sys.argv) > 1 else ''
if name not in ALLOWED:
    raise SystemExit('Unknown CRF 0.9 runner')
key = getpass.getpass('DeepSeek credential (hidden): ')
proc = subprocess.Popen(['node', str(ROOT / 'scripts' / name), *sys.argv[2:]], stdin=subprocess.PIPE, cwd=ROOT)
proc.stdin.write((json.dumps({'apiKey': key}) + '\n').encode())
proc.stdin.close()
key = ''
raise SystemExit(proc.wait())
