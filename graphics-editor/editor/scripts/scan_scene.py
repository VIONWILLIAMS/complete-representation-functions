#!/usr/bin/env python3
"""Reproduce the explicit pixel scan and assisted semantic labels; no Blender."""
from pathlib import Path
import argparse
import json
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from scanner.scene_scan import scan
from scanner.validate_scan import validate


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--reference", default=str(ROOT / "web/assets/reference.png"))
    p.add_argument("--annotations", default=str(ROOT / "scanner/seed_annotations.json"))
    args = p.parse_args()
    report = scan(args.reference, args.annotations, ROOT)
    report["validation"] = validate(ROOT)
    (ROOT / "reports/scan_report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    print(json.dumps({"statistics": report["statistics"], "payload": report["payload"],
                      "qaArtifacts": report["qaArtifacts"], "validation": report["validation"]}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
