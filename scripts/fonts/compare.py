"""Strict screenshot diff: exits nonzero for even one changed RGB pixel."""
import argparse
import hashlib
import json
from pathlib import Path
from PIL import Image, ImageChops

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('before', type=Path)
parser.add_argument('after', type=Path)
parser.add_argument('--output', type=Path, required=True)
args = parser.parse_args()
a = Image.open(args.before).convert('RGB')
b = Image.open(args.after).convert('RGB')
if a.size != b.size:
    raise SystemExit(f'Screenshot dimensions changed: {a.size} -> {b.size}')
diff = ImageChops.difference(a, b)
count = sum(pixel != (0, 0, 0) for pixel in diff.get_flattened_data())
args.output.parent.mkdir(parents=True, exist_ok=True)
diff.save(args.output.with_suffix('.png'))
result = {'pixels_changed': count, 'pixels_total': a.width * a.height, 'bounds': diff.getbbox(), 'before_sha256': hashlib.sha256(args.before.read_bytes()).hexdigest(), 'after_sha256': hashlib.sha256(args.after.read_bytes()).hexdigest()}
args.output.with_suffix('.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps(result))
raise SystemExit(bool(count))
