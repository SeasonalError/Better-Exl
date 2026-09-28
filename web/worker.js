/* Scientific Python runs in a dedicated worker; measurements never leave it. */
"use strict";
const RUNTIME = "https://cdn.jsdelivr.net/pyodide/v0.28.3/full/";
const revision = new URL(self.location.href).searchParams.get("v");
const asset = (name) => {
  const url = new URL(name, self.location.href);
  if (revision) url.searchParams.set("v", revision);
  return url;
};
let python;
let ready;
let queue = Promise.resolve();
const progress = (message, percent) =>
  self.postMessage({ type: "progress", message, percent });
async function boot() {
  progress("Preparing your analysis tools", 12);
  importScripts(RUNTIME + "pyodide.js");
  python = await loadPyodide({
    indexURL: RUNTIME,
    stdout: () => {},
    stderr: () => {},
  });
  progress("Loading numerical methods", 35);
  await python.loadPackage(["numpy", "scipy", "micropip"]);
  progress("Connecting units and file import", 70);
  const manifest = await (await fetch(asset("./runtime-manifest.json"))).json();
  const wheels = manifest.wheels.map(
    (file) => new URL("./wheels/" + file, self.location.href).href,
  );
  python.globals.set("_wheels_json", JSON.stringify(wheels));
  await python.runPythonAsync(
    "import json, micropip\nawait micropip.install(json.loads(_wheels_json), deps=False)",
  );
  python.FS.mkdirTree("/app/better_exl");
  await Promise.all(
    manifest.python.map(async (file) => {
      const response = await fetch(asset("./python/" + file));
      if (!response.ok)
        throw Error("Could not load the analysis engine. Please reload.");
      python.FS.writeFile("/app/better_exl/" + file, await response.text());
    }),
  );
  await python.runPythonAsync(
    'import sys\nsys.path.insert(0,"/app")\nfrom better_exl.web_api import dispatch_json',
  );
  progress("Analysis tools ready", 100);
  return python;
}
self.onmessage = (event) => {
  const { id, operation, payload } = event.data;
  queue = queue.then(async () => {
    try {
      ready ??= boot();
      await ready;
      if (operation === "ready") {
        self.postMessage({ id, result: true });
        return;
      }
      python.globals.set(
        "_request_json",
        JSON.stringify({ operation, payload }),
      );
      const result = JSON.parse(
        python.runPython("dispatch_json(_request_json)"),
      );
      if (result.error) throw Error(result.error);
      self.postMessage({ id, result: result.value });
    } catch (error) {
      self.postMessage({ id, error: String(error.message || error) });
    }
  });
};
