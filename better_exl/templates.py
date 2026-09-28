"""Editable experiment starting points; only the labelled demo has synthetic data."""

import copy
import math
import uuid


def uid():
    return uuid.uuid4().hex


def col(key, name, unit="", formula="", uncertainty=""):
    return dict(
        key=key,
        name=name,
        unit=unit,
        formula=formula,
        uncertainty=uncertainty,
        uncertaintyMode="absolute",
        description="",
        role="calculated" if formula else "measurement",
    )


def blank_sheet(name="Measurements", columns=None):
    columns = columns or [col("x", "X"), col("y", "Y")]
    return dict(
        id=uid(),
        name=name,
        columns=copy.deepcopy(columns),
        rows=[],
        constants=[],
        correlations=[],
        notes="",
        source="Manual measurements",
        plot=dict(
            x=columns[0]["key"],
            y=columns[-1]["key"],
            kind="scatter",
            title="",
            xLabel="",
            yLabel="",
            xScale="linear",
            yScale="linear",
            color="#3468e8",
            markerSize=7,
            lineWidth=2,
            grid=True,
            errorBars=True,
            band=True,
            preset="report",
            annotations=[],
            overlay=[],
        ),
        fit=dict(
            enabled=False, model="linear", expression="a*x+b", params=[], method="ols"
        ),
        theory=dict(enabled=False, expression="", params=[]),
    )


TEMPLATES = []


def add(id, name, category, description, columns, model, notes, **plot):
    TEMPLATES.append(
        dict(
            id=id,
            name=name,
            category=category,
            description=description,
            columns=columns,
            model=model,
            notes=notes,
            **plot,
        )
    )


add(
    "blank",
    "Blank experiment",
    "General",
    "Your own measurements and equations.",
    [col("x", "X"), col("y", "Y")],
    "linear",
    "Add units and standard uncertainties before weighted fitting.",
)
add(
    "pendulum",
    "Simple pendulum",
    "Mechanics",
    "Time many swings and estimate g from T² versus length.",
    [
        col("L", "Length", "m"),
        col("t", "Total time", "s"),
        col("N", "Swing count", "", "", 0),
        col("T", "Period", "s", "t/N"),
        col("T2", "Period squared", "s^2", "T^2"),
    ],
    "linear",
    "Small-angle model: T² = 4π²L/g. Measure length to the bob centre. N is an exact count; from slope a, g = 4π²/a. An intercept can reveal a length offset.",
)
add(
    "freefall",
    "Free fall & air track",
    "Mechanics",
    "Position and time with a quadratic model.",
    [col("t", "Time", "s"), col("z", "Position", "m")],
    "quadratic",
    "z = z₀ + v₀t + at²/2. Acceleration is twice the quadratic coefficient. Record the sign convention, perspective and drag assumptions.",
)
add(
    "hooke",
    "Spring constant",
    "Mechanics",
    "Mass, extension and force with propagated uncertainty.",
    [
        col("extension", "Extension", "m"),
        col("mass", "Mass", "kg"),
        col("force", "Force", "N", "mass*g0"),
    ],
    "linear",
    "F = k Δx in the elastic regime. g0 is conventional standard gravity, not a local measurement. Include an intercept to investigate preload.",
)
add(
    "rotation",
    "Rotational dynamics",
    "Mechanics",
    "Hanging mass and axle acceleration.",
    [col("mass", "Hanging mass", "kg"), col("acceleration", "Acceleration", "m/s^2")],
    "linear",
    "Exact ideal model: a = (m g r² − τ_f r)/(I + m r²). A linear a–m approximation needs m r² ≪ I and constant friction torque.",
)
add(
    "oscillation",
    "Damped oscillations",
    "Mechanics",
    "Displacement traces, frequency and damping.",
    [col("t", "Time", "s"), col("displacement", "Displacement", "m")],
    "damped",
    "x(t) = A exp(−t/τ) cos(2πft + φ) + b. Choose an informative initial frequency. Damped and undamped frequencies differ.",
)
add(
    "collision",
    "Momentum & collisions",
    "Mechanics",
    "Compare initial and final momentum.",
    [
        col("m1", "Mass 1", "kg"),
        col("m2", "Mass 2", "kg"),
        col("u1", "Initial velocity 1", "m/s"),
        col("u2", "Initial velocity 2", "m/s"),
        col("v1", "Final velocity 1", "m/s"),
        col("v2", "Final velocity 2", "m/s"),
        col("p_before", "Initial momentum", "kg*m/s", "m1*u1+m2*u2"),
        col("p_after", "Final momentum", "kg*m/s", "m1*v1+m2*v2"),
    ],
    "linear",
    "An isolated system conserves total momentum. Shared mass measurements correlate both axes; diagonal-error fits do not model this covariance.",
    x="p_before",
)
add(
    "ohm",
    "Ohm’s law",
    "Electronics",
    "Voltage and current to estimate resistance.",
    [col("current", "Current", "A"), col("voltage", "Voltage", "V")],
    "linear",
    "V = RI + offset. Slope is resistance. Self-heating can change R; record drift and inspect residuals.",
)
add(
    "rc",
    "RC discharge",
    "Electronics",
    "A voltage decay and its time constant.",
    [col("t", "Time", "s"), col("voltage", "Capacitor voltage", "V")],
    "decay",
    "V = A exp(−t/τ) + b, with τ = RC ideally. Instrument loading can alter effective resistance.",
)
add(
    "charge",
    "RC / RL rise",
    "Electronics",
    "An exponential approach to equilibrium.",
    [col("t", "Time", "s"), col("response", "Response", "V")],
    "charge",
    "Response = A[1−exp(−t/τ)]+b. RC: τ=RC. RL current: τ=L/R. Adjust response units to match what you measure.",
)
for id, title in [("lowpass", "Low-pass filter"), ("highpass", "High-pass filter")]:
    add(
        id,
        title,
        "Electronics",
        "Calculate gain from measured input and output amplitudes.",
        [
            col("frequency", "Frequency", "Hz"),
            col("vin", "Input RMS voltage", "V"),
            col("vout", "Output RMS voltage", "V"),
            col("gain", "Voltage gain", "", "vout/vin"),
        ],
        id,
        "Ideal RC cutoff fc = 1/(2πRC). Use matching RMS or peak measures for both channels. Amplitude ratios are distinct from phase shifts.",
    )
add(
    "resonance",
    "RLC resonance",
    "Electronics",
    "Frequency response and quality factor.",
    [col("frequency", "Frequency", "Hz"), col("amplitude", "Amplitude", "V")],
    "resonance",
    "The suggested model is a driven-oscillator displacement response, appropriate to some capacitor-voltage transfer functions. Current/resistor-voltage responses use a different numerator. Match the model to your circuit.",
)
add(
    "diode",
    "Diode characteristics",
    "Electronics",
    "I–V measurements and a custom physical model.",
    [col("voltage", "Voltage", "V"), col("current", "Current", "A")],
    "custom",
    "Ideal example: I0*(exp(x/Vt)-1), with I0 in A and Vt in V. Series resistance and heating limit the ideal model. Supply guesses and bounds.",
)
add(
    "malus",
    "Malus law",
    "Optics",
    "Polarizer angle versus transmitted intensity.",
    [
        col("angle", "Polarizer angle", "degree"),
        col("intensity", "Detector voltage", "V"),
    ],
    "malus",
    "I = A cos²(θ−φ)+b. Trigonometric functions convert degrees to radians. A background parameter can represent ambient light.",
)
add(
    "diffraction",
    "Diffraction grating",
    "Optics",
    "Use screen geometry to estimate sin θ.",
    [
        col("order", "Diffraction order", "", "", 0),
        col("position", "Screen displacement", "m"),
        col("distance", "Screen distance", "m"),
        col("sin_theta", "Sine of angle", "", "position/sqrt(position^2+distance^2)"),
    ],
    "linear",
    "Normal incidence: d sin θ = n λ. Slope of sin θ vs order is λ/d. A shared screen distance creates cross-row covariance that diagonal fitting does not model.",
)
add(
    "lens",
    "Thin lens",
    "Optics",
    "Linearize object and image distances.",
    [
        col("object_distance", "Object distance", "m"),
        col("image_distance", "Image distance", "m"),
        col("inv_object", "Inverse object distance", "1/m", "1/object_distance"),
        col("inv_image", "Inverse image distance", "1/m", "1/image_distance"),
    ],
    "linear",
    "Positive real-distance convention: 1/v = −1/u + 1/f. Slope −1; intercept 1/f. State your sign convention and thin-lens assumption.",
    x="inv_object",
)
add(
    "spectrum",
    "Spectral peak",
    "Optics",
    "Fit a single Gaussian or Lorentzian peak.",
    [col("wavelength", "Wavelength", "nm"), col("counts", "Counts")],
    "gaussian",
    "Gaussian FWHM = 2√(2 ln 2)σ; area above baseline = Aσ√(2π). Width σ is not measurement uncertainty. Low counts need a Poisson-likelihood treatment beyond v1.",
)
add(
    "sound",
    "Speed of sound",
    "Waves",
    "Travel time versus path length.",
    [col("distance", "Path length", "m"), col("time", "Travel time", "s")],
    "linear",
    "t = d/c + offset. Speed is reciprocal slope. Echo path length is twice one-way separation; record temperature.",
)
add(
    "standing",
    "Standing waves",
    "Waves",
    "Frequency versus mode number.",
    [col("mode", "Mode number", "", "", 0), col("frequency", "Frequency", "Hz")],
    "linear",
    "For a string fixed at both ends: f_n = n v/(2L). Other end conditions change the relation.",
)
add(
    "hall",
    "Hall effect",
    "Fields",
    "Hall voltage against magnetic field.",
    [col("field", "Magnetic field", "T"), col("voltage", "Hall voltage", "V")],
    "linear",
    "Simple single-carrier model: V_H=R_H I B/t. Reverse field/current to investigate offsets. Multicarrier materials require a richer model.",
)
add(
    "equipotential",
    "Equipotential mapping",
    "Fields",
    "Position and potential with interpolated contours.",
    [
        col("pos_x", "X position", "cm"),
        col("pos_y", "Y position", "cm"),
        col("potential", "Potential", "V"),
    ],
    "linear",
    "Measure x, y and V. Contours interpolate only inside the data convex hull; they are not a solved boundary-value problem. Record electrode geometry and supply voltage.",
    x="pos_x",
    y="pos_y",
    z="potential",
    kind="contour",
)
add(
    "photoelectric",
    "Photoelectric effect",
    "Modern physics",
    "Stopping potential versus frequency.",
    [
        col("frequency", "Light frequency", "Hz"),
        col("stopping", "Stopping voltage", "V"),
    ],
    "linear",
    "Ideal model: V_s=(h/e)f−Φ/e. State the stopping-potential sign convention. Contact potentials and spectral width affect interpretation.",
)
add(
    "cooling",
    "Newton’s cooling",
    "Thermal",
    "Temperature difference versus time.",
    [col("t", "Time", "s"), col("delta_T", "Temperature above ambient", "K")],
    "decay",
    "ΔT=A exp(−t/τ)+b for approximately constant ambient conditions. Use temperature differences in K, not absolute Celsius in the model.",
)
add(
    "decay",
    "Radioactive count rate",
    "Modern physics",
    "A decay and constant background.",
    [col("t", "Time", "s"), col("rate", "Count rate", "1/s")],
    "decay",
    "Rate=A exp(−t/τ)+b; half-life=τ ln2. Deliberately propagate count/acquisition-time uncertainty. Gaussian least squares may be unsuitable for low counts.",
)


def from_template(id):
    t = next((t for t in TEMPLATES if t["id"] == id), None)
    if not t:
        raise ValueError("Unknown template.")
    s = blank_sheet(t["name"], t["columns"])
    s["notes"] = t["notes"]
    s["template"] = id
    s["fit"]["model"] = t["model"]
    s["plot"].update({k: t[k] for k in ("x", "y", "z", "kind") if k in t})
    return s


def demo():
    s = from_template("pendulum")
    s["name"] = "Pendulum · example"
    s["source"] = "Synthetic teaching example. Not experimental measurements."
    s["columns"][0]["uncertainty"] = 0.002
    s["columns"][1]["uncertainty"] = 0.12
    errors = [0.07, -0.11, 0.03, 0.16, -0.08, 0.10, -0.04, 0.13, -0.10, 0.05]
    s["rows"] = [
        dict(
            id=uid(),
            values=dict(
                L=round(0.2 + i * 0.1, 3),
                N=10,
                t=round(20 * math.pi * math.sqrt((0.2 + i * 0.1) / 9.79) + e, 3),
            ),
            uncertainties={},
            included=True,
            note="",
        )
        for i, e in enumerate(errors)
    ]
    s["plot"]["title"] = "The pendulum, measured"
    s["fit"] = dict(
        enabled=True,
        model="linear",
        expression="a*x+b",
        method="wls",
        params=[
            dict(name="a", value=4, unit="s^2/m", lower="", upper="", fixed=False),
            dict(name="b", value=0, unit="s^2", lower="", upper="", fixed=False),
        ],
    )
    s["theory"] = dict(
        enabled=True,
        expression="4*pi^2*x/g",
        params=[dict(name="g", value=9.80665, unit="m/s^2")],
    )
    return dict(
        name="A first experiment",
        objective="Estimate gravitational acceleration from a simple pendulum.",
        apparatus="Pendulum, metre rule, stopwatch",
        notes="Synthetic example data. Create a new experiment for your measurements.",
        sheets=[s],
        log=[],
    )
