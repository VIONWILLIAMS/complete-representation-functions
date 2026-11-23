# Existing Colab runtime probe — static review and usage

## Status

The helper was developed and validated offline. **No OAuth flow, assignment
listing, Jupyter connection, GPU command, upload, or remote execution was
performed while developing it.** The previously pending login process was not
read, modified, interrupted, or used to extract credentials.

Reviewed installed packages:

- `google-colab-cli==0.8.0`, installed under `colab_cli_env`.
- `jupyter-kernel-client==0.9.0`, its pinned dependency.
- Authentication dependencies are the package's normal `google-auth`,
  `google-auth-oauthlib`, `requests`, and `keyring`; Jupyter uses
  `websocket-client` and the pinned kernel client.

## Findings from the installed official source

1. `colab_cli.client.Client.list_assignments()` makes a GET to
   `/tun/m/assignments`. Its response contains existing endpoint metadata and
   a short-lived runtime proxy URL/token. The helper uses those values only
   in process memory and displays only endpoint, accelerator, variant and
   machine shape. It never serializes the assignment object.
2. Bare `colab ssh` can create a VM when the local session store is empty.
   `ssh --proxy-mode -s NAME` can also create one if NAME does not exist.
   The helper does not invoke either path, `colab new`, `assign` or `unassign`.
3. `colab_cli.runtime.ColabRuntime.kernel_client` ultimately calls
   `KernelClient.start()`. In `jupyter_kernel_client.client`, `start()` can
   create a new Jupyter kernel if the supplied kernel is absent. Merely passing
   a stale ID is therefore insufficient to guarantee attach-only behavior.
4. The helper uses `KernelHttpManager` to list kernels and refresh a selected
   existing ID by GET, verifies that it is idle and Python, then opens only its
   WebSocket channels. It does not call `KernelClient.start()` or any
   create/restart/interrupt/shutdown method.
5. `get_credentials()` normally reads the OS keyring, can migrate an old token
   cache, and can save to the keyring. On this host the keyring is unavailable,
   so a different process cannot be promised seamless reuse after login exits.
   The helper's default **memory-only OAuth** invokes the installed package's
   unchanged `_run_remote_flow` with its distributed OAuth client configuration
   and wraps the returned credentials in `AuthorizedSession`. This still uses
   Google's normal consent page and authorization code exchange. No cache is
   read or written by this mode. `--system-credentials` is an explicit alternative
   that follows the official `get_credentials()` keyring behavior.

Primary source files inspected were the installed package's `auth.py`,
`client.py`, `runtime.py`, `common.py`, `commands/ssh.py`, and the pinned
dependency's `client.py`, `manager.py`, and `wsclient.py`. No credential files,
browser cookies, local Colab session caches, or another process's memory were
inspected.

## Safe offline invocation

```bash
colab_cli_env/bin/python crf_render/tools/colab_existing_runtime_probe.py \
  --interactive --memory-only-oauth
```

Omitting `--connect` prints an offline plan and performs no authentication or
network operations. This was the invocation used during development.

## One normal OAuth flow, followed by an in-memory interactive session

Start this only after the user authorizes it and after any earlier pending
OAuth invocation has ended. Do not run two OAuth prompts concurrently.

```bash
colab_cli_env/bin/python crf_render/tools/colab_existing_runtime_probe.py \
  --connect --interactive --memory-only-oauth \
  --allow-file /absolute/path/to/crf_render/src/renderer.cpp \
  --allow-file /absolute/path/to/crf_render/tools/explicit_gpu_test.py \
  --remote-dir /content/crf_code_renderer
```

Replace each allow-file path with a real file the operator explicitly selected;
the example GPU test filename is illustrative and is not supplied by this helper.
The exact allowed files must live inside this CRF project. Paths, hidden files,
file types and byte sizes are checked before remote use. Each source file is
hashed before upload or execution, and different existing remote bytes are not
overwritten.

After normal authorization the helper lists existing assignments, asks for an
exact endpoint, lists existing kernels, asks for an exact idle Python kernel ID,
and queries `nvidia-smi`. It stays alive so the authorized session can be reused
without extracting or exporting credentials.

Interactive commands:

| Command | Behavior |
| --- | --- |
| `probe` | Runs the fixed read-only GPU inventory command. |
| `list` | Lists existing authorized assignments. |
| `kernels ENDPOINT` | Lists accessible kernels for exactly that existing endpoint. |
| `use ENDPOINT KERNEL_ID` | Attaches to exactly the selected existing idle Python kernel. |
| `allow-file EXACT_PROJECT_LOCAL_PATH` | Explicitly adds one project-local source file to this process's allowlist; useful when a GPU test is written after OAuth. |
| `run-file EXACT_ALLOWED_LOCAL_PATH` | Executes one explicitly allowed Python source file in an isolated namespace. |
| `upload EXACT_ALLOWED_LOCAL_PATH [RELATIVE_NAME]` | Uploads that allowed file beneath the selected remote directory. |
| `wait` | Continues collecting a previously submitted command without resubmitting it. |
| `exit` | Closes local channels/session only; it does not unload or stop the remote runtime. |

`run-file` and `upload` are additional authorized actions, **not read-only
operations**. They are unavailable for any file not included in `--allow-file`
or explicitly added with the interactive `allow-file` command.
No arbitrary shell command is accepted by the interactive command parser.

For a one-shot existing-resource inventory:

```bash
colab_cli_env/bin/python crf_render/tools/colab_existing_runtime_probe.py --connect list
```

For a known existing endpoint and kernel:

```bash
colab_cli_env/bin/python crf_render/tools/colab_existing_runtime_probe.py \
  --connect probe --endpoint EXACT_ENDPOINT --kernel-id EXACT_IDLE_KERNEL_ID
```

Separate one-shot commands may each require OAuth on a host with no keyring.
Use the interactive mode if only one normal consent flow is desired.

## Limits

- Authentication, entitlement, endpoint visibility, runtime availability,
  WebSocket reachability and actual GPU hardware have **not been tested live**.
- The default OAuth flow uses a private helper function in CLI 0.8.0, and the
  attach path is tied to the reviewed 0.9.0 kernel client. A version mismatch
  stops network use until the new version is reviewed.
- A runtime with no existing idle Python kernel is not repaired or provisioned;
  the helper stops. A busy kernel is not interrupted or restarted. A race between
  the idle check and another user's action is still possible.
- Closing the local process does not stop an already submitted GPU test. A wait
  timeout preserves the request so `wait` can continue; it does not send an
  interrupt.
- The normal OAuth grant uses the package's standard scopes, which are broader
  than this helper's operation set. The local helper restricts its assignment
  API transport to the single GET-listing endpoint and never displays tokens.
- Proxy tokens are temporary. A long session may require an explicit `use` to
  refresh endpoint information; no replacement VM or kernel is created.
- The minimal transfer helper supports files up to 8 MiB. It has no remote
  filesystem browsing, bulk credential discovery, listener, or secret export.

## Offline checks performed

- Python AST parse and compilation succeeded.
- The helper contains no calls to runtime/kernel lifecycle methods
  (`assign`, `unassign`, `restart`, `shutdown`, `start_kernel`,
  `shutdown_kernel`, `restart_kernel`, `interrupt_kernel`).
- Default `--interactive --memory-only-oauth` invocation returned
  `offline_only`, `network_calls: 0`, and `oauth_started: false`.
- Fixed remote probe, upload and file-execution wrapper syntax was compiled
  locally without sending any of it to a remote kernel.

This establishes an inspectable attach-only design; it does not establish that
the current account has an accessible GPU or that remote execution has succeeded.
