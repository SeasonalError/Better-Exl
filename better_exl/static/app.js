"use strict";
const $ = (s, r = document) => r.querySelector(s),
  $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const copy = (v) => JSON.parse(JSON.stringify(v)),
  uid = () => crypto.randomUUID();
const fmt = (v, n = 5) =>
  v == null || !Number.isFinite(Number(v))
    ? "—"
    : Number(v) === 0
      ? "0"
      : Math.abs(v) > 1e5 || Math.abs(v) < 0.001
        ? Number(v).toExponential(3)
        : String(Number(Number(v).toPrecision(n)));
const opt = (v, l, c) =>
  `<option value="${esc(v)}" ${v === c ? "selected" : ""}>${esc(l)}</option>`;
const opts = (items, c) =>
  items.map((i) => opt(i.key ?? i.id, i.name, c)).join("");
const S = {
  config: null,
  projects: [],
  p: null,
  sid: null,
  tab: "data",
  a: null,
  undo: [],
  redo: [],
  dirty: false,
  saving: null,
  seq: 0,
  page: 0,
  search: "",
  selection: null,
};
const sheet = () => S.p?.sheets.find((s) => s.id === S.sid) || S.p?.sheets[0];
const token = $("meta[name=api-token]").content;
const WEB = Boolean(window.BetterExlWeb);
const SAVED_LABEL = WEB ? "Saved in this browser" : "Saved on this computer";
const icon = (name, size = 18) => window.labIcon(name, size);
function setNavigation(action) {
  $$(".primary-nav button").forEach((button) =>
    button.classList.toggle("nav-active", button.dataset.action === action),
  );
}
function renderIcons() {
  $$("[data-icon]").forEach((el) => (el.innerHTML = icon(el.dataset.icon)));
}
function showEngine(detail) {
  const box = $("#engine-state"),
    message = $("#engine-message");
  if (!box || !message) return;
  box.classList.toggle("loading", detail.percent < 100 && !detail.error);
  box.classList.toggle("failed", Boolean(detail.error));
  message.textContent = detail.error
    ? "Analysis unavailable · retry"
    : detail.percent === 100
      ? "Analysis tools ready"
      : detail.message;
  box.dataset.action = detail.error ? "retry-engine" : "storage";
  box.title = detail.error
    ? detail.message
    : "Calculations run privately on your device.";
}
function toast(text, error = false) {
  const e = document.createElement("div");
  e.className = "toast" + (error ? " error" : "");
  e.textContent = text;
  $("#toasts").append(e);
  setTimeout(() => e.remove(), error ? 10000 : 4500);
}
async function api(path, method = "GET", body) {
  if (WEB) return window.BetterExlWeb.request(path, method, body);
  const r = await fetch(path, {
    method,
    headers: {
      "X-Better-Exl": token,
      ...(body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" }),
    },
    body:
      body === undefined
        ? undefined
        : body instanceof FormData
          ? body
          : JSON.stringify(body),
  });
  if (!r.ok) {
    let e;
    try {
      e = await r.json();
    } catch {
      e = { error: "Request failed. Keep the local server running." };
    }
    throw Error(e.error);
  }
  return r.json();
}
function modal(title, body, foot = "") {
  const d = $("#dialog");
  $("#modal").innerHTML =
    `<div class="modalhead"><h2>${esc(title)}</h2><button data-action="close" aria-label="Close">×</button></div><div class="modalbody">${body}</div>${foot ? `<div class="modalfoot">${foot}</div>` : ""}`;
  if (!d.open) d.showModal();
  setTimeout(
    () => $("input:not([type=checkbox]),textarea,select", d)?.focus(),
    20,
  );
}
function close() {
  $("#dialog").close();
}
function field(label, id, value = "", extra = "") {
  return `<div class="field"><label for="${id}">${label}</label><input id="${id}" value="${esc(value)}" ${extra}></div>`;
}
function select(label, id, html) {
  return `<div class="field"><label for="${id}">${label}</label><select id="${id}">${html}</select></div>`;
}
function dl(content, name, type = "text/plain") {
  const u = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = u;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(u), 5000);
}
function status(text, error = false) {
  if ($("#save")) {
    $("#save").textContent = text;
    $("#save").className = "save" + (error ? " error" : "");
  }
}
function draft() {
  try {
    if (S.p) localStorage.setItem("better-exl-draft", JSON.stringify(S.p));
  } catch {
    status("Unsaved · recovery storage full", true);
  }
}
function changed(action, render = false, calc = true, record = true) {
  S.p.log ??= [];
  if (record) S.p.log.push({ time: new Date().toISOString(), action });
  S.dirty = true;
  draft();
  status("Saving…");
  clearTimeout(S.saveTimer);
  S.saveTimer = setTimeout(
    () => save().catch((e) => toast(e.message, true)),
    500,
  );
  if (render) workspace();
  if (calc) schedule();
}
function mutate(action, fn, render = false, calc = true) {
  S.undo.push(copy(S.p));
  if (S.undo.length > 50) S.undo.shift();
  S.redo = [];
  fn();
  changed(action, render, calc);
  if ($("#undo")) $("#undo").disabled = false;
  if ($("#redo")) $("#redo").disabled = true;
}
async function save() {
  clearTimeout(S.saveTimer);
  if (S.saving) await S.saving;
  if (!S.p || !S.dirty) return;
  const snapshot = copy(S.p);
  S.dirty = false;
  S.saving = (async () => {
    try {
      const r = await api("/api/projects/" + snapshot.id, "PUT", snapshot);
      if (S.p?.id === r.id) {
        S.p.version = r.version;
        S.p.updated = r.updated;
        if (!S.dirty) {
          status(SAVED_LABEL);
          localStorage.removeItem("better-exl-draft");
        }
      }
      Object.assign(S.projects.find((p) => p.id === r.id) || {}, {
        name: r.name,
        version: r.version,
        updated: r.updated,
      });
      sidebar();
    } catch (e) {
      S.dirty = true;
      draft();
      status("Not saved · export a backup", true);
      throw e;
    } finally {
      S.saving = null;
    }
  })();
  await S.saving;
  if (S.dirty) return save();
}
function schedule() {
  clearTimeout(S.calcTimer);
  const seq = ++S.seq;
  S.calcTimer = setTimeout(() => analyze(seq), 300);
}
async function analyze(seq = ++S.seq) {
  const s = sheet();
  if (!s) return;
  const id = s.id;
  try {
    const a = await api("/api/analyze", "POST", { sheet: copy(s) });
    if (seq !== S.seq || sheet()?.id !== id) return;
    S.a = a;
    computed();
    await graph();
    results();
  } catch (e) {
    if (seq !== S.seq) return;
    S.a = null;
    if ($("#diagnostics"))
      $("#diagnostics").innerHTML =
        `<div class="notice error">${esc(e.message)}</div>`;
    toast(e.message, true);
  }
}
function sidebar() {
  $("#projects").innerHTML = S.projects
    .map(
      (p) =>
        `<button class="project ${p.id === S.p?.id ? "active" : ""}" data-action="open" data-id="${p.id}">${icon("flask", 16)}<span>${esc(p.name)}</span></button>`,
    )
    .join("");
}
async function openProject(id) {
  await save();
  close();
  S.p = await api("/api/projects/" + id);
  S.sid = S.p.sheets[0].id;
  S.tab = "data";
  S.a = null;
  S.page = 0;
  S.search = "";
  S.selection = null;
  S.undo = [];
  S.redo = [];
  sidebar();
  workspace();
  window.scrollTo(0, 0);
  await analyze();
}
async function create(body) {
  await save();
  S.p = await api("/api/projects", "POST", body);
  S.projects = await api("/api/projects");
  S.sid = S.p.sheets[0].id;
  S.tab = "data";
  S.a = null;
  S.page = 0;
  S.search = "";
  S.selection = null;
  S.undo = [];
  S.redo = [];
  close();
  sidebar();
  workspace();
  window.scrollTo(0, 0);
  await analyze();
}
function home() {
  window.scrollTo(0, 0);
  setNavigation("home");
  document.title = "Better Exl · Your lab, in focus";
  $("#main").innerHTML = `
    <header class="topbar home-topbar"><div class="breadcrumb">${icon("grid", 16)}<span>Workspace</span><span class="crumb-slash">/</span><strong>Overview</strong></div><div class="actions"><button class="search-button" data-action="search-projects">${icon("search", 16)}<span>Find an experiment</span><kbd>⌘ K</kbd></button><button class="help-button" data-action="help" aria-label="Help">${icon("help", 19)}</button><span class="top-avatar">YL</span></div></header>
    <div class="overview">
      <div class="welcome"><div><div class="eyebrow"><span class="live-dot"></span> YOUR PERSONAL LAB WORKSPACE</div><h1>Your lab, in focus.</h1><p>Less time wrestling with data. More time discovering what it means.</p></div><button class="primary create-top" data-action="new">${icon("plus", 18)} New experiment</button></div>
      <div class="starts">
        <button class="start" data-action="new"><span class="start-icon violet">${icon("flask", 23)}</span><span><strong>Start an experiment</strong><small>A fresh page for your next question.</small></span><span class="start-arrow">${icon("arrow", 17)}</span></button>
        <button class="start" data-action="import"><span class="start-icon teal">${icon("import", 23)}</span><span><strong>Bring your data</strong><small>Drop in a CSV, Excel file or project.</small></span><span class="start-arrow">${icon("arrow", 17)}</span></button>
        <button class="start" data-action="quick"><span class="start-icon amber">${icon("plot", 23)}</span><span><strong>Make a quick plot</strong><small>Paste your measurements. Find the story.</small></span><span class="start-arrow">${icon("arrow", 17)}</span></button>
      </div>
      <section class="experiment-section"><div class="heading"><div class="heading-title"><h2>Your experiments</h2><span class="count-pill">${S.projects.length}</span></div><button class="link" data-action="search-projects">${icon("search", 15)} Find experiment</button></div>
      ${
        S.projects.length
          ? `<div class="experiment-cards">${S.projects
              .slice(0, 9)
              .map(
                (p, i) =>
                  `<button class="experiment-card" data-action="open" data-id="${p.id}"><div class="experiment-card-top"><span class="folder-icon tone-${i % 3}">${icon("flask", 22)}</span><span class="card-open">${icon("external", 15)}</span></div><h3>${esc(p.name)}</h3><p>Measurements, models & notes</p><div class="experiment-card-foot"><span>${icon("clock", 13)} ${new Date(p.updated).toLocaleDateString(undefined, { day: "numeric", month: "short" })}</span><span>Revision ${p.version}</span></div></button>`,
              )
              .join("")}</div>`
          : `<div class="empty-projects"><div class="empty-experiment-icon">${icon("folder", 27)}</div><div><h3>A home for every experiment.</h3><p>Start something new, or explore the guided example below.</p></div><button data-action="new">Create your first experiment ${icon("arrow", 15)}</button></div>`
      }</section>
      <section class="demo"><div class="demo-copy"><div class="eyebrow demo-eyebrow">${icon("spark", 15)} LEARN BY EXPLORING</div><h2>A simple pendulum.<br>A whole new perspective.</h2><p>Turn raw timings into uncertainty bars, a fitted model and a comparison with theory. Follow the entire journey in one workspace.</p><button class="primary" data-action="demo">Explore the example ${icon("arrow", 17)}</button><span class="demo-disclaimer">Synthetic teaching data · 10 measurements</span></div><div class="demo-figure"><div class="demo-figure-head"><span><span class="live-dot"></span> Pendulum study</span><span class="mini-tag">T² vs. length</span></div><div id="demo-plot" class="demo-plot"></div><div class="demo-figure-foot"><span><i class="legend-point"></i> Measurement</span><span><i class="legend-line"></i> Linear model</span><strong>Make the relationship visible.</strong></div></div></section>
      <section class="template-section"><div class="heading"><div><h2>A head start for your next lab</h2><p class="helper">Thoughtful starting points. Every column and equation is yours to change.</p></div><button class="link" data-action="templates">Browse all 24 ${icon("arrow", 16)}</button></div><div class="template-strip">${[
        ["pendulum", "Mechanics", "Pendulums & motion", "flask"],
        ["rc", "Electronics", "Circuits & decay", "bolt"],
        ["malus", "Optics", "Light & polarization", "sun"],
        ["sound", "Waves", "Sound & oscillations", "wave"],
      ]
        .map(
          ([id, category, title, glyph]) =>
            `<button class="template-tile" data-action="template" data-id="${id}"><span class="template-glyph">${icon(glyph, 21)}</span><span><strong>${category}</strong><small>${title}</small></span>${icon("arrow", 15)}</button>`,
        )
        .join("")}</div></section>
      <footer class="workspace-footer"><span>${icon("shield", 14)} ${WEB ? "Private by default. Saved in this browser." : "Your experiments stay on your computer."}</span><button class="link" data-action="help">Built for the way you do science ${icon("arrow", 14)}</button></footer>
    </div>`;
  Plotly.newPlot(
    "demo-plot",
    [
      {
        x: [0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1],
        y: [0.82, 1.19, 1.62, 2.04, 2.4, 2.85, 3.21, 3.64, 4, 4.46],
        mode: "markers",
        marker: {
          color: "#6762e8",
          size: 7,
          line: { color: "white", width: 1.5 },
        },
        error_y: {
          type: "constant",
          value: 0.1,
          color: "#b0acef",
          thickness: 1,
          width: 2,
        },
      },
      {
        x: [0.15, 1.15],
        y: [0.6, 4.63],
        mode: "lines",
        line: { color: "#aba8e9", width: 1.7, dash: "dot" },
      },
    ],
    {
      height: 255,
      margin: { t: 15, r: 25, b: 44, l: 53 },
      showlegend: false,
      font: { family: "Inter, sans-serif", color: "#8b91a3", size: 10 },
      xaxis: {
        title: { text: "Length (m)", font: { size: 11 } },
        gridcolor: "#f0f1f7",
        zeroline: false,
        ticksuffix: " ",
      },
      yaxis: {
        title: { text: "Period² (s²)", font: { size: 11 } },
        gridcolor: "#f0f1f7",
        zeroline: false,
      },
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor: "rgba(0,0,0,0)",
    },
    { staticPlot: true, responsive: true, displayModeBar: false },
  );
}

function newDialog(template = "blank") {
  modal(
    "New experiment",
    field(
      "Experiment name",
      "new-name",
      template === "blank"
        ? ""
        : S.config.templates.find((t) => t.id === template)?.name,
      'placeholder="e.g. RC filter · Lab 2"',
    ) +
      select(
        "Starting point",
        "new-template",
        opts(S.config.templates, template),
      ) +
      '<p class="helper">Your measurements, models, graphs and notes save together. Templates suggest models; fitting starts when you choose to run it.</p>',
    '<button data-action="close">Cancel</button><button class="primary" data-action="create">Create experiment</button>',
  );
}
function templates() {
  window.scrollTo(0, 0);
  setNavigation("templates");
  const cards = (q) =>
    S.config.templates
      .filter((t) =>
        (t.name + " " + t.category + " " + t.description)
          .toLowerCase()
          .includes(q.toLowerCase()),
      )
      .map(
        (t) =>
          `<button class="card" data-action="template" data-id="${t.id}"><small style="color:var(--blue)">${t.category.toUpperCase()}</small><strong>${esc(t.name)}</strong><p>${esc(t.description)}</p><small>${t.columns.length} suggested columns</small></button>`,
      )
      .join("");
  S.templateCards = cards;
  $("#main").innerHTML =
    `<header class="topbar"><div><div class="crumb">Starting points</div><h1>Experiment templates</h1></div><button data-action="back">Back to workspace</button></header><div class="overview"><div class="intro"><div class="eyebrow">A STARTING POINT, NOT A BLACK BOX</div><h1>Built around the measurements you take.</h1><p>Suggested columns, units, models and assumptions. All editable.</p></div><input id="template-search" placeholder="Search mechanics, circuits, optics…" style="max-width:440px;margin:25px 0 5px" aria-label="Search templates"><div class="cards" id="template-cards">${cards("")}</div></div>`;
}
function workspace() {
  setNavigation("");
  const p = S.p,
    s = sheet();
  if (!p || !s) return;
  S.sid = s.id;
  document.title = p.name + " · Better Exl";
  $("#main").innerHTML =
    `<header class="topbar"><div><div class="crumb">Experiments / ${esc(s.name)}</div><h1 id="project-title" tabindex="0" title="Double-click to rename">${esc(p.name)}</h1></div><div class="actions"><span class="save" id="save">${S.dirty ? "Saving…" : SAVED_LABEL}</span><button data-action="undo" aria-label="Undo" id="undo" ${S.undo.length ? "" : "disabled"} title="Undo">↶</button><button data-action="redo" aria-label="Redo" id="redo" ${S.redo.length ? "" : "disabled"} title="Redo">↷</button><button data-action="focus" class="focus-button" title="Focus on your data" aria-label="Toggle focus mode">${icon("focus", 16)}</button><button data-action="import">${icon("import", 15)} Import</button><button class="primary" data-action="export">Export ${icon("external", 15)}</button></div></header><div class="navrow"><nav class="tabs">${[
      ["data", "Data & graph"],
      ["fit", "Fit & theory"],
      ["stats", "Statistics"],
      ["notes", "Notebook"],
    ]
      .map(
        ([k, l]) =>
          `<button class="tab ${S.tab === k ? "active" : ""}" data-action="tab" data-id="${k}">${l}</button>`,
      )
      .join(
        "",
      )}</nav><div class="sheets"><select id="sheet-select" aria-label="Dataset">${opts(p.sheets, s.id)}</select><button class="small" data-action="add-sheet" title="Add dataset">+</button></div></div>${S.tab === "notes" ? notebook() : `<div class="workspace"><div class="center">${S.tab === "data" ? dataView() : S.tab === "fit" ? fitView() : statsView()}</div><aside class="inspector" id="inspector">${inspector()}</aside></div>`}`;
  if (S.a) {
    computed();
    graph();
    results();
  }
}
function filtered() {
  const q = S.search.toLowerCase();
  return sheet()
    .rows.map((r, i) => ({ r, i }))
    .filter(
      ({ r }) =>
        !q ||
        [...Object.values(r.values), r.note || ""]
          .join(" ")
          .toLowerCase()
          .includes(q),
    );
}
function table() {
  const s = sheet();
  return `<table class="grid"><thead><tr><th>#</th>${s.columns.map((c) => `<th data-column="${esc(c.key)}" title="Click to edit column"><span>${esc(c.name)}</span><small><span class="mono">${esc(c.key)}</span> · ${esc(c.unit || "unitless")} ${c.formula ? " · ƒx" : ""}</small></th>`).join("")}<th>Use · note</th></tr></thead><tbody>${
    filtered()
      .slice(S.page * 100, (S.page + 1) * 100)
      .map(
        ({ r, i }) =>
          `<tr class="${r.included === false ? "excluded" : ""}"><td>${i + 1}</td>${s.columns.map((c, j) => (c.formula ? `<td><div class="calc" data-derived="${i}:${c.key}">—</div></td>` : `<td><div class="cell"><input data-cell="${i}:${j}:value" aria-label="${esc(c.name)} row ${i + 1}" value="${esc(r.values[c.key] ?? "")}" inputmode="decimal" spellcheck="false"><input class="sigma" data-cell="${i}:${j}:uncertainty" aria-label="Uncertainty ${esc(c.name)} row ${i + 1}" value="${esc(r.uncertainties?.[c.key] ?? "")}" placeholder="± ${esc(c.uncertainty ?? "?")}" inputmode="decimal"></div></td>`)).join("")}<td><div class="row-tools"><input type="checkbox" data-include="${i}" ${r.included === false ? "" : "checked"} aria-label="Include row ${i + 1}"><button data-action="row-note" data-id="${i}" title="${esc(r.note || "Row note")}">${r.note ? "▣" : "✎"}</button><button data-action="remove-row" data-id="${i}" title="Remove row; retained in revisions">×</button></div></td></tr>`,
      )
      .join("") ||
    `<tr><td colspan="${s.columns.length + 2}"><div class="empty"><strong>Ready for your measurements.</strong>Add a row, paste a table, or import a file.<br>Click a column heading to define units and uncertainty.</div></td></tr>`
  }</tbody></table>`;
}
function dataView() {
  const s = sheet();
  return `<div class="toolbar"><div class="actions"><button class="link" data-action="rename-sheet" style="font-weight:600;color:var(--ink)">${esc(s.name)} ⌄</button><span class="tag">${s.columns.filter((c) => c.formula).length} DERIVED</span></div><div class="actions"><button class="small" data-action="add-row">+ Row</button><button class="small" data-action="add-column">+ Column</button><button class="small" data-action="paste">Paste table</button></div></div>${(s.source || "").includes("Synthetic") ? '<div class="notice info">Synthetic teaching data. Create a new experiment for your own measurements.</div>' : ""}<div class="tablebox" id="grid">${table()}</div><div class="footer"><span id="row-count">${s.rows.length} rows · values and ± standard uncertainty</span><div class="actions"><input id="search" placeholder="Find values…" aria-label="Search data" value="${esc(S.search)}"><button class="small" data-action="copy-range">Copy range</button><button class="small" data-action="prev">‹</button><span id="page">${S.page + 1}</span><button class="small" data-action="next">›</button></div></div>${graphBox()}<div id="metrics"></div><div id="analysis-summary"></div>`;
}
function refreshTable() {
  if (!$("#grid")) return;
  $("#grid").innerHTML = table();
  $("#page").textContent = S.page + 1;
  $("#row-count").textContent =
    sheet().rows.length + " rows · values and ± standard uncertainty";
  computed();
}
function computed() {
  if (!S.a) return;
  $$("[data-derived]").forEach((e) => {
    const [i, k] = e.dataset.derived.split(":");
    e.innerHTML = `<span>${fmt(S.a.values[k]?.[i])}</span><small>± ${fmt(S.a.uncertainties[k]?.[i], 3)}</small>`;
  });
}
function graphBox(tall = false) {
  return `<section class="graphbox"><div class="graphhead"><h3>Graph</h3><div class="actions"><button class="small" data-action="graph-settings">Customize</button><button class="small" data-action="annotation">+ Note</button><button class="small" data-action="png">↓ PNG</button><button class="small" data-action="svg">SVG</button></div></div><div id="graph" class="graph ${tall ? "tall" : ""}" aria-label="Interactive scientific graph"><div class="graph-loading"><span class="loading-ring"></span><p>${WEB ? "Preparing your graph…" : "Calculating…"}</p><small>Your measurements will appear here.</small></div></div><div class="graphnote"><span>Double-click labels to edit · drag to zoom · double-click the plot to reset</span><button class="link" data-action="pdf">Print / PDF</button></div></section>`;
}
function inspector() {
  const s = sheet(),
    p = s.plot;
  if (S.tab === "fit")
    return `<div class="section-label">READ THE RESULT</div><h3>Model ≠ proof</h3><p class="helper" style="margin:12px 0">Inspect residuals, parameter uncertainty and the assumptions behind the equation. A good-looking curve alone is not enough.</p><div id="diagnostics"></div><hr><button data-action="constants">Constants & correlations</button><details><summary>What the numbers mean</summary><p class="helper">Uncertainty is one sigma. Confidence intervals use a local covariance approximation. χ² needs supplied measurement uncertainties. R² is descriptive, not a test of physical validity.</p></details>`;
  if (S.tab === "stats")
    return `<div class="section-label">EXPLORE YOUR MEASUREMENTS</div><p class="helper">Statistics use included rows. Missing values are counted and never changed to zero.</p><hr><h3>Repeated trials</h3><p class="helper" style="margin:12px 0">Group repeated measurements and distinguish SD, SEM and instrument uncertainty.</p><button data-action="repeats">Group repeated trials</button><hr><h3>Signal tools</h3><p class="helper" style="margin:12px 0">FFT, power spectrum, differentiation, integration and smoothing create a new dataset.</p><button data-action="signals">Open signal tools</button><hr><button data-action="constants">Constants & correlations</button>`;
  return `<div class="section-label">MAKE THE GRAPH YOURS</div>${select(
    "Plot type",
    "plot-kind",
    [
      ["scatter", "Scatter + error bars"],
      ["line", "Line + markers"],
      ["histogram", "Histogram (Y)"],
      ["box", "Box plot (Y)"],
      ["contour", "Potential map / contour"],
      ["scatter3d", "3D scatter (X, Y, Z)"],
    ]
      .map(([v, l]) => opt(v, l, p.kind))
      .join(""),
  )}${select("X axis", "plot-x", opts(s.columns, p.x))}${select("Y axis", "plot-y", opts(s.columns, p.y))}${["contour", "scatter3d"].includes(p.kind) ? select("Z / colour value", "plot-z", opts(s.columns, p.z || s.columns.at(-1).key)) : ""}<div class="row2">${select("X scale", "plot-xScale", opt("linear", "Linear", p.xScale) + opt("log", "Log", p.xScale))}${select("Y scale", "plot-yScale", opt("linear", "Linear", p.yScale) + opt("log", "Log", p.yScale))}</div>${[
    ["errorBars", "Show X & Y error bars"],
    ["band", "Show 95% mean-curve CI"],
    ["grid", "Grid lines"],
  ]
    .map(
      ([k, l]) =>
        `<label class="check"><input type="checkbox" id="plot-${k}" ${p[k] ? "checked" : ""}>${l}</label>`,
    )
    .join("")}<hr>${select(
    "Figure style",
    "plot-preset",
    [
      ["report", "Lab report"],
      ["publication", "Publication"],
      ["presentation", "Presentation"],
      ["dark", "Dark"],
      ["minimal", "Minimal"],
    ]
      .map(([v, l]) => opt(v, l, p.preset))
      .join(""),
  )}<div class="row2">${field("Marker colour", "plot-color", p.color, 'type="color"')}${field("Marker size", "plot-markerSize", p.markerSize, 'type="number" min="2" max="20"')}</div><details><summary>Labels, limits & layers</summary>${field("Title", "plot-title", p.title, 'placeholder="Automatic"')}${field("X label", "plot-xLabel", p.xLabel, 'placeholder="From column"')}${field("Y label", "plot-yLabel", p.yLabel, 'placeholder="From column"')}<div class="row2">${field("X minimum", "plot-xMin", p.xMin ?? "")}${field("X maximum", "plot-xMax", p.xMax ?? "")}</div><div class="row2">${field("Y minimum", "plot-yMin", p.yMin ?? "")}${field("Y maximum", "plot-yMax", p.yMax ?? "")}</div>${field("Line width", "plot-lineWidth", p.lineWidth, 'type="number" min="1" max="8"')}<p class="helper">Overlay another Y column (use compatible units):</p>${s.columns
    .filter((c) => c.key !== p.x && c.key !== p.y)
    .map(
      (c) =>
        `<label class="check"><input type="checkbox" data-overlay="${c.key}" ${(p.overlay || []).includes(c.key) ? "checked" : ""}>${esc(c.name)}</label>`,
    )
    .join(
      "",
    )}</details><hr><button class="small" data-action="constants">Constants & correlations</button><div id="diagnostics"></div>`;
}
function parameters(params, kind, bounds) {
  return `<div class="paramscroll"><table class="params"><thead><tr><th>Symbol</th><th>${bounds ? "Initial guess" : "Value"}</th><th>Unit</th>${bounds ? "<th>Lower</th><th>Upper</th><th>Fixed</th>" : ""}</tr></thead><tbody>${params.map((p, i) => `<tr><td class="mono">${esc(p.name)}</td>${["value", "unit", ...(bounds ? ["lower", "upper"] : [])].map((k) => `<td><input data-param="${kind}:${i}:${k}" aria-label="${esc(p.name)} ${k}" value="${esc(p[k] ?? "")}" placeholder="${k === "lower" ? "−∞" : k === "upper" ? "+∞" : k === "unit" ? "dimensionless" : ""}"></td>`).join("")}${bounds ? `<td><input type="checkbox" data-param="${kind}:${i}:fixed" aria-label="Fix ${esc(p.name)}" ${p.fixed ? "checked" : ""}></td>` : ""}</tr>`).join("") || '<tr><td colspan="6" class="helper">Identify parameters to set their values and units.</td></tr>'}</tbody></table></div>`;
}
function fitView() {
  const s = sheet(),
    f = s.fit,
    t = s.theory;
  return `<div class="fitbox"><div class="heading"><div><div class="eyebrow" style="margin-bottom:7px">ESTIMATE FROM YOUR DATA</div><h2>Fit a model</h2></div><span class="tag">BEST FIT</span></div><div class="row2">${select(
    "Model",
    "fit-model",
    Object.entries(S.config.models)
      .map(([k, l]) => opt(k, l, f.model))
      .join(""),
  )}${select(
    "Fitting method",
    "fit-method",
    [
      ["ols", "Ordinary least squares"],
      ["wls", "Weighted by Y uncertainty"],
      ["odr", "X + Y uncertainty (ODR)"],
    ]
      .map(([k, l]) => opt(k, l, f.method))
      .join(""),
  )}</div>${field("Equation · x is " + esc(s.columns.find((c) => c.key === s.plot.x)?.name), "fit-expression", f.expression, 'class="mono"')}<p class="helper" style="margin-bottom:12px">Use the selected X column’s units and set parameter units below. Initial guesses and bounds are your choices.</p><button class="small" data-action="identify" data-id="fit">Identify parameters</button>${parameters(f.params || [], "fit", true)}<div class="toolbar"><label class="check"><input id="fit-enabled" type="checkbox" ${f.enabled ? "checked" : ""}> Keep fit active as data changes</label><button class="primary" data-action="run-fit">Run fit →</button></div><div id="fit-error"></div></div><div class="fitbox"><div class="heading"><div><div class="eyebrow" style="color:#a97931;margin-bottom:7px">PREDICT BEFORE FITTING</div><h2>Compare with theory</h2></div><span class="tag" style="color:#a97931;background:#fff8ea">THEORY</span></div>${field("Theoretical equation", "theory-expression", t.expression, 'class="mono" placeholder="e.g. 4*pi^2*x/g"')}<p class="helper" style="margin-bottom:12px">Use x or the selected X symbol. Constants here define a prediction independently of the fitted curve.</p><button class="small" data-action="identify" data-id="theory">Identify constants</button>${parameters(t.params || [], "theory", false)}<div class="toolbar"><button data-action="theory-to-fit">Use as fit model</button><button class="primary" data-action="theory">${t.enabled ? "Hide theory" : "Compare with data →"}</button></div><div id="theory-error"></div></div>${graphBox(true)}<div id="metrics"></div><div id="analysis-summary"></div><section id="residual-area" class="section"></section>`;
}
function statsView() {
  return `<div class="heading"><div><h2>Know your measurements</h2><p class="helper" style="margin-top:8px">Distributions, descriptive statistics and repeated trials.</p></div><button class="small" data-action="latex">Copy as LaTeX</button></div><div id="stats-content"></div><div id="distribution" class="graphbox" style="height:340px;margin-top:24px"></div>`;
}
function notebook() {
  const p = S.p,
    s = sheet();
  return `<div class="notebook"><div class="heading"><h2>Your lab notebook</h2><button data-action="history">Revision history</button></div><p class="helper" style="margin:12px 0 25px">Keep the conditions, observations and decisions that make your result reproducible.</p>${field("Objective", "note-objective", p.objective || "")}${field("Apparatus", "note-apparatus", p.apparatus || "")}<div class="field"><label for="note-method">Dataset method & assumptions</label><textarea id="note-method">${esc(s.notes)}</textarea></div><div class="field"><label for="note-notes">Observations</label><textarea id="note-notes">${esc(p.notes)}</textarea><button class="small" data-action="observation" style="margin-top:8px">+ Timestamped observation</button></div><h3 style="margin:25px 0 12px">Analysis history</h3>${
    p.log
      .slice(-40)
      .reverse()
      .map(
        (l) =>
          `<div class="history-item"><div>${esc(l.action)}<small>${new Date(l.time).toLocaleString()}</small></div></div>`,
      )
      .join("") || '<p class="helper">Analysis steps will appear here.</p>'
  }</div>`;
}
function label(k) {
  const c = sheet().columns.find((c) => c.key === k),
    un = S.a?.units[k] ?? c?.unit;
  return (c?.name || k) + (un && un !== "dimensionless" ? " (" + un + ")" : "");
}
function range(p, k) {
  if (
    p[k + "Min"] == null ||
    p[k + "Max"] == null ||
    p[k + "Min"] === "" ||
    p[k + "Max"] === ""
  )
    return undefined;
  const v = [Number(p[k + "Min"]), Number(p[k + "Max"])];
  if (!v.every(Number.isFinite) || v[0] >= v[1]) return undefined;
  return p[k + "Scale"] === "log"
    ? v[0] > 0
      ? v.map(Math.log10)
      : undefined
    : v;
}
async function graph() {
  const el = $("#graph"),
    a = S.a,
    s = sheet();
  if (!el || !a) return;
  el.querySelector(".graph-loading")?.remove();
  const p = s.plot,
    idx = a.indices || [],
    x = idx.map((i) => a.values[p.x]?.[i]),
    y = idx.map((i) => a.values[p.y]?.[i]),
    ux = idx.map((i) => a.uncertainties[p.x]?.[i]),
    uy = idx.map((i) => a.uncertainties[p.y]?.[i]);
  const dark = p.preset === "dark",
    bg = dark ? "#1c2c43" : "white",
    ink = dark ? "#c6d5ea" : "#61718b",
    traces = [],
    name = (k, v) => p.names?.[k] || v;
  const standard = ["scatter", "line"].includes(p.kind);
  if (standard) {
    traces.push({
      x,
      y,
      type: "scatter",
      mode: p.kind === "line" ? "lines+markers" : "markers",
      name: name(
        "measured",
        s.columns.find((c) => c.key === p.y)?.name || "Measured",
      ),
      meta: "measured",
      customdata: idx.map((i) => i + 1),
      hovertemplate:
        "x: %{x:.6g}<br>y: %{y:.6g}<br>Row %{customdata}<extra>%{fullData.name}</extra>",
      marker: {
        color: p.color,
        size: p.markerSize,
        line: { width: 1, color: bg },
      },
      line: { color: p.color, width: p.lineWidth },
      error_x: {
        type: "data",
        array: ux.map((v) => v ?? 0),
        visible: p.errorBars,
        color: p.color,
        thickness: 1,
        width: 3,
      },
      error_y: {
        type: "data",
        array: uy.map((v) => v ?? 0),
        visible: p.errorBars,
        color: p.color,
        thickness: 1,
        width: 3,
      },
    });
    const colours = ["#9368bc", "#21978d", "#c38143", "#b56479"];
    (p.overlay || []).forEach((k, j) => {
      if (!a.values[k]) return;
      const ids = s.rows
        .map((r, i) => i)
        .filter(
          (i) =>
            s.rows[i].included !== false &&
            a.values[p.x]?.[i] != null &&
            a.values[k]?.[i] != null,
        );
      traces.push({
        x: ids.map((i) => a.values[p.x][i]),
        y: ids.map((i) => a.values[k][i]),
        type: "scatter",
        mode: "markers",
        meta: k,
        name: name(k, s.columns.find((c) => c.key === k).name),
        marker: { size: 7, color: colours[j % 4] },
        error_y: {
          type: "data",
          array: ids.map((i) => a.uncertainties[k][i] ?? 0),
          visible: p.errorBars,
          thickness: 1,
          color: colours[j % 4],
        },
      });
    });
    if (a.theory)
      traces.push({
        x: a.theory.grid,
        y: a.theory.curve,
        mode: "lines",
        meta: "theory",
        name: name("theory", "Theory"),
        line: { color: "#d1a047", width: 2, dash: "dash" },
      });
    if (a.fit) {
      const f = a.fit;
      if (p.band) {
        traces.push({
          x: f.grid,
          y: f.lower,
          mode: "lines",
          line: { width: 0 },
          showlegend: false,
          hoverinfo: "skip",
          meta: "band",
        });
        traces.push({
          x: f.grid,
          y: f.upper,
          mode: "lines",
          line: { width: 0 },
          fill: "tonexty",
          fillcolor: "rgba(52,104,232,.09)",
          name: "95% mean-curve CI",
          hoverinfo: "skip",
          meta: "band",
        });
      }
      traces.push({
        x: f.grid,
        y: f.curve,
        mode: "lines",
        meta: "fit",
        name: name("fit", "Best fit"),
        line: { color: "#3b5aa5", width: 2.2 },
      });
    }
  } else if (["histogram", "box"].includes(p.kind)) {
    const values = a.values[p.y].filter(
      (v, i) => v != null && s.rows[i].included !== false,
    );
    traces.push(
      p.kind === "histogram"
        ? {
            x: values,
            type: "histogram",
            marker: { color: p.color, line: { color: bg, width: 1 } },
            name: label(p.y),
          }
        : {
            y: values,
            type: "box",
            name: label(p.y),
            boxpoints: "all",
            jitter: 0.25,
            marker: { color: p.color, size: 5 },
          },
    );
  } else if (p.kind === "scatter3d") {
    const z = p.z || s.columns.at(-1).key;
    traces.push({
      x,
      y,
      z: idx.map((i) => a.values[z]?.[i]),
      type: "scatter3d",
      mode: "markers",
      marker: {
        size: 4,
        color: idx.map((i) => a.values[z]?.[i]),
        colorscale: "Viridis",
        showscale: true,
      },
      name: "Measured",
    });
  } else if (p.kind === "contour") {
    if (a.map)
      traces.push({
        x: a.map.x,
        y: a.map.y,
        z: a.map.z,
        type: "contour",
        connectgaps: false,
        colorscale: "Viridis",
        contours: { showlabels: true },
        colorbar: {
          thickness: 12,
          title: { text: label(p.z || s.columns.at(-1).key) },
        },
      });
    traces.push({
      x,
      y,
      mode: "markers",
      marker: {
        color: a.map ? "white" : p.color,
        size: 4,
        line: { color: "#455671", width: 1 },
      },
      name: "Measured positions",
    });
  }
  const fontsize =
    p.preset === "presentation" ? 18 : p.preset === "publication" ? 14 : 13;
  const layout = {
    title: {
      text: esc(p.title || s.name),
      x: 0.07,
      xanchor: "left",
      font: { size: fontsize + 4, color: dark ? "#e5eeff" : "#283854" },
    },
    font: {
      family:
        p.preset === "publication"
          ? "Georgia, serif"
          : "Inter, Segoe UI, sans-serif",
      size: fontsize,
      color: ink,
    },
    margin: { t: 65, r: 30, b: 65, l: 72 },
    paper_bgcolor: bg,
    plot_bgcolor: bg,
    showlegend: true,
    legend: {
      orientation: "h",
      x: 0,
      y: 1.02,
      yanchor: "bottom",
      font: { size: 11 },
    },
    xaxis: {
      title: {
        text: esc(
          p.xLabel || (p.kind === "histogram" ? label(p.y) : label(p.x)),
        ),
        standoff: 14,
      },
      type: p.xScale,
      range: range(p, "x"),
      gridcolor: dark ? "#32445e" : "#edf1f7",
      showgrid: p.grid && p.preset !== "minimal",
      showline: true,
      linecolor: "#cbd4e2",
      ticks: "outside",
      zeroline: false,
      automargin: true,
    },
    yaxis: {
      title: {
        text: esc(p.yLabel || (p.kind === "histogram" ? "Count" : label(p.y))),
        standoff: 12,
      },
      type: p.yScale,
      range: range(p, "y"),
      gridcolor: dark ? "#32445e" : "#edf1f7",
      showgrid: p.grid && p.preset !== "minimal",
      showline: true,
      linecolor: "#cbd4e2",
      ticks: "outside",
      zeroline: false,
      automargin: true,
    },
    annotations: (p.annotations || []).map((n) => ({
      ...n,
      text: esc(n.text),
    })),
    uirevision: s.id,
    hovermode: "closest",
  };
  if (p.kind === "scatter3d")
    layout.scene = {
      xaxis: { title: { text: label(p.x) } },
      yaxis: { title: { text: label(p.y) } },
      zaxis: { title: { text: label(p.z || s.columns.at(-1).key) } },
    };
  if (!s.rows.length)
    layout.annotations.push({
      text: "Your measurements will appear here",
      xref: "paper",
      yref: "paper",
      x: 0.5,
      y: 0.5,
      showarrow: false,
      font: { size: 15, color: "#96a3b6" },
    });
  await Plotly.react(el, traces, layout, {
    responsive: true,
    displaylogo: false,
    editable: false,
    toImageButtonOptions: {
      format: "png",
      filename: "better-exl-graph",
      width: 1400,
      height: 900,
      scale: 2,
    },
    modeBarButtonsToRemove: ["lasso2d", "select2d"],
  });
  // The grid can resize while a chart is rendering; observe its actual container.
  if (S.observedGraph !== el) {
    S.graphObserver?.disconnect();
    clearTimeout(S.resizeTimer);
    S.observedGraph = el;
    S.graphObserver = new ResizeObserver(() => {
      clearTimeout(S.resizeTimer);
      S.resizeTimer = setTimeout(() => {
        if (el.isConnected && el.data) Plotly.Plots.resize(el).catch(() => {});
      }, 60);
    });
    S.graphObserver.observe(el);
  }
  if (!el._better) {
    el._better = true;
    el.addEventListener("dblclick", (e) => {
      let kind, value, key;
      if (e.target.closest(".gtitle")) {
        kind = "title";
        value = sheet().plot.title || sheet().name;
      } else if (e.target.closest(".xtitle")) {
        kind = "xLabel";
        value = sheet().plot.xLabel || label(sheet().plot.x);
      } else if (e.target.closest(".ytitle")) {
        kind = "yLabel";
        value = sheet().plot.yLabel || label(sheet().plot.y);
      } else if (e.target.closest(".annotation-text")) {
        value = e.target.closest(".annotation-text").textContent;
        key = sheet().plot.annotations.findIndex((n) => n.text === value);
        if (key < 0) return;
        kind = "annotation";
      }
      if (kind) {
        e.preventDefault();
        S.edit = { kind, key };
        modal(
          "Edit " + kind,
          field("Text", "graph-text", value),
          '<button data-action="close">Cancel</button><button class="primary" data-action="graph-text">Apply</button>',
        );
      }
    });
    // Plotly's legend hit rectangle sits above its text; use its native event.
    el.on("plotly_legenddoubleclick", (event) => {
      const trace = el.data[event.curveNumber];
      if (!trace?.meta || trace.meta === "band") return false;
      S.edit = { kind: "legend", key: trace.meta };
      modal(
        "Edit legend",
        field("Text", "graph-text", trace.name),
        '<button data-action="close">Cancel</button><button class="primary" data-action="graph-text">Apply</button>',
      );
      return false;
    });
    el.on("plotly_click", () => {
      if (S.tab === "data")
        $("#inspector").scrollIntoView({ block: "nearest" });
    });
  }
}
function diagnostics() {
  if ($("#diagnostics") && S.a)
    $("#diagnostics").innerHTML =
      '<div class="section-label" style="margin-top:24px">SCIENTIFIC CHECKS</div>' +
      (S.a.diagnostics
        .map((d) => `<div class="diagnostic">△ ${esc(d)}</div>`)
        .join("") ||
        '<p class="helper">No input problems detected. Check the physical assumptions and calibration before interpreting results.</p>');
}
function matrix(m, title) {
  return `<div class="section-label" style="margin-top:15px">${title}</div><div class="scroll"><table class="results mono"><tbody>${m.map((r) => `<tr>${r.map((v) => `<td>${fmt(v, 4)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}
function results() {
  const a = S.a,
    s = sheet();
  if (!a) return;
  diagnostics();
  const f = a.fit,
    t = a.theory;
  if ($("#fit-error"))
    $("#fit-error").innerHTML = a.fitError
      ? `<div class="notice error">${esc(a.fitError)}</div>`
      : "";
  if ($("#theory-error"))
    $("#theory-error").innerHTML = a.theoryError
      ? `<div class="notice error">${esc(a.theoryError)}</div>`
      : "";
  if ($("#metrics"))
    $("#metrics").innerHTML = f
      ? `<div class="metrics">${[
          ["POINTS IN FIT", f.n, f.dof + " degrees of freedom"],
          ["RMSE", fmt(f.rmse, 4), "in Y units"],
          [
            "REDUCED χ²",
            fmt(f.reducedChi2, 4),
            f.chi2 == null
              ? "Needs supplied uncertainties"
              : "Uses supplied uncertainty",
          ],
          ["DESCRIPTIVE R²", fmt(f.r2, 5), "Not a model-validity test"],
        ]
          .map(
            ([l, v, n]) =>
              `<div class="metric"><label>${l}</label><strong>${v}</strong><small>${n}</small></div>`,
          )
          .join("")}</div>`
      : "";
  if ($("#analysis-summary")) {
    let html = "";
    if (S.tab === "data") {
      if (f)
        html += `<div class="toolbar"><p class="helper">${f.params.map((p) => `${esc(p.name)} = <strong>${fmt(p.value)}${p.stderr != null ? " ± " + fmt(p.stderr, 3) : " (fixed)"}</strong> ${esc(p.unit)}`).join(" &nbsp; · &nbsp; ")}</p><button class="small" data-action="tab" data-id="fit">Inspect fit & residuals →</button></div>`;
      for (const k of ["fitError", "theoryError"])
        if (a[k]) html += `<div class="notice error">${esc(a[k])}</div>`;
    } else {
      if (f)
        html += `<section class="section"><div class="heading"><h3>Fitted parameters</h3><button class="small" data-action="latex-fit">Copy as LaTeX</button></div><div class="scroll"><table class="results"><thead><tr><th>Parameter</th><th>Estimate ± standard uncertainty</th><th>95% interval</th></tr></thead><tbody>${f.params.map((p) => `<tr><td class="mono">${esc(p.name)}<small style="display:block">${esc(p.unit)}</small></td><td>${fmt(p.value)} ${p.stderr == null ? "(fixed)" : "± " + fmt(p.stderr, 3)}</td><td>${p.ci95 ? p.ci95.map((v) => fmt(v)).join(" to ") : "—"}</td></tr>`).join("")}</tbody></table></div><details><summary>Covariance and correlation</summary><p class="helper">Rows and columns: ${f.freeNames.map(esc).join(", ")}. Covariance entries use products of parameter units.</p>${matrix(f.covariance, "Covariance")}${matrix(f.correlation, "Correlation")}</details></section>`;
      if (t)
        html += `<section class="section"><div class="heading"><h3>Theory versus measurement</h3><small>RMSE ${fmt(t.rmse, 4)}</small></div><p class="helper" style="margin-bottom:12px">${esc(t.note)} Percentage deviation is undefined for zero predictions.</p><div class="scroll" style="max-height:270px"><table class="results"><thead><tr><th>X</th><th>Measured</th><th>Predicted</th><th>Residual</th><th>Deviation %</th></tr></thead><tbody>${t.x
          .slice(0, 100)
          .map(
            (x, i) =>
              `<tr>${[x, t.observed[i], t.predicted[i], t.residuals[i], t.percentDeviation[i]].map((v) => `<td>${fmt(v)}</td>`).join("")}</tr>`,
          )
          .join(
            "",
          )}</tbody></table></div><p class="helper">First 100 points shown; export includes all points.</p></section>`;
    }
    $("#analysis-summary").innerHTML = html;
  }
  if ($("#residual-area")) {
    const r = f || t;
    $("#residual-area").innerHTML = r
      ? `<div class="heading"><h3>Inspect residuals</h3><select id="residual-mode" aria-label="Residual display" style="width:190px"><option value="raw">Observed − ${f ? "fit" : "theory"}</option>${f && f.method !== "ols" ? '<option value="normalized">Residual / Y sigma</option>' : ""}</select></div><div class="graphbox"><div id="residual" class="residual"></div></div><p class="helper" style="margin-top:12px">Inspect curvature, drift, clusters or changing scatter. These may reveal calibration problems or missing physics.</p>`
      : "";
    if (r) residual();
  }
  if ($("#stats-content")) stats();
}
function residual() {
  const r = S.a?.fit || S.a?.theory;
  if (!r || !$("#residual")) return;
  const normal = $("#residual-mode")?.value === "normalized";
  Plotly.react(
    "residual",
    [
      {
        x: r.x,
        y: normal ? r.normalized : r.residuals,
        mode: "markers",
        marker: { size: 7, color: "#3468e8" },
        error_y: {
          type: "data",
          array: r.sigma?.map((v) => v ?? 0),
          visible: !!r.sigma && !normal,
          color: "#9ab4ef",
          thickness: 1,
        },
      },
    ],
    {
      margin: { t: 20, r: 25, b: 55, l: 72 },
      showlegend: false,
      font: { family: "Segoe UI, sans-serif", size: 12, color: "#61738c" },
      xaxis: {
        title: { text: label(sheet().plot.x) },
        gridcolor: "#edf1f7",
        zeroline: false,
      },
      yaxis: {
        title: { text: normal ? "Residual / u(Y)" : "Observed − predicted" },
        gridcolor: "#edf1f7",
        zerolinecolor: "#8b9ab1",
      },
      shapes: normal
        ? [-2, 2].map((y) => ({
            type: "line",
            xref: "paper",
            x0: 0,
            x1: 1,
            y0: y,
            y1: y,
            line: { color: "#c7ab76", dash: "dot", width: 1 },
          }))
        : [],
    },
    { responsive: true, displaylogo: false },
  );
}
function stats() {
  const a = S.a,
    s = sheet();
  $("#stats-content").innerHTML =
    `<div class="scroll"><table class="results"><thead><tr><th>Column</th><th>n / missing</th><th>Mean</th><th>Sample SD</th><th>SEM</th><th>Median</th><th>Range</th></tr></thead><tbody>${s.columns
      .map((c) => {
        const v = a.stats[c.key];
        return `<tr><td><button class="link" data-action="distribution" data-id="${c.key}">${esc(c.name)}</button><small style="display:block">${esc(a.units[c.key])}</small></td><td>${v.n} / ${v.missing}</td>${[v.mean, v.sd, v.sem, v.median].map((x) => `<td>${fmt(x)}</td>`).join("")}<td>${fmt(v.min)} to ${fmt(v.max)}</td></tr>`;
      })
      .join(
        "",
      )}</tbody></table></div><div class="notice info">SD describes scatter. SEM estimates uncertainty of the mean of independent repeats. Instrumental and systematic uncertainty are separate. One measurement has no sample SD or SEM.</div>`;
  distribution(s.plot.y);
}
function distribution(k) {
  if (!$("#distribution") || !S.a.values[k]) return;
  const v = S.a.stats[k];
  Plotly.react(
    "distribution",
    [
      {
        x: S.a.values[k].filter(
          (x, i) => x !== null && sheet().rows[i].included !== false,
        ),
        type: "histogram",
        marker: { color: "#7a9def", line: { color: "white", width: 1 } },
      },
    ],
    {
      title: { text: esc(label(k)), x: 0.08, font: { size: 16 } },
      margin: { t: 60, r: 20, b: 50, l: 60 },
      font: { family: "Segoe UI, sans-serif", color: "#677892", size: 12 },
      xaxis: { title: { text: "Measurement" }, gridcolor: "#edf1f7" },
      yaxis: { title: { text: "Count" }, gridcolor: "#edf1f7" },
      annotations:
        v.ci95?.[0] != null
          ? [
              {
                text: `Mean 95% interval: ${fmt(v.ci95[0])} to ${fmt(v.ci95[1])}`,
                xref: "paper",
                yref: "paper",
                x: 1,
                y: 1,
                showarrow: false,
                font: { size: 11 },
              },
            ]
          : [],
    },
    { responsive: true, displaylogo: false },
  );
}

function editColumn(key = null) {
  const s = sheet(),
    c = s.columns.find((c) => c.key === key) || {
      key: "",
      name: "",
      unit: "",
      formula: "",
      uncertainty: "",
      uncertaintyMode: "absolute",
    };
  S.columnKey = key;
  modal(
    key ? "Edit column" : "Add column",
    `<div class="row2">${field("Name", "col-name", c.name)}${field("Formula symbol", "col-key", c.key, 'placeholder="e.g. velocity"')}</div><div class="row2">${field("Unit", "col-unit", c.unit, 'placeholder="e.g. m/s, degree, V"')}${field("Default uncertainty", "col-uncertainty", c.uncertainty, 'placeholder="Unknown if blank; exact if 0"')}</div>${select(
      "How to interpret the default uncertainty",
      "col-mode",
      [
        ["absolute", "Standard uncertainty (± one sigma)"],
        ["percent", "Percentage of the value"],
        ["relative", "Relative fraction"],
        ["resolution", "Digital resolution / √12"],
        ["bound", "Uniform ± half-width / √3"],
      ]
        .map(([k, l]) => opt(k, l, c.uncertaintyMode))
        .join(""),
    )}${select(
      "Or use values from an uncertainty column",
      "col-u-source",
      opt("", "None", c.uncertaintyColumn || "") +
        opts(
          s.columns.filter((z) => !z.formula && z.key !== key),
          c.uncertaintyColumn,
        ),
    )}${field("Formula (leave blank for measured values)", "col-formula", c.formula, 'class="mono" placeholder="e.g. 2*distance/time^2"')}${field("Description / calibration notes", "col-description", c.description)}<p class="helper">Formulas use column symbols, constants and functions such as sqrt, sin, exp and ln. Units are checked. Row uncertainty overrides are always standard uncertainty in the column unit. Editing a unit label does not convert measurements.</p>${key ? '<hr><div class="actions"><button data-action="budget">Uncertainty budget</button><button data-action="convert-column">Convert to new column</button><button data-action="sort-copy">Sorted dataset copy</button></div>' : ""}`,
    (key
      ? '<button class="danger" data-action="remove-column">Remove column</button>'
      : "") +
      '<button data-action="close">Cancel</button><button class="primary" data-action="save-column">Save column</button>',
  );
}
async function saveColumn() {
  const s = copy(sheet()),
    old = S.columnKey,
    key = $("#col-key").value.trim();
  const c = {
    key,
    name: $("#col-name").value.trim() || key,
    unit: $("#col-unit").value.trim(),
    formula: $("#col-formula").value.trim(),
    uncertainty: $("#col-uncertainty").value,
    uncertaintyMode: $("#col-mode").value,
    uncertaintyColumn: $("#col-u-source").value,
    description: $("#col-description").value,
  };
  if (!key) throw Error("Give the column a formula symbol.");
  const at = s.columns.findIndex((c) => c.key === old);
  if (
    at >= 0 &&
    !s.columns[at].formula &&
    c.formula &&
    s.rows.some((r) => String(r.values[old] ?? "").trim())
  )
    throw Error(
      "Keep the measured column and add a new calculated column for this formula.",
    );
  if (at < 0) s.columns.push(c);
  else s.columns[at] = c;
  if (old && old !== key) {
    const re = new RegExp("\\b" + old + "\\b", "g");
    s.columns.forEach((z) => {
      if (z.formula) z.formula = z.formula.replace(re, key);
      if (z.uncertaintyColumn === old) z.uncertaintyColumn = key;
    });
    s.rows.forEach((r) => {
      if (old in r.values) {
        r.values[key] = r.values[old];
        delete r.values[old];
      }
      if (old in (r.uncertainties || {})) {
        r.uncertainties[key] = r.uncertainties[old];
        delete r.uncertainties[old];
      }
    });
    for (const k of ["x", "y", "z"]) if (s.plot[k] === old) s.plot[k] = key;
    s.plot.overlay = (s.plot.overlay || []).map((k) => (k === old ? key : k));
    for (const k of ["fit", "theory"])
      s[k].expression = s[k].expression.replace(re, key);
    s.correlations.forEach((p) => {
      if (p.a === old) p.a = key;
      if (p.b === old) p.b = key;
    });
  }
  await api("/api/validate", "POST", { sheet: s, compute: true });
  mutate(
    "Edited column " + key,
    () => (S.p.sheets[S.p.sheets.findIndex((z) => z.id === s.id)] = s),
    true,
  );
  close();
}
function budget() {
  const key = S.columnKey,
    b = S.a?.budgets[key];
  if (!b) {
    toast(
      "Uncertainty budgets are available for calculated columns with valid formulas.",
    );
    return;
  }
  const i = Math.max(
    0,
    S.a.values[key].findIndex((v) => v != null),
  );
  modal(
    "Uncertainty budget · " + key,
    `<p class="mono">${esc(b.formula)}</p><p class="helper" style="margin:12px 0">${esc(b.method)} Showing row ${i + 1}. Correlation terms are included in the total, so squared contributions alone need not sum to it.</p><table class="results"><thead><tr><th>Source</th><th>∂result / ∂source</th><th>Source u</th><th>Sensitivity × u</th></tr></thead><tbody>${Object.keys(
      b.sensitivities,
    )
      .map(
        (k) =>
          `<tr><td>${esc(k)}</td><td>${fmt(b.sensitivities[k][i])}</td><td>${fmt(b.sourceUncertainties[k][i])}</td><td>${b.sourceUncertainties[k][i] == null ? "Unknown" : fmt(b.sensitivities[k][i] * b.sourceUncertainties[k][i])}</td></tr>`,
      )
      .join(
        "",
      )}</tbody></table><p style="margin-top:20px">Result: ${fmt(S.a.values[key][i])} ± ${fmt(S.a.uncertainties[key][i])} ${esc(S.a.units[key])}</p>`,
    '<button data-action="close">Done</button>',
  );
}
function pasteDialog() {
  modal(
    "Paste a table",
    '<p class="helper">Paste numeric rows copied from Excel or a tab-separated table. Each column maps to a measured column, starting at the selected cell (or the first blank row). For headers, units or extra columns, use Import.</p><textarea id="paste-table" style="min-height:230px;margin-top:16px" placeholder="0.2&#9;0.894\n0.3&#9;1.095"></textarea>',
    '<button data-action="close">Cancel</button><button class="primary" data-action="apply-paste">Insert measurements</button>',
  );
}
function pasteData(text, position) {
  const rows = text
    .trim()
    .split(/\r?\n/)
    .map((l) => l.split(l.includes("\t") ? "\t" : ","));
  const s = sheet(),
    pos = position || S.selection?.start || [s.rows.length, 0, "value"],
    [ri, ci, kind] = pos;
  const columns = s.columns.slice(ci).filter((c) => !c.formula);
  if (rows.some((r) => r.length > columns.length))
    throw Error(
      "The pasted table has more columns than this range. Add measured columns first, or import the file.",
    );
  if (ri + rows.length > 20000) throw Error("The row limit is 20,000.");
  mutate(
    "Pasted " + rows.length + " measurement rows",
    () => {
      rows.forEach((vals, n) => {
        while (s.rows.length <= ri + n)
          s.rows.push({
            id: uid(),
            values: {},
            uncertainties: {},
            included: true,
            note: "",
          });
        const r = s.rows[ri + n],
          target = kind === "uncertainty" ? (r.uncertainties ??= {}) : r.values;
        vals.forEach((v, j) => (target[columns[j].key] = v.trim()));
      });
    },
    true,
  );
  close();
}
async function copyRange() {
  const s = sheet(),
    a = S.selection?.start || [0, 0, "value"],
    b = S.selection?.end || [s.rows.length - 1, s.columns.length - 1, "value"];
  const lines = [];
  for (let i = Math.min(a[0], b[0]); i <= Math.max(a[0], b[0]); i++)
    lines.push(
      s.columns
        .slice(Math.min(a[1], b[1]), Math.max(a[1], b[1]) + 1)
        .map((c) =>
          a[2] === "uncertainty"
            ? (S.a?.uncertainties[c.key]?.[i] ?? "")
            : ((c.formula
                ? S.a?.values[c.key]?.[i]
                : s.rows[i]?.values[c.key]) ?? ""),
        )
        .join("\t"),
    );
  await navigator.clipboard.writeText(lines.join("\n"));
  toast("Range copied. Shift-click another cell to extend a selection.");
}
async function identify(kind) {
  const target = sheet()[kind],
    r = await api("/api/symbols", "POST", {
      sheet: sheet(),
      expression: target.expression,
    });
  mutate(
    "Identified " + kind + " parameters",
    () => {
      target.params = r.names.map(
        (name) =>
          target.params.find((p) => p.name === name) || {
            name,
            value: 1,
            unit: "",
            lower: "",
            upper: "",
            fixed: false,
          },
      );
      if (kind === "fit") target.enabled = false;
    },
    true,
  );
}
function constantsDialog() {
  const s = sheet();
  modal(
    "Constants & correlations",
    `<p class="helper">Custom constants apply to every row. They can carry standard uncertainty. Fitting currently treats rows independently; a shared uncertain constant creates cross-row covariance that these fits do not model.</p><div class="field" style="margin-top:18px"><label for="custom-constants">One per line: symbol, value, unit, standard uncertainty</label><textarea id="custom-constants" class="mono" placeholder="g, 9.81, m/s^2, 0.02">${esc(s.constants.map((c) => [c.key, c.value, c.unit, c.uncertainty ?? 0].join(", ")).join("\n"))}</textarea></div><div class="field"><label for="correlations">Within-row correlations: raw symbol A, raw symbol B, coefficient</label><textarea id="correlations" class="mono" placeholder="length, width, 0.5">${esc(s.correlations.map((c) => [c.a, c.b, c.rho].join(", ")).join("\n"))}</textarea></div><details><summary>Built-in scientific constants</summary><table class="results"><thead><tr><th>Symbol</th><th>Value</th><th>Unit</th><th>Standard u</th></tr></thead><tbody>${Object.entries(
      S.config.constants,
    )
      .map(
        ([k, c]) =>
          `<tr><td class="mono">${k}</td><td>${fmt(c[0], 9)}</td><td>${esc(c[1])}</td><td>${fmt(c[2])}</td></tr>`,
      )
      .join(
        "",
      )}</tbody></table><p class="helper">g0 is conventional standard gravity, not your local g. Non-exact built-ins use the installed SciPy constants dataset.</p></details>`,
    '<button data-action="close">Cancel</button><button class="primary" data-action="save-constants">Apply</button>',
  );
}
async function saveConstants() {
  const s = copy(sheet()),
    lines = (id) =>
      $(id)
        .value.split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
        .map((l) => l.split(",").map((v) => v.trim()));
  s.constants = lines("#custom-constants").map(
    ([key, value, unit = "", uncertainty = "0"]) => ({
      key,
      value,
      unit,
      uncertainty,
    }),
  );
  s.correlations = lines("#correlations").map(([a, b, rho]) => ({
    a,
    b,
    rho: Number(rho),
  }));
  await api("/api/validate", "POST", { sheet: s, compute: true });
  mutate(
    "Updated constants and correlations",
    () => (S.p.sheets[S.p.sheets.findIndex((z) => z.id === s.id)] = s),
    true,
  );
  close();
}
function importDialog(file) {
  S.importFile = file;
  S.importResult = null;
  modal(
    "Import measurements",
    `<p>${esc(file.name)}</p><div class="row2" style="margin-top:18px">${field("Header row (1 = first row)", "import-header", 1, 'type="number" min="1" max="101"')}${select(
      "Delimiter",
      "import-delimiter",
      [
        ["auto", "Detect automatically"],
        [",", "Comma"],
        ["\t", "Tab"],
        [";", "Semicolon"],
        ["|", "Pipe"],
      ]
        .map(([k, l]) => opt(k, l, "auto"))
        .join(""),
    )}</div>${field("Excel worksheet name (blank = first)", "import-tab", "")}<label class="check"><input type="checkbox" id="import-decimal"> Use comma as decimal separator</label><p class="helper">Headers like Time [s] and Voltage [V] define units. Missing and nonnumeric values stay visible. Excel formulas are imported as text, never executed.</p><button data-action="preview-import" style="margin:16px 0">Preview import</button><div id="import-preview"></div>`,
    '<button data-action="close">Cancel</button>' +
      (S.p ? '<button data-action="import-sheet">Add dataset</button>' : "") +
      '<button class="primary" data-action="import-project">New experiment</button>',
  );
}
async function previewImport() {
  const data = new FormData();
  data.append("file", S.importFile);
  data.append("header", Number($("#import-header").value) - 1);
  data.append("delimiter", $("#import-delimiter").value);
  data.append("decimalComma", $("#import-decimal").checked);
  data.append("tab", $("#import-tab").value);
  const response = await api("/api/import", "POST", data),
    s = response.sheet;
  S.importResult = s;
  $("#import-preview").innerHTML =
    `<p class="helper">${s.rows.length} rows · ${s.columns.length} columns. Original text is retained in the project.</p><div class="scroll"><table class="results"><thead><tr>${s.columns.map((c) => `<th>${esc(c.name)}<small style="display:block">${esc(c.unit)}</small></th>`).join("")}</tr></thead><tbody>${s.rows
      .slice(0, 6)
      .map(
        (r) =>
          `<tr>${s.columns.map((c) => `<td>${esc(r.values[c.key])}</td>`).join("")}</tr>`,
      )
      .join("")}</tbody></table></div>`;
  return s;
}
async function importFile(file) {
  if (file.name.toLowerCase().endsWith(".json")) {
    const p = JSON.parse(await file.text());
    p.name = (p.name || "Imported experiment") + " · imported";
    await create({ project: p });
    toast("Project imported as a new experiment.");
  } else importDialog(file);
}
function graphSettings() {
  const p = sheet().plot;
  modal(
    "Customize the graph",
    `${field("Title", "custom-title", p.title)}<div class="row2">${field("X-axis label", "custom-xLabel", p.xLabel)}${field("Y-axis label", "custom-yLabel", p.yLabel)}</div><div class="row2">${field("Marker size", "custom-markerSize", p.markerSize, 'type="number" min="2" max="20"')}${field("Line width", "custom-lineWidth", p.lineWidth, 'type="number" min="1" max="8"')}</div>${select(
      "Figure style",
      "custom-preset",
      [
        ["report", "Lab report"],
        ["publication", "Publication"],
        ["presentation", "Presentation"],
        ["dark", "Dark"],
        ["minimal", "Minimal"],
      ]
        .map(([v, l]) => opt(v, l, p.preset))
        .join(""),
    )}<p class="helper">Axis limits, logarithmic scales and extra series are available in the Data & graph sidebar. Double-click a title, axis label, legend name or annotation directly on the graph to edit it.</p>`,
    '<button data-action="close">Cancel</button><button class="primary" data-action="apply-graph">Apply</button>',
  );
}
function annotation() {
  modal(
    "Add graph annotation",
    field("Note", "annotation-text") +
      `<div class="row2">${field("Horizontal position (0–1)", "annotation-x", 0.55, 'type="number" min="0" max="1" step="0.05"')}${field("Vertical position (0–1)", "annotation-y", 0.9, 'type="number" min="0" max="1" step="0.05"')}</div><p class="helper">Positions are fractions of the plotting area. Double-click a note to change its text; empty text removes it.</p>`,
    '<button data-action="close">Cancel</button><button class="primary" data-action="add-annotation">Add note</button>',
  );
}
async function figure(kind) {
  if (!$("#graph")?.data) {
    S.tab = "data";
    workspace();
    await graph();
  }
  if (!$("#graph")?.data)
    throw Error("Add measurements before exporting a figure.");
  if (kind === "pdf") {
    const url = await Plotly.toImage($("#graph"), {
      format: "png",
      width: 1500,
      height: 1000,
      scale: 2,
    });
    $("#print-area").innerHTML =
      `<h1>${esc(S.p.name)}</h1><img src="${url}" style="width:100%"><p>${esc(sheet().notes)}</p>`;
    const img = $("#print-area img");
    await img.decode();
    window.print();
    return;
  }
  await Plotly.downloadImage($("#graph"), {
    format: kind,
    width: 1500,
    height: 1000,
    scale: kind === "png" ? 2 : 1,
    filename: "better-exl-figure",
  });
}
function exportDialog() {
  modal(
    "Take your work with you",
    '<p class="helper">Project JSON contains every dataset, formula, graph setting, note and imported source. A ZIP adds the current dataset’s raw and calculated tables, analysis, report and Python script.</p><div class="exports">' +
      [
        ["project", "Project backup", "Editable JSON · all datasets"],
        ["bundle", "Reproducible bundle", "ZIP · project + current analysis"],
        ["csv", "Calculated data", "CSV · values + standard uncertainties"],
        ["raw", "Raw measurements", "CSV · entered values + overrides"],
        ["report", "Analysis report", "Markdown · equations and results"],
        ["python", "Python script", "Rerun using this app’s engine"],
        [
          "analysis",
          "Full numerical results",
          "JSON · residuals and covariance",
        ],
        ["png", "Figure · PNG", "3000 × 2000 pixels"],
        ["svg", "Figure · SVG", "Vector 2D figure"],
        ["pdf", "Figure · PDF", "Browser Print → Save as PDF"],
      ]
        .map(
          ([id, title, desc]) =>
            `<button class="card" data-action="download" data-id="${id}"><strong>${title}</strong><small>${desc}</small></button>`,
        )
        .join("") +
      "</div>",
    '<button data-action="close">Done</button>',
  );
}
async function download(kind) {
  if (["png", "svg", "pdf"].includes(kind)) return figure(kind);
  if (kind === "project") {
    dl(
      JSON.stringify(S.p, null, 2),
      "better-exl-project.json",
      "application/json",
    );
    return;
  }
  if (WEB) {
    const result = await api("/api/export", "POST", {
      project: S.p,
      sheetId: S.sid,
      kind,
    });
    const content = result.base64
      ? Uint8Array.from(atob(result.base64), (c) => c.charCodeAt(0))
      : result.text;
    dl(content, result.name, result.type);
    toast("Export ready.");
    return;
  }
  const r = await fetch("/api/export", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Better-Exl": token },
    body: JSON.stringify({ project: S.p, sheetId: S.sid, kind }),
  });
  if (!r.ok) throw Error((await r.json()).error);
  const name =
    r.headers.get("Content-Disposition")?.match(/filename="?([^";]+)/)?.[1] ||
    kind;
  dl(
    await r.blob(),
    name,
    kind === "bundle" ? "application/zip" : "text/plain",
  );
  toast("Export ready.");
}
function repeatsDialog() {
  const s = sheet();
  S.repeatResult = null;
  modal(
    "Group repeated trials",
    `<p class="helper">Rows with exactly matching group values are repeated trials. SEM uses independent repeat scatter; the instrument term is a shared standard uncertainty added in quadrature. Individual row uncertainties are not averaged by this tool.</p><div class="row2" style="margin-top:16px">${select("Group by", "repeat-group", opts(s.columns, s.plot.x))}${select("Measured quantity", "repeat-target", opts(s.columns, s.plot.y))}</div>${field("Instrument standard uncertainty (quantity units)", "repeat-instrument", 0, 'type="number" min="0" step="any"')}<button data-action="preview-repeats">Calculate groups</button><div id="repeat-preview"></div>`,
    '<button data-action="close">Cancel</button><button class="primary" data-action="save-repeats">Create summary dataset</button>',
  );
}
async function previewRepeats() {
  if ($("#repeat-group").value === $("#repeat-target").value)
    throw Error("Choose different group and measured columns.");
  const r = await api("/api/repeated", "POST", {
    sheet: sheet(),
    group: $("#repeat-group").value,
    target: $("#repeat-target").value,
    instrument: Number($("#repeat-instrument").value),
  });
  S.repeatResult = {
    result: r,
    group: $("#repeat-group").value,
    target: $("#repeat-target").value,
  };
  $("#repeat-preview").innerHTML =
    '<div class="scroll"><table class="results"><thead><tr><th>Group</th><th>n</th><th>Mean</th><th>SD</th><th>SEM</th><th>Combined u</th></tr></thead><tbody>' +
    r.rows
      .map(
        (g) =>
          `<tr>${[g.group, g.n, g.mean, g.sd, g.sem, g.combined].map((v) => `<td>${fmt(v)}</td>`).join("")}</tr>`,
      )
      .join("") +
    "</tbody></table></div>";
  return S.repeatResult;
}
function signalsDialog() {
  S.signalResult = null;
  modal(
    "Signal tools",
    `<p class="helper">Uses the selected X and Y columns and included rows. X must increase strictly; FFT and PSD need evenly spaced samples. Transformed measurement uncertainty is not estimated.</p>${select(
      "Operation",
      "signal-operation",
      [
        ["fft", "FFT · amplitude spectrum"],
        ["spectrum", "Power spectral density"],
        ["derivative", "Numerical derivative"],
        ["integral", "Cumulative integral"],
        ["smooth", "Savitzky–Golay smoothing"],
      ]
        .map(([k, l]) => opt(k, l, "fft"))
        .join(""),
    )}${field("Smoothing window (odd number)", "signal-window", 7, 'type="number" min="3" step="2"')}<button data-action="preview-signal">Preview transformation</button><div id="signal-note" class="helper" style="margin:15px 0"></div><div id="signal-preview" style="height:280px"></div>`,
    '<button data-action="close">Cancel</button><button class="primary" data-action="save-signal">Create transformed dataset</button>',
  );
}
async function previewSignal() {
  const op = $("#signal-operation").value,
    r = await api("/api/signal", "POST", {
      sheet: sheet(),
      operation: op,
      window: Number($("#signal-window").value),
    });
  S.signalResult = { ...r, operation: op };
  $("#signal-note").textContent =
    r.note +
    (r.peaks.length
      ? " Peaks: " +
        r.peaks
          .slice()
          .sort((a, b) => b.y - a.y)
          .slice(0, 3)
          .map((p) => fmt(p.x) + " " + r.xunit)
          .join(", ")
      : "");
  await Plotly.newPlot(
    "signal-preview",
    [{ x: r.x, y: r.y, mode: "lines", line: { color: "#3468e8" } }],
    {
      margin: { t: 10, l: 60, r: 10, b: 55 },
      xaxis: { title: { text: r.xunit } },
      yaxis: { title: { text: r.yunit } },
    },
    { responsive: true, displaylogo: false },
  );
  return S.signalResult;
}
function addDataset(s) {
  if (S.p.sheets.length >= 30)
    throw Error("Use at most 30 datasets per experiment.");
  mutate(
    "Added dataset " + s.name,
    () => {
      S.p.sheets.push(s);
      S.sid = s.id;
      S.a = null;
      S.page = 0;
      S.search = "";
      S.selection = null;
    },
    true,
  );
  close();
}
async function history() {
  await save();
  const rows = await api("/api/projects/" + S.p.id + "/revisions");
  modal(
    "Revision history",
    '<p class="helper">Every saved revision is kept on this computer. Restoring creates a separate experiment, preserving the current one. The most recent 200 revisions are listed.</p><div class="history">' +
      rows
        .map(
          (r) =>
            `<div class="history-item"><div>Revision ${r.version}<small>${new Date(r.created || r.updated).toLocaleString()}</small></div><button data-action="restore" data-id="${r.version}">Restore a copy</button></div>`,
        )
        .join("") +
      "</div>",
    '<button data-action="close">Done</button>',
  );
}
function textDialog(title, value, action, label = "Text") {
  modal(
    title,
    field(label, "edit-text", value),
    '<button data-action="close">Cancel</button><button class="primary" data-action="' +
      action +
      '">Save</button>',
  );
}
function undo(redo = false) {
  const from = redo ? S.redo : S.undo,
    to = redo ? S.undo : S.redo;
  if (!from.length) return;
  to.push(copy(S.p));
  const version = S.p.version;
  S.p = from.pop();
  S.p.version = version;
  if (!S.p.sheets.find((s) => s.id === S.sid)) S.sid = S.p.sheets[0].id;
  S.a = null;
  changed(redo ? "Redid edit" : "Undid edit", true);
}
async function latex(fit = false) {
  const safe = (t) => String(t ?? "").replace(/([&%$#_{}])/g, "\\$1");
  const rows = fit
    ? (S.a?.fit?.params || []).map((p) => [
        safe(p.name),
        fmt(p.value),
        fmt(p.stderr),
        safe(p.unit),
      ])
    : sheet().columns.map((c) => [
        safe(c.name),
        fmt(S.a?.stats[c.key]?.mean),
        fmt(S.a?.stats[c.key]?.sem),
        safe(c.unit),
      ]);
  await navigator.clipboard.writeText(
    "\\begin{tabular}{lrrl}\n" +
      (fit
        ? "Parameter & Estimate & Standard uncertainty & Unit"
        : "Column & Mean & SEM & Unit") +
      " \\\\\n\\hline\n" +
      rows.map((r) => r.join(" & ") + " \\\\").join("\n") +
      "\n\\end{tabular}",
  );
  toast("LaTeX table copied.");
}
function help() {
  modal(
    "Your first lab, in five steps",
    `<ol style="line-height:1.8;padding-left:22px"><li>Create an experiment or import CSV / XLSX. Templates start with empty measurements; the pendulum example is labelled synthetic.</li><li>Click column headings to set names, symbols, units and uncertainty. Put raw values in the main cell and optional standard uncertainty in the smaller ± cell.</li><li>Add calculated columns with formulas such as <code>t/N</code> or <code>2*d/t^2</code>. Open a calculated column’s uncertainty budget to inspect contributions.</li><li>Choose X and Y, then open Fit & theory. Check guesses, units and fitting method. Enter an independent physical prediction to compare with your measurements.</li><li>Inspect residuals, record assumptions in Notebook and export a project backup or complete analysis bundle.</li></ol><hr><p class="helper">Double-click graph labels to edit them. Tab / Enter moves between cells; paste multiple rows from Excel. Shift-click selects a rectangular range. Ctrl/Cmd+S saves, Ctrl/Cmd+Z undoes; use the redo button or Ctrl/Cmd+Shift+Z. Projects autosave on your device. Export project backups regularly and before moving between devices.</p><p class="helper" style="margin-top:12px">Uncertainty propagation is first order. Fits assume independent rows, with within-row X/Y correlation unsupported by ODR. Theory bands and general covariance fitting are not part of v1. See the repository’s METHODS.md for precise assumptions.</p>`,
    '<button data-action="close">Got it</button>',
  );
}

function searchProjects() {
  const list = (q) =>
    S.projects
      .filter((p) => p.name.toLowerCase().includes(q.toLowerCase()))
      .map(
        (p) =>
          `<button class="search-result" data-action="open" data-id="${p.id}">${icon("flask", 19)}<span><strong>${esc(p.name)}</strong><small>Edited ${new Date(p.updated).toLocaleDateString()}</small></span>${icon("arrow", 16)}</button>`,
      )
      .join("") ||
    '<p class="helper">No matching experiments. Create a new one to get started.</p>';
  S.searchProjects = list;
  modal(
    "Find an experiment",
    field(
      "Search your workspace",
      "project-search",
      "",
      'placeholder="Experiment name…"',
    ) + `<div id="project-search-results">${list("")}</div>`,
    '<button data-action="new">New experiment</button>',
  );
}
async function storageDetails() {
  const stats = WEB ? await window.BetterExlWeb.storageInfo() : null;
  modal(
    "Your data belongs to you",
    `<div class="storage-illustration">${icon("shield", 32)}</div><h3>${WEB ? "Saved in this browser. Private to this device." : "Saved on your computer."}</h3><p style="margin-top:12px">${WEB ? "Experiments and revisions stay in this browser’s storage. They are not uploaded to GitHub or synced between devices. Clearing site data, private browsing, or changing browsers can remove access to them." : "Experiments and revisions are stored in your local Better Exl database."}</p><p>Use <strong>Export → Project backup</strong> to keep a copy or move your work to another device. Import the JSON file to continue exactly where you left off.</p>${stats ? `<p class="helper">This site is using about ${((stats.usage || 0) / 1024 / 1024).toFixed(1)} MB of browser storage.</p>` : ""}<div class="notice info">${WEB ? "The first calculation downloads the analysis tools. Your measurements are processed on your device." : "The local edition works offline after its first setup."}</div>`,
    '<button data-action="close">Got it</button>' +
      (S.p
        ? '<button class="primary" data-action="export">Export a backup</button>'
        : ""),
  );
}
const actions = {
  "search-projects": searchProjects,
  storage: storageDetails,
  focus: () => {
    document.body.classList.toggle("focus-mode");
    graph();
  },
  "retry-engine": async () => {
    if (WEB) {
      await window.BetterExlWeb.retry();
      if (S.p) await analyze();
    }
  },
  close,
  home: async () => {
    await save();
    S.p = null;
    S.a = null;
    ++S.seq;
    sidebar();
    home();
  },
  back: () => (S.p ? workspace() : home()),
  new: () => newDialog(),
  templates,
  template: (e) => newDialog(e.dataset.id),
  create: () =>
    create({
      name: $("#new-name").value.trim() || "Untitled experiment",
      template: $("#new-template").value,
    }),
  demo: () => create({ demo: true }),
  open: (e) => openProject(e.dataset.id),
  quick: async () => {
    await create({ name: "Quick plot", template: "blank" });
    pasteDialog();
  },
  help,
  tab: (e) => {
    S.tab = e.dataset.id;
    workspace();
  },
  "add-sheet": async () =>
    addDataset(await api("/api/template", "POST", { id: "blank" })),
  "rename-sheet": () =>
    textDialog("Rename dataset", sheet().name, "save-sheet-name"),
  "save-sheet-name": () => {
    const name = $("#edit-text").value.trim();
    if (!name) throw Error("Enter a name.");
    mutate("Renamed dataset", () => (sheet().name = name), true, false);
    close();
  },
  "save-project-name": () => {
    const name = $("#edit-text").value.trim();
    if (!name) throw Error("Enter a name.");
    mutate("Renamed experiment", () => (S.p.name = name), true, false);
    close();
  },
  undo: () => undo(),
  redo: () => undo(true),
  "add-row": () =>
    mutate(
      "Added measurement row",
      () => {
        if (sheet().rows.length >= 20000)
          throw Error("The row limit is 20,000.");
        sheet().rows.push({
          id: uid(),
          values: {},
          uncertainties: {},
          included: true,
          note: "",
        });
        S.page = Math.floor((sheet().rows.length - 1) / 100);
      },
      true,
    ),
  "add-column": () => editColumn(),
  "save-column": saveColumn,
  budget,
  "remove-column": async () => {
    const k = S.columnKey,
      s = copy(sheet());
    if (s.columns.length < 2) throw Error("Keep at least one column.");
    if (!confirm("Remove " + k + "? Previous values stay in revision history."))
      return;
    s.columns = s.columns.filter((c) => c.key !== k);
    for (const r of s.rows) {
      delete r.values[k];
      delete r.uncertainties?.[k];
    }
    for (const axis of ["x", "y", "z"])
      if (s.plot[axis] === k) s.plot[axis] = s.columns[0].key;
    s.plot.overlay = (s.plot.overlay || []).filter((c) => c !== k);
    s.fit.enabled = false;
    s.theory.enabled = false;
    mutate(
      "Removed column " + k,
      () => (S.p.sheets[S.p.sheets.findIndex((z) => z.id === s.id)] = s),
      true,
    );
    close();
  },
  "convert-column": () => {
    const c = sheet().columns.find((c) => c.key === S.columnKey);
    modal(
      "Convert into a new column",
      field("New column symbol", "convert-key", c.key + "_converted") +
        field("Target unit", "convert-unit", c.unit) +
        '<p class="helper">A derived column converts the source values and propagates their uncertainty. Original measurements stay available.</p>',
      '<button data-action="close">Cancel</button><button class="primary" data-action="apply-convert">Convert</button>',
    );
  },
  "apply-convert": async () => {
    const c = sheet().columns.find((c) => c.key === S.columnKey),
      key = $("#convert-key").value.trim(),
      unit = $("#convert-unit").value.trim();
    await api("/api/convert", "POST", { value: 1, from: c.unit, to: unit });
    const s = copy(sheet());
    s.columns.push({
      key,
      name: c.name + " (" + unit + ")",
      unit,
      formula: c.key,
      uncertainty: "",
      uncertaintyMode: "absolute",
    });
    await api("/api/validate", "POST", { sheet: s });
    mutate(
      "Converted " + c.key + " to " + unit,
      () => (sheet().columns = s.columns),
      true,
    );
    close();
  },
  "sort-copy": () => {
    const k = S.columnKey,
      s = copy(sheet());
    s.id = uid();
    s.name += " · sorted by " + k;
    const values = new Map(
      sheet().rows.map((r, i) => [r.id, S.a?.values[k]?.[i]]),
    );
    s.rows.sort(
      (a, b) => (values.get(a.id) ?? Infinity) - (values.get(b.id) ?? Infinity),
    );
    addDataset(s);
  },
  paste: pasteDialog,
  "apply-paste": () => pasteData($("#paste-table").value),
  "copy-range": copyRange,
  prev: () => {
    S.page = Math.max(0, S.page - 1);
    refreshTable();
  },
  next: () => {
    S.page = Math.min(
      Math.max(0, Math.ceil(filtered().length / 100) - 1),
      S.page + 1,
    );
    refreshTable();
  },
  "remove-row": (e) =>
    mutate(
      "Removed row " + (+e.dataset.id + 1),
      () => sheet().rows.splice(Number(e.dataset.id), 1),
      true,
    ),
  "row-note": (e) => {
    S.rowNote = Number(e.dataset.id);
    textDialog(
      "Row " + (S.rowNote + 1) + " note",
      sheet().rows[S.rowNote].note,
      "save-row-note",
    );
  },
  "save-row-note": () => {
    const text = $("#edit-text").value;
    mutate(
      "Edited row note",
      () => (sheet().rows[S.rowNote].note = text),
      true,
      false,
    );
    close();
  },
  import: () => {
    $("#file-picker").value = "";
    $("#file-picker").click();
  },
  "preview-import": previewImport,
  "import-sheet": async () => addDataset(await previewImport()),
  "import-project": async () => {
    const s = await previewImport();
    await create({
      project: {
        name: s.name,
        objective: "",
        apparatus: "",
        notes: "",
        sheets: [s],
        log: [],
      },
    });
  },
  identify: (e) => identify(e.dataset.id),
  "run-fit": async () => {
    if (!sheet().fit.params.length) {
      if (sheet().fit.model === "custom") {
        await identify("fit");
        toast("Check parameter guesses and units, then run the fit.");
        return;
      }
      const method = sheet().fit.method,
        r = await api("/api/model", "POST", {
          sheet: sheet(),
          model: sheet().fit.model,
        });
      mutate(
        "Initialized model parameters",
        () => Object.assign(sheet().fit, r, { method }),
        true,
        false,
      );
    }
    mutate(
      "Ran " + sheet().fit.method + " fit",
      () => (sheet().fit.enabled = true),
      true,
    );
    await analyze();
  },
  theory: () =>
    mutate(
      "Toggled theory comparison",
      () => (sheet().theory.enabled = !sheet().theory.enabled),
      true,
    ),
  "theory-to-fit": () =>
    mutate(
      "Copied theory equation into a new fit",
      () => {
        sheet().fit = {
          enabled: false,
          model: "custom",
          method: "ols",
          expression: sheet().theory.expression,
          params: sheet().theory.params.map((p) => ({
            ...p,
            lower: "",
            upper: "",
            fixed: false,
          })),
        };
      },
      true,
    ),
  constants: constantsDialog,
  "save-constants": saveConstants,
  "graph-settings": graphSettings,
  "apply-graph": () => {
    const values = {};
    for (const k of [
      "title",
      "xLabel",
      "yLabel",
      "markerSize",
      "lineWidth",
      "preset",
    ])
      values[k] = ["markerSize", "lineWidth"].includes(k)
        ? Number($("#custom-" + k).value)
        : $("#custom-" + k).value;
    mutate(
      "Customized graph",
      () => Object.assign(sheet().plot, values),
      true,
      false,
    );
    graph();
    close();
  },
  "graph-text": () => {
    const value = $("#graph-text").value,
      { kind, key } = S.edit;
    mutate(
      "Edited graph " + kind,
      () => {
        const p = sheet().plot;
        if (kind === "legend") {
          p.names ??= {};
          p.names[key] = value;
        } else if (kind === "annotation") {
          if (value) p.annotations[key].text = value;
          else p.annotations.splice(key, 1);
        } else p[kind] = value;
      },
      true,
      false,
    );
    graph();
    close();
  },
  annotation,
  "add-annotation": () => {
    const text = $("#annotation-text").value,
      x = Number($("#annotation-x").value),
      y = Number($("#annotation-y").value);
    if (!text || x < 0 || x > 1 || y < 0 || y > 1)
      throw Error("Add text and positions from 0 to 1.");
    mutate(
      "Annotated graph",
      () =>
        sheet().plot.annotations.push({
          text,
          x,
          y,
          xref: "paper",
          yref: "paper",
          showarrow: false,
          bgcolor: "rgba(255,255,255,.85)",
          borderpad: 5,
        }),
      false,
      false,
    );
    graph();
    close();
  },
  png: () => figure("png"),
  svg: () => figure("svg"),
  pdf: () => figure("pdf"),
  export: exportDialog,
  download: (e) => download(e.dataset.id),
  repeats: repeatsDialog,
  "preview-repeats": previewRepeats,
  "save-repeats": async () => {
    const { result: r, group, target } = await previewRepeats(),
      s = await api("/api/template", "POST", { id: "blank" }),
      src = sheet();
    s.name = src.name + " · repeats";
    s.columns = [
      {
        ...copy(src.columns.find((c) => c.key === group)),
        formula: "",
        uncertainty: "",
      },
      {
        ...copy(src.columns.find((c) => c.key === target)),
        formula: "",
        uncertainty: "",
      },
    ];
    s.columns.forEach((c) => delete c.uncertaintyColumn);
    s.plot.x = group;
    s.plot.y = target;
    s.rows = r.rows.map((g) => ({
      id: uid(),
      values: { [group]: g.group, [target]: g.mean },
      uncertainties: { [target]: g.combined ?? "" },
      included: true,
      note: `n=${g.n}; SD=${fmt(g.sd)}; SEM=${fmt(g.sem)}`,
    }));
    s.notes =
      r.note ||
      "Repeat means; independent scatter and shared instrument uncertainty.";
    s.source = "Summary of " + src.name;
    addDataset(s);
  },
  signals: signalsDialog,
  "preview-signal": previewSignal,
  "save-signal": async () => {
    const r = await previewSignal(),
      s = await api("/api/template", "POST", { id: "blank" });
    s.name = sheet().name + " · " + r.operation;
    s.columns[0].unit = r.xunit;
    s.columns[1].unit = r.yunit;
    s.rows = r.x.map((x, i) => ({
      id: uid(),
      values: { x, y: r.y[i] },
      uncertainties: {},
      included: true,
      note: "",
    }));
    s.notes = r.note;
    s.source = "Transformed from " + sheet().name;
    s.plot.kind = "line";
    addDataset(s);
  },
  distribution: (e) => distribution(e.dataset.id),
  latex: () => latex(),
  "latex-fit": () => latex(true),
  history,
  restore: async (e) => {
    const p = await api(
      "/api/projects/" + S.p.id + "/revisions/" + e.dataset.id,
    );
    p.name += " · revision " + e.dataset.id;
    await create({ project: p });
  },
  observation: () =>
    textDialog("Timestamped observation", "", "save-observation"),
  "save-observation": () => {
    const t = $("#edit-text").value;
    mutate(
      "Added observation",
      () => (S.p.notes += "\n\n[" + new Date().toLocaleString() + "] " + t),
      true,
      false,
    );
    close();
  },
  "recover-draft": async () => {
    const p = S.recovery;
    p.name += " · recovered";
    await create({ project: p });
    localStorage.removeItem("better-exl-draft");
  },
  "skip-recovery": () => {
    localStorage.removeItem("better-exl-draft");
    close();
  },
};
document.addEventListener("click", async (e) => {
  const b = e.target.closest("[data-action]");
  if (b && !b.disabled) {
    try {
      b.disabled = true;
      await actions[b.dataset.action]?.(b);
    } catch (err) {
      toast(err.message, true);
    } finally {
      if (b.isConnected) b.disabled = false;
    }
  } else {
    const c = e.target.closest("[data-column]");
    if (c) editColumn(c.dataset.column);
  }
});
function commitCell(el) {
  const [i, j, kind] = el.dataset.cell.split(":"),
    c = sheet().columns[j],
    r = sheet().rows[i],
    values = kind === "uncertainty" ? (r.uncertainties ??= {}) : r.values;
  if (String(values[c.key] ?? "") === el.value) return;
  const action = "Edited " + c.key + " row " + (+i + 1);
  if (S.cellEdit === el) {
    values[c.key] = el.value;
    changed(action, false, true, false);
  } else {
    mutate(action, () => (values[c.key] = el.value));
    S.cellEdit = el;
  }
}
document.addEventListener("focusout", (e) => {
  if (S.cellEdit === e.target) S.cellEdit = null;
});
document.addEventListener("change", async (e) => {
  const el = e.target;
  try {
    if (el.matches("[data-cell]")) {
      commitCell(el);
    } else if (el.matches("[data-include]")) {
      mutate(
        "Changed row inclusion",
        () => (sheet().rows[el.dataset.include].included = el.checked),
        false,
      );
      el.closest("tr").classList.toggle("excluded", !el.checked);
    } else if (el.id === "sheet-select") {
      S.sid = el.value;
      S.a = null;
      S.page = 0;
      S.search = "";
      S.selection = null;
      workspace();
      await analyze();
    } else if (el.id.startsWith("plot-")) {
      const k = el.id.slice(5),
        v =
          el.type === "checkbox"
            ? el.checked
            : el.type === "number"
              ? Number(el.value)
              : el.value;
      mutate(
        "Changed graph " + k,
        () => {
          sheet().plot[k] = v;
          if (["x", "y"].includes(k)) {
            sheet().fit.enabled = false;
            sheet().theory.enabled = false;
          }
        },
        ["kind", "x", "y"].includes(k),
        ["x", "y", "z", "kind"].includes(k),
      );
      graph();
    } else if (el.dataset.overlay) {
      mutate(
        "Changed graph layers",
        () => {
          const p = sheet().plot;
          p.overlay = el.checked
            ? [...(p.overlay || []), el.dataset.overlay]
            : (p.overlay || []).filter((k) => k !== el.dataset.overlay);
        },
        false,
        false,
      );
      graph();
    } else if (el.dataset.param) {
      const [kind, i, k] = el.dataset.param.split(":");
      mutate(
        "Edited " + kind + " parameter",
        () =>
          (sheet()[kind].params[i][k] = k === "fixed" ? el.checked : el.value),
      );
    } else if (el.id === "fit-model") {
      const r = await api("/api/model", "POST", {
        sheet: sheet(),
        model: el.value,
      });
      mutate(
        "Selected " + el.value + " model",
        () =>
          Object.assign(sheet().fit, r, { enabled: false, model: el.value }),
        true,
      );
    } else if (el.id === "fit-method") {
      mutate("Changed fitting method", () => (sheet().fit.method = el.value));
    } else if (el.id === "fit-enabled") {
      mutate("Changed fit activity", () => (sheet().fit.enabled = el.checked));
    } else if (["fit-expression", "theory-expression"].includes(el.id)) {
      const kind = el.id.split("-")[0];
      mutate("Edited " + kind + " equation", () => {
        sheet()[kind].expression = el.value;
        if (kind === "fit") sheet().fit.model = "custom";
      });
    } else if (el.id.startsWith("note-")) {
      const k = el.id.slice(5);
      mutate(
        "Edited notebook " + k,
        () => {
          if (k === "method") sheet().notes = el.value;
          else S.p[k] = el.value;
        },
        false,
        false,
      );
    } else if (el.id === "residual-mode") residual();
    else if (el.id === "file-picker" && el.files[0])
      await importFile(el.files[0]);
  } catch (err) {
    toast(err.message, true);
  }
});
document.addEventListener("input", (e) => {
  if (e.target.matches("[data-cell]")) commitCell(e.target);
  if (e.target.id === "project-search")
    $("#project-search-results").innerHTML = S.searchProjects(e.target.value);
  if (e.target.id === "search") {
    S.search = e.target.value;
    S.page = 0;
    refreshTable();
  }
  if (e.target.id === "template-search")
    $("#template-cards").innerHTML = S.templateCards(e.target.value);
});
document.addEventListener("dblclick", (e) => {
  if (e.target.id === "project-title")
    textDialog("Rename experiment", S.p.name, "save-project-name");
});
document.addEventListener("mousedown", (e) => {
  if (e.target.dataset.cell) {
    const p = e.target.dataset.cell.split(":");
    p[0] = +p[0];
    p[1] = +p[1];
    if (e.shiftKey && S.selection) {
      S.selection.end = p;
      e.preventDefault();
    } else S.selection = { start: p, end: p };
    $$("[data-cell]").forEach((el) => {
      const [i, j] = el.dataset.cell.split(":").map(Number),
        a = S.selection.start,
        b = S.selection.end;
      el.classList.toggle(
        "selected",
        i >= Math.min(a[0], b[0]) &&
          i <= Math.max(a[0], b[0]) &&
          j >= Math.min(a[1], b[1]) &&
          j <= Math.max(a[1], b[1]),
      );
    });
  }
});
document.addEventListener("paste", (e) => {
  if (e.target.dataset.cell) {
    const text = e.clipboardData.getData("text/plain");
    if (/[\t\r\n]/.test(text)) {
      e.preventDefault();
      const p = e.target.dataset.cell.split(":");
      p[0] = +p[0];
      p[1] = +p[1];
      try {
        pasteData(text, p);
      } catch (err) {
        toast(err.message, true);
      }
    }
  }
});
document.addEventListener("keydown", async (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
    e.preventDefault();
    searchProjects();
    return;
  }
  if (
    e.key.toLowerCase() === "n" &&
    !e.ctrlKey &&
    !e.metaKey &&
    !e.altKey &&
    !e.target.matches("input,textarea,select") &&
    !$("#dialog").open
  ) {
    e.preventDefault();
    newDialog();
    return;
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
    e.preventDefault();
    try {
      await save();
      toast(SAVED_LABEL + ".");
    } catch (err) {
      toast(err.message, true);
    }
  }
  if (
    (e.ctrlKey || e.metaKey) &&
    e.key.toLowerCase() === "z" &&
    S.p &&
    !$("#dialog").open &&
    !e.target.matches("input,textarea")
  ) {
    e.preventDefault();
    undo(e.shiftKey);
  }
  if (
    (e.ctrlKey || e.metaKey) &&
    e.key.toLowerCase() === "c" &&
    e.target.dataset.cell &&
    S.selection &&
    JSON.stringify(S.selection.start) !== JSON.stringify(S.selection.end)
  ) {
    e.preventDefault();
    try {
      await copyRange();
    } catch (err) {
      toast(err.message, true);
    }
  }
  if (
    e.target.dataset.cell &&
    ["Enter", "ArrowUp", "ArrowDown"].includes(e.key)
  ) {
    const [i, j, k] = e.target.dataset.cell.split(":");
    const next = $(
      `[data-cell="${+i + (e.key === "ArrowUp" ? -1 : 1)}:${j}:${k}"]`,
    );
    if (next) {
      e.preventDefault();
      next.focus();
      next.select();
    }
  }
});
document.addEventListener("dragover", (e) => {
  if (e.dataTransfer.types.includes("Files")) e.preventDefault();
});
document.addEventListener("drop", (e) => {
  if (e.dataTransfer.files.length) {
    e.preventDefault();
    importFile(e.dataTransfer.files[0]).catch((err) =>
      toast(err.message, true),
    );
  }
});
window.addEventListener("beforeunload", (e) => {
  if (S.dirty || S.saving) {
    draft();
    e.preventDefault();
    e.returnValue = "";
  }
});
(async () => {
  try {
    renderIcons();
    if (WEB) {
      $("#storage-caption").textContent = "Saved in this browser.";
      showEngine(window.BetterExlWeb.status());
      window.addEventListener("better-exl-engine", (event) =>
        showEngine(event.detail),
      );
    }
    [S.config, S.projects] = await Promise.all([
      api("/api/config"),
      api("/api/projects"),
    ]);
    sidebar();
    home();
    if (WEB) setTimeout(() => window.BetterExlWeb.warmup(), 1500);
    const draft = localStorage.getItem("better-exl-draft");
    if (draft) {
      S.recovery = JSON.parse(draft);
      modal(
        "Recover an unsaved edit",
        "<p>An edit to " +
          esc(S.recovery.name) +
          " was left in this browser. Restore it as a separate experiment?</p>",
        '<button data-action="skip-recovery">Discard browser draft</button><button class="primary" data-action="recover-draft">Recover a copy</button>',
      );
    }
  } catch (e) {
    $("#main").innerHTML =
      '<div class="overview"><h1>Couldn’t open your workspace</h1><p>' +
      esc(e.message) +
      `</p><p>${WEB ? "Refresh the page to retry. Your saved experiments remain in this browser." : "Keep the local server running, then refresh this page."}</p></div>`;
  }
})();
