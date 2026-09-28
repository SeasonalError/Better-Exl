# Scientific methods

## Measurements and units

Original strings and missing entries remain in the dataset. Numeric analysis uses finite values. Invalid numeric text becomes unavailable with a diagnostic, never an invented zero. Exclusion removes a row from graphs, fits and statistics while retaining it in the project and exports.

Pint checks dimensions. A derived column may infer its unit or convert to an entered compatible unit. Changing a measured unit changes its interpretation; **Convert to new column** preserves measurements and makes a derived conversion. Trigonometric inputs support degrees or radians. Use temperature differences in kelvin for decay models.

Formulas use an AST allowlist, not Python `eval`: arithmetic, parentheses, powers and single-argument mathematical functions. Explicit multiplication is required. Dependencies and forward references are resolved; cycles are diagnosed. There is no arbitrary code, attribute access, file access or cell-address formula language.

## Standard uncertainty

Uncertainty means one sigma. Blank means unknown; zero means explicitly exact.

| Entry mode | Standard uncertainty |
|---|---|
| Absolute | Entered magnitude, in measurement units |
| Percentage | abs(value) × percent / 100 |
| Relative fraction | abs(value) × fraction |
| Digital resolution | resolution / sqrt(12), assuming uniform quantization |
| Uniform ± bound | half-width / sqrt(3) |
| Linked column | Raw values converted from that column's unit |
| Row override | Standard uncertainty in measurement units, overriding the default/link |

Negative uncertainty is invalid. Instrument specifications are not guessed; derive the relevant standard uncertainty and state the assumptions.

Derived uncertainty uses **u² = J Σ Jᵀ**. Central finite differences estimate sensitivities to original sources through the entire dependency graph. Shared dependencies are preserved: if q=2*x, the uncertainty of q-2*x cancels. Budgets list derivatives and source uncertainties. With correlations, squared contributions alone do not sum to the result because cross terms also contribute.

Perturbations scale as cbrt(machine epsilon) × max(abs(value), abs(uncertainty)), with a nonzero fallback. This is a numerical first-order approximation: near singularities, nonsmooth functions, boundaries or large relative uncertainty, use a more suitable method. Monte Carlo propagation is not included.

Custom within-row correlations may link raw columns and custom constants. Coefficients must lie in [-1,1] and form a positive semidefinite matrix. Unspecified pairs are independent. Defined scientific constants are exact; other constants use the installed SciPy dataset. g0 is conventional standard gravity, not measured local g.

Shared constants can correlate different rows. The app propagates pointwise uncertainty but does not pass a full inter-row covariance matrix into its fits. Error bars alone do not demonstrate that all systematic effects are included.

## Fitting

Equations operate in the original measurement units. Parameter names, values, units, bounds and fixed flags are explicit. Initial guesses are visible suggestions; local optimizers do not guarantee a global optimum. Fit failures clear the result and show a reason.

- **OLS:** SciPy curve_fit, trust-region reflective optimization, residual-scaled covariance (`absolute_sigma=False`). Equal weights. No χ² is reported without a specified noise scale.
- **WLS:** the same solver with positive supplied Y standard uncertainties and `absolute_sigma=True`. Objective sum(((y-f(x))/u_y)²). Covariance is not rescaled to force reduced χ² to one. Missing/zero uncertainties block the fit.
- **ODR:** SciPy ODRPACK with RealData(sx,sy). Positive X and Y standard uncertainties are required. Covariance uses unscaled cov_beta, treating supplied uncertainties as absolute. Fixed parameters are outside the free vector. Bounds are rejected. Displayed residuals are vertical differences at measured X, not orthogonal distances.

Fits assume independent rows. ODR here additionally assumes independent within-row X/Y errors. Shared sources, ignored X uncertainty, near-bound parameters and ill-conditioned covariance generate diagnostics where detectable. Bounds, parameter correlations and poor identifiability can invalidate covariance approximations.

Valid pairs must outnumber free parameters. Degrees of freedom = n − n_free. Standard parameter uncertainty = sqrt(diag(covariance)). Approximate 95% intervals use Student's t for OLS and normal 1.96 for absolute-uncertainty WLS/ODR. Bands propagate parameter covariance through the model gradient and describe the estimated **mean curve**, not future observations. They exclude uncertainty in fixed external constants.

RMSE = sqrt(mean(vertical residual²)). Descriptive R² = 1−SSE/SST, unavailable for constant Y. WLS χ² uses Y uncertainty; ODR χ² uses its weighted X/Y objective. Reduced χ² divides by degrees of freedom; the survival probability is available in exported results. These tests require appropriate noise/model assumptions. High R² does not prove a physical model.

Residual plots show raw residuals or residual/Y sigma for weighted fits. An exploratory Spearman check flags monotonic structure; it is not an overall model-validity test.

## Independent theory

Theory constants are entered independently of fitting. The app calculates predictions at measured X, a separate curve, residuals, RMSE and 100 × (observed−predicted)/predicted. Percentage deviation is unavailable at zero prediction. Constant and X uncertainty are not included in a theory band. **Use as fit model** explicitly creates a separate custom fit.

## Statistics and repeat groups

Statistics use included finite values: count, missing count, mean, median, sample SD/variance (ddof=1), SEM, quartiles, min/max and a Student-t 95% mean interval. A single observation has no sample SD or SEM. Numerical exports include an inverse-variance weighted mean/uncertainty when all uncertainties are positive and finite; this assumes independence.

Repeated trials group by exact numeric equality. SEM = sample SD/sqrt(n). The entered instrument term is treated as shared standard uncertainty: combined u = sqrt(SEM² + instrument u²), without dividing that term by sqrt(n). Individual row uncertainties are not averaged. Avoid double counting an instrumental effect already represented by repeat scatter. Single trials have no estimated SEM or combined result. Summary datasets preserve n/SD/SEM in notes; grouping-coordinate uncertainty is not estimated.

## Signals and maps

Signal tools require four finite included pairs and strictly increasing X. FFT and PSD additionally require uniform sampling to 0.1% relative tolerance. No hidden resampling repairs gaps.

| Operation | Method |
|---|---|
| FFT | Mean removed; rectangular window; one-sided amplitude 2*abs(rfft)/n, with DC/Nyquist correction |
| PSD | SciPy periodogram, Hann window, constant detrending, density scaling |
| Derivative | NumPy gradient against X, second-order edge differences |
| Integral | Cumulative trapezoidal integration, initial integral zero |
| Smoothing | Savitzky–Golay, polynomial order two, entered odd window |

Outputs are separate datasets without estimated measurement uncertainty. Smoothing introduces correlation. Peak positions are local maxima without significance or uncertainty estimates. Sampling, aliasing and leakage remain physical experimental considerations.

Contours linearly interpolate scattered measurements on a 70×70 grid inside the convex hull. Outside values are unavailable. This is not a field-equation solution or validated extrapolation. Collinear/insufficient inputs produce a diagnostic. 3D graphics can be rasterized within SVG exports.

## Reproducibility

Project JSON retains raw measurements, uncertainty conventions, formulas, constants/correlations, inclusion choices, models, plots and notes. Source snapshots retain imported tabular text. SQLite keeps immutable revisions and checks concurrent edit versions. Browser drafts can be recovered as a separate project.

Raw CSV contains entered values and uncertainty overrides; project settings are needed to interpret defaults. Processed CSV includes evaluated standard uncertainties. Spreadsheet formula markers in exported text are escaped; original content remains in JSON. XLSX formula strings are not executed.

The exported Python script embeds the selected dataset and uses this engine. Preserve the application commit and dependency versions. It is not a standalone reimplementation. The server binds to loopback; mutations require a page token. No telemetry is implemented. Public multi-user deployment needs additional authentication, authorization and resource isolation.
