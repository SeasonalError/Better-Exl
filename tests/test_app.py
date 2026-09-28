import copy, io, json, tempfile, unittest, zipfile, subprocess, sys
from pathlib import Path
from better_exl.app import create_app
from better_exl.storage import Store, Conflict
from better_exl.templates import demo
from better_exl.exchange import import_table, safe_cell, python_script


class Application(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.app = create_app(self.tmp.name)
        self.client = self.app.test_client()
        self.headers = {"X-Better-Exl": self.app.config["API_TOKEN"]}

    def tearDown(self):
        self.tmp.cleanup()

    def post(self, url, data):
        return self.client.post(url, json=data, headers=self.headers)

    def test_immutable_revisions_and_conflict(self):
        p = self.post("/api/projects", {"demo": True}).json
        old = copy.deepcopy(p)
        p["name"] = "Changed"
        r = self.client.put("/api/projects/" + p["id"], json=p, headers=self.headers)
        self.assertEqual(r.status_code, 200)
        self.assertEqual(
            self.client.get("/api/projects/" + p["id"] + "/revisions/1").json["name"],
            old["name"],
        )
        self.assertEqual(
            self.client.put(
                "/api/projects/" + p["id"], json=old, headers=self.headers
            ).status_code,
            409,
        )

    def test_survives_new_app(self):
        p = self.post("/api/projects", {"demo": True}).json
        app2 = create_app(self.tmp.name)
        self.assertEqual(app2.test_client().get("/api/projects/" + p["id"]).json, p)

    def test_request_guard(self):
        self.assertEqual(
            self.client.post("/api/projects", json={"demo": True}).status_code, 403
        )
        self.assertEqual(
            self.client.get(
                "/api/config", headers={"Host": "evil.example"}
            ).status_code,
            403,
        )
        self.assertEqual(self.client.get("/").status_code, 200)

    def test_import_preserves_missing_and_bad(self):
        s = import_table(b"Time [s],Voltage [V]\n0,2\n1,\n2,oops\n", "lab.csv")["sheet"]
        self.assertEqual(s["columns"][0]["unit"], "s")
        self.assertEqual(s["rows"][2]["values"]["Voltage"], "oops")
        self.assertEqual(s["importSnapshot"]["rows"][1], ["1", ""])

    def test_bundle_and_reproduction(self):
        p = self.post("/api/projects", {"demo": True}).json
        s = p["sheets"][0]
        r = self.post("/api/export", dict(project=p, sheetId=s["id"], kind="bundle"))
        self.assertEqual(r.status_code, 200)
        with zipfile.ZipFile(io.BytesIO(r.data)) as z:
            self.assertEqual(len(z.namelist()), 7)
            self.assertEqual(json.loads(z.read("project.json")), p)
            self.assertIn("T2", json.loads(z.read("analysis.json"))["values"])
        target = Path(self.tmp.name) / "reproduce.py"
        target.write_text(python_script(s))
        r = subprocess.run(
            [sys.executable, str(target)],
            cwd=Path(__file__).resolve().parents[1],
            capture_output=True,
            text=True,
        )
        self.assertEqual(r.returncode, 0, r.stderr)
        for name in ["reproduced-analysis.json", "reproduced-data.csv"]:
            Path(name).unlink(missing_ok=True)

    def test_csv_injection(self):
        self.assertEqual(safe_cell("=cmd()"), "'=cmd()")
        self.assertEqual(safe_cell("-1.2e-4"), "-1.2e-4")
        self.assertTrue(safe_cell("@SUM(1)").startswith("'"))

    def test_symbols(self):
        s = demo()["sheets"][0]
        r = self.post("/api/symbols", dict(sheet=s, expression="4*pi^2*x/g"))
        self.assertEqual(r.json["names"], ["g"])
        self.assertEqual(
            self.post(
                "/api/symbols", dict(sheet=s, expression="x.__class__")
            ).status_code,
            400,
        )

    def test_reject_malformed_and_future_project(self):
        self.assertEqual(
            self.post(
                "/api/projects", {"project": {"name": "bad", "sheets": []}}
            ).status_code,
            400,
        )
        p = demo()
        p["formatVersion"] = 999
        self.assertEqual(self.post("/api/projects", {"project": p}).status_code, 400)

    def test_import_endpoint_shape(self):
        r = self.client.post(
            "/api/import",
            data={"file": (io.BytesIO(b"x,y\n1,2\n"), "data.csv")},
            headers=self.headers,
        )
        self.assertEqual(r.status_code, 200)
        self.assertEqual(len(r.json["sheet"]["rows"]), 1)

    def test_xlsx_formulas_remain_text(self):
        import openpyxl

        wb = openpyxl.Workbook()
        ws = wb.active
        ws.append(["Time [s]", "Voltage [V]"])
        ws.append([1, "=2+2"])
        buf = io.BytesIO()
        wb.save(buf)
        s = import_table(buf.getvalue(), "data.xlsx")["sheet"]
        self.assertEqual(s["rows"][0]["values"]["Voltage"], "=2+2")


if __name__ == "__main__":
    unittest.main()
