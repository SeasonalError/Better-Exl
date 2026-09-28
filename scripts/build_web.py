"""Build a portable static website; the scientific engine runs in the browser."""

import argparse, json, pathlib, shutil, subprocess, sys, urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from better_exl.templates import TEMPLATES, from_template, demo
from better_exl.engine import MODELS
from better_exl.expressions import CONSTANTS
import plotly

parser = argparse.ArgumentParser()
parser.add_argument("--out", default="dist")
args = parser.parse_args()
out = pathlib.Path(args.out).resolve()
out.mkdir(parents=True, exist_ok=True)
assets = out / "assets"
assets.mkdir(exist_ok=True)
for name in ("app.js", "style.css", "design.css", "icons.js"):
    path = ROOT / "better_exl/static" / name
    if path.exists():
        shutil.copy2(path, assets / name)
shutil.copy2(
    pathlib.Path(plotly.__file__).parent / "package_data/plotly.min.js",
    assets / "plotly.min.js",
)
for name in ("client.js", "worker.js"):
    shutil.copy2(ROOT / "web" / name, assets / name)
html = (
    (ROOT / "better_exl/static/index.html")
    .read_text()
    .replace("__API_TOKEN__", "browser")
    .replace("/static/", "./assets/")
    .replace("/vendor/plotly.js", "./assets/plotly.min.js")
)
html = html.replace(
    '<script src="./assets/app.js" defer></script>',
    '<script src="./assets/client.js" defer></script>\n    <script src="./assets/app.js" defer></script>',
)
(out / "index.html").write_text(html)
(out / ".nojekyll").touch()
config = {
    "templates": TEMPLATES,
    "models": {k: v[0] for k, v in MODELS.items()},
    "constants": CONSTANTS,
    "version": "1.1.0",
    "mode": "browser",
}
(assets / "seed.json").write_text(
    json.dumps(
        {
            "config": config,
            "templates": {t["id"]: from_template(t["id"]) for t in TEMPLATES},
            "demo": demo(),
        },
        ensure_ascii=False,
    )
)
python = [
    "__init__.py",
    "engine.py",
    "expressions.py",
    "templates.py",
    "exchange.py",
    "web_api.py",
]
(assets / "python").mkdir(exist_ok=True)
for name in python:
    shutil.copy2(ROOT / "better_exl" / name, assets / "python" / name)
wheels = assets / "wheels"
wheels.mkdir(exist_ok=True)
subprocess.run(
    [
        sys.executable,
        "-m",
        "pip",
        "download",
        "--quiet",
        "--only-binary=:all:",
        "--no-deps",
        "--dest",
        str(wheels),
        "pint==0.26.1",
        "flexcache==0.3",
        "flexparser==0.4",
        "platformdirs==4.4.0",
        "typing_extensions==4.15.0",
        "openpyxl==3.1.5",
        "et_xmlfile==2.0.0",
    ],
    check=True,
)
(assets / "runtime-manifest.json").write_text(
    json.dumps(
        {
            "python": python,
            "wheels": [p.name for p in sorted(wheels.glob("*.whl"))],
            "pyodide": "0.28.3",
        }
    )
)
# Bundle a pinned variable font; no third-party font requests at runtime.
font = assets / "inter-latin.woff2"
if not font.exists():
    urllib.request.urlretrieve(
        "https://cdn.jsdelivr.net/npm/@fontsource-variable/inter@5.3.0/files/inter-latin-wght-normal.woff2",
        font,
    )
css = assets / "design.css"
css.write_text(
    "@font-face{font-family:Inter;font-style:normal;font-weight:100 900;"
    "font-display:swap;src:url(./inter-latin.woff2) format('woff2')}\n"
    + css.read_text()
)
print(f"Static website built at {out}")
