#!/usr/bin/env python3
"""Run CRF 0.10 evidence scripts with a credential only in memory and stdin."""
import getpass, json, subprocess, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
ALLOWED = {'probe_provider10.mjs', 'run_generation10.mjs', 'run_research10.mjs'}
name = sys.argv[1] if len(sys.argv) > 1 else ''
if name not in ALLOWED:
    raise SystemExit('Unknown CRF 0.10 runner')
key = getpass.getpass('DeepSeek credential (hidden): ')
proc = subprocess.Popen(['node', str(ROOT / 'scripts' / name), *sys.argv[2:]], stdin=subprocess.PIPE, cwd=ROOT)
proc.stdin.write((json.dumps({'apiKey': key}) + '\n').encode())
proc.stdin.close()
key = ''
raise SystemExit(proc.wait())
