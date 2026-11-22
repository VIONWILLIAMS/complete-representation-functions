#!/usr/bin/env python3
"""Verify exact Site URLs with the official server-to-server access header.
The credential is read with getpass and never persisted or printed.
"""
import argparse, getpass, hashlib, json, urllib.request, urllib.error
from pathlib import Path
from urllib.parse import urlparse, urljoin
ROOT=Path(__file__).resolve().parents[1]
p=argparse.ArgumentParser();p.add_argument('--origin',required=True);p.add_argument('--provider',action='store_true');p.add_argument('--provider-evidence',help='Reuse an explicit previously successful check for this identical published origin, without another paid call');p.add_argument('--verify-html-only',action='store_true',help='Recheck only the canonical editor HTML route; explicitly preserve prior checks for this same origin');a=p.parse_args()
if a.provider and a.provider_evidence:raise SystemExit('Select a fresh provider call or explicit existing evidence, not both.')
if a.verify_html_only and a.provider:raise SystemExit('The focused HTML check must not repeat a paid provider call.')
u=urlparse(a.origin)
if u.scheme!='https' or u.path not in ('','/') or u.query or u.fragment:raise SystemExit('An exact HTTPS Site origin is required.')
origin=a.origin.rstrip('/');key=getpass.getpass('Site service access (hidden): ')
headers={'OAI-Sites-Authorization':'Bearer '+key};checks=[]
prior_html=None
if a.verify_html_only:
 prior_html=json.loads((ROOT/'reports/v09/production.json').read_text())
 if prior_html.get('origin')!=origin:raise SystemExit('Prior checks must refer to the same published origin.')
 checks=[c for c in prior_html['checks'] if c['path']!='/studio09.html']
def request(route,body=None):
 data=None if body is None else json.dumps(body,ensure_ascii=False).encode()
 req=urllib.request.Request(origin+route,data=data,headers={**headers,**({'Content-Type':'application/json'} if body is not None else {})})
 # Do not forward the Site credential across a redirect.
 class NoRedirect(urllib.request.HTTPRedirectHandler):
  def redirect_request(self,*args,**kwargs):return None
 opener=urllib.request.build_opener(NoRedirect)
 try:
  with opener.open(req,timeout=180) as res:return res.status,res.read(),{k.lower():v for k,v in res.headers.items()}
 except urllib.error.HTTPError as e:return e.code,e.read(),{k.lower():v for k,v in e.headers.items()}
if not a.verify_html_only:
 status,raw,_=request('/api/crf/status')
 try:connection=json.loads(raw)
 except Exception:connection={}
 checks.append({'path':'/api/crf/status','status':status,'version':connection.get('version'),'configured':connection.get('configured'),'passed':status==200 and connection.get('version')=='0.9.0' and connection.get('configured') is True})
for rel in (['studio09.html'] if a.verify_html_only else ['index.html','studio09.html','gaussian08.html','assets/v09/acceptance.json','assets/v09/generated/index.json','downloads/CRF_0_9_Render_Kit.zip','downloads/CRF_0_9_Report.md']):
 route='/'+rel;status,raw,h=request(route);redirects=[]
 # ASSETS may canonicalize a directly stored HTML page to its extensionless
 # path. Follow only this exact same-origin form; never forward auth to login,
 # arbitrary paths, query strings, another scheme/host, or another API route.
 if status in (301,302,303,307,308) and rel.endswith('.html') and h.get('location'):
  destination=urlparse(urljoin(origin+route,h['location']))
  allowed={route[:-5],route[:-5]+'/'}
  if route=='/index.html':allowed.add('/')
  if destination.scheme==u.scheme and destination.netloc==u.netloc and destination.path in allowed and not destination.query and not destination.fragment:
   redirects.append({'status':status,'fromPath':route,'toPath':destination.path});status,raw,h=request(destination.path)
 file=ROOT/'web'/rel;expected=hashlib.sha256(file.read_bytes()).hexdigest();actual=hashlib.sha256(raw).hexdigest()
 checks.append({'path':route,'status':status,'redirects':redirects,'bytes':len(raw),'expectedSHA256':expected,'actualSHA256':actual,'passed':status==200 and actual==expected})
provider=prior_html.get('provider') if prior_html else None
if a.provider_evidence:
 prior=json.loads(Path(a.provider_evidence).read_text())
 if prior.get('origin')!=origin or prior.get('provider',{}).get('passed') is not True:raise SystemExit('Provider evidence must be a successful actual call for this exact origin.')
 provider=prior['provider'];provider['reusedFromExplicitEvidence']=str(Path(a.provider_evidence).relative_to(ROOT) if Path(a.provider_evidence).is_absolute() else Path(a.provider_evidence))
if a.provider:
 status,raw,_=request('/api/crf/native/generate',{'mode':'generate','prompt':'一个红苹果与一个绿色梨，摆在同一浅灰承托面上，侧光，1024×768。使用已有形态，局限放qualityNotes。','category':'still_life','seed':90909})
 try:result=json.loads(raw)
 except Exception:result={}
 provider={k:result.get(k) for k in ['ok','model','runId','action','usage','attempts','elapsedMs','qualityNotes','warnings','error']}
 provider.update({'httpStatus':status,'passed':status==200 and result.get('ok') is True and result.get('action')=='scene','scope':'Actual published server endpoint request; does not certify an authenticated browser task or image quality.'})
 if result.get('scene'):
  (ROOT/'reports/v09/production.scene.json').write_text(json.dumps(result['scene'],ensure_ascii=False,indent=2)+'\n')
key='';headers={}
report={'schema':'crf.production_service_verification.v0.9','origin':origin,'accessMethod':'Official Site service access header; no browser identity bypass','checks':checks,'provider':provider,'allPassed':all(x['passed'] for x in checks) and (provider is None or provider['passed']),'productionAuthenticatedBrowserTasks':0}
if a.verify_html_only:report['focusedRecheck']={'path':'/studio09.html','otherChecks':'Preserved actual preceding checks for this same unchanged published origin; no additional provider call.'}
(ROOT/'reports/v09/production.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'allPassed':report['allPassed'],'checks':[{'path':x['path'],'status':x['status'],'passed':x['passed']} for x in checks],'provider':provider},ensure_ascii=False))
raise SystemExit(0 if report['allPassed'] else 2)
