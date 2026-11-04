"""Public artifact contract: run after optimize.py, never at app build time."""
import json
import hashlib
from pathlib import Path
import unittest
from fontTools.ttLib import TTFont
from fontTools.pens.recordingPen import DecomposingRecordingPen

ROOT = Path(__file__).resolve().parents[2]


class FontArtifactsTest(unittest.TestCase):
    def test_committed_subsets_match_their_css_ranges(self):
        manifest = json.loads((ROOT / 'frontend/src/fonts/manifest.json').read_text())
        for family in manifest['families']:
            points = []
            for part in family['outputs']:
                path = ROOT / part['path']
                font = TTFont(path)
                actual = set(font.getBestCmap())
                declared = set()
                for interval in part['unicode_range'].split(','):
                    ends = interval.removeprefix('U+').split('-')
                    declared.update(range(int(ends[0], 16), int(ends[-1], 16) + 1))
                self.assertEqual(actual, declared - {0x2010})
                self.assertEqual(declared - actual, {0x2010} if path.stem.endswith("-core") else set())
                self.assertEqual(path.stat().st_size, part['bytes'])
                self.assertEqual(hashlib.sha256(path.read_bytes()).hexdigest(), part['sha256'])
                self.assertEqual([(a.axisTag, a.minValue, a.defaultValue, a.maxValue) for a in font['fvar'].axes], [('wght', 100, 400, 900)])
                for record in font['name'].names:
                    if record.nameID in (1, 3, 4, 6, 16, 21, 25):
                        self.assertIn('Querylane', record.toUnicode())
                self.assertNotIn('fpgm', font)
                points.append(actual)
            self.assertFalse(points[0] & points[1])
            self.assertEqual(set(family['retained_codepoints']), points[0] | points[1])
            self.assertTrue(set(range(32, 127)) <= points[0])
            self.assertTrue({ 0x2018, 0x2019, 0x201c, 0x201d, 0x2013, 0x2014, 0x2026} <= points[0])
            # U+2010 is absent upstream: preserve its system-font fallback.
            self.assertNotIn(0x2010, points[0] | points[1])


    def test_default_outlines_and_metrics_are_unchanged(self):
        manifest = json.loads((ROOT / 'frontend/src/fonts/manifest.json').read_text())
        self.assertTrue(manifest['full_axes'])
        for family in manifest['families']:
            source = TTFont(ROOT / family['source']['path'])
            for output in family['outputs']:
                font = TTFont(ROOT / output['path'])
                for weight in (300, 400, 500, 600, 700):
                    original_set = source.getGlyphSet(location={'wght': weight})
                    result_set = font.getGlyphSet(location={'wght': weight})
                    for point, glyph in font.getBestCmap().items():
                        original = original_set[source.getBestCmap()[point]]
                        result = result_set[glyph]
                        self.assertEqual(original.width, result.width)
                        before = DecomposingRecordingPen(original_set)
                        after = DecomposingRecordingPen(result_set)
                        original.draw(before)
                        result.draw(after)
                        self.assertEqual(before.value, after.value)

if __name__ == '__main__':
    unittest.main()
