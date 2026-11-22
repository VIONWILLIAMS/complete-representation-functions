#!/usr/bin/env python3
"""Pass a runtime credential to a selected audited Node runner via stdin."""
import getpass,json,subprocess,sys
from pathlib import Path
root=Path(__file__).resolve().parents[1]
allowed={'run_learning08.mjs','run_semantics08.mjs','run_generation08.mjs','repair_learning08.mjs','polish_generation08.mjs'}
name=sys.argv[1] if len(sys.argv)>1 else 'run_learning08.mjs'
if name not in allowed: raise SystemExit('Unknown runner')
key=getpass.getpass('DeepSeek key (hidden): ')
proc=subprocess.Popen(['node',str(root/'scripts'/name),*sys.argv[2:]],stdin=subprocess.PIPE,cwd=root)
proc.stdin.write((json.dumps({'apiKey':key})+'\n').encode());proc.stdin.close();key=''
raise SystemExit(proc.wait())
