#!/usr/bin/env python3
"""Regenerate committed fonts by hand; never called by the build."""
import hashlib
import json
from pathlib import Path
import re
import subprocess

from fontTools import subset, __version__
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parents[2]
APP = ROOT / 'frontend/src/fonts'
MANIFEST = ROOT / 'docs/fonts/manifest.json'
CORE = set(range(32, 256)) | {0x0131, 0x0152, 0x0153, 0x0304, 0x0308, 0x0329, 0x20AC, 0x2191, 0x2193, 0x2212, 0x2022, 0x2010, 0x2013, 0x2014, 0x2018, 0x2019, 0x201C, 0x201D, 0x2026}
LATIN = 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+2074,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD'
FEATURES = ['ccmp', 'locl', 'liga', 'kern', 'mark', 'mkmk', 'tnum']


def parse_ranges(value):
    points = set()
    for interval in value.split(','):
        ends = interval.removeprefix('U+').split('-')
        points.update(range(int(ends[0], 16), int(ends[-1], 16) + 1))
    return points


def ranges(points):
    intervals = []
    for point in sorted(points):
        if intervals and point == intervals[-1][1] + 1:
            intervals[-1][1] = point
        else:
            intervals.append([point, point])
    return ','.join(f'U+{a:04X}' + (f'-{b:04X}' if a != b else '') for a, b in intervals)


def write_font(source, destination, points, internal_name):
    font = TTFont(source, recalcTimestamp=False)
    average_width = font['OS/2'].xAvgCharWidth
    style = font['name'].getDebugName(2) or 'Regular'
    options = subset.Options()
    options.layout_features = FEATURES
    options.hinting = True  # prep/gasp affect Linux rasterization, even without glyph hints.
    options.recalc_timestamp = False
    options.name_IDs = ['*']
    options.name_legacy = True
    options.name_languages = ['*']
    sub = subset.Subsetter(options=options)
    sub.populate(unicodes=points)
    sub.subset(font)
    font['OS/2'].xAvgCharWidth = average_width  # Preserve fallback metrics.
    for record in font['name'].names:
        if record.nameID in (1, 3, 4, 6, 16, 21, 25):
            value = internal_name if record.nameID in (1, 16, 21, 25) else f'{internal_name} {style}'
            if record.nameID in (3, 6, 25):
                value = value.replace(' ', '')
            font['name'].setName(value, record.nameID, record.platformID, record.platEncID, record.langID)
    destination.parent.mkdir(parents=True, exist_ok=True)
    font.flavor = 'woff2'
    font.save(destination)
    coverage = set(TTFont(destination).getBestCmap())
    # Upstream declares this missing hyphen. Removing it changes fallback font runs.
    if destination.stem.endswith('-core'):
        coverage.add(0x2010)
    return {
        'source': str(source.relative_to(ROOT)),
        'path': str(destination.relative_to(ROOT)),
        'sha256': hashlib.sha256(destination.read_bytes()).hexdigest(),
        'unicodeRange': ranges(coverage),
    }


def face(asset):
    return f'''@font-face {{
  font-family: "{asset['family']}";
  font-weight: {asset['weight']};
  font-display: swap;
  src: url("./{Path(asset['path']).name}");
  unicode-range: {asset['unicodeRange']};
}}'''


def generate():
    if __version__ != '4.68.0':
        raise ValueError('Use scripts/fonts/requirements.txt.')
    for source in json.loads((ROOT / 'scripts/fonts/sources.json').read_text()):
        if hashlib.sha256((ROOT / source['path']).read_bytes()).hexdigest() != source['sha256']:
            raise ValueError(f'Font source changed: {source["path"]}. Re-audit before updating sources.json.')
    doc_faces, app_css = [], ['/* Maintained with scripts/fonts/optimize.py, outside the build. */']
    for kind, package in [('sans', 'geist'), ('mono', 'geist-mono')]:
        package_dir = ROOT / 'node_modules/@fontsource-variable' / package
        family = 'Geist Variable' if kind == 'sans' else 'Geist Mono Variable'
        for public in (ROOT / 'public/font-licenses', ROOT / 'frontend/public/font-licenses'):
            public.mkdir(parents=True, exist_ok=True)
            (public / f'OFL-{package}.txt').write_bytes((package_dir / 'LICENSE').read_bytes())
        for block in re.findall(r'@font-face\s*\{[^}]+\}', (package_dir / 'index.css').read_text()):
            filename = re.search(r'url\(\./files/([^)]*)\)', block).group(1)
            source = package_dir / 'files' / filename
            points = set(TTFont(source).getBestCmap()) & parse_ranges(re.search(r'unicode-range:\s*([^;]+)', block).group(1))
            subset_name = filename.removeprefix(package + '-').removesuffix('-wght-normal.woff2')
            parts = [(subset_name, points)]
            if subset_name == 'latin':
                parts = [('core', points & CORE), ('extended', points - CORE)]
            for part, coverage in parts:
                name = f'{kind}-{part}.woff2'
                asset = write_font(source, APP / name, coverage, f'Querylane App {kind.title()}')
                asset.update(family=family, weight='100 900')
                app_css.append(face(asset))
    for kind, family, weight in [('sans', 'Geist', '400 700'), ('mono', 'Geist Mono', '400 600')]:
        # Astro derives fallback metrics from the first style: keep italic first.
        for style in ['italic', 'normal']:
            source = ROOT / f'scripts/fonts/sources/docs-{kind}-{style}.woff2'
            points = set(TTFont(source).getBestCmap()) & parse_ranges(LATIN)
            for part, coverage in [('core', points & CORE), ('extended', points - CORE)]:
                asset = write_font(source, ROOT / f'docs/fonts/docs-{kind}-{style}-{part}.woff2', coverage, f'Querylane Docs {kind.title()}')
                asset.update(family=family, style=style, weight=weight, subset='latin' if part == 'core' else 'extended')
                doc_faces.append(asset)
    (APP / 'fonts.css').write_text('\n\n'.join(app_css) + '\n')
    MANIFEST.write_text(json.dumps(doc_faces, indent=2) + '\n')
    subprocess.run([str(ROOT / 'frontend/node_modules/.bin/biome'), 'format', '--write', str(APP / 'fonts.css'), str(MANIFEST)], cwd=ROOT / 'frontend', check=True)


if __name__ == '__main__':
    generate()
