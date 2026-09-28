"""Loopback-only app. No CDN, cloud account or secret data in source control."""

import io, json, os, secrets
from pathlib import Path
from flask import Flask, request, jsonify, send_file, make_response
from werkzeug.exceptions import HTTPException
import plotly
from .storage import Store, Conflict
from .templates import TEMPLATES, from_template, demo
from .engine import (
    analyze,
    calculate,
    validate_sheet,
    model_defaults,
    repeated,
    signal_analysis,
    MODELS,
)
from .expressions import clean, CONSTANTS, Expression, unit, Q
from .exchange import import_table, data_csv, report, bundle, python_script


def create_app(data_dir=None):
    app = Flask(__name__, static_folder="static")
    app.config["MAX_CONTENT_LENGTH"] = 24 * 1024 * 1024
    store = Store(
        Path(data_dir or os.environ.get("BETTER_EXL_DATA", Path.home() / ".better-exl"))
        / "experiments.sqlite3"
    )
    app.extensions["store"] = store
    token = secrets.token_urlsafe(32)
    app.config["API_TOKEN"] = token

    @app.before_request
    def guard():
        if request.host.split(":")[0] not in ("localhost", "127.0.0.1"):
            return jsonify(error="Open Better Exl using localhost or 127.0.0.1."), 403
        if (
            request.path.startswith("/api/")
            and request.method not in ("GET", "HEAD")
            and request.headers.get("X-Better-Exl") != token
        ):
            return jsonify(error="Refresh the application before making changes."), 403

    @app.after_request
    def headers(r):
        r.headers["X-Content-Type-Options"] = "nosniff"
        r.headers["X-Frame-Options"] = "DENY"
        r.headers["Referrer-Policy"] = "no-referrer"
        if request.path == "/" or request.path.startswith("/api/"):
            r.headers["Cache-Control"] = "no-store"
        return r

    @app.errorhandler(Exception)
    def error(e):
        return jsonify(error=str(e)[:600]), (
            e.code
            if isinstance(e, HTTPException)
            else (
                409
                if isinstance(e, Conflict)
                else 404 if isinstance(e, KeyError) else 400
            )
        )

    @app.get("/")
    def home():
        return make_response(
            (Path(app.static_folder) / "index.html")
            .read_text()
            .replace("__API_TOKEN__", token)
        )

    @app.get("/vendor/plotly.js")
    def js():
        return send_file(
            Path(plotly.__file__).parent / "package_data" / "plotly.min.js",
            mimetype="text/javascript",
            max_age=86400,
        )

    @app.get("/api/config")
    def config():
        return jsonify(
            templates=TEMPLATES,
            models={k: v[0] for k, v in MODELS.items()},
            constants=CONSTANTS,
            version="1.0.0",
        )

    @app.get("/api/projects")
    def projects():
        return jsonify(store.list())

    @app.post("/api/projects")
    def new():
        b = request.get_json()
        p = (
            demo()
            if b.get("demo")
            else (
                b["project"]
                if b.get("project")
                else dict(
                    name=b.get("name", "Untitled experiment"),
                    objective="",
                    apparatus="",
                    notes="",
                    sheets=[from_template(b.get("template", "blank"))],
                    log=[],
                )
            )
        )
        return jsonify(store.create(p)), 201

    @app.get("/api/projects/<id>")
    def get(id):
        return jsonify(store.get(id))

    @app.put("/api/projects/<id>")
    def save(id):
        p = request.get_json()
        if p.get("id") != id:
            raise ValueError("Project ID does not match.")
        return jsonify(store.save(p))

    @app.get("/api/projects/<id>/revisions")
    def revisions(id):
        return jsonify(store.revisions(id))

    @app.get("/api/projects/<id>/revisions/<int:version>")
    def revision(id, version):
        return jsonify(store.get(id, version))

    @app.post("/api/analyze")
    def analysis():
        return jsonify(analyze(request.get_json()["sheet"]))

    @app.post("/api/validate")
    def validate():
        b = request.get_json()
        validate_sheet(b["sheet"])
        if b.get("compute"):
            calculate(b["sheet"])
        return jsonify(valid=True)

    @app.post("/api/symbols")
    def symbols():
        b = request.get_json()
        s = b["sheet"]
        known = (
            set(CONSTANTS)
            | {"x", s["plot"]["x"]}
            | {c["key"] for c in s.get("constants", [])}
        )
        return jsonify(names=sorted(Expression(b["expression"]).names - known))

    @app.post("/api/model")
    def model():
        b = request.get_json()
        return jsonify(clean(model_defaults(b["sheet"], b["model"])))

    @app.post("/api/repeated")
    def repeats():
        b = request.get_json()
        return jsonify(
            repeated(b["sheet"], b["group"], b["target"], b.get("instrument", 0))
        )

    @app.post("/api/signal")
    def transform():
        b = request.get_json()
        return jsonify(signal_analysis(b["sheet"], b["operation"], b.get("window", 7)))

    @app.post("/api/template")
    def template():
        return jsonify(from_template(request.get_json()["id"]))

    @app.post("/api/convert")
    def convert():
        b = request.get_json()
        q = Q(float(b["value"]), unit(b["from"])).to(unit(b["to"]))
        return jsonify(value=q.magnitude, unit=str(q.units))

    @app.post("/api/import")
    def load():
        f = request.files.get("file")
        if not f:
            raise ValueError("Choose a CSV, TSV, TXT or XLSX file.")
        return jsonify(
            import_table(
                f.read(),
                f.filename,
                int(request.form.get("header", 0)),
                request.form.get("delimiter", "auto"),
                request.form.get("decimalComma") == "true",
                request.form.get("tab", ""),
            )
        )

    @app.post("/api/export")
    def export():
        b = request.get_json()
        p = b["project"]
        s = next(s for s in p["sheets"] if s["id"] == b["sheetId"])
        kind = b["kind"]
        if kind == "bundle":
            return send_file(
                bundle(p, s),
                as_attachment=True,
                download_name="better-exl-analysis.zip",
            )
        a = analyze(s)
        if kind in ("raw", "csv"):
            text = data_csv(s, a, kind == "csv")
            name = kind + ".csv"
        elif kind == "report":
            text = report(p, s, a)
            name = "analysis-report.md"
        elif kind == "python":
            text = python_script(s)
            name = "reproduce.py"
        elif kind == "analysis":
            text = json.dumps(a, indent=2, ensure_ascii=False)
            name = "analysis.json"
        else:
            raise ValueError("Unknown export format.")
        return send_file(
            io.BytesIO(text.encode()),
            as_attachment=True,
            download_name=name,
            mimetype="text/plain",
        )

    return app
