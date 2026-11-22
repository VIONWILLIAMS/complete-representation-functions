"""Synthetic evidence tests; these fixtures are never provider-call evidence."""
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

from PIL import Image

MODULE = Path(__file__).resolve().parents[1] / "scripts/summarize_experiments09.py"
SPEC = importlib.util.spec_from_file_location("summary09", MODULE)
s = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(s)


def write(root, name, data):
    file = Path(root) / name
    file.parent.mkdir(parents=True, exist_ok=True)
    file.write_text(json.dumps(data))


class EvidenceSummaryTests(unittest.TestCase):
    def test_source_identity_and_sha_union_do_not_count_language_copies_as_independent(self):
        a = "https://www.pexels.com/zh-tw/photo/12267666/"
        b = "https://www.pexels.com/photo/bright-orange-12267666/?utm_source=test"
        self.assertEqual(s.canonical_source(a), s.canonical_source(b))
        self.assertEqual(s.canonical_source("https://commons.wikimedia.org/wiki/File:Red_wall.jpg#1"),
                         s.canonical_source("https://commons.wikimedia.org/wiki/File:Red%20wall.jpg"))
        count = s.source_counts([{"sourceUrl": a, "sha256": "a"}, {"sourceUrl": b, "sha256": "b"},
                                 {"sourceUrl": "https://other.test/asset", "sha256": "b"}])
        self.assertEqual(count["records"], 3)
        self.assertEqual(count["deduplicatedGroups"], 1)

    def test_request_metadata_is_deduplicated_across_round_and_category_reports(self):
        requests = s.Requests()
        usage = {"providerCalls": 1, "requests": [{"requestId": "actual-style-id", "total_tokens": 150,
                 "elapsedMs": 2000, "reasoning_content": "must not be copied", "server_tool_use": {"tool_search": 3}}]}
        requests.add(usage, "round"); requests.add(usage, "category")
        report = requests.summary()
        self.assertEqual(report["requestCount"], 1)
        self.assertEqual(report["total_tokens"], 150)
        self.assertEqual(report["serverToolCounters"]["tool_search"], 3)
        self.assertNotIn("reasoning_content", report["requests"][0])
        self.assertIsNone(report["moneyCharged"])

    def test_idless_provider_fallback_is_one_call_and_is_not_native_search(self):
        usage = {"providerCalls": 1, "requests": [{"requestId": "", "phase": "search_fallback", "total_tokens": 0, "elapsedMs": 744}]}
        requests = s.Requests()
        requests.add(usage, "learning:landscape:research_9")
        requests.add({"phase": "research_9", **usage}, "learning:landscape:research_9")
        self.assertEqual(requests.summary()["requestCount"], 1)
        self.assertEqual(requests.summary()["identifiedRequests"], 0)
        self.assertEqual(requests.summary()["providerSearchEndpointRecords"], 1)
        self.assertEqual(requests.summary()["modelRequestRecords"], 0)
        evidence = s.search_evidence({"research": {"searched": True, "toolCalls": [
            {"type": "search_api", "kind": "search", "status": "completed"}]}, "usage": usage})
        self.assertTrue(evidence["searchObserved"])
        self.assertTrue(evidence["providerFallbackSearchObserved"])
        self.assertFalse(evidence["nativeSearchObserved"])

    def test_search_download_evidence_does_not_imply_completed_learning_or_fitting(self):
        with tempfile.TemporaryDirectory() as root:
            write(root, "reports/v09/learning/run/learn-architecture/round_01.search.json", {
                "research": {"searched": True, "toolCalls": [{"id": "native-tool", "type": "deepseek_web_search", "status": "completed"}]},
                "downloads": [{"sourceUrl": "https://test/photo", "sha256": "a"}], "collection": None,
            })
            row, _, _ = s.summarize_learning_category(s.Evidence(root), "run", "architecture", s.Requests())
            self.assertEqual(row["nativeSearchEvidenceRounds"], 1)
            self.assertEqual(row["returnedDownloads"], 1)
            self.assertEqual(row["roundsComplete"], 0)
            self.assertFalse(row["fitCountsKnown"])
            self.assertEqual(row["validSavedPreviewFitCount"], 0)
            self.assertIsNone(row["rounds"][0]["decodedCount"])

    def test_frozen_checks_read_real_scene_and_keep_first_failure_denominator(self):
        with tempfile.TemporaryDirectory() as root:
            base = "reports/v09/generation/run/case"
            spec = {"id": "case", "title": "test", "category": "still_life", "prompt": "two apples", "seed": 2,
                    "width": 2, "height": 2, "expectedConstraints": [{"type": "count", "subject": "apple", "value": 2}]}
            scene = {"seed": 2, "category": "still_life", "objects": [{"id": "apple", "type": "apple", "visible": True, "x": .2, "y": .5}]}
            write(root, base + "/candidate_00.scene.json", scene)
            Image.new("RGBA", (2, 2), (50, 70, 90, 255)).save(Path(root) / base / "candidate_00.png")
            write(root, base + "/record.json", {"status": "review_required", "protocolSha256": "hash", "prompt": "two apples", "seed": 2,
                "selection": {"index": 0}, "candidates": [{"index": 0, "semanticFrozen": {"evaluated": 1, "passed": 1}, "render": {}}],
                "planningHistory": [{"error": {"code": "UNSUPPORTED_REQUIREMENTS"}}], "replanCount": 1})
            row, _ = s.summarize_generation_case(s.Evidence(root), "run", spec, "hash", s.Requests())
            self.assertEqual(row["candidates"][0]["parameterChecks"]["passed"], 0)
            self.assertFalse(row["candidates"][0]["savedCheckAgreement"])
            missing = {"id": "missing", "expectedParameterChecks": 2, "candidates": []}
            self.assertEqual(s.candidate_totals([row, missing], "first")["parameterChecksExpectedDenominator"], 3)
            self.assertEqual(s.candidate_totals([row, missing], "initial_execution")["actualPNGCount"], 0)
            self.assertEqual(s.candidate_totals([row, missing], "first")["actualPNGCount"], 1)

    def test_online_heldout_source_intersection_invalidates_new_model_score_claim(self):
        with tempfile.TemporaryDirectory() as root:
            old = {"id": "heldout", "split": "test", "sourceUrl": "https://www.pexels.com/photo/orange-123/", "sourceSHA256": "oldbytes"}
            sources = [{"category": "still_life", "round": 1, "sourceUrl": "https://www.pexels.com/zh-tw/photo/123/",
                        "sha256": "newbytes", "statisticsExtracted": True, "sharedUpdateCommitted": True}]
            model = {"id": "updated", "observations": [{"id": "observation.newbytes", "sourceGroup": sources[0]["sourceUrl"]}]}
            report = s.leakage_audit(s.Evidence(root), sources, model, {"modelId": "old", "sources": [old]}, [old])
            self.assertEqual(report["sourceOrExactHashMatchPairs"], 1)
            self.assertEqual(report["overlapPairsPresentInCurrentModel"], 1)
            self.assertEqual(report["onlineObservationsWithoutFrozenSplit"], 1)
            self.assertFalse(report["oldHeldoutMetricsValidForCurrentModel"])
            self.assertFalse(report["freshPostLearningHoldoutEvaluationPerformed"])

    def test_scheduler_duplicate_classification_does_not_relabel_final_task(self):
        self.assertTrue(s.duplicate_scheduler_error({"message": "Learning batch exists; use --resume or another --run-id"}))
        self.assertTrue(s.duplicate_scheduler_error({"message": "Trial already exists; use --resume"}))
        self.assertFalse(s.duplicate_scheduler_error({"message": "Search request failed"}))

    def test_independent_summary_checks_resolve_attachment_and_camera(self):
        scene = {"camera": {"panX": .1, "panY": 0, "zoom": 1.2}, "objects": [
            {"id": "pole", "type": "pole", "x": .8, "y": .5, "depth": 1, "visible": True},
            {"id": "signal", "type": "signal", "x": .05, "y": .05, "depth": 0, "visible": True,
             "attachment": {"parentId": "pole", "anchor": [-.1, -.1]}},
            {"id": "window", "type": "window", "x": .3, "y": .3, "depth": 0, "visible": True},
        ]}
        checks = s.frozen_parameter_checks(scene, [{"type": "right_of", "subject": "signal", "target": "window"}])
        self.assertTrue(checks["allPassed"])
        self.assertAlmostEqual(s.resolved_objects(scene)[1]["x"], .715)
        scene["objects"][0]["visible"] = False
        checks = s.frozen_parameter_checks(scene, [{"type": "count", "subject": "signal", "value": 0}])
        self.assertTrue(checks["allPassed"])

    def test_missing_final_reports_stay_in_all_denominators_and_never_get_quality_pass(self):
        with tempfile.TemporaryDirectory() as root:
            protocol = {"showcase": [{"id": f"case{i}", "title": "synthetic", "category": ("architecture", "landscape", "still_life")[i % 3],
                "prompt": "one object", "seed": i, "width": 2, "height": 2,
                "expectedConstraints": [{"type": "count", "subject": "apple", "value": 1}]} for i in range(10)],
                "terminal": {"taskCount": 180}}
            write(root, "benchmarks/v09/protocol.json", protocol)
            protocol_file = Path(root) / "benchmarks/v09/protocol.json"
            protocol_file.with_suffix(".json.sha256").write_text(s.digest(protocol_file.read_bytes()))
            write(root, "reports/v09/terminal_status.json", {"status": "not_run", "tasks": [{"status": "not_run"}] * 180})
            report = s.build_summary(root, "synthetic-learning", "synthetic-generation")
            self.assertFalse(report["allPlannedTrialsReported"])
            self.assertEqual(report["generation"]["missingTasks"], 10)
            self.assertEqual(report["generation"]["final"]["parameterChecksExpectedDenominator"], 10)
            self.assertEqual(report["generation"]["final"]["parameterCheckRate"], 0)
            self.assertEqual(report["generation"]["photoQualityGate"]["status"], "not_passed")
            self.assertEqual(report["terminalBenchmark"]["status"], "not_run")
            self.assertIsNone(report["terminalBenchmark"]["score"])
            self.assertEqual(report["provider"]["requestCount"], 0)


if __name__ == "__main__":
    unittest.main()
