# Verification record · 28 September 2026

The v1 implementation passed **36 numerical/API/storage tests** and **25 browser assertions**. The browser run recorded no page or console errors. This is evidence for the tested workflows, not a guarantee that every possible dataset or model is valid.

## Online edition verification

The v1.1 GitHub Pages edition passed **40 native Python tests**, **30 tests in the actual Pyodide WebAssembly runtime**, and **11 IndexedDB transport assertions**. The WebAssembly suite reruns the scientific reference tests and verifies the JSON boundary, original CSV text, ZIP project export and rejection of unsafe expressions. The IndexedDB checks cover distinct dataset IDs, persistence across client instances, immutable revisions, stale-tab rejection, and invalid saves without overwriting data.

Commands: `python -m unittest discover -s tests -v`, `node tests/web_runtime.cjs`, and `node tests/web_storage.cjs` (build `dist` and install the documented Node dependencies first). The storage regression suite uses fake-indexeddb. Live desktop Chrome checks on GitHub Pages verified initial runtime loading, the synthetic pendulum fit and uncertainty outputs, double-click title editing, measurement recalculation, persistence of measurements and graph labels after reload, and a downloaded ZIP containing project JSON, raw/processed CSV, numerical results, Markdown report and Python reproduction script. The only console error observed came from the browser extension, not the website. The redesigned mobile layout has not been checked in a physical mobile browser.

The browser runtime is Pyodide 0.28.3, Python 3.13.2, NumPy 2.2.5, SciPy 1.14.1, Pint 0.26.1 and openpyxl 3.1.5. The native package versions below are unchanged. The automated GitHub Pages build reruns all 40 native tests before publishing.

## Numerical and persistence checks

- Restricted expression syntax, degree-aware trigonometry and dimensional errors.
- Analytic first-order uncertainty, shared-source cancellation, correlation validation, unit conversion, missing data, resolution/overrides, circular formulas, linked uncertainty and uncertain constants.
- WLS against a closed-form weighted linear solution and covariance; OLS uncertainty conventions; nonlinear decay with a fixed baseline; ODR and rejected bounds; excluded points and unidentifiable X; independent theory and zero-prediction percentage deviations.
- Repeated-trial SEM, an 8 Hz signal with known FFT amplitude, derivative/integral reference results, contour interpolation, all 25 starting points (blank plus 24 physics templates) and the synthetic pendulum example.
- Immutable revisions, concurrent-write conflicts, persistence across application instances, local request guards, malformed/future-format rejection, CSV/XLSX preservation, CSV formula escaping, complete ZIP export and an executed reproduction script.

Command: `python -m unittest discover -s tests -v`.

## Browser workflow

Headless Chromium exercised the actual local Flask application at desktop and 390-pixel viewport widths. It checked overview/demo loading; independent theory; title/axis/legend double-click edits; recalculation; undo; uncertainty budgets; annotations; fit/residual/statistics views; repeated-trial preview; revisions; persistence after reload; ZIP/SVG downloads; CSV preview and units; fitting imported data; signal preview and a separate transformed dataset; narrow-screen containment; Excel-style paste; and calculated-column editing. Desktop and mobile screenshots were inspected.

Command: `node tests/browser.cjs` with the documented runtime overrides. The script creates and removes a temporary experiment database.

## Environment and limits of this verification

| Component | Tested version |
|---|---|
| Python | 3.12.14 on Linux |
| Flask | 3.1.3 |
| NumPy | 2.3.5 |
| SciPy | 1.17.0 |
| Pint | 0.26.1 |
| Plotly | 6.9.0 |
| openpyxl | 3.1.5 |

Windows/macOS launcher scripts are supplied, but were not executed natively in those operating systems. Browser Print → PDF uses the user's print dialog; a native PDF-save dialog was not automated. Hardware acquisition and other roadmap features are not implemented or represented as tested.

[Scientific assumptions](METHODS.md) remain applicable even when the software passes its tests.
