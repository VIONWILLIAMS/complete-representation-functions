#!/usr/bin/env python3
"""Apply the unchanged 0.3 strict RGB8 checker to the actual 0.5 PNG."""
from pathlib import Path
import json
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from verification.pixel_acceptance import assess

if __name__ == '__main__':
    scan = json.loads((ROOT / 'reports/scan_report.json').read_text())
    rois = {}
    for item in scan.get('objects', []):
        box = item.get('bbox') or item.get('bbox_px')
        if box:
            rois[item['id']] = box
    report = assess(ROOT / 'web/assets/reference.png',
                    ROOT / 'web/downloads/crf_0_5_street_reference.png',
                    rois=rois, output_dir=ROOT / 'reports/v05/pixel_gate')
    print(json.dumps({'valid': report['valid'], 'exact100': report['exact100'],
                      'global': report['global']}, ensure_ascii=False, indent=2))
    sys.exit(0 if report['valid'] and report['exact100'] else 1)
