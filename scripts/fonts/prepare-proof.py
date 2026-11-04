"""Create disposable identical-content pages using two production builds' CSS.

python scripts/fonts/prepare-proof.py --app-dir /tmp/baseline --docs-url http://127.0.0.1:4185
Then serve app-dir and open font-proof-{app,docs,ascii,cjk}.html.
"""
import argparse
from pathlib import Path
import re
import uuid
from urllib.request import urlopen

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--app-dir', type=Path, required=True)
parser.add_argument('--docs-url', required=True)
args = parser.parse_args()
app = (args.app_dir / 'index.html').read_text()
docs = urlopen(args.docs_url + '/get-started').read().decode()
app_head = '\n'.join(re.findall(r'<link[^>]+(?:stylesheet|as="font")[^>]*>', app))
docs_head = '\n'.join(re.findall(r'<style[^>]*>.*?</style>|<link[^>]+(?:stylesheet|as="font")[^>]*>', docs, re.S))
# Serve font/CSS copies same-origin so CORS cannot invalidate the proof.
assets = args.app_dir / 'font-proof-assets'
assets.mkdir(exist_ok=True)
for asset in set(re.findall(r'(?:href=[\"\']|url\([\"\']?)(/[^\"\'\s)>]+)', docs_head)):
    destination = assets / Path(asset).name
    destination.write_bytes(urlopen(args.docs_url + asset).read())
    docs_head = docs_head.replace(asset, '/font-proof-assets/' + destination.name)
# All references are now local.
docs_head = re.sub(r'(?P<attr>href=|url\()(["\']?)/', r'\g<attr>\2/', docs_head)
for name, head, sans, mono in [
    ('app', app_head, 'var(--font-sans)', 'var(--font-mono)'),
    ('docs', docs_head, 'var(--blume-ff-geist)', 'var(--blume-ff-geist-mono)'),
]:
    content = '<h1>Querylane font proof — same content, same viewport</h1>'
    for family in (sans, mono):
        content += f'<section style="font-family:{family}">'
        for weight in (300, 400, 500, 600, 700):
            content += f'<p style="font-weight:{weight}">{weight} AV To fi fl 0123456789 “quotes” – em—dash… <em>Italic <strong>bold inside italics</strong></em></p>'
        content += '<p>café naïve Noël Straße Ångström Łódź Āā Žž Œœ Đđ é Ελληνικά Україна Tiếng Việt</p>'
        content += '<p>東京 中文 한국어; U+2010 hyphen: co‐operate; symbols: € ← → ↑ ↓ − •</p>'
        content += '<pre style="font-weight:600">SELECT "café", count(*) FROM public.東京; -- italic comments</pre>'
        content += '<p style="font-variant-numeric:tabular-nums">Tabular 111 222 3.14 000 <em><strong>700 italic</strong></em></p></section>'
    common = '<style>body{padding:20px}h1{font-size:20px}p{margin:7px 0;font-size:15px}section{margin:20px 0}strong{font-weight:700}pre{font:inherit}</style>'
    (args.app_dir / f'font-proof-{name}.html').write_text(f'<!doctype html><html lang="en"><head><meta charset="utf-8">{head}{common}</head><body>{content}</body></html>')
# Cache-bust font URLs per probe: Chromium can otherwise share loaded FontFaces
# across navigations without reporting an additional Resource Timing entry.
stylesheet = re.search(r'href="([^"]+)" rel="stylesheet"', app_head).group(1)
css_path = args.app_dir / stylesheet.lstrip('/')
network_id = uuid.uuid4().hex
# Distinct pages to prove unicode-range network gating without DOM mutation.
for name, text in [('extended', 'Querylane ™ 2′'), ('ascii', 'Querylane SELECT count(*) “quotes” — …'), ('accented', 'Querylane café naïve Ångström'), ('cjk', 'Querylane 東京 中文 한국어')]:
    query = f'?font-proof={network_id}-{name}'
    css = re.sub(r'(\.woff2)([\"\']?\))', r'\1' + query + r'\2', css_path.read_text())
    probe_css = css_path.with_name(f'font-proof-{name}.css')
    probe_css.write_text(css)
    probe_head = app_head.replace(stylesheet, '/' + probe_css.relative_to(args.app_dir).as_posix())
    probe_head = probe_head.replace('.woff2\"', '.woff2' + query + '\"')
    (args.app_dir / f'font-proof-{name}.html').write_text(f'<!doctype html><html lang="en"><head><meta charset="utf-8">{probe_head}</head><body><p>{text}</p></body></html>')
