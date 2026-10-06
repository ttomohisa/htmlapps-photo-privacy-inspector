#!/usr/bin/env python3
"""Independent decoder check for outputs from test-photo-clean.cjs (requires Pillow)."""
import argparse
import base64
import io
import json
from pathlib import Path

from PIL import Image, ImageOps

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("output_dir", type=Path)
args = parser.parse_args()
root = Path(__file__).resolve().parent.parent
fixtures = json.loads((root / "tests/fixtures/photo-clean.json").read_text())["cases"]

for case in fixtures:
    source = Image.open(io.BytesIO(base64.b64decode(case["base64"])))
    output = Image.open(args.output_dir / case["name"])
    frames = getattr(source, "n_frames", 1)
    assert frames == getattr(output, "n_frames", 1), case["name"]
    for frame in range(frames):
        source.seek(frame)
        output.seek(frame)
        source.load()
        output.load()
        before = ImageOps.exif_transpose(source).convert("RGBA")
        after = ImageOps.exif_transpose(output).convert("RGBA")
        assert before.size == after.size, (case["name"], frame, before.size, after.size)
        assert before.tobytes() == after.tobytes(), (case["name"], frame, "displayed pixels changed")
    print(f"PASS {case['name']}: {frames} frame(s), orientation-aware pixels equal")

print(f"PASS: decoded all {len(fixtures)} synthetic input/output pairs")
