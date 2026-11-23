#!/usr/bin/env python3
"""Read-only environment probes; writes one atomic JSON report, never trains."""
from __future__ import annotations

import argparse
import csv
import datetime as dt
import io
import json
import os
from pathlib import Path
import platform
import re
import shutil
import subprocess
import sys
import tempfile
import time


TORCH_PROBE = r'''
import json
try:
    import torch
except ModuleNotFoundError as exc:
    result = {"status": "not_installed" if exc.name == "torch" else "import_failed",
              "error_type": type(exc).__name__}
except Exception as exc:
    result = {"status": "import_failed", "error_type": type(exc).__name__}
else:
    result = {"status": "imported", "version": str(torch.__version__),
              "cuda_runtime_version": torch.version.cuda}
    try:
        result["cuda_available"] = bool(torch.cuda.is_available())
        result["visible_device_count"] = int(torch.cuda.device_count())
        result["compiled_cuda_architectures"] = list(torch.cuda.get_arch_list())
        result["devices"] = []
        if result["cuda_available"]:
            for ordinal in range(result["visible_device_count"]):
                prop = torch.cuda.get_device_properties(ordinal)
                result["devices"].append({"ordinal": ordinal, "name": str(prop.name),
                    "compute_capability": f"{prop.major}.{prop.minor}",
                    "total_memory_bytes": int(prop.total_memory)})
    except Exception as exc:
        result["status"] = "cuda_probe_failed"
        result["error_type"] = type(exc).__name__
print("GPU_PREFLIGHT_JSON:" + json.dumps(result, ensure_ascii=True))
'''


def invoke(args: list[str], timeout: float) -> dict:
    start = time.monotonic()
    try:
        completed = subprocess.run(
            args, capture_output=True, text=True, errors="replace", timeout=timeout,
            check=False, shell=False,
        )
    except subprocess.TimeoutExpired:
        return {"status": "timeout", "seconds": round(time.monotonic() - start, 3)}
    except OSError as exc:
        return {"status": "execution_failed", "error_type": type(exc).__name__,
                "seconds": round(time.monotonic() - start, 3)}
    # Raw tool output is used only for parsing. It is never copied into the report.
    return {"status": "ok" if completed.returncode == 0 else "command_failed",
            "returncode": completed.returncode,
            "stdout": completed.stdout,
            "seconds": round(time.monotonic() - start, 3)}


def number(value: str) -> float | None:
    try:
        parsed = float(value.strip())
        return parsed if parsed >= 0 and parsed < float("inf") else None
    except ValueError:
        return None


def nvidia_probe(timeout: float) -> dict:
    executable = shutil.which("nvidia-smi")
    if not executable:
        return {"status": "not_installed_or_not_on_path", "devices": [], "attempts": []}
    base = ["name", "memory.total", "memory.free", "driver_version"]
    attempts = []
    for include_compute in (True, False):
        fields = base + (["compute_cap"] if include_compute else [])
        run = invoke([executable, "--query-gpu=" + ",".join(fields),
                      "--format=csv,noheader,nounits"], timeout)
        attempts.append({"fields": fields, "status": run["status"],
                         "returncode": run.get("returncode"), "seconds": run["seconds"]})
        output = run.get("stdout", "")
        if "no devices were found" in output.lower():
            return {"status": "no_devices", "devices": [], "attempts": attempts}
        if run["status"] != "ok":
            if include_compute and run["status"] == "command_failed":
                continue
            return {"status": run["status"], "devices": [], "attempts": attempts}
        devices = []
        for row in csv.reader(io.StringIO(output)):
            if not row or not any(part.strip() for part in row):
                continue
            if len(row) != len(fields):
                return {"status": "unrecognized_output", "devices": [], "attempts": attempts}
            row = [part.strip() for part in row]
            device = {"ordinal": len(devices), "name": row[0][:160],
                      "total_memory_mib": number(row[1]),
                      "free_memory_mib": number(row[2]), "driver_version": row[3][:80],
                      "compute_capability": None}
            if include_compute and re.fullmatch(r"\d+\.\d+", row[4]):
                device["compute_capability"] = row[4]
            devices.append(device)
        return {"status": "detected" if devices else "no_devices", "devices": devices,
                "compute_capability_query_used": include_compute, "attempts": attempts}
    return {"status": "command_failed", "devices": [], "attempts": attempts}


def nvcc_probe(timeout: float) -> dict:
    executable = shutil.which("nvcc")
    if not executable:
        return {"status": "not_installed_or_not_on_path"}
    run = invoke([executable, "--version"], timeout)
    result = {"status": run["status"], "returncode": run.get("returncode"),
              "seconds": run["seconds"]}
    if run["status"] == "ok":
        match = re.search(r"release\s+([\d.]+),\s+V([\d.]+)", run.get("stdout", ""))
        if match:
            result.update(toolkit_release=match.group(1), compiler_version=match.group(2))
        else:
            result["status"] = "version_format_unrecognized"
    return result


def torch_probe(timeout: float) -> dict:
    run = invoke([sys.executable, "-c", TORCH_PROBE], timeout)
    if run["status"] != "ok":
        return {"status": run["status"], "returncode": run.get("returncode"),
                "seconds": run["seconds"]}
    for line in reversed(run.get("stdout", "").splitlines()):
        if line.startswith("GPU_PREFLIGHT_JSON:"):
            try:
                result = json.loads(line.split(":", 1)[1])
            except json.JSONDecodeError:
                break
            if isinstance(result, dict):
                result["seconds"] = run["seconds"]
                return result
    return {"status": "unrecognized_output", "seconds": run["seconds"]}


def disk_probe(path: Path) -> dict:
    try:
        usage = shutil.disk_usage(path)
    except OSError as exc:
        return {"status": "unavailable", "error_type": type(exc).__name__}
    return {"status": "ok", "total_bytes": usage.total, "used_bytes": usage.used,
            "free_bytes": usage.free}


def atomic_json(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = None
    try:
        with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=path.parent,
                                         prefix="." + path.name + ".", suffix=".tmp",
                                         delete=False) as stream:
            temporary = Path(stream.name)
            json.dump(data, stream, indent=2, ensure_ascii=False, allow_nan=False)
            stream.write("\n")
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
    finally:
        if temporary is not None and temporary.exists():
            temporary.unlink()


def positive_seconds(value: str) -> float:
    result = float(value)
    if not (0 < result <= 60):
        raise argparse.ArgumentTypeError("timeout must be greater than 0 and at most 60 seconds")
    return result


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Read-only GPU environment inventory. No installations, settings changes, or training.",
        epilog="Exit 0 means the JSON report was written; it does not mean GPU training passed.",
    )
    parser.add_argument("--output", type=Path, default=Path("gpu_preflight.json"),
                        help="atomic JSON report destination (default: gpu_preflight.json)")
    parser.add_argument("--disk-path", type=Path, default=Path.cwd(),
                        help="existing path whose filesystem capacity is queried (default: current directory)")
    parser.add_argument("--timeout", type=positive_seconds, default=10.0,
                        help="timeout per external version/device query, in seconds (default: 10)")
    parser.add_argument("--torch", action="store_true",
                        help="optionally import PyTorch in a child process and query CUDA availability")
    parser.add_argument("--torch-timeout", type=positive_seconds, default=20.0,
                        help="timeout for optional PyTorch child process (default: 20 seconds)")
    args = parser.parse_args()

    nvidia = nvidia_probe(args.timeout)
    nvcc = nvcc_probe(args.timeout)
    torch = torch_probe(args.torch_timeout) if args.torch else {"status": "not_requested"}
    try:
        device_nodes = len(list(Path("/dev").glob("nvidia[0-9]*"))) if os.name == "posix" else None
    except OSError:
        device_nodes = None
    detected = bool(nvidia["devices"]) or torch.get("cuda_available") is True
    if detected:
        status = "gpu_detected_unvalidated"
    elif nvidia["status"] in {"no_devices", "not_installed_or_not_on_path"} and not device_nodes:
        if torch["status"] in {"timeout", "execution_failed", "cuda_probe_failed"}:
            status = "gpu_probe_inconclusive"
        else:
            status = "gpu_not_detected"
    else:
        status = "gpu_probe_inconclusive"

    report = {
        "schema_version": 1,
        "generated_utc": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "status": status,
        "scope": "Only this execution environment; hidden host hardware is not asserted absent.",
        "training_validated": False,
        "training_or_rendering_started": False,
        "performance_measured": False,
        "system_settings_changed": False,
        "packages_installed": False,
        "os": {"system": platform.system(), "release": platform.release(),
               "machine": platform.machine()},
        "python": {"version": platform.python_version(),
                   "implementation": platform.python_implementation()},
        "disk": disk_probe(args.disk_path),
        "nvidia_device_node_count": device_nodes,
        "nvidia_smi": nvidia,
        "nvcc": nvcc,
        "torch": torch,
        "notes": [
            "Device detection, compiler presence, or PyTorch import is not a training/gradient test.",
            "nvidia-smi ordinals and PyTorch visible ordinals may differ; no mapping is assumed.",
            "Compiler not on PATH does not prove no isolated compiler exists elsewhere.",
        ],
    }
    try:
        atomic_json(args.output, report)
    except OSError as exc:
        print(f"Could not write report: {type(exc).__name__}", file=sys.stderr)
        return 1
    print(f"Status: {status}; training_validated=false; performance_measured=false")
    print(f"NVIDIA query: {nvidia['status']}; nvcc: {nvcc['status']}; torch: {torch['status']}")
    print(f"Report: {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
