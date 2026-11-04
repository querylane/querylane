"""Run after both builds: protect rendering and separate-file delivery."""
import hashlib
import json
import re
from pathlib import Path
import unittest

from fontTools.pens.recordingPen import DecomposingRecordingPen
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parents[2]
ASSETS = json.loads((ROOT / 'docs/fonts/manifest.json').read_text())
SOURCES = json.loads((ROOT / 'scripts/fonts/sources.json').read_text())
CSS = (ROOT / 'frontend/src/fonts/fonts.css').read_text()
for source in SOURCES:
    if not source['path'].startswith('node_modules/'):
        continue
    filename = Path(source['path']).name
    kind = 'mono' if filename.startswith('geist-mono-') else 'sans'
    if filename.endswith('-latin-wght-normal.woff2'):
        outputs = [f'{kind}-{part}.woff2' for part in ('core', 'extended')]
    else:
        package = Path(source['path']).parent.parent.name
        suffix = filename.removeprefix(package + '-').removesuffix('-wght-normal.woff2')
        outputs = [f'{kind}-{suffix}.woff2']
    for filename in outputs:
        block = next(block for block in re.findall(r'@font-face\s*\{[^}]+\}', CSS) if f'./{filename}' in block)
        ASSETS.append({'source': source['path'], 'path': f'frontend/src/fonts/{filename}', 'unicodeRange': ''.join(re.search(r'unicode-range:\s*([^;]+)', block).group(1).split())})


def codepoints(value):
    result = set()
    for interval in value.split(','):
        ends = interval.removeprefix('U+').split('-')
        result.update(range(int(ends[0], 16), int(ends[-1], 16) + 1))
    return result


class FontTests(unittest.TestCase):
    def test_coverage_names_and_axes(self):
        coverage = {}
        for asset in ASSETS:
            font = TTFont(ROOT / asset['path'])
            source = TTFont(ROOT / asset['source'])
            actual = set(font.getBestCmap())
            declared = codepoints(asset['unicodeRange'])
            exception = {0x2010} if Path(asset['path']).stem.endswith('-core') else set()
            self.assertEqual(declared - actual, exception)
            self.assertEqual(actual - declared, set())
            if 'sha256' in asset:
                self.assertEqual(hashlib.sha256((ROOT / asset['path']).read_bytes()).hexdigest(), asset['sha256'])
            axes = lambda f: [(a.axisTag, a.minValue, a.defaultValue, a.maxValue) for a in f['fvar'].axes] if 'fvar' in f else []
            self.assertEqual(axes(font), axes(source))
            for record in font['name'].names:
                if record.nameID in (1, 3, 4, 6, 16, 21, 25):
                    self.assertIn('Querylane', record.toUnicode())
            previous = coverage.setdefault(asset['source'], set())
            self.assertFalse(previous & actual)
            previous.update(actual)
        for path, actual in coverage.items():
            source = TTFont(ROOT / path)
            # All originally supported Latin-1 and Extended-A characters remain.
            required = {p for p in source.getBestCmap() if 32 <= p <= 255} if '-latin-wght-' in path or '/sources/docs-' in path else set()
            if '-latin-ext-' in path:
                required = {p for p in source.getBestCmap() if 0x100 <= p <= 0x17f}
            self.assertTrue(required <= actual, path)

    def test_rasterizer_programs_and_outlines(self):
        for asset in ASSETS:
            source = TTFont(ROOT / asset['source'])
            font = TTFont(ROOT / asset['path'])
            for tag in ('prep', 'gasp'):
                if tag in source:
                    self.assertIn(tag, font, asset['path'])
                    self.assertEqual(source[tag].compile(source), font[tag].compile(font))
            for weight in (300, 400, 500, 600, 700):
                original = source.getGlyphSet(location={'wght': weight})
                result = font.getGlyphSet(location={'wght': weight})
                for point, glyph in font.getBestCmap().items():
                    a, b = original[source.getBestCmap()[point]], result[glyph]
                    self.assertEqual(a.width, b.width)
                    before, after = DecomposingRecordingPen(original), DecomposingRecordingPen(result)
                    a.draw(before)
                    b.draw(after)
                    self.assertEqual(before.value, after.value)

    def test_builds_emit_every_subset_separately(self):
        emitted = {
            directory: {hashlib.sha256(p.read_bytes()).hexdigest() for p in (ROOT / directory).glob('*.woff2')}
            for directory in ('frontend/dist/static/font', 'dist/client/_astro/fonts')
        }
        for asset in ASSETS:
            directory = 'dist/client/_astro/fonts' if asset['path'].startswith('docs/') else 'frontend/dist/static/font'
            self.assertIn(hashlib.sha256((ROOT / asset['path']).read_bytes()).hexdigest(), emitted[directory], asset['path'])


if __name__ == '__main__':
    unittest.main()
