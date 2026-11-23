# Portable Colab notebook

`delivery/CRF_GPU_Colab.ipynb` embeds the exact bytes of
`delivery/CRF_CodeNative_Render_Source.zip`, checks their SHA-256, and extracts
them into a new independent directory under the user's Colab `/content`.

The notebook does not contain credentials, use the Colab CLI, request a VM,
mount Drive, keep a session alive, or claim GPU execution occurred here.
The user opens it in their own Colab account, explicitly selects/connects a
GPU runtime, and runs the notebook cells.

## Current compilation evidence

`logs/cuda_compile_status.json` records successful local compilation **and
linking** with isolated NVIDIA **NVCC 13.0.88**, **GCC 14.2**, and target
**sm_120**. This was cross-compilation on a host without a usable NVIDIA GPU;
it did not run the CUDA program or produce GPU-rendered images.

The earlier local CUDA 12.8 attempt failed because of a header declaration
conflict with this host's glibc 2.41. That local environment failure does not
establish that a remote CUDA 12.8 environment will fail. Remote CUDA 12.8,
driver compatibility, numerical behavior and GPU performance remain untested.

The notebook builder reads this JSON status record and compares its recorded
hashes against the **embedded ZIP's** `renderer.cpp`, `renderer_cuda.cu`, and
`cuda_shared.generated.cuh`. It reports compile success for the embedded source
only if those hashes match. A stale checkpoint gets an explicit mismatch note.
The record's SHA-256, compiler, target and separate execution status are retained
in notebook metadata and the eventual runtime result manifest.

The real command sequence is:

1. Query the already connected GPU using `nvidia-smi` and check `nvcc`, `g++`,
   and GNU `timeout` exist.
2. Validate/extract the embedded source ZIP, install `requirements.txt`.
3. `bash build_cuda.sh`.
4. `bash tools/run_gpu_workload.sh --smoke`, verify `cuda_verification.json`,
   and display this run's `gpu_preview.png`.
5. Only when `RUN_FULL=True`, execute the finite `--full` workload with bounded
   sample counts and per-render/total wall times.
6. Display the actual native-resolution GPU outputs through smaller notebook
   previews, and export an actual-results ZIP with logs, hashes and source.

## Rebuild after the source ZIP is refreshed

The builder requires `nbformat`. It is already present in the adjacent
`colab_cli_env` used for this handoff; that Python can build the notebook without
starting OAuth or connecting to any remote runtime.

From the CRF project directory:

```bash
python tools/package_delivery.py --source-only
../colab_cli_env/bin/python tools/build_colab_notebook.py --snapshot-status refreshed
```

For a clearly labeled checkpoint/preparatory notebook:

```bash
../colab_cli_env/bin/python tools/build_colab_notebook.py --snapshot-status preliminary
```

The builder compares critical current source files with the ZIP. `refreshed`
refuses mismatches; `preliminary` records them and marks the snapshot as a
checkpoint. Neither status establishes GPU execution.

This snapshot label is separate from the recorded local cross-compilation
result and from the as-yet-unperformed remote GPU execution.

`delivery/CRF_GPU_Colab.build.json` records exact notebook/source hashes, schema
and code-cell syntax checks, embedded ZIP CRC, required source paths, and the
explicit GPU execution gap. Local NVCC cross-compilation has succeeded, but GPU
cells cannot be executed without a usable NVIDIA GPU. Their outputs and
execution counts remain empty until run by the
user; no sample image is inserted as an executed GPU result.
