"""scripts/generate-dark-css.py (11 Nov 2026)

Generate a dark-mode companion stylesheet from the light CSS (scoped to body[data-vw-theme="dark"]).

Light neutral backgrounds -> dark surface; light tinted backgrounds -> dark tint of the same hue;
light borders -> dark borders; dark/medium text -> light text of the same hue. Saturated mid colours
(buttons, accents, status fills) and white text are left alone.

Run again after adding or changing page CSS (needs Python 3 and `pip install tinycss2`):
    python scripts/generate-dark-css.py src src/styles/dark-mode.generated.css
Hand-written fixes go in MANUAL at the bottom of this script, not in the generated file.
"""
import colorsys, re, sys, os, tinycss2

SRC = sys.argv[1]
OUT = sys.argv[2]
SKIP_FILES = ('components/Sidebar.css', 'components/LoginLoader/', 'pages/Login/', 'styles/print', 'dark-mode.generated.css', 'pages/Home/', 'PublicHome')
SCOPE = 'body[data-vw-theme="dark"]'
SKIP_SEL = re.compile(r'data-vw-theme|\.rv-doc-print|@page|\.login-|\.auth-|\.public-|\.landing')

HEX = re.compile(r'#([0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b')
RGB = re.compile(r'rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)')
NAMED = {'white': (255, 255, 255, 1.0), '#fff': (255, 255, 255, 1.0)}


def parse(tok):
    m = HEX.fullmatch(tok)
    if m:
        h = m.group(1)
        if len(h) in (3, 4):
            h = ''.join(c * 2 for c in h)
        a = int(h[6:8], 16) / 255 if len(h) == 8 else 1.0
        return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), a
    m = RGB.fullmatch(tok)
    if m:
        a = m.group(4)
        a = 1.0 if a is None else (float(a[:-1]) / 100 if a.endswith('%') else float(a))
        return float(m.group(1)), float(m.group(2)), float(m.group(3)), a
    if tok.lower() == 'white':
        return 255, 255, 255, 1.0
    return None


def fmt(r, g, b, a):
    r, g, b = (max(0, min(255, round(x))) for x in (r, g, b))
    return f'#{r:02x}{g:02x}{b:02x}' if a >= 0.999 else f'rgba({r},{g},{b},{a:.2f})'


def hls(c):
    return colorsys.rgb_to_hls(c[0] / 255, c[1] / 255, c[2] / 255)


def from_hls(h, l, s, a):
    r, g, b = colorsys.hls_to_rgb(h, l, s)
    return fmt(r * 255, g * 255, b * 255, a)


def map_bg(c):
    h, l, s = hls(c)
    a = c[3]
    if a < 0.5:
        return None
    if l >= 0.9 and s < 0.35:
        return fmt(0x1b, 0x2b, 0x44, a) if l >= 0.97 else fmt(0x22, 0x34, 0x4f, a)
    if l >= 0.78:
        return from_hls(h, 0.19 if l >= 0.9 else 0.23, min(s, 0.32), a)
    return None


def map_border(c):
    h, l, s = hls(c)
    if l >= 0.75:
        return from_hls(h, 0.33, min(s, 0.3), c[3])
    return None


def map_text(c):
    h, l, s = hls(c)
    if l >= 0.62:
        return None
    if s < 0.3 or l < 0.3:
        return from_hls(h, max(0.82, 1 - l * 0.8), min(s, 0.45), c[3])
    return from_hls(h, 0.72, min(s, 0.85), c[3])


COLOR_TOKEN = re.compile(r'#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|\bwhite\b')


VAR_ONLY = re.compile(r'^var\((--[\w-]+)(?:\s*,\s*([^)]+))?\)$')


def transform(prop, value):
    m = VAR_ONLY.match(value.strip())
    if m and not prop.startswith('--'):
        lit = SINGLE.get(m.group(1)) or (m.group(2) or '').strip()
        if lit and parse(lit) is not None:
            value = lit
        else:
            return None
    elif 'var(' in value and not COLOR_TOKEN.search(value):
        return None
    if prop in ('color', '-webkit-text-fill-color', 'caret-color'):
        fn = map_text
    elif prop.startswith('background') or prop in ('fill',):
        fn = map_bg
    elif prop.startswith('border') or prop.startswith('outline'):
        fn = map_border
    elif prop.startswith('--'):
        name = prop.lower()
        if any(k in name for k in ('mit-', 'deep', 'brand', 'sidebar', 'primary', 'flag')):
            return None
        if any(k in name for k in ('bg', 'surface', 'soft', 'card', 'canvas', 'paper', 'tint', 'panel', 'fill', '-s')) and not name.endswith('-c'):
            fn = map_bg
        elif any(k in name for k in ('line', 'border', 'bd', 'rule', 'divider', 'track')):
            fn = map_border
        elif any(k in name for k in ('ink', 'text', 'navy', 'muted', 'title', 'fg', 'head', 'label')):
            fn = map_text
        else:
            return None
    else:
        return None
    changed = False

    def rep(m):
        nonlocal changed
        c = parse(m.group(0))
        if c is None:
            return m.group(0)
        n = fn(c)
        if n is None:
            return m.group(0)
        changed = True
        return n
    out = COLOR_TOKEN.sub(rep, value)
    return out if changed else None


def scope(selector):
    parts = []
    for sel in [s.strip() for s in selector.split(',') if s.strip()]:
        if SKIP_SEL.search(sel):
            continue
        if sel.startswith(('html', ':root')):
            sel = re.sub(r'^(html|:root)\s*', '', sel)
            parts.append(f'{SCOPE} {sel}'.strip() if sel else SCOPE)
        elif sel.startswith('body'):
            parts.append(SCOPE + sel[4:])
        else:
            parts.append(f'{SCOPE} {sel}')
    return ', '.join(parts)


def rules(nodes, out, media=None):
    for node in nodes:
        if node.type == 'qualified-rule':
            sel = tinycss2.serialize(node.prelude).strip()
            if sel.startswith(('from', 'to')) or re.fullmatch(r'[\d.%,\s]+', sel):
                continue
            decls = tinycss2.parse_declaration_list(node.content, skip_comments=True, skip_whitespace=True)
            new = []
            for d in decls:
                if d.type != 'declaration':
                    continue
                v = tinycss2.serialize(d.value).strip()
                t = transform(d.lower_name if not d.name.startswith('--') else d.name, v)
                if t is not None:
                    new.append(f'{d.name}:{t}{" !important" if d.important else ""}')
            if new:
                scoped = scope(sel)
                if scoped:
                    out.append((media, f'{scoped}{{{";".join(new)}}}'))
        elif node.type == 'at-rule' and node.lower_at_keyword in ('media', 'supports'):
            prelude = tinycss2.serialize(node.prelude).strip()
            if 'print' in prelude or 'prefers-color-scheme' in prelude:
                continue
            inner = tinycss2.parse_rule_list(node.content, skip_comments=True, skip_whitespace=True)
            rules(inner, out, f'@{node.lower_at_keyword} {prelude}')


VARS = {}
VAR_RE = re.compile(r'(--[\w-]+)\s*:\s*([^;}]+)')
for root, _, files in os.walk(SRC):
    for f in files:
        if f.endswith('.css') and not any(k in os.path.relpath(os.path.join(root, f), SRC) for k in SKIP_FILES):
            for name, val in VAR_RE.findall(open(os.path.join(root, f), encoding='utf-8').read()):
                val = val.strip()
                if parse(val) is not None:
                    VARS.setdefault(name, set()).add(val.lower())
SINGLE = {k: next(iter(v)) for k, v in VARS.items() if len(v) == 1}

blocks = ['/* GENERATED by scripts/generate-dark-css.py. Do not edit by hand; edit page CSS or MANUAL in the script and run it again. */']
count = 0
for root, _, files in os.walk(SRC):
    for f in sorted(files):
        if not f.endswith('.css'):
            continue
        path = os.path.join(root, f)
        rel = os.path.relpath(path, SRC)
        if any(k in rel for k in SKIP_FILES):
            continue
        sheet = tinycss2.parse_stylesheet(open(path, encoding='utf-8').read(), skip_comments=True, skip_whitespace=True)
        out = []
        rules(sheet, out)
        if out:
            blocks.append(f'/* {rel} */')
            for media, css in out:
                blocks.append(f'{media}{{{css}}}' if media else css)
                count += 1
MANUAL = '''
/* Manual: KPI numbers and text on saturated fills. */
body[data-vw-theme="dark"] .mu-kpi .mu-kpi-text b{color:color-mix(in srgb,var(--mu-c) 45%,#fff)}
body[data-vw-theme="dark"] :is(.adm-avatar,.vim-ac-v2-step-number,.vim-ac-v2-side-no){color:#fff!important}
body[data-vw-theme="dark"] .au-av{background:#2c4a78;color:#fff}
body[data-vw-theme="dark"] .au-av.sys{background:#3a4a63}
/* Manual: Bootstrap form controls (node_modules CSS is not scanned). */
body[data-vw-theme="dark"] .dashboard-content :is(.form-control,.form-select,textarea,input:not([type=checkbox]):not([type=radio]):not([type=range]),select){background-color:#16253b;color:#ebf2fc;border-color:#40516a}
body[data-vw-theme="dark"] .dashboard-content :is(.form-control,textarea,input)::placeholder{color:#8ea3bf}
body[data-vw-theme="dark"] .dashboard-content .form-control:disabled,body[data-vw-theme="dark"] .dashboard-content .form-control[readonly]{background-color:#1f2f48;color:#a9bbd1}
'''
open(OUT, 'w', encoding='utf-8').write('\n'.join(blocks) + '\n' + MANUAL)
print(count, 'rules ->', OUT)
