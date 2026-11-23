#!/usr/bin/env python3
"""Attach only to an explicitly selected, already existing Colab kernel.

Reviewed against google-colab-cli 0.8.0 / jupyter-kernel-client 0.9.0.
Without --connect this file makes no network or authentication calls.
--interactive keeps the normal OAuth session in process memory. It can query
hardware, then run/upload only exact local files explicitly allowlisted.

This helper never creates a runtime or a kernel, and never interrupts,
restarts, shuts down, unassigns, or writes a Colab sessions/token cache.
The optional --system-credentials uses the official get_credentials function
and therefore follows that function's own OS-keyring/legacy-migration rules.
The default memory-only mode uses the package's unchanged normal OAuth flow.
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import importlib.metadata
import json
import logging
from pathlib import Path, PurePosixPath
import queue
import shlex
import sys
import time
from urllib.parse import urlsplit


PROJECT=Path(__file__).resolve().parents[1]
MARKER='__CRF_COLAB_RESULT__'
MAX_FILE_BYTES=8*1024*1024
ALLOWED_SUFFIXES={'.py','.cpp','.cc','.c','.h','.hpp','.cu','.cuh','.scene','.json','.txt','.md','.zip'}
REQUIRED_VERSIONS={'google-colab-cli':'0.8.0','jupyter-kernel-client':'0.9.0'}


class ProbeError(Exception):
    """An intentionally sanitized, user-readable failure."""


def out(value):
    print(json.dumps(value,ensure_ascii=False,indent=2),flush=True)


def check_versions():
    found={name:importlib.metadata.version(name) for name in REQUIRED_VERSIONS}
    if found!=REQUIRED_VERSIONS:
        raise ProbeError('Installed client versions differ from the statically reviewed versions; review before connecting.')
    return found


def quiet_logger():
    # Some upstream debug records include proxy URLs or HTTP headers. This
    # executable never enables those logs and never prints exception reprs.
    logging.disable(logging.CRITICAL)
    logger=logging.getLogger('crf.colab.existing_only')
    logger.disabled=True
    return logger


def authorize(system_credentials=False):
    if system_credentials:
        from colab_cli.auth import get_credentials, AuthProvider
        return get_credentials(provider=AuthProvider.OAUTH2)
    # Only the publicly distributed client configuration is read. No token,
    # browser cookie, CLI state, credential cache, or another process is read.
    from importlib import resources
    from colab_cli.auth import _run_remote_flow
    from google.auth.transport.requests import AuthorizedSession
    config=json.loads(resources.files('colab_cli').joinpath('oauth_config.json').read_text())
    credentials=_run_remote_flow(config)
    return AuthorizedSession(credentials)


def validate_proxy(url):
    p=urlsplit(url)
    host=p.hostname or ''
    if p.scheme!='https' or p.username or p.password or p.query or p.fragment:
        raise ProbeError('The returned runtime proxy URL is outside the reviewed HTTPS shape; stopped.')
    if not (host=='colab.research.google.com' or host.endswith('.googleusercontent.com')):
        raise ProbeError('The returned runtime proxy is not a reviewed Google Colab host; stopped.')
    return url.rstrip('/')


def public_assignment(a):
    return {'endpoint':a.endpoint,
            'accelerator':getattr(a.accelerator,'value',str(a.accelerator)),
            'variant':getattr(a.variant,'name',str(a.variant)),
            'machine_shape':getattr(a.machine_shape,'name',str(a.machine_shape))}


def public_kernel(k):
    return {key:k.get(key) for key in ('id','name','execution_state','connections','last_activity')}


class AssignmentListTransport:
    """Constrain the official Colab client to its single listing GET endpoint."""
    def __init__(self,session):self.session=session
    def request(self,method,url,**kwargs):
        p=urlsplit(url)
        if method.upper()!='GET' or p.scheme!='https' or p.hostname!='colab.research.google.com' or p.path!='/tun/m/assignments':
            raise ProbeError('This helper permits only the existing-assignment listing API.')
        kwargs.setdefault('timeout',20)
        return self.session.request(method,url,**kwargs)


class ExistingOnly:
    def __init__(self,session,timeout=300):
        from colab_cli.client import Client,Prod
        self.api=Client(Prod(),AssignmentListTransport(session),logger=quiet_logger())
        self.session=session
        self.timeout=timeout
        self.manager=None
        self.channel=None
        self.endpoint=None
        self.kernel_id=None
        self.pending=None
        self.stream=''

    def assignments(self):
        # This official method performs GET /tun/m/assignments only.
        return self.api.list_assignments()

    def list(self):
        aa=self.assignments()
        out({'existing_assignments':[public_assignment(a) for a in aa]})
        return aa

    def resolve(self,endpoint):
        aa=[a for a in self.assignments() if a.endpoint==endpoint]
        if len(aa)!=1:
            raise ProbeError('The exact endpoint is not present in the current authorized assignment list. Nothing was created.')
        return aa[0]

    def manager_for(self,a,kernel_id=None):
        from jupyter_kernel_client.manager import KernelHttpManager
        from jupyter_kernel_client.wsclient import JupyterSubprotocol
        info=a.runtime_proxy_info
        return KernelHttpManager(
            server_url=validate_proxy(info.url),token=info.token,kernel_id=kernel_id,
            log=quiet_logger(),headers={
                'X-Colab-Client-Agent':'colab-cli',
                'X-Colab-Runtime-Proxy-Token':info.token,
            },client_kwargs={'subprotocol':JupyterSubprotocol.DEFAULT,
                             'timeout':20,'reconnect_interval':0})

    def kernels(self,endpoint):
        a=self.resolve(endpoint)
        # No kernel_id: constructing a manager does not create/connect a kernel.
        manager=self.manager_for(a)
        kk=manager.list_kernels(timeout=20)
        out({'endpoint':endpoint,'existing_kernels':[public_kernel(k) for k in kk]})
        return kk

    def select(self,endpoint,kernel_id):
        if self.pending:
            raise ProbeError('A previously submitted command is still pending; use wait or exit without interrupting it.')
        if not endpoint or not kernel_id:
            raise ProbeError('An exact endpoint and existing kernel ID are both required.')
        a=self.resolve(endpoint)
        listed=self.manager_for(a).list_kernels(timeout=20)
        selected=[k for k in listed if k.get('id')==kernel_id]
        if len(selected)!=1:
            raise ProbeError('The exact kernel ID is not in this endpoint\'s current accessible kernel list.')
        if selected[0].get('execution_state')!='idle':
            raise ProbeError('The selected kernel is not idle; no code was submitted.')
        if 'python' not in str(selected[0].get('name','')).lower():
            raise ProbeError('This GPU probe requires an existing Python kernel; no alternate kernel was started.')
        # Constructor refreshes the supplied ID by GET. A missing kernel fails
        # here. We deliberately never call KernelClient.start(), which can
        # create a kernel when its old ID vanished.
        manager=self.manager_for(a,kernel_id)
        model=manager.kernel
        if not model or model.get('id')!=kernel_id:
            raise ProbeError('The selected kernel no longer exists. No replacement kernel was created.')
        if model.get('execution_state')!='idle':
            raise ProbeError('The selected kernel is not idle; no code was submitted.')
        self.close_channels()
        self.manager=manager
        self.endpoint=endpoint
        self.kernel_id=kernel_id
        self.channel=manager.client
        self.channel.start_channels(stdin=False,control=False)
        if not self.channel.connection_ready.is_set():
            self.close_channels()
            raise ProbeError('Jupyter WebSocket did not become ready. No code was submitted.')
        out({'selected_existing_endpoint':endpoint,'existing_kernel':kernel_id,
             'runtime_created':False,'kernel_created':False})

    def close_channels(self):
        if self.channel is not None:
            self.channel.stop_channels()
        self.channel=None
        self.manager=None

    def execute(self,body,timeout=None):
        if self.pending:
            raise ProbeError('A previous request remains pending; use wait instead of submitting it again.')
        if self.channel is None or self.manager is None:
            raise ProbeError('Select an existing endpoint and idle kernel first.')
        model=self.manager.refresh_model(timeout=20)
        if not model or model.get('id')!=self.kernel_id or model.get('execution_state')!='idle':
            raise ProbeError('The selected kernel is missing or busy; no command was sent.')
        # Separate execution namespace, no IPython history entry, no stdin, and
        # no request to abort other queued work if this request fails.
        code='exec('+repr(body)+', {})'
        self.stream=''
        self.pending=self.channel.execute(code,silent=False,store_history=False,
                                          allow_stdin=False,stop_on_error=False)
        return self.collect(timeout or self.timeout)

    def collect(self,timeout=None):
        if not self.pending or not self.channel:
            raise ProbeError('No command is waiting for output.')
        deadline=time.monotonic()+(timeout or self.timeout)
        while True:
            remaining=deadline-time.monotonic()
            if remaining<=0:
                raise ProbeError('The output wait expired. The command was not interrupted; use wait to continue or exit to disconnect.')
            if not self.channel.connection_ready.is_set():
                raise ProbeError('The WebSocket disconnected. No interrupt or restart was sent; remote execution state is unknown.')
            try:
                msg=self.channel.get_iopub_msg(timeout=min(1.,remaining))
            except queue.Empty:
                continue
            if msg.get('parent_header',{}).get('msg_id')!=self.pending:
                continue
            kind=msg.get('header',{}).get('msg_type')
            content=msg.get('content',{})
            if kind=='stream':
                self.stream=(self.stream+content.get('text',''))[-200000:]
            elif kind=='error':
                self.stream+=MARKER+json.dumps({'status':'kernel_error','exception_type':content.get('ename','Error')})+'\n'
            elif kind=='status' and content.get('execution_state')=='idle':
                self.pending=None
                parsed=[]
                for line in self.stream.splitlines():
                    if line.startswith(MARKER):
                        try:parsed.append(json.loads(line[len(MARKER):]))
                        except json.JSONDecodeError:pass
                if not parsed:
                    raise ProbeError('The kernel completed without the expected structured result. Raw output was not exposed.')
                for value in parsed:out(value)
                return parsed

    def probe(self):
        return self.execute('''import json,subprocess
try:
    result=subprocess.run(['nvidia-smi','--query-gpu=name,memory.total,memory.used,utilization.gpu,driver_version','--format=csv,noheader,nounits'],capture_output=True,text=True,timeout=15,check=False)
    payload={'operation':'read_only_nvidia_smi','returncode':result.returncode,'columns':['name','memory_total_MiB','memory_used_MiB','gpu_utilization_percent','driver_version'],'stdout':result.stdout[:12000],'stderr':result.stderr[:2000]}
except Exception as error:
    payload={'operation':'read_only_nvidia_smi','status':'unavailable','exception_type':type(error).__name__}
print('''+repr(MARKER)+'''+json.dumps(payload))
''',timeout=35)


def allowed_files(paths):
    result={}
    for name in paths:
        p=Path(name).expanduser().resolve(strict=True)
        if not p.is_file() or not p.is_relative_to(PROJECT) or p.suffix.lower() not in ALLOWED_SUFFIXES:
            raise ProbeError('Every allowed file must be an explicitly chosen source/artifact inside this CRF project.')
        if any(part.startswith('.') for part in p.relative_to(PROJECT).parts):
            raise ProbeError('Hidden files and directories cannot be added to the upload/run allowlist.')
        if p.stat().st_size>MAX_FILE_BYTES:
            raise ProbeError('An allowed file exceeds the 8 MiB limit for this minimal Jupyter transfer helper.')
        result[str(p)]=p
    return result


def resolve_allowed(value,allowed):
    p=Path(value).expanduser().resolve(strict=True)
    if str(p) not in allowed:
        raise ProbeError('That exact local path was not supplied using --allow-file.')
    if p.stat().st_size>MAX_FILE_BYTES:
        raise ProbeError('The file now exceeds the transfer limit.')
    return p


def run_file(connection,path):
    if path.suffix.lower()!='.py':
        raise ProbeError('run-file accepts an explicitly allowed Python source file only.')
    data=path.read_bytes()
    source=data.decode('utf-8')
    compile(source,path.name,'exec')
    payload=base64.b64encode(data).decode('ascii')
    body=f'''import base64,contextlib,io,json
source=base64.b64decode({payload!r}).decode('utf-8')
stdout=io.StringIO();stderr=io.StringIO()
payload={{'operation':'run_explicit_local_file','filename':{path.name!r},'sha256':{hashlib.sha256(data).hexdigest()!r}}}
try:
    with contextlib.redirect_stdout(stdout),contextlib.redirect_stderr(stderr):
        exec(compile(source,{path.name!r},'exec'),{{'__name__':'__main__'}})
    payload['status']='completed'
except Exception as error:
    payload['status']='failed';payload['exception_type']=type(error).__name__;payload['message']=str(error)[:2000]
payload['stdout']=stdout.getvalue()[-60000:];payload['stderr']=stderr.getvalue()[-60000:]
print({MARKER!r}+json.dumps(payload))
'''
    out({'submitting_explicit_file':str(path),'sha256':hashlib.sha256(data).hexdigest(),'bytes':len(data)})
    connection.execute(body)


def remote_directory(value):
    p=PurePosixPath(value)
    if not p.is_absolute() or not p.is_relative_to('/content') or '..' in p.parts or str(p)=='/content':
        raise ProbeError('--remote-dir must name an explicit subdirectory beneath /content without traversal components.')
    return p


def upload_file(connection,path,directory,relative=None):
    relative=PurePosixPath(relative or path.name)
    if relative.is_absolute() or '..' in relative.parts or any(p.startswith('.') for p in relative.parts):
        raise ProbeError('The remote filename must be relative to --remote-dir with no hidden or traversal components.')
    target=directory/relative
    data=path.read_bytes();digest=hashlib.sha256(data).hexdigest()
    payload=base64.b64encode(data).decode('ascii')
    body=f'''import base64,hashlib,json,pathlib
root=pathlib.Path({str(directory)!r}).resolve()
p=pathlib.Path({str(target)!r}).resolve()
assert p.is_relative_to(root), 'Remote path escapes the explicitly selected directory.'
data=base64.b64decode({payload!r})
assert hashlib.sha256(data).hexdigest()=={digest!r}
if p.exists():
    if p.read_bytes()!=data:
        raise FileExistsError('Target exists with different bytes; no overwrite performed.')
    status='already_identical'
else:
    p.parent.mkdir(parents=True,exist_ok=True)
    with p.open('xb') as stream:stream.write(data)
    status='uploaded'
print({MARKER!r}+json.dumps({{'operation':'upload_explicit_file','status':status,'remote_path':str(p),'bytes':len(data),'sha256':{digest!r}}}))
'''
    out({'uploading_explicit_file':str(path),'remote_path':str(target),'bytes':len(data),'sha256':digest})
    connection.execute(body)


def interactive(connection,args,allowed):
    connection.list()
    endpoint=args.endpoint or input('Exact existing endpoint (or exit): ').strip()
    if endpoint in ('exit','quit','q',''):return
    connection.kernels(endpoint)
    kernel_id=args.kernel_id or input('Exact existing idle kernel ID (or exit): ').strip()
    if kernel_id in ('exit','quit','q',''):return
    connection.select(endpoint,kernel_id)
    connection.probe()
    out({'commands':['probe','list','kernels ENDPOINT','use ENDPOINT KERNEL_ID',
                     'allow-file EXACT_PROJECT_LOCAL_PATH',
                     'run-file EXACT_ALLOWED_LOCAL_PATH','upload EXACT_ALLOWED_LOCAL_PATH [RELATIVE_NAME]',
                     'wait','exit'],
         'allowed_local_files':list(allowed),'remote_directory':str(remote_directory(args.remote_dir)),
         'credentials':'Kept in this process only in the default OAuth mode; never printed.'})
    while True:
        try:
            parts=shlex.split(input('crf-colab> '))
            if not parts:continue
            cmd,*values=parts
            if cmd in ('exit','quit','q'):return
            if cmd=='probe' and not values:connection.probe()
            elif cmd=='list' and not values:connection.list()
            elif cmd=='kernels' and len(values)==1:connection.kernels(values[0])
            elif cmd=='use' and len(values)==2:connection.select(*values)
            elif cmd=='wait' and not values:connection.collect()
            elif cmd=='allow-file' and len(values)==1:
                added=allowed_files(values);allowed.update(added)
                out({'explicitly_allowlisted_local_files':list(added)})
            elif cmd=='run-file' and len(values)==1:run_file(connection,resolve_allowed(values[0],allowed))
            elif cmd=='upload' and len(values) in (1,2):
                upload_file(connection,resolve_allowed(values[0],allowed),remote_directory(args.remote_dir),values[1] if len(values)==2 else None)
            else:raise ProbeError('Unknown command or argument count. Arbitrary shell commands are not accepted.')
        except EOFError:return
        except ProbeError as error:out({'error':str(error)})
        except Exception as error:out({'error':'Operation failed; raw exception details suppressed.','exception_type':type(error).__name__})


def main(argv=None):
    parser=argparse.ArgumentParser(description=__doc__,formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('mode',nargs='?',choices=('list','kernels','probe'),default='list')
    parser.add_argument('--connect',action='store_true',help='Actually authorize and connect; omit for an offline plan only.')
    parser.add_argument('--interactive',action='store_true',help='Keep one authorized process for explicit selection, probe, allowed uploads/runs.')
    parser.add_argument('--endpoint',help='Exact endpoint returned by the authorized existing-assignment list.')
    parser.add_argument('--kernel-id',help='Exact already existing idle kernel ID; never creates one.')
    parser.add_argument('--memory-only-oauth',action='store_true',help='Explicit spelling of the default normal OAuth flow with no token cache.')
    parser.add_argument('--system-credentials',action='store_true',help='Use official get_credentials with its normal OS-keyring/cache migration behavior.')
    parser.add_argument('--allow-file',action='append',default=[],help='Exact project-local source file permitted for interactive upload/run. Repeat as needed.')
    parser.add_argument('--remote-dir',default='/content/crf_code_renderer',help='Explicit upload directory beneath /content; existing different files are not overwritten.')
    parser.add_argument('--timeout',type=float,default=300,help='Seconds to wait for an explicit run; expiry does not interrupt remote execution.')
    args=parser.parse_args(argv)
    if args.memory_only_oauth and args.system_credentials:parser.error('Choose one OAuth storage mode.')
    if not args.interactive and args.mode in ('kernels','probe') and not args.endpoint:parser.error('--endpoint is required.')
    if not args.interactive and args.mode=='probe' and not args.kernel_id:parser.error('--kernel-id is required.')
    allowed=allowed_files(args.allow_file)
    remote_directory(args.remote_dir)
    if not args.connect:
        out({'status':'offline_only','network_calls':0,'oauth_started':False,
             'reviewed_dependencies':REQUIRED_VERSIONS,'mode':args.mode,'interactive':args.interactive,
             'endpoint_explicit':bool(args.endpoint),'kernel_id_explicit':bool(args.kernel_id),
             'allowed_files':list(allowed),'remote_directory':args.remote_dir,
             'next_step':'Use --connect only after the user has authorized normal OAuth; do not run beside another pending OAuth flow.'})
        return 0
    check_versions();quiet_logger()
    session=None;connection=None
    try:
        session=authorize(args.system_credentials)
        connection=ExistingOnly(session,args.timeout)
        if args.interactive:interactive(connection,args,allowed)
        elif args.mode=='list':connection.list()
        elif args.mode=='kernels':connection.kernels(args.endpoint)
        else:
            connection.select(args.endpoint,args.kernel_id)
            connection.probe()
        return 0
    except ProbeError as error:
        out({'error':str(error)});return 2
    except KeyboardInterrupt:
        out({'status':'local_exit','remote_interrupt_sent':False});return 130
    except Exception as error:
        out({'error':'Connection or operation failed; raw exception details suppressed.','exception_type':type(error).__name__});return 2
    finally:
        if connection is not None:
            if connection.pending:out({'notice':'Disconnected locally while a request may still be running. No remote interrupt was sent.'})
            try:connection.close_channels()
            except Exception as error:out({'notice':'Local channel cleanup failed. No remote lifecycle action was requested.','exception_type':type(error).__name__})
        if session is not None:
            try:session.close()
            except Exception:pass


if __name__=='__main__':raise SystemExit(main())
