"""Check real build output, including accidental bundler data-URI inlining."""
import hashlib
import json
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[2]


class FontDeliveryTest(unittest.TestCase):
    def test_every_committed_subset_is_emitted_as_a_separate_file(self):
        manifest = json.loads((ROOT / 'frontend/src/fonts/manifest.json').read_text())
        app = {hashlib.sha256(p.read_bytes()).hexdigest() for p in (ROOT / 'frontend/dist/static/font').glob('*.woff2')}
        docs = {hashlib.sha256(p.read_bytes()).hexdigest() for p in (ROOT / 'dist/client/_astro/fonts').glob('*.woff2')}
        for family in manifest['families']:
            for part in family['outputs']:
                emitted = docs if family['id'].startswith('docs-') else app
                self.assertIn(part['sha256'], emitted, f'{part["path"]} was not emitted separately')
        for face in manifest['supplemental']:
            self.assertIn(face['output']['sha256'], app)


if __name__ == '__main__':
    unittest.main()
