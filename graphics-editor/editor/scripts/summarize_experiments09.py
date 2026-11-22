#!/usr/bin/env python3
"""Summarize actual CRF 0.9 experiments without calling any provider.

Final per-category/per-case reports are authoritative. Intermediate search files
can establish search/download evidence, but never imply a completed pixel fit.
The frozen scene checks below are an independent implementation of parameter
checks; they are deliberately not a visual recognition or realism evaluator.
"""
from __future__ import annotations

import argparse
import copy
import hashlib
import json
import math
import os
import re
import subprocess
import tempfile
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import parse_qsl, unquote, urlencode, urlsplit, urlunsplit

from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1]
CATEGORIES = ("architecture", "landscape", "still_life")
FINAL_LEARNING = {"learning_ready", "failed", "cancelled"}
FINAL_GENERATION = {"review_required", "failed", "cancelled"}
PARAMETER_SCOPE = (
    "Independent checks against frozen expected constraints, using declared scene "
    "parameters, resolved attachment centers, inherited visibility and camera transform only. No image recognition, "
    "occlusion verification, photorealism score, or complete-prompt judgment."
)
LEARNING_SCOPE = (
    "Online ten-round learning updates linear-RGB moments and four Gaussian-band "
    "RMS amplitudes. Per-reference Gaussian fits remain separate previews. "
    "It does not retrain H2 canonical object Gaussian coefficient bases or "
    "DeepSeek weights, and does not acquire unimplemented geometry."
)


def digest(value):
    if not isinstance(value, bytes):
        value = json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()
    return hashlib.sha256(value).hexdigest()


def number(value, default=0):
    return value if isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value) else default


def safe_name(value):
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.-]{0,100}", value):
        raise ValueError("Invalid run identifier")
    return value


def sanitized(value):
    if isinstance(value, str):
        if value.startswith("data:image/"):
            return {"embeddedImageOmitted": True}
        return re.sub(r"sk-[A-Za-z0-9_-]{12,}", "[credential removed]", value)
    if isinstance(value, list):
        return [sanitized(v) for v in value]
    if isinstance(value, dict):
        return {k: sanitized(v) for k, v in value.items()
                if k.lower() not in {"apikey", "api_key", "authorization", "reasoning_content", "reasoning_text"}}
    return value


def canonical_source(source):
    """Normalize known photograph identity, retaining meaningful query fields."""
    if not isinstance(source, str) or not source:
        return None
    try:
        u = urlsplit(source)
        host = (u.hostname or "").lower().removeprefix("www.")
        if u.scheme not in ("https", "http") or not host:
            return source
        pathname = unquote(u.path)
        if host.endswith("pexels.com") and "/search/" not in pathname:
            match = re.search(r"(?:/photos/|/)(?:[^/]*-)?(\d+)(?:/|/pexels-photo[^/]*|\.[^/]*)?$", pathname)
            if match:
                return "pexels:" + match.group(1)
        query = dict(parse_qsl(u.query, keep_blank_values=True))
        title = pathname.removeprefix("/wiki/") if pathname.startswith("/wiki/") else query.get("title", "")
        if host == "commons.wikimedia.org" and title.lower().startswith("file:"):
            return "commons:" + title[5:].replace("_", " ")
        pairs = [(k, v) for k, v in parse_qsl(u.query, keep_blank_values=True)
                 if not k.lower().startswith("utm_") and k.lower() not in {"fbclid", "gclid"}]
        return urlunsplit(("https", host, pathname.rstrip("/") or "/", urlencode(sorted(pairs)), ""))
    except (ValueError, TypeError):
        return source


def elapsed(start, finish):
    try:
        a = datetime.fromisoformat(start.replace("Z", "+00:00"))
        b = datetime.fromisoformat(finish.replace("Z", "+00:00"))
        return max(0, round((b - a).total_seconds() * 1000))
    except (ValueError, AttributeError, TypeError):
        return None


def duplicate_scheduler_error(value):
    message = value.get("message", value.get("error", "")) if isinstance(value, dict) else str(value)
    return bool(re.search(r"(?:Learning batch exists|Trial already exists);?", str(message), re.I))


class Evidence:
    def __init__(self, root):
        self.root = Path(root).resolve()
        self.inputs = {}
        self.runtime_hints = {}
        self.warnings = []

    def path(self, relative):
        value = (self.root / relative).resolve()
        if not value.is_relative_to(self.root):
            raise ValueError("Evidence path outside repository")
        return value

    def json(self, relative, default=None):
        file = self.path(relative)
        if not file.exists():
            return default
        raw = file.read_bytes()
        self.inputs[str(file.relative_to(self.root))] = {"sha256": digest(raw), "bytes": len(raw)}
        return json.loads(raw)

    def binary(self, relative):
        file = self.path(relative)
        if not file.exists():
            return None
        raw = file.read_bytes()
        self.inputs[str(file.relative_to(self.root))] = {"sha256": digest(raw), "bytes": len(raw)}
        return raw

    def changed_inputs(self):
        changed = []
        for name, expected in self.inputs.items():
            file = self.path(name)
            if not file.exists() or digest(file.read_bytes()) != expected["sha256"]:
                changed.append(name)
        for name, record in self.runtime_hints.items():
            file = record["file"]
            if not file.exists() or digest(file.read_bytes()) != record["sha256"]:
                changed.append("runtime-status:" + name)
        return changed

    def runtime_hint(self, kind, run_id, spec_id):
        """Only status metadata; never open full tasks/reference binary stores."""
        if kind not in {"generation", "learning"}:
            raise ValueError("Invalid checkpoint kind")
        safe_name(run_id); safe_name(spec_id)
        file = self.root.parent / "crf09_runs" / kind / run_id / spec_id / "run.json"
        if not file.exists():
            return None
        raw = file.read_bytes()
        value = json.loads(raw)
        selected = {k: value[k] for k in ("taskId", "status", "stage", "updatedAt") if k in value}
        self.runtime_hints[f"{kind}/{run_id}/{spec_id}"] = {"file": file, "sha256": digest(raw), "status": selected}
        return selected


class Requests:
    """Deduplicate successful/failed request records by real provider request ID."""
    def __init__(self):
        self.rows = {}
        self.unitemized = []

    def add(self, usage, context):
        if not isinstance(usage, dict):
            return
        rows = usage.get("requests") or []
        if number(usage.get("providerCalls")) > len(rows):
            self.unitemized.append({"context": context, "reportedCalls": usage["providerCalls"], "itemizedRequests": len(rows)})
        for i, item in enumerate(rows):
            request_id = item.get("requestId")
            # Round files omit the enclosing usage.phase while final task files
            # include it. It is not a second call: context/index/request metadata
            # identify the same response copy even if the provider omitted its ID.
            key = request_id or "unidentified:" + digest([context, i, item])[:20]
            allowed = ("requestId", "phase", "model", "elapsedMs", "prompt_tokens", "completion_tokens",
                       "total_tokens", "reasoning_tokens", "server_tool_use", "finishReason", "status",
                       "errorCode", "httpStatus", "reasoningEnabled", "reasoningObserved", "renderedImageProvided",
                       "referenceImagesProvided")
            selected = {k: item[k] for k in allowed if k in item}
            if key not in self.rows:
                self.rows[key] = {**selected, "requestId": request_id, "contexts": [context], "identityVerified": bool(request_id), "recordCopiesObserved": 1}
            else:
                current = self.rows[key]
                current["recordCopiesObserved"] += 1
                if context not in current["contexts"]:
                    current["contexts"].append(context)
                for k, v in selected.items():
                    if k not in current:
                        current[k] = v

    def summary(self):
        rows = list(self.rows.values())
        return {
            "deduplication": "Real requestId; ID-less copies are consolidated only within the same operation context/index with identical request metadata. Their global identity is not verified.",
            "requestCount": len(rows), "identifiedRequests": sum(bool(r["requestId"]) for r in rows),
            "providerSearchEndpointRecords": sum(str(r.get("phase", "")).endswith("search_fallback") for r in rows),
            "modelRequestRecords": sum(not str(r.get("phase", "")).endswith("search_fallback") for r in rows),
            **{key: sum(number(r.get(key)) for r in rows)
               for key in ("prompt_tokens", "completion_tokens", "total_tokens", "reasoning_tokens")},
            "cumulativeProviderElapsedMs": sum(number(r.get("elapsedMs")) for r in rows),
            "elapsedScope": "Sum of itemized provider request durations, not wall-clock time; concurrent jobs overlap.",
            "requestsWithoutTokenCounts": sum("total_tokens" not in r for r in rows),
            "unitemizedCallReports": self.unitemized,
            "serverToolCounters": {name: sum(number(r.get("server_tool_use", {}).get(name)) for r in rows)
                                   for name in ("tool_search", "tool_fetch", "tool_image_search")},
            "moneyCharged": None, "costScope": "Actual token/call evidence only; no invoice or monetary charge was supplied.",
            "requests": rows,
        }


def source_counts(rows):
    """Union by exact source identity or source-file SHA; no independence claim."""
    parent = list(range(len(rows)))

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    seen = {}
    for i, row in enumerate(rows):
        keys = [("source", canonical_source(row.get("sourceUrl"))), ("hash", row.get("sha256"))]
        for kind, value in keys:
            if not value:
                continue
            key = (kind, value)
            if key in seen:
                parent[find(i)] = find(seen[key])
            else:
                seen[key] = i
    return {
        "records": len(rows),
        "exactSourceURLs": len({r["sourceUrl"] for r in rows if r.get("sourceUrl")}),
        "canonicalSourceIdentities": len({canonical_source(r["sourceUrl"]) for r in rows if r.get("sourceUrl")}),
        "originalFileSHA256s": len({r["sha256"] for r in rows if r.get("sha256")}),
        "deduplicatedGroups": len({find(i) for i in range(len(rows))}),
        "scope": "Exact source-page/known photo-ID and byte-hash union; not manually verified independent captures.",
    }


def search_evidence(result):
    result = result or {}
    research = result.get("research") or {}
    tools = [t for t in research.get("toolCalls", [])
             if "search" in str(t.get("type", "")).lower() or t.get("kind") == "search"]
    completed = [t for t in tools if t.get("status") == "completed"]
    native = [t for t in completed if str(t.get("type", "")).startswith("deepseek_")]
    fallback = [t for t in completed if t.get("type") == "search_api"]
    request_rows = (result.get("usage") or {}).get("requests", [])
    search_count = sum(number(r.get("server_tool_use", {}).get("tool_search")) for r in request_rows)
    return {
        "reportedSearched": research.get("searched") is True,
        "searchObserved": research.get("searched") is True and (bool(completed) or search_count > 0),
        "nativeSearchObserved": research.get("searched") is True and (bool(native) or search_count > 0),
        "providerFallbackSearchObserved": bool(fallback),
        "completedNativeToolCalls": len(native), "completedFallbackToolCalls": len(fallback), "serverSearchCount": search_count,
        "toolCalls": [{"id": t.get("id"), "type": t.get("type"), "status": t.get("status"),
                       "queryCount": len(t.get("action", {}).get("queries", [])),
                       "sourceURLCount": len(t.get("sourceUrls", []))} for t in tools],
        "requestIds": [r["requestId"] for r in request_rows if r.get("requestId")],
    }


def summarize_learning_category(evidence, run_id, category, requests):
    base = f"reports/v09/learning/{run_id}"
    report_path = f"{base}/{category}.json"
    report = evidence.json(report_path)
    runtime_hint = evidence.runtime_hint("learning", run_id, "learn-" + category)
    rounds_by_id = {r["round"]: r for r in (report or {}).get("rounds", [])}
    rounds, online_sources, decoded_sources, failures, all_operations = [], [], [], [], []
    for round_id in range(1, 11):
        row = rounds_by_id.get(round_id, {})
        prefix = f"{base}/learn-{category}/round_{round_id:02d}"
        search = evidence.json(prefix + ".search.json", row.get("search"))
        vision = evidence.json(prefix + ".vision.json", row.get("semantics"))
        if search:
            requests.add(search.get("usage"), f"learning:{category}:research_{round_id}")
        if vision:
            requests.add(vision.get("usage"), f"learning:{category}:vision_{round_id}")
        references = row.get("references") or []
        downloads = (search or {}).get("downloads") or []
        accepted = {r.get("sha256"): r for r in references if r.get("sha256")}
        by_source = {canonical_source(r.get("sourceUrl")): r for r in references if r.get("sourceUrl")}
        download_rows = downloads if downloads else (search or {}).get("imageMetadata", [])
        for item in download_rows:
            reference = accepted.get(item.get("sha256")) or by_source.get(canonical_source(item.get("sourceUrl"))) or {}
            online_sources.append({
                "category": category, "round": round_id,
                "sourceUrl": item.get("sourceUrl"), "sha256": item.get("sha256"),
                "file": item.get("file"), "referenceId": reference.get("id"),
                "statisticsExtracted": reference.get("sampleAdded") is True,
                "sharedUpdateCommitted": bool((report or {}).get("sharedUpdate")) and reference.get("sampleAdded") is True,
            })
        vision_ids = {v.get("id") for v in row.get("visionInputs", [])}
        fitted_ids = {f.get("referenceId") for f in row.get("fitResults", []) if f.get("status") == "fitted"}
        decoded = [r for r in references if not r.get("decodeFailed") and
                   (r.get("sampleAdded") is True or r.get("id") in vision_ids or r.get("id") in fitted_ids)]
        decoded_sources.extend(decoded)
        fits = []
        for fit in row.get("fitResults", []):
            item = {k: fit.get(k) for k in ("referenceId", "id", "status", "gaussianCount", "qualityTier", "representationScope", "error") if k in fit}
            if fit.get("status") == "fitted" and fit.get("id"):
                asset_path = f"fitting/learning09/{run_id}/learn-{category}/fits/{fit['id'][:100]}.json"
                asset = evidence.json(asset_path)
                item["artifactPresent"] = asset is not None
                item["artifactGaussianCount"] = len((asset or {}).get("splats", []))
                item["validSavedPreviewFit"] = asset is not None and item["artifactGaussianCount"] > 0
                item["reportedCountMatches"] = item["artifactGaussianCount"] == fit.get("gaussianCount")
                item["artifact"] = asset_path
            fits.append(item)
        rounds.append({
            "round": round_id,
            "status": row.get("status", "search_evidence_only" if search else "not_reported"),
            "completed": row.get("status") == "complete",
            "searchAvailable": search is not None, "visionAvailable": vision is not None,
            "search": search_evidence(search),
            "returnedDownloads": len(download_rows), "acceptedReferenceCount": len(references),
            "decodedCount": len(decoded) if report else None,
            "statisticsExtractedCount": sum(r.get("sampleAdded") is True for r in references) if report else None,
            "visionSubmittedCount": len((vision or {}).get("images", [])),
            "fitSuccessCount": sum(f.get("status") == "fitted" for f in fits),
            "validSavedPreviewFitCount": sum(f.get("validSavedPreviewFit") is True for f in fits),
            "fitFailureCount": sum(f.get("status") == "failed" for f in fits),
            "decodeFailureCount": sum(bool(r.get("decodeFailed")) for r in references),
            "excludedDuplicates": row.get("excludedDuplicates", []),
            "downloadFailures": [{"sourceUrl": a.get("sourceUrl"), "status": a.get("status"), "error": a.get("error")}
                                 for a in ((search or {}).get("collection") or {}).get("attempts", []) if a.get("status") != "downloaded"],
            "fits": fits,
            "startedAt": row.get("startedAt"), "completedAt": row.get("completedAt"),
            "elapsedMs": elapsed(row.get("startedAt"), row.get("completedAt")),
            "searchElapsedMs": (search or {}).get("elapsedMs"), "visionElapsedMs": (vision or {}).get("elapsedMs"),
        })
    if report:
        for usage in report.get("usage") or []:
            requests.add(usage, f"learning:{category}:{usage.get('phase', 'unknown')}")
        failures = report.get("failures") or []
        all_operations = report.get("apiOperations") or []
    totals = {key: sum(number(r.get(key)) for r in rounds) for key in
              ("returnedDownloads", "acceptedReferenceCount", "decodedCount", "statisticsExtractedCount", "visionSubmittedCount",
               "fitSuccessCount", "validSavedPreviewFitCount", "fitFailureCount", "decodeFailureCount")}
    result = {
        "category": category, "taskId": (report or {}).get("taskId"), "report": report_path,
        "status": (report or {}).get("status", "not_finalized"),
        "finalReportPresent": report is not None,
        "finalized": (report or {}).get("status") in FINAL_LEARNING and not (runtime_hint and runtime_hint.get("status") in {"running", "queued"}),
        "currentRuntimeStatus": runtime_hint,
        "roundsPlanned": 10, "roundsComplete": sum(r["completed"] for r in rounds),
        "searchRoundsAvailable": sum(r["searchAvailable"] for r in rounds),
        "nativeSearchEvidenceRounds": sum(r["search"]["nativeSearchObserved"] for r in rounds),
        "fallbackSearchEvidenceRounds": sum(r["search"]["providerFallbackSearchObserved"] for r in rounds),
        "searchEvidenceRounds": sum(r["search"]["searchObserved"] for r in rounds),
        "visionRoundsAvailable": sum(r["visionAvailable"] for r in rounds),
        **totals,
        "fitCountsKnown": report is not None,
        "downloadedSources": source_counts(online_sources), "decodedSources": source_counts(decoded_sources),
        "sharedUpdate": (report or {}).get("sharedUpdate"), "modelId": (report or {}).get("modelId"),
        "error": (report or {}).get("error"), "failures": failures,
        "wallTimeMs": elapsed(next((r["startedAt"] for r in rounds if r["startedAt"]), None),
                              next((r["completedAt"] for r in reversed(rounds) if r["completedAt"]), None)),
        "rounds": rounds, "scope": LEARNING_SCOPE,
    }
    return result, online_sources, all_operations


def resolved_objects(scene):
    objects = copy.deepcopy(scene.get("objects") or [])
    by_id = {o.get("id"): o for o in objects}
    visited, stack = set(), set()

    def visit(obj):
        key = obj.get("id")
        if key in visited:
            return
        if key in stack:
            raise ValueError("Attachment cycle in exported scene")
        stack.add(key)
        attachment = obj.get("attachment")
        if attachment:
            parent = by_id.get(attachment.get("parentId"))
            if parent is None:
                raise ValueError("Missing attachment parent")
            visit(parent)
            anchor = attachment.get("anchor", [])
            if len(anchor) != 2:
                raise ValueError("Invalid attachment anchor")
            obj["x"] = parent["x"] + anchor[0]
            obj["y"] = parent["y"] + anchor[1]
            if parent.get("visible") is False:
                obj["visible"] = False
        stack.remove(key)
        visited.add(key)

    for obj in objects:
        visit(obj)
    camera = scene.get("camera") or {}
    zoom = camera.get("zoom", 1)
    for obj in objects:
        depth = obj.get("depth", .5)
        obj["x"] = .5 + (obj["x"] - .5) * zoom - camera.get("panX", 0) * (.25 + .75 * depth)
        obj["y"] = .5 + (obj["y"] - .5) * zoom - camera.get("panY", 0) * (.25 + .75 * depth)
    return [o for o in objects if o.get("visible") is not False]


def frozen_parameter_checks(scene, conditions):
    visible = resolved_objects(scene)
    checks = []
    for condition in conditions:
        objects = [o for o in visible if o.get("type") == condition.get("subject")]
        targets = [o for o in visible if o.get("type") == condition.get("target")]
        kind, observed, passed = condition.get("type"), None, False
        if kind == "count":
            observed, passed = len(objects), len(objects) == condition.get("value")
        elif kind == "visible":
            observed = bool(objects)
            passed = observed == condition.get("value")
        elif kind == "color":
            observed = [o.get("color") for o in objects]
            color = condition.get("value", [])
            passed = len(color) == 3 and bool(objects) and all(isinstance(o.get("color"), list) and len(o["color"]) == 3 and
                math.sqrt(sum((a - b) ** 2 for a, b in zip(o["color"], color))) <= 35 for o in objects)
        elif kind in ("left_of", "right_of", "above", "below") and objects and targets:
            axis = "y" if kind in ("above", "below") else "x"
            a = sum(o[axis] for o in objects) / len(objects)
            b = sum(o[axis] for o in targets) / len(targets)
            observed = {"subjectMean": a, "targetMean": b}
            passed = a < b if kind in ("left_of", "above") else a > b
        checks.append({**condition, "passed": passed, "observed": observed})
    return {"checks": checks, "evaluated": len(checks), "passed": sum(c["passed"] for c in checks),
            "allPassed": bool(checks) and all(c["passed"] for c in checks), "scope": PARAMETER_SCOPE}


def inspect_png(evidence, relative, expected_sha=None, expected_pixels=None):
    raw = evidence.binary(relative)
    if raw is None:
        return {"present": False, "valid": False, "error": "Image file missing"}
    try:
        with Image.open(evidence.path(relative)) as image:
            image.load()
            rgba = image.convert("RGBA")
            actual_hash, actual_pixels = digest(raw), digest(rgba.tobytes())
            return {"present": True, "valid": image.format == "PNG", "width": image.width, "height": image.height,
                    "pngSha256": actual_hash, "pixelSha256": actual_pixels,
                    "recordedPNGHashMatches": expected_sha == actual_hash if expected_sha else None,
                    "recordedPixelHashMatches": expected_pixels == actual_pixels if expected_pixels else None}
    except (OSError, ValueError) as error:
        return {"present": True, "valid": False, "error": str(error)[:300]}


def summarize_generation_case(evidence, run_id, spec, protocol_hash, requests):
    base = f"reports/v09/generation/{run_id}/{spec['id']}"
    record = evidence.json(base + "/record.json")
    task = evidence.json(base + "/task_evidence.json")
    runtime_hint = evidence.runtime_hint("generation", run_id, spec["id"])
    if not record:
        return {"id": spec["id"], "title": spec["title"], "category": spec["category"], "status": "not_reported",
                "finalized": False, "reported": False, "candidates": [], "selectedCandidate": None, "currentRuntimeStatus": runtime_hint,
                "expectedParameterChecks": len(spec.get("expectedConstraints", []))}, []
    for usage in record.get("usage") or []:
        requests.add(usage, f"generation:{spec['id']}:{usage.get('phase', 'unknown')}")
    candidates = []
    for candidate in sorted(record.get("candidates") or [], key=lambda c: c["index"]):
        index = candidate["index"]
        scene_path = f"{base}/candidate_{index:02d}.scene.json"
        scene = evidence.json(scene_path)
        render = candidate.get("render") or {}
        png_path = candidate.get("png") or f"{base}/candidate_{index:02d}.png"
        image = inspect_png(evidence, png_path, render.get("pngSha256"), render.get("pixelSha256"))
        checks, error = None, None
        if scene:
            try:
                checks = frozen_parameter_checks(scene, spec.get("expectedConstraints", []))
            except (KeyError, TypeError, ValueError) as exc:
                error = str(exc)
        saved = candidate.get("semanticFrozen") or {}
        candidates.append({
            "index": index, "scene": scene_path, "image": png_path, "imageVerification": image,
            "rendered": image.get("valid") is True,
            "frameMatchesFrozen": image.get("width") == spec["width"] and image.get("height") == spec["height"],
            "sceneSeedMatchesFrozen": scene.get("seed") == spec["seed"] if scene else None,
            "sceneCategoryMatchesFrozen": scene.get("category") == spec["category"] if scene else None,
            "parameterChecks": checks, "parameterCheckError": error,
            "recordedRuntimeParameters": candidate.get("semanticFromPlanner"),
            "recordedFrozenParameters": candidate.get("semanticFrozen"),
            "savedCheckAgreement": checks["passed"] == saved.get("passed") and checks["evaluated"] == saved.get("evaluated") if checks and saved else None,
            "kernelMs": render.get("kernelMs"),
            "critiquePresent": candidate.get("critique") is not None,
            "critiqueScope": "Auxiliary provider self-critique of the actual image; not independent quality acceptance.",
        })
    selection = (record.get("selection") or {}).get("index")
    artifact = record.get("artifact")
    final_verification = None
    if artifact and artifact.get("imageUrl"):
        final_verification = inspect_png(evidence, "web/" + artifact["imageUrl"], expected_pixels=artifact.get("pixelSha256"))
    extra = record.get("additionalRunnerFailures") or []
    scheduler = [e for e in extra if duplicate_scheduler_error(e)]
    status = record.get("status")
    only_overlap = record.get("runnerFailure") is True and duplicate_scheduler_error(record.get("error", {}))
    if only_overlap and not task:
        status = "scheduler_duplicate_without_final_task_report"
    result = {
        "id": spec["id"], "title": spec["title"], "category": spec["category"], "seed": spec["seed"],
        "status": status, "reported": True, "finalized": status in FINAL_GENERATION and not (runtime_hint and runtime_hint.get("status") in {"running", "queued"}),
        "currentRuntimeStatus": runtime_hint,
        "taskId": record.get("taskId"), "error": record.get("error"), "report": base + "/record.json",
        "protocolHashMatches": record.get("protocolSha256") == protocol_hash,
        "promptMatchesFrozen": record.get("prompt") == spec["prompt"],
        "recordSeedMatchesFrozen": record.get("seed") == spec["seed"],
        "expectedParameterChecks": len(spec.get("expectedConstraints", [])),
        "firstCandidate": next((c["index"] for c in candidates if c["index"] == 0), None),
        "selectedCandidate": selection, "candidates": candidates,
        "candidateGenerationFailures": [{"index": c.get("index"), "status": c.get("status"), "error": c.get("error")}
                                        for c in (task or {}).get("candidates", []) if c.get("status") != "rendered"],
        "failedGenerationOperations": [{k: op.get(k) for k in ("index", "phase", "status", "errorCode")}
                                       for op in record.get("apiOperations", []) if op.get("status") == "failed" and
                                       (op.get("phase") == "generate" or str(op.get("phase", "")).startswith("revision_"))],
        "planningFailureHistory": record.get("planningHistory", (task or {}).get("planningHistory", [])),
        "replanCount": record.get("replanCount", (task or {}).get("replanCount", 0)),
        "selectedImageVerification": final_verification,
        "selectedImageAvailable": bool(final_verification and final_verification.get("valid")),
        "artifact": artifact, "model": record.get("model"),
        "wallTimeMs": elapsed((task or {}).get("startedAt"), (task or {}).get("finishedAt")),
        "startedAt": (task or {}).get("startedAt"), "completedAt": record.get("completedAt"),
        "schedulerDuplicateCount": len(scheduler) + int(only_overlap),
        "schedulerDuplicates": scheduler,
        "otherRunnerFailures": [e for e in extra if not duplicate_scheduler_error(e)],
        "quality": {"photorealismAccepted": False, "independentHumanReview": False,
                    "status": "candidate_requires_independent_review", "reportedGate": (record.get("quality") or {}).get("releaseGate")},
    }
    return result, record.get("apiOperations") or []


def candidate_totals(cases, which):
    selected = []
    expected_checks = sum(c["expectedParameterChecks"] for c in cases)
    for case in cases:
        if which == "all":
            selected.extend(case["candidates"])
        else:
            if which == "initial_execution" and case.get("planningFailureHistory"):
                continue
            index = 0 if which in ("first", "initial_execution") else case.get("selectedCandidate")
            candidate = next((c for c in case["candidates"] if c["index"] == index), None)
            if candidate:
                selected.append(candidate)
    rendered = [c for c in selected if c["rendered"]]
    checks = [c["parameterChecks"] for c in rendered if c.get("parameterChecks")]
    denominator = sum(c["evaluated"] for c in checks) if which == "all" else expected_checks
    passed = sum(c["passed"] for c in checks)
    return {
        "plannedTaskDenominator": len(cases), "candidateRecords": len(selected), "actualPNGCount": len(rendered),
        "parameterChecksEvaluated": sum(c["evaluated"] for c in checks),
        "parameterChecksExpectedDenominator": denominator,
        "parameterChecksPassed": passed, "parameterCheckRate": passed / denominator if denominator else None,
        "allFrozenParametersPassedCount": sum(c["allPassed"] for c in checks),
        "allFrozenParametersPassedRate": sum(c["allPassed"] for c in checks) / (len(rendered) if which == "all" else len(cases)) if (len(rendered) if which == "all" else len(cases)) else None,
        "frameMatchesFrozenCount": sum(c["frameMatchesFrozen"] for c in rendered),
        "scope": PARAMETER_SCOPE,
        "candidateMeaning": "Initial execution, including original planner failures" if which == "initial_execution" else "First rendered candidate, after any explicitly recorded one-time planner repair" if which == "first" else "All rendered candidates" if which == "all" else "Explicitly selected final candidate",
        "denominatorNote": "Every planned task stays in first/final denominators; missing/failed outputs earn no passed checks. All-candidate rates are descriptive and not a ten-task success rate.",
    }


def dhash(file):
    with Image.open(file) as image:
        gray = ImageOps.exif_transpose(image).convert("L").resize((9, 8), Image.Resampling.LANCZOS)
        values = list(gray.get_flattened_data() if hasattr(gray, "get_flattened_data") else gray.getdata())
    result = 0
    for y in range(8):
        for x in range(8):
            result = (result << 1) | int(values[y * 9 + x + 1] > values[y * 9 + x])
    return f"{result:016x}"


def leakage_audit(evidence, sources, model, offline, observations):
    held = [r for r in (offline or {}).get("sources", []) if r.get("split") in ("validation", "test")]
    old_by_id = {r["id"]: r for r in observations or []}
    online_observations = [r for r in (model or {}).get("observations", []) if r.get("id") not in old_by_id]
    current_ids = {r.get("id") for r in (model or {}).get("observations", [])}
    current_sources = {canonical_source(r.get("sourceUrl") or r.get("sourceGroup")) for r in online_observations}
    unique = {}
    for row in sources:
        key = (row.get("sha256"), canonical_source(row.get("sourceUrl")))
        if key not in unique:
            unique[key] = {**row, "occurrences": []}
        unique[key]["statisticsExtracted"] |= row.get("statisticsExtracted") is True
        unique[key]["sharedUpdateCommitted"] |= row.get("sharedUpdateCommitted") is True
        unique[key]["occurrences"].append({"category": row["category"], "round": row["round"]})
    matches, hash_failures, checked = [], [], 0
    for row in unique.values():
        perceptual = None
        if row.get("file"):
            file = evidence.path(row["file"])
            if file.exists():
                try:
                    raw = evidence.binary(row["file"])
                    if row.get("sha256") and digest(raw) != row["sha256"]:
                        hash_failures.append({"file": row["file"], "error": "Original file SHA disagrees with acquisition report"})
                    else:
                        perceptual = dhash(file)
                        checked += 1
                except (OSError, ValueError) as error:
                    hash_failures.append({"file": row["file"], "error": str(error)[:300]})
        in_model = "observation." + str(row.get("sha256")) in current_ids or canonical_source(row.get("sourceUrl")) in current_sources
        for heldout in held:
            reasons, distance = [], None
            if row.get("sha256") and row["sha256"] == heldout.get("sourceSHA256"):
                reasons.append("exact_source_bytes_sha256")
            if canonical_source(row.get("sourceUrl")) == canonical_source(heldout.get("sourceUrl")) and row.get("sourceUrl"):
                reasons.append("same_canonical_photo_source")
            old_hash = old_by_id.get(heldout["id"], {}).get("dHash64")
            if perceptual and old_hash:
                distance = (int(perceptual, 16) ^ int(old_hash, 16)).bit_count()
                if distance <= 7:
                    reasons.append("dhash_hamming_le_7_potential_near_duplicate")
            if reasons:
                matches.append({
                    "onlineSourceUrl": row.get("sourceUrl"), "onlineSHA256": row.get("sha256"),
                    "onlineOccurrences": row["occurrences"], "statisticsExtracted": row["statisticsExtracted"],
                    "sharedUpdateCommitted": row["sharedUpdateCommitted"], "presentInCurrentModel": in_model,
                    "heldoutId": heldout["id"], "heldoutSplit": heldout["split"],
                    "heldoutSourceUrl": heldout.get("sourceUrl"), "heldoutSHA256": heldout.get("sourceSHA256"),
                    "matchReasons": reasons, "dHashDistance": distance,
                    "matchStrength": "source_identity_or_exact_bytes" if any(r != "dhash_hamming_le_7_potential_near_duplicate" for r in reasons) else "heuristic_only_requires_review",
                })
    confirmed = [m for m in matches if m["matchStrength"] == "source_identity_or_exact_bytes"]
    learned = [m for m in matches if m["presentInCurrentModel"]]
    return {
        "status": "potential_heldout_overlap_detected" if matches else "no_overlap_detected_by_available_checks",
        "originalHeldoutRows": len(held), "originalValidationRows": sum(r["split"] == "validation" for r in held),
        "originalTestRows": sum(r["split"] == "test" for r in held),
        "onlineSourcesCompared": len(unique), "onlineOriginalsPerceptuallyChecked": checked,
        "currentModelOnlineObservationCount": len(online_observations),
        "onlineObservationsWithoutFrozenSplit": sum(r.get("split") not in {"train", "validation", "test"} for r in online_observations),
        "sourceOrExactHashMatchPairs": len(confirmed), "heuristicOnlyMatchPairs": len(matches) - len(confirmed),
        "overlapPairsPresentInCurrentModel": len(learned), "matches": matches, "originalFileVerificationFailures": hash_failures,
        "oldMetricModelId": (offline or {}).get("modelId"), "currentModelId": (model or {}).get("id"),
        "modelChangedSinceOfflineEvaluation": (offline or {}).get("modelId") != (model or {}).get("id"),
        "oldHeldoutMetricsValidForCurrentModel": False,
        "freshPostLearningHoldoutEvaluationPerformed": False,
        "interpretation": "Original validation/test numbers are historical diagnostics of the frozen pre-online model. They are not a new held-out evaluation of any updated model. Exact-source overlap compromises that source as a future untouched holdout; heuristic dHash matches require review.",
        "limitations": [
            "Canonical source identity and byte SHA detect known copies, not every capture/scene identity.",
            "dHash Hamming <= 7 follows the exploratory offline grouping heuristic and can flag unrelated low-detail images; it is not proof of duplication.",
            "No detected intersection does not establish independence. New online observations have no frozen train/validation/test assignment.",
            "Semantic browsing or inspection may expose a held-out source even when it was not committed to shared statistics.",
        ],
    }


def basis_audit(evidence, model, offline, run_id):
    baseline_path = "reports/v09/hypothesis03/fruit-window.scene.json"
    baseline_scene = evidence.json(baseline_path, {})
    baseline = baseline_scene.get("appearanceModel") or {}
    valid_baseline = baseline.get("id") == (offline or {}).get("modelId") and bool(baseline.get("functionFamilies"))
    rows = []
    for name, snapshot in [("pre_online_frozen_scene", baseline), ("current_shared_model", model or {})] + [
        (category, evidence.json(f"reports/v09/learning/{run_id}/learn-{category}/shared_model_after.json", {})) for category in CATEGORIES
    ]:
        if not snapshot:
            continue
        families = snapshot.get("functionFamilies") or {}
        rows.append({"snapshot": name, "modelId": snapshot.get("id"), "familiesSHA256": digest(families),
                     "families": {key: {"trainingCount": value.get("trainingCount"), "rank": value.get("rank"),
                                        "gaussianCount": len(value.get("mean", [])), "trainingIds": value.get("trainingIds", []),
                                        "sha256": digest(value)} for key, value in families.items()},
                     "onlineUpdate": snapshot.get("onlineUpdate")})
    baseline_hash = digest(baseline.get("functionFamilies") or {}) if valid_baseline else None
    unchanged = bool(valid_baseline and rows and all(r["familiesSHA256"] == baseline_hash for r in rows))
    return {"onlineScope": LEARNING_SCOPE, "baseline": baseline_path, "baselineModelMatchesOfflineEvidence": valid_baseline,
            "familyContentUnchangedAcrossRecordedSnapshots": unchanged if valid_baseline else None,
            "onlineH2BasisRetrainingPerformed": False, "DeepSeekWeightTrainingPerformed": False,
            "snapshots": rows, "warning": None if unchanged else "Basis preservation cannot be confirmed from all available snapshots; inspect before claiming unchanged.",
            "offlineH2Scope": "Limited offline canonical fruit appearance Gaussian-coefficient mean/PCA experiment. Its training count is separate from online image counts; oracle reconstruction diagnostics are not generation quality."}


def operation_summary(operations):
    rows = []
    for context, operation in operations:
        rows.append({"context": context, **{k: operation.get(k) for k in ("index", "phase", "status", "startedAt", "finishedAt", "errorCode") if k in operation},
                     "elapsedMs": elapsed(operation.get("startedAt"), operation.get("finishedAt"))})
    return {"countsByStatus": dict(Counter(r.get("status", "unknown") for r in rows)),
            "cumulativeOperationMs": sum(number(r.get("elapsedMs")) for r in rows),
            "scope": "Application operation durations include provider/transport work; do not add them to provider durations as separate cost.", "rows": rows}


def build_summary(root=ROOT, learning_run="learning-v1", generation_run="showcase-v1"):
    safe_name(learning_run); safe_name(generation_run)
    evidence = Evidence(root)
    protocol = evidence.json("benchmarks/v09/protocol.json")
    if not protocol:
        raise ValueError("Frozen protocol missing")
    protocol_hash = evidence.inputs["benchmarks/v09/protocol.json"]["sha256"]
    expected_hash = evidence.path("benchmarks/v09/protocol.json.sha256").read_text().strip()
    if protocol_hash != expected_hash:
        raise ValueError("Frozen protocol SHA-256 changed")
    if len(protocol.get("showcase", [])) != 10:
        raise ValueError("Protocol must retain all ten showcase tasks")
    requests, learning, sources, operations = Requests(), [], [], []
    for category in CATEGORIES:
        item, online, ops = summarize_learning_category(evidence, learning_run, category, requests)
        learning.append(item); sources.extend(online)
        operations.extend(("learning:" + category, op) for op in ops)
    cases = []
    for spec in protocol["showcase"]:
        case, ops = summarize_generation_case(evidence, generation_run, spec, protocol_hash, requests)
        cases.append(case); operations.extend(("generation:" + spec["id"], op) for op in ops)
    model = evidence.json("web/assets/v09/shared-appearance.json", {})
    offline = evidence.json("reports/v09/shared_learning.json", {})
    observations = evidence.json("reports/v09/appearance_observations.json", [])
    leakage = leakage_audit(evidence, sources, model, offline, observations)
    basis = basis_audit(evidence, model, offline, learning_run)
    terminal = evidence.json("reports/v09/terminal_status.json", {})
    terminal_tasks = terminal.get("tasks") or []
    started_terminal = [t for t in terminal_tasks if t.get("status") != "not_run"]
    all_reported = all(c["finalized"] for c in learning) and all(c["finalized"] for c in cases)
    changed = evidence.changed_inputs()
    summary = {
        "schema": "crf.actual_experiment_summary.v0.9", "generatedAt": datetime.now(timezone.utc).isoformat(),
        "status": "complete_trials_require_independent_quality_review" if all_reported and not changed else "incomplete_evidence_snapshot",
        "allPlannedTrialsReported": all_reported, "inputSnapshotStable": not changed, "inputsChangedDuringRead": changed,
        "protocol": {"path": "benchmarks/v09/protocol.json", "sha256": protocol_hash, "verified": True,
                     "showcaseTaskCount": 10, "terminalTaskCount": protocol.get("terminal", {}).get("taskCount", 180),
                     "showcaseIsTerminalBenchmark": False},
        "learning": {
            "runId": learning_run, "plannedCategories": 3, "plannedRounds": 30,
            "finalizedCategories": sum(c["finalized"] for c in learning),
            "learningReadyCategories": sum(c["status"] == "learning_ready" for c in learning),
            "roundsComplete": sum(c["roundsComplete"] for c in learning),
            "nativeSearchEvidenceRounds": sum(c["nativeSearchEvidenceRounds"] for c in learning),
            "fallbackSearchEvidenceRounds": sum(c["fallbackSearchEvidenceRounds"] for c in learning),
            "searchEvidenceRounds": sum(c["searchEvidenceRounds"] for c in learning),
            **{key: sum(c[key] for c in learning) for key in
               ("returnedDownloads", "acceptedReferenceCount", "decodedCount", "statisticsExtractedCount", "fitSuccessCount", "validSavedPreviewFitCount", "fitFailureCount", "decodeFailureCount")},
            "fitCountsKnownForAllCategories": all(c["fitCountsKnown"] for c in learning),
            "downloadedSourcesAcrossCategories": source_counts(sources),
            "categories": learning, "scope": LEARNING_SCOPE,
        },
        "generation": {
            "runId": generation_run, "plannedTasks": 10, "reportedTasks": sum(c["reported"] for c in cases),
            "finalizedTasks": sum(c["finalized"] for c in cases),
            "failedTasks": sum(c["status"] == "failed" for c in cases),
            "cancelledTasks": sum(c["status"] == "cancelled" for c in cases),
            "missingTasks": sum(not c["reported"] for c in cases),
            "selectedActualImages": sum(c.get("selectedImageAvailable", False) for c in cases),
            "candidateGenerationFailures": sum(len(c.get("candidateGenerationFailures", [])) for c in cases),
            "failedGenerationOperations": sum(len(c.get("failedGenerationOperations", [])) for c in cases),
            "preservedPlanningFailures": sum(len(c.get("planningFailureHistory", [])) for c in cases),
            "tasksWithBoundedReplan": sum(c.get("replanCount", 0) > 0 for c in cases),
            "schedulerDuplicateRejections": sum(c.get("schedulerDuplicateCount", 0) for c in cases),
            "initialExecution": candidate_totals(cases, "initial_execution"),
            "first": candidate_totals(cases, "first"), "final": candidate_totals(cases, "final"),
            "allCandidates": candidate_totals(cases, "all"),
            "perCategory": {category: {"plannedTasks": sum(c["category"] == category for c in cases),
                "first": candidate_totals([c for c in cases if c["category"] == category], "first"),
                "final": candidate_totals([c for c in cases if c["category"] == category], "final")} for category in CATEGORIES},
            "cases": cases, "semanticEvaluationScope": PARAMETER_SCOPE,
            "photoQualityGate": {"status": "not_passed", "autoApprovalAllowed": False, "independentEvaluationAvailable": False,
                "reason": "Rendered candidates, API success, numeric scene constraints and model critiques do not establish photographic realism."},
        },
        "provider": requests.summary(), "operations": operation_summary(operations),
        "scheduling": {"authoritativeStatus": "Per-category and per-case final task reports",
                       "driverExitCodeUsedAsTaskFailure": False,
                       "overlapRule": "A driver exit 2 caused by an existing-batch refusal is a scheduling duplicate. It does not overwrite another process's category report or turn learning_ready into failed.",
                       "learningDriverLogWasInspected": False,
                       "limitation": "No learning driver log is consumed here; only observed per-case duplicate errors are counted. No exit code is invented."},
        "dataSplitAudit": leakage, "learningMechanisms": basis,
        "terminalBenchmark": {"status": "not_run" if terminal.get("status") == "not_run" and not started_terminal else "status_requires_manual_review",
                              "reportedStatus": terminal.get("status"), "plannedPrompts": 60, "plannedSeedsPerPrompt": 3, "plannedTasks": 180,
                              "reportedTasksOtherThanNotRun": len(started_terminal), "score": None,
                              "reason": "No terminal benchmark is executed by this script. The 180-task suite requires independent P3 evidence; showcase results do not substitute for it."},
        "inputEvidence": [{"path": name, **info} for name, info in sorted(evidence.inputs.items())],
        "runtimeStatusHints": [{"experiment": name, "sha256": value["sha256"], "status": value["status"]}
                               for name, value in sorted(evidence.runtime_hints.items())],
        "limitations": [LEARNING_SCOPE, PARAMETER_SCOPE,
            "Source deduplication does not certify independent captures or complete semantic coverage.",
            "Online model updates do not inherit a fresh held-out score from the old model's report.",
            "No photographic-quality, full P3/G2, preference, or 180-task benchmark pass is automatically awarded."],
    }
    return sanitized(summary)


def atomic_json(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    handle, temporary = tempfile.mkstemp(prefix=path.name + ".tmp-", dir=path.parent)
    try:
        with os.fdopen(handle, "w") as file:
            json.dump(value, file, ensure_ascii=False, indent=2, allow_nan=False)
            file.write("\n")
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def public_summary(summary):
    value = copy.deepcopy(summary)
    value["schema"] = "crf.public_experiment_summary.v0.9"
    value["detailReport"] = "reports/v09/experiment_summary.json"
    value["inputEvidenceCount"] = len(value.pop("inputEvidence", []))
    # Keep complete request IDs/tokens/search evidence, but avoid doubling the
    # detailed operation list and 100+ saved-fit metadata rows in the UI payload.
    value["operations"].pop("rows", None)
    for category in value["learning"]["categories"]:
        for round_row in category["rounds"]:
            round_row.pop("fits", None)
    return value


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--learning-run", default="learning-v1")
    parser.add_argument("--generation-run", default="showcase-v1")
    parser.add_argument("--allow-incomplete", action="store_true", help="Write a clearly labelled partial snapshot")
    parser.add_argument("--dry-run", action="store_true", help="Read/check only; no outputs or gallery rebuild")
    parser.add_argument("--no-rebuild-gallery", action="store_true")
    options = parser.parse_args()
    summary = build_summary(ROOT, options.learning_run, options.generation_run)
    incomplete = not summary["allPlannedTrialsReported"] or not summary["inputSnapshotStable"]
    if incomplete and not (options.allow_incomplete or options.dry_run):
        raise SystemExit("Actual reports are incomplete or changing. No summary was written; wait for jobs to finish or explicitly use --allow-incomplete.")
    if not options.dry_run:
        if not incomplete and not options.no_rebuild_gallery:
            subprocess.run(["node", "scripts/rebuild_gallery09.mjs", "--run-id", options.generation_run], cwd=ROOT, check=True)
        atomic_json(ROOT / "reports/v09/experiment_summary.json", summary)
        atomic_json(ROOT / "web/assets/v09/experiments.json", public_summary(summary))
    print(json.dumps({"status": summary["status"], "written": not options.dry_run,
                      "learningRoundsComplete": summary["learning"]["roundsComplete"],
                      "validSavedPreviewFits": summary["learning"]["validSavedPreviewFitCount"],
                      "selectedActualImages": summary["generation"]["selectedActualImages"],
                      "allCandidateImages": summary["generation"]["allCandidates"]["actualPNGCount"],
                      "requestCount": summary["provider"]["requestCount"], "totalTokens": summary["provider"]["total_tokens"],
                      "heldoutSourceOrHashMatches": summary["dataSplitAudit"]["sourceOrExactHashMatchPairs"],
                      "terminalBenchmark": summary["terminalBenchmark"]["status"], "providerCallsMadeBySummary": 0}, ensure_ascii=False))


if __name__ == "__main__":
    main()
