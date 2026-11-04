#!/usr/bin/env python3
"""Manual, deterministic font asset generation; deliberately not a build step."""
import argparse
import hashlib
from io import BytesIO
import json
from pathlib import Path
import re
import subprocess

from fontTools import subset, __version__
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'frontend/src/fonts'
CORE = set(range(32, 256)) | {0x0131, 0x0152, 0x0153, 0x0304, 0x0308, 0x0329, 0x20AC, 0x2191, 0x2193, 0x2212, 0x2022, 0x2010, 0x2013, 0x2014, 0x2018, 0x2019, 0x201C, 0x201D, 0x2026}
FEATURES = ['ccmp', 'locl', 'liga', 'kern', 'mark', 'mkmk', 'tnum']


def parse_ranges(declared):
    points = set()
    for interval in declared.split(','):
        ends = interval.removeprefix('U+').split('-')
        points.update(range(int(ends[0], 16), int(ends[-1], 16) + 1))
    return points


def ranges(points):
    result = []
    for point in sorted(points):
        if result and point == result[-1][1] + 1:
            result[-1][1] = point
        else:
            result.append([point, point])
    return ','.join(f'U+{a:04X}' + (f'-{b:04X}' if a != b else '') for a, b in result)


def inspect(path):
    font = TTFont(path)
    return {
        'path': str(path.relative_to(ROOT)), 'bytes': path.stat().st_size,
        'sha256': hashlib.sha256(path.read_bytes()).hexdigest(),
        'glyphs': len(font.getGlyphOrder()), 'characters': len(font.getBestCmap()),
        'axes': {a.axisTag: [a.minValue, a.defaultValue, a.maxValue] for a in font['fvar'].axes} if 'fvar' in font else {},
        'features': {tag: sorted({r.FeatureTag for r in font[tag].table.FeatureList.FeatureRecord}) for tag in ('GSUB', 'GPOS') if tag in font},
        'hint_tables': [tag for tag in ('fpgm', 'prep', 'cvt ', 'gasp', 'cvar') if tag in font],
        'hinted_glyphs': sum(bool(getattr(g, 'program', None) and g.program.getBytecode()) for g in (font['glyf'][name] for name in font.getGlyphOrder())),
    }


def write_font(source, destination, points, family, bounds, keep_hinting=False):
    font = TTFont(source, recalcTimestamp=False)
    # Bounds are deliberately configurable: partial instancing can round outlines.
    if bounds:
        instantiateVariableFont(font, {'wght': bounds}, inplace=True)
        # Reopen: instancer omits empty gvar entries; subset expects them present.
        intermediate = BytesIO()
        font.save(intermediate)
        intermediate.seek(0)
        font = TTFont(intermediate, recalcTimestamp=False)
    options = subset.Options()
    options.layout_features = FEATURES
    options.hinting = keep_hinting
    options.recalc_timestamp = False
    options.name_IDs = ['*']
    options.name_legacy = True
    options.name_languages = ['*']
    sub = subset.Subsetter(options=options)
    sub.populate(unicodes=points)
    sub.subset(font)
    # Preserve rasterizer policy; dropping gasp can change Windows rendering.
    original = TTFont(source)
    if 'gasp' in original:
        font['gasp'] = original['gasp']
    # Keep upstream fallback metrics, not the subset's recomputed average.
    font['OS/2'].xAvgCharWidth = original['OS/2'].xAvgCharWidth
    # Rename every derivative, even when the upstream OFL has no RFN.
    for record in font['name'].names:
        if record.nameID in (1, 3, 4, 6, 16, 21, 25):
            style = original['name'].getDebugName(2) or 'Regular'
            value = family if record.nameID in (1, 16, 21, 25) else f'{family} {style}'
            if record.nameID in (3, 6, 25):
                value = value.replace(' ', '')
            font['name'].setName(value, record.nameID, record.platformID, record.platEncID, record.langID)
    destination.parent.mkdir(parents=True, exist_ok=True)
    font.flavor = 'woff2'
    font.save(destination)
    result = inspect(destination)
    result['unicode_range'] = ranges(TTFont(destination).getBestCmap())
    # Upstream declares this missing hyphen. Removing it changes Chromium's
    # fallback run segmentation (confirmed by exact pixel diffs). No glyph added.
    if destination.stem.endswith('-core'):
        result['unicode_range'] = ranges(set(TTFont(destination).getBestCmap()) | {0x2010})
        result['range_exceptions'] = ['U+2010']
    return result


def generate(full_axes=True, keep_hinting=False):
    if __version__ != '4.68.0':
        raise ValueError('Use the pinned scripts/fonts/requirements.txt toolchain.')
    for source in json.loads((ROOT / 'scripts/fonts/sources.json').read_text()):
        path = ROOT / source['path']
        if hashlib.sha256(path.read_bytes()).hexdigest() != source['sha256']:
            raise ValueError(f'Font source changed: {path}. Re-audit and update sources.json intentionally.')
    for public in (ROOT / 'public/font-licenses', ROOT / 'frontend/public/font-licenses'):
        public.mkdir(parents=True, exist_ok=True)
        for name in ('OFL-geist.txt', 'OFL-geist-mono.txt'):
            (public / name).write_bytes((ROOT / 'scripts/fonts' / name).read_bytes())
    OUT.mkdir(parents=True, exist_ok=True)
    families = []
    app_css = ['/* Maintained with scripts/fonts/optimize.py, outside the build. */']
    supplemental = []
    for kind, package, css_name, bounds in [
        ('sans', 'geist', 'Geist Variable', (300, 700)),
        ('mono', 'geist-mono', 'Geist Mono Variable', (300, 700)),
    ]:
        package_dir = ROOT / 'node_modules/@fontsource-variable' / package
        original_css = (package_dir / 'index.css').read_text()
        source = package_dir / 'files' / f'{package}-latin-wght-normal.woff2'
        latin_block = re.findall(r'@font-face\s*\{[^}]+\}', original_css)[-1]
        latin_allowed = parse_ranges(re.search(r'unicode-range:\s*([^;]+)', latin_block).group(1))
        latin_points = set(TTFont(source).getBestCmap()) & latin_allowed
        family = {'id': f'app-{kind}', 'family': css_name, 'style': 'normal', 'weight': '100 900', 'source': inspect(source), 'outputs': [], 'retained_codepoints': sorted(latin_points)}
        for part, points in [('core', CORE & latin_points), ('extended', latin_points - CORE)]:
            output = write_font(source, OUT / f'app-{kind}-{part}.woff2', points, f'Querylane App {kind.title()}', None if full_axes else bounds, keep_hinting)
            family['outputs'].append(output)
            app_css.append(face(css_name, 'normal', '100 900', './' + Path(output['path']).name, output['unicode_range']))
        families.append(family)
        latin_css = app_css[-2:]
        del app_css[-2:]
        # Database values are not a closed corpus. Preserve every existing script.
        for block in re.findall(r'@font-face\s*\{[^}]+\}', original_css):
            file = re.search(r'url\(\./files/([^)]*)\)', block).group(1)
            if file == source.name:
                continue
            source_other = package_dir / 'files' / file
            declared = re.search(r'unicode-range:\s*([^;]+)', block).group(1)
            allowed = set()
            for interval in declared.split(','):
                ends = interval.removeprefix('U+').split('-')
                allowed.update(range(int(ends[0], 16), int(ends[-1], 16) + 1))
            points = set(TTFont(source_other).getBestCmap()) & allowed
            output = write_font(source_other, OUT / file, points, f'Querylane App {kind.title()}', None if full_axes else bounds, keep_hinting)
            supplemental.append({'source': inspect(source_other), 'output': output})
            app_css.append(face(css_name, 'normal', '100 900', './' + file, output['unicode_range']))
        app_css.extend(latin_css)
    for kind, css_name, bounds in [('sans', 'Geist', (400, 700)), ('mono', 'Geist Mono', (400, 600))]:
        for style in ['italic', 'normal']:
            source = ROOT / f'scripts/fonts/sources/docs-{kind}-{style}.woff2'
            # Exactly the Google provider's original latin unicode-range.
            latin_allowed = parse_ranges('U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+2074,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD')
            latin_points = set(TTFont(source).getBestCmap()) & latin_allowed
            family = {'id': f'docs-{kind}-{style}', 'family': css_name, 'style': style, 'weight': f'{bounds[0]} {bounds[1]}', 'source': inspect(source), 'outputs': [], 'retained_codepoints': sorted(latin_points)}
            for part, points in [('core', CORE & latin_points), ('extended', latin_points - CORE)]:
                destination = ROOT / f'docs/fonts/{family["id"]}-{part}.woff2'
                family['outputs'].append(write_font(source, destination, points, f'Querylane Docs {kind.title()}', None if full_axes else bounds, keep_hinting))
            families.append(family)
    (OUT / 'fonts.css').write_text('\n\n'.join(app_css) + '\n')
    manifest = {'fonttools': '4.68.0', 'features_retained': FEATURES, 'full_axes': full_axes, 'keep_hinting': keep_hinting, 'families': families, 'supplemental': supplemental}
    (OUT / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    subprocess.run([str(ROOT / 'frontend/node_modules/.bin/biome'), 'format', '--write', str(OUT / 'fonts.css'), str(OUT / 'manifest.json')], cwd=ROOT / 'frontend', check=True)
    print('\n'.join(f'{f["id"]}: {f["source"]["bytes"]} -> ' + ' + '.join(str(o['bytes']) for o in f['outputs']) for f in families))


def face(family, style, weight, url, points):
    return f'@font-face {{\n  font-family: "{family}";\n  font-style: {style};\n  font-display: swap;\n  font-weight: {weight};\n  src: url("{url}") format("woff2-variations");\n  unicode-range: {points};\n}}'


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--limit-axes', action='store_true', help='EXPERIMENT: smaller fonts, changes pixels. Never commit without visual approval.')
    parser.add_argument('--keep-hinting', action='store_true', help='Preserve hinting when a target rasterizer needs it.')
    args = parser.parse_args()
    generate(not args.limit_axes, args.keep_hinting)
