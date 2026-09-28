# Better Exl

**Your measurements, uncertainty, models and graphs — together in one local lab workspace.**

A Python-powered website for physics students: enter or import measurements, define units and equations, inspect uncertainty, fit models, compare independent predictions and export reproducible results. No account, API key or cloud service required.

## Run on your computer

1. Install **Python 3.11 or newer**. On Windows, include the Python launcher (`py`).
2. Download this repository with **Code → Download ZIP**, then extract it, or clone it with Git.
3. **Windows:** double-click `start.bat`. **macOS / Linux:** open a terminal in the extracted folder and run `bash start.sh`.
4. Open **http://127.0.0.1:8765** if your browser does not open automatically. Keep the terminal running while you work.

The first start installs dependencies in a virtual environment. Later starts work offline. Linux may need the distribution's `python3-venv` package. If the port is busy, use `bash start.sh --port 8767` or `start.bat --port 8767`.

Manual setup:

```bash
python -m venv .venv
# Windows: .venv\Scripts\activate
# macOS / Linux:
source .venv/bin/activate
python -m pip install -r requirements.txt
python run.py
```

Use `python run.py --no-browser` for a headless session or `--data-dir /path/to/data` for another storage location. This app requires its Python backend; GitHub Pages alone cannot run it.

## Included in v1

| Workflow | Features |
|---|---|
| Collect | Multiple experiments/datasets, spreadsheet editing, rectangular paste/copy, search, row inclusion and notes, undo/redo |
| Save | SQLite autosave, immutable revisions, conflict protection, recovery of interrupted browser drafts, JSON project backup/import |
| Import | CSV, TSV, TXT, XLSX; preview, header row, delimiter, decimal comma and worksheet selection; original text retained |
| Calculate | Named formulas, dimensional checks/conversion, scientific/custom constants, uncertainty columns, first-order propagation with shared dependencies, within-row correlations, inspectable budgets |
| Plot | Scatter/line with X/Y error bars, histogram, box, contour, 3D scatter, extra series, log axes, limits and figure styles |
| Edit | Double-click titles, axis labels, legend names and annotations; customize colours, markers and line widths |
| Fit | Linear, polynomial, exponential, oscillation, peak, filter, resonance and custom models; OLS, WLS and ODR; guesses, fixed parameters and least-squares bounds |
| Interpret | Parameter uncertainty, covariance/correlation, approximate 95% mean-curve bands, residuals, RMSE, descriptive R², χ² and diagnostics |
| Predict | Independent theory equation/constant entry; overlay, predicted values, residuals and percentage deviations |
| Explore | Descriptive statistics, repeat grouping with SD/SEM, FFT, power spectral density, derivative, integral and smoothing |
| Export | Project JSON, raw/processed CSV, numerical JSON, report Markdown, Python reproduction script, ZIP bundle, PNG/SVG and browser Print → PDF |
| Record | Experiment objective/apparatus, dataset assumptions, timestamped observations and analysis history |

## First experiment

Click **Explore the example** to open labelled synthetic pendulum measurements. Raw timings produce `T=t/N` and `T2=T^2`, propagated uncertainty, a weighted line fit and a separate theoretical curve.

For your own work:

1. Choose **New experiment**, an experiment template or **Import data**. The 24 physics templates start with empty measurements.
2. Click a column heading to define its name, symbol, unit and uncertainty. Blank uncertainty means unknown; zero means exact. The smaller ± cell accepts a row-specific standard uncertainty.
3. Add calculated columns such as `2*distance/time^2`. Use explicit multiplication, column symbols and compatible units (`m/s^2`, `degree`, `mA`, etc.).
4. Choose X/Y and open **Fit & theory**. Check guesses, parameter units and method before running. For custom equations, choose **Identify parameters**, then edit guesses and units.
5. Inspect residuals and scientific checks. Record assumptions in **Notebook**, then export a project backup or full analysis bundle.

Tab moves between cells; Enter or ↑/↓ moves through rows. Paste a range from Excel. Shift-click extends a selection; **Copy range** copies it. Ctrl/Cmd+S saves. Project undo/redo is available in the toolbar and via Ctrl/Cmd+Z / Shift+Z when focus is outside a text input; inputs retain normal browser text undo.

## Storage and backups

Projects save to **`~/.better-exl/experiments.sqlite3`** (your user profile on Windows), outside the source folder. Closing or updating the app does not delete them. Every autosave creates an immutable revision. Notebook → Revision history restores a separate experiment, preserving the current one. Conflicting edits from another tab are rejected rather than overwritten.

Export **Project backup** regularly and import that JSON on another computer. The ZIP includes the whole project plus the selected dataset’s numerical outputs, report and reproduction script. CSV does not preserve formulas, modes or settings. Revisions are never automatically deleted, so the database can grow. Stop the server before copying the data directory as a full backup.

## Scientific scope

This is a connected, usable v1 core, not every possible research analysis. Read [METHODS.md](docs/METHODS.md), the source survey in [RESEARCH.md](docs/RESEARCH.md), and [ROADMAP.md](docs/ROADMAP.md).

- Propagation is first order; Monte Carlo and general nonlinear uncertainty methods are not implemented.
- Fits assume independent rows. Shared calibration sources can correlate rows; full cross-row covariance and correlated X/Y fitting are not supported. ODR has no bounds here.
- Theory overlays condition on entered constants without a theory uncertainty band. Fit bands are local mean-curve confidence intervals, not prediction intervals.
- Signal transformations and contour interpolation do not estimate measurement uncertainty. Low-count Poisson fitting, arbitrary Python execution, instrument acquisition and video tracking are future work.
- Limit: 20,000 rows, 40 columns per dataset and 30 datasets per experiment. Tables show 100 rows per page; analysis uses the full included dataset. Formula-heavy projects can be slow.

## Development and verification

Python: Flask, NumPy, SciPy, Pint, Plotly and openpyxl. Browser: plain JavaScript and locally served Plotly. SQLite is included in Python. No frontend build step or CDN.

```bash
# In the activated virtual environment:
python -m unittest discover -s tests -v
```

Optional browser suite:

```bash
npm install --no-save playwright
npx playwright install chromium
node tests/browser.cjs
```

`CHROMIUM_PATH` can select an existing browser and `BETTER_EXL_PYTHON` another Python executable. Tests use temporary storage; screenshots go to ignored `artifacts/`.

To rerun an exported `reproduce.py`, activate this repository’s environment, **keep the repository root as the current directory**, and run `python /path/to/reproduce.py`. It writes `reproduced-analysis.json` and `reproduced-data.csv`. Preserve the app commit and dependency versions with a submitted report for long-term reproducibility.

Code: `expressions.py` handles units/arithmetic, `engine.py` scientific methods, `storage.py` revisions, `exchange.py` import/export, `templates.py` starting points, `app.py` the local API and `static/` the interface.

[MIT license](LICENSE). Dependencies retain their own licenses.
