"""JSON boundary for the same scientific engine in Pyodide; no HTTP server."""

import base64
import json
from .engine import (
    analyze,
    calculate,
    validate_sheet,
    model_defaults,
    repeated,
    signal_analysis,
)
from .expressions import clean, CONSTANTS, Expression, Q, unit
from .exchange import import_table, data_csv, report, bundle, python_script


def dispatch(operation, b):
    if operation == "analyze":
        return analyze(b["sheet"])
    if operation == "validate":
        validate_sheet(b["sheet"])
        if b.get("compute"):
            calculate(b["sheet"])
        return {"valid": True}
    if operation == "symbols":
        s = b["sheet"]
        known = (
            set(CONSTANTS)
            | {"x", s["plot"]["x"]}
            | {c["key"] for c in s.get("constants", [])}
        )
        return {"names": sorted(Expression(b["expression"]).names - known)}
    if operation == "model":
        return clean(model_defaults(b["sheet"], b["model"]))
    if operation == "repeated":
        return repeated(b["sheet"], b["group"], b["target"], b.get("instrument", 0))
    if operation == "signal":
        return signal_analysis(b["sheet"], b["operation"], b.get("window", 7))
    if operation == "convert":
        q = Q(float(b["value"]), unit(b["from"])).to(unit(b["to"]))
        return {"value": q.magnitude, "unit": str(q.units)}
    if operation == "import":
        return import_table(
            base64.b64decode(b["data"]),
            b["filename"],
            int(b.get("header", 0)),
            b.get("delimiter", "auto"),
            b.get("decimalComma", False),
            b.get("tab", ""),
        )
    if operation == "export":
        p, kind = b["project"], b["kind"]
        s = next(s for s in p["sheets"] if s["id"] == b["sheetId"])
        if kind == "bundle":
            return {
                "base64": base64.b64encode(bundle(p, s).getvalue()).decode(),
                "name": "better-exl-analysis.zip",
                "type": "application/zip",
            }
        a = analyze(s)
        formats = {
            "raw": lambda: (data_csv(s, a, False), "raw-measurements.csv", "text/csv"),
            "csv": lambda: (data_csv(s, a), "calculated-data.csv", "text/csv"),
            "report": lambda: (report(p, s, a), "analysis-report.md", "text/markdown"),
            "python": lambda: (python_script(s), "reproduce.py", "text/x-python"),
            "analysis": lambda: (
                json.dumps(a, indent=2, ensure_ascii=False),
                "analysis.json",
                "application/json",
            ),
        }
        if kind not in formats:
            raise ValueError("Unknown export format.")
        text, name, content_type = formats[kind]()
        return {"text": text, "name": name, "type": content_type}
    raise ValueError("Unknown analysis operation.")


def dispatch_json(text):
    try:
        request = json.loads(text)
        return json.dumps(
            {
                "value": clean(
                    dispatch(request["operation"], request.get("payload", {}))
                )
            },
            allow_nan=False,
        )
    except Exception as error:
        return json.dumps({"error": str(error)[:600]})
