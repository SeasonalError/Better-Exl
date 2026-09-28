# Verification record · 28 September 2026

The v1 implementation passed **36 numerical/API/storage tests** and **25 browser assertions**. The browser run recorded no page or console errors. This is evidence for the tested workflows, not a guarantee that every possible dataset or model is valid.

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
