"""Lossless PNG packaging for new v0.10 outputs; never touch historical assets."""
from pathlib import Path
from io import BytesIO
import hashlib
import json
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
rows = []
for p in sorted((ROOT / 'web/assets/v10/generated').glob('*/*.png')):
    before = p.read_bytes()
    with Image.open(BytesIO(before)) as im:
        original = im.convert('RGBA').tobytes()
        out = BytesIO()
        im.save(out, format='PNG', optimize=True, compress_level=9)
    candidate = out.getvalue()
    with Image.open(BytesIO(candidate)) as im:
        assert im.convert('RGBA').tobytes() == original, str(p)
    if len(candidate) < len(before):
        p.write_bytes(candidate)
    rows.append({
        'path': str(p.relative_to(ROOT)),
        'beforeBytes': len(before),
        'afterBytes': p.stat().st_size,
        'rgbaUnchanged': True,
        'pixelSHA256': hashlib.sha256(original).hexdigest(),
    })
report = {
    'schema': 'crf.lossless_packaging.v0.10',
    'scope': 'PNG compression only; all RGBA pixels and historical assets unchanged.',
    'savedBytes': sum(r['beforeBytes'] - r['afterBytes'] for r in rows),
    'files': rows,
}
(ROOT / 'reports/v10/lossless_packaging.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps({'savedBytes': report['savedBytes'], 'files': len(rows), 'allRGBAUnchanged': True}))
