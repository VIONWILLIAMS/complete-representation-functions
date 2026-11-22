#!/usr/bin/env python3
"""Read a temporary test key without echoing or persisting it."""
import getpass,json,pathlib,subprocess,sys
root=pathlib.Path(__file__).resolve().parent.parent
key=getpass.getpass('DeepSeek test key (hidden): ')
result=subprocess.run(['node','scripts/probe_scenes07.mjs',*sys.argv[1:]],cwd=root,input=json.dumps({'apiKey':key}),text=True)
key=''
raise SystemExit(result.returncode)
