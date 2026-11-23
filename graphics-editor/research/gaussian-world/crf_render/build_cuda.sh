#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
if ! command -v nvcc >/dev/null 2>&1; then
  echo 'nvcc is unavailable. CUDA source is unvalidated; install a compatible CUDA toolkit on the GPU host.' >&2
  exit 2
fi
python3 tools/generate_cuda_shared.py
# CUDA12.8 supports SM120 on the intended Blackwell GPU. Native auto-detects
# the connected GPU; override, e.g. CRF_CUDA_ARCH=sm_120, for cross compilation.
crf_arch="${CRF_CUDA_ARCH:-native}"
crf_nvcc_extra=()
if [[ -n "${CRF_NVCC_CCBIN:-}" ]]; then crf_nvcc_extra+=(-ccbin "$CRF_NVCC_CCBIN"); fi
nvcc -O3 -std=c++17 -arch="$crf_arch" -Xcompiler=-fopenmp \
  --expt-relaxed-constexpr -lineinfo "${crf_nvcc_extra[@]}" \
  src/renderer_cuda.cu -o crf_render_cuda.next
mv -f crf_render_cuda.next crf_render_cuda
printf '%s\n' 'Compiled CUDA prototype. Run tools/run_gpu_workload.sh --smoke before full renders.'
