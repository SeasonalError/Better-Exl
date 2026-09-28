/* Run the actual browser Python build in WebAssembly, without a browser UI.
 * Build dist first. npm install --no-save pyodide@0.28.3
 * Optional PYODIDE_NODE_ROOT points to an installed pyodide directory.
 */
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const packageRoot = process.env.PYODIDE_NODE_ROOT || path.dirname(require.resolve('pyodide/package.json'));
const { loadPyodide } = require(packageRoot);
(async () => {
  const py = await loadPyodide({ indexURL: packageRoot + '/' });
  await py.loadPackage(['numpy', 'scipy', 'micropip']);
  py.FS.mkdirTree('/app/better_exl');
  py.FS.mkdirTree('/tests');
  py.FS.mkdirTree('/wheels');
  const assets = path.join(root, 'dist/assets');
  const manifest = JSON.parse(fs.readFileSync(path.join(assets, 'runtime-manifest.json')));
  for (const name of manifest.python) py.FS.writeFile('/app/better_exl/' + name, fs.readFileSync(path.join(assets, 'python', name)));
  for (const name of manifest.wheels) py.FS.writeFile('/wheels/' + name, fs.readFileSync(path.join(assets, 'wheels', name)));
  for (const name of ['test_science.py', 'test_web_api.py']) py.FS.writeFile('/tests/' + name, fs.readFileSync(path.join(root, 'tests', name)));
  py.globals.set('_wheels_json', JSON.stringify(manifest.wheels.map(n => 'emfs:/wheels/' + n)));
  await py.runPythonAsync(`import json, micropip, sys
await micropip.install(json.loads(_wheels_json), deps=False)
sys.path.insert(0, '/app')
import numpy, scipy
print('WebAssembly:', sys.version.split()[0], 'NumPy', numpy.__version__, 'SciPy', scipy.__version__)
import unittest
result = unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.discover('/tests'))
if not result.wasSuccessful(): raise RuntimeError('Browser scientific validation failed')
`);
})().catch(error => { console.error(error); process.exitCode = 1; });
