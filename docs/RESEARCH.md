# Research informing the design

This is a targeted survey of public primary sources, not an exhaustive inventory of laboratories worldwide. It shaped a common workflow: measurements → units/uncertainty → physical equations → fitting → residuals → reproducible reporting.

| Primary source | Design consequence |
|---|---|
| [NIST TN 1297: propagation of uncertainty](https://www.nist.gov/pml/nist-technical-note-1297/nist-tn-1297-appendix-law-propagation-uncertainty) | First-order sensitivities, covariance, standard uncertainty and explicit assumptions |
| [NIST TN 1297: Type A evaluation](https://www.nist.gov/pml/nist-technical-note-1297/nist-tn-1297-3-type-evaluation-standard-uncertainty) | Distinguish scatter, SD and uncertainty of a mean |
| [SciPy curve_fit](https://docs.scipy.org/doc/scipy/reference/generated/scipy.optimize.curve_fit.html) | Absolute/residual-scaled sigma, bounds, covariance and nonlinear fit caveats |
| [SciPy ODR](https://docs.scipy.org/doc/scipy/reference/odr.html) | A separate path for uncertainty in both axes |
| [Pint NumPy integration](https://pint.readthedocs.io/en/stable/user/numpy.html) | Unit-aware arrays and dimensional checks |
| [SciPy periodogram](https://docs.scipy.org/doc/scipy/reference/generated/scipy.signal.periodogram.html) | Explicit spectral normalization, window and sampling assumptions |
| [Plotly configuration](https://plotly.com/javascript/configuration-options/) | Interactive figures and local export; application-owned persisted text edits |
| [LabPlot features](https://labplot.org/pages/features/) | Join tabular data, transformations, fitting and scientific figures in one workspace |
| [Vernier calculated columns and custom fits](https://www.vernier.com/video/calculated-columns-and-custom-curve-fits-in-vernier-graphical-analysis-pro/) | Make physical equations and derived columns accessible to students |
| [MIT Junior Lab experiments](https://ocw.mit.edu/courses/8-13-14-experimental-physics-i-ii-junior-lab-fall-2016-spring-2017/pages/experiments/) | Support several experiment families and keep apparatus/assumptions alongside analysis |
| [LUMS introductory PhysLab](https://physlab.org/lab-i-phy-100200/) and [Hall effect](https://physlab.org/experiment/observing-hall-effect-in-semiconductors/) | Measurement-specific column layouts, calibration, offset reversal and slope-to-constant interpretation |

## Covered input patterns

| Family | Measurements | Analysis path |
|---|---|---|
| Pendulum | Length, time for N swings, N | T and T², uncertainty, slope and independent g prediction |
| Kinematics | Time, position | Quadratic fit; acceleration interpretation |
| Mechanics | Mass/extension, masses/velocities | Force/momentum formulas, calibration and conservation |
| Oscillations | Time/displacement | Sine/damped fit, FFT and residuals |
| Circuits | Current/voltage or time/response | Linear, diode/custom, exponential and offset models |
| Filters/resonance | Frequency and input/output amplitudes | Gain, low/high-pass or circuit-specific response |
| Optics | Angle/intensity, screen geometry, object/image distances | Trigonometry, transformations and theory |
| Spectra | Wavelength/energy coordinate, detector counts | Gaussian/Lorentzian with baseline; low-count limits stated |
| Waves | Distance/time, mode/frequency | Propagation slopes and boundary-condition assumptions |
| Fields | B/Hall voltage or x/y/potential | Slopes and measured-point contour maps |
| Photoelectric | Frequency/stopping potential | Linear relation, offset and sign conventions |
| Thermal/decay | Time/temperature difference or count rate | Exponential time constants and background |

The 24 physics templates are original editable scaffolds, not copied institutional protocols or substitutes for lab instructions. A few composable primitives—columns, units, equations, uncertainty sources, models and exports—cover more use cases honestly than hundreds of named but incomplete tools.

Monte Carlo uncertainty, full-covariance inference, Poisson likelihood, acquisition and video tracking need their own validation before being advertised. See [METHODS.md](METHODS.md) for actual behavior and [ROADMAP.md](ROADMAP.md) for extensions.
