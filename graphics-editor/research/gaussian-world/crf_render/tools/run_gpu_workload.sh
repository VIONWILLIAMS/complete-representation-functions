#!/usr/bin/env bash
# Finite, authorized rendering workload. Never changes clocks/power or fills VRAM.
set -euo pipefail
cd "$(dirname "$0")/.."
crf_mode="${1:---full}"
if [[ "$crf_mode" != --full && "$crf_mode" != --smoke ]]; then echo 'Use --smoke or --full' >&2;exit 2;fi
command -v nvidia-smi >/dev/null || { echo 'No nvidia-smi; GPU workload not started.' >&2;exit 2; }
command -v timeout >/dev/null || { echo 'GNU timeout required for bounded workloads.' >&2;exit 2; }
[[ -x ./crf_render_cuda ]] || ./build_cuda.sh
crf_stamp="$(date -u +%Y%m%dT%H%M%SZ)"
crf_out="${CRF_GPU_OUTPUT:-outputs/gpu_$crf_stamp}"
mkdir -p "$crf_out"
crf_index="${CRF_GPU_TELEMETRY_INDEX:-0}"
nvidia-smi --id="$crf_index" --query-gpu=name,driver_version,memory.total --format=csv > "$crf_out/gpu_inventory.csv"
nvcc --version > "$crf_out/nvcc_version.txt"
sha256sum src/renderer.cpp src/renderer_cuda.cu src/cuda_shared.generated.cuh crf_render_cuda > "$crf_out/source_and_binary_sha256.txt"
nvidia-smi --id="$crf_index" --query-gpu=timestamp,index,name,utilization.gpu,utilization.memory,memory.used,memory.total,power.draw,temperature.gpu --format=csv -l 2 > "$crf_out/telemetry.csv" &
crf_monitor_pid=$!
cleanup(){ kill "$crf_monitor_pid" 2>/dev/null || true;wait "$crf_monitor_pid" 2>/dev/null || true; }
trap cleanup EXIT INT TERM
crf_limit="${CRF_MAX_RENDER_SECONDS:-3600}"
run_render(){ timeout --signal=TERM --kill-after=15 "$crf_limit" ./crf_render_cuda "$@"; }
# Analytic checks are independent of visual preferences or denoising.
run_render scenes/check_lambert.scene "$crf_out/check_lambert_cuda" 16 16 4 1 3 4 2>&1 | tee "$crf_out/check_lambert.log"
run_render scenes/check_beer.scene "$crf_out/check_beer_cuda" 1 1 4 1 4 4 2>&1 | tee "$crf_out/check_beer.log"
python3 tools/verify_cuda.py "$crf_out"
# Tune block size on a finite representative preview; choose measured time.
python3 scenes/still_life.py "$crf_out/still_life.scene"
for crf_block in 64 128 256; do
 CRF_CUDA_BLOCK="$crf_block" run_render "$crf_out/still_life.scene" "$crf_out/bench_$crf_block" 256 384 16 77 10 4 2>&1 | tee "$crf_out/bench_$crf_block.log"
done
crf_best="$(python3 - "$crf_out" <<'PY'
import json,sys
from pathlib import Path
p=Path(sys.argv[1]);results=[json.loads((p/f'bench_{b}.json').read_text()) for b in (64,128,256)]
best=min(results,key=lambda d:d['kernel_seconds']);(p/'benchmark_summary.json').write_text(json.dumps({'benchmarks':results,'selected_block':best['block_size']},indent=2)+'\n');print(best['block_size'])
PY
)"
export CRF_CUDA_BLOCK="$crf_best"
python3 tools/develop.py "$crf_out/bench_$crf_best" --output "$crf_out/gpu_preview.png" --atrous 1
if [[ "$crf_mode" == --smoke ]]; then
 printf 'Smoke checks finished. Results: %s\n' "$crf_out"
 exit 0
fi
crf_spp="${CRF_GPU_SPP:-256}"
crf_depth="${CRF_GPU_DEPTH:-12}"
crf_batch="${CRF_GPU_BATCH:-8}"
# Dimensions are native rendered pixels, never AI-upscaled.
for crf_scene in still_life architecture landscape product; do
 python3 "scenes/$crf_scene.py" "$crf_out/$crf_scene.scene"
 case "$crf_scene" in
  still_life) crf_w=2048;crf_h=3072;;
  architecture|landscape) crf_w=3072;crf_h=2048;;
  product) crf_w=2048;crf_h=2560;;
 esac
 run_render "$crf_out/$crf_scene.scene" "$crf_out/${crf_scene}_cuda" "$crf_w" "$crf_h" "$crf_spp" 20261123 "$crf_depth" "$crf_batch" 2>&1 | tee "$crf_out/${crf_scene}_cuda.log"
 python3 tools/develop.py "$crf_out/${crf_scene}_cuda" --atrous 2
 done
if [[ -f scenes/desert.py && "${CRF_GPU_INCLUDE_DESERT:-1}" == 1 ]]; then
 python3 scenes/desert.py "$crf_out/desert.scene"
 run_render "$crf_out/desert.scene" "$crf_out/desert_cuda" 3072 2048 "$crf_spp" 20261123 "$crf_depth" "$crf_batch" 2>&1 | tee "$crf_out/desert_cuda.log"
 python3 tools/develop.py "$crf_out/desert_cuda" --atrous 2
fi
printf 'Finite GPU workload finished. Images, raw data, measurements: %s\n' "$crf_out"
