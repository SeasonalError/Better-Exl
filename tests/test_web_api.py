"""The browser JSON boundary must retain the local edition's scientific outputs."""

import base64
import io
import json
import unittest
import zipfile

from better_exl.engine import analyze
from better_exl.templates import demo
from better_exl.web_api import dispatch_json


class BrowserBoundary(unittest.TestCase):
    def request(self, operation, **payload):
        result = json.loads(
            dispatch_json(json.dumps(dict(operation=operation, payload=payload)))
        )
        self.assertNotIn("error", result, result)
        return result["value"]

    def test_analysis_matches_engine(self):
        sheet = demo()["sheets"][0]
        self.assertEqual(self.request("analyze", sheet=sheet), analyze(sheet))

    def test_import_retains_original_measurements(self):
        result = self.request(
            "import",
            filename="measurements.csv",
            data=base64.b64encode(b"time,distance\n1.20,4.50\n2.30,6.70\n").decode(),
        )
        self.assertEqual(len(result["sheet"]["rows"]), 2)
        self.assertIn("1.20", str(result["sheet"]))

    def test_zip_contains_reproducible_project(self):
        project = demo()
        result = self.request(
            "export", project=project, sheetId=project["sheets"][0]["id"], kind="bundle"
        )
        with zipfile.ZipFile(io.BytesIO(base64.b64decode(result["base64"]))) as archive:
            self.assertIn("project.json", archive.namelist())
            self.assertIn("reproduce.py", archive.namelist())
            self.assertEqual(
                json.loads(archive.read("project.json"))["sheets"], project["sheets"]
            )

    def test_unit_conversion_and_invalid_formula(self):
        self.assertAlmostEqual(
            self.request("convert", value=2.5, **{"from": "cm", "to": "m"})["value"],
            0.025,
        )
        sheet = demo()["sheets"][0]
        result = json.loads(
            dispatch_json(
                json.dumps(
                    dict(
                        operation="symbols",
                        payload=dict(sheet=sheet, expression="__import__('os')"),
                    )
                )
            )
        )
        self.assertIn("error", result)


if __name__ == "__main__":
    unittest.main()
