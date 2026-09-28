/* Browser transport and transactional local storage for the GitHub Pages edition. */
"use strict";
(() => {
  const clone = (v) => JSON.parse(JSON.stringify(v));
  const root = new URL("./", document.currentScript.src);
  const seedPromise = fetch(new URL("seed.json", root)).then((r) => {
    if (!r.ok)
      throw Error("The workspace files could not load. Refresh to retry.");
    return r.json();
  });
  const database = new Promise((resolve, reject) => {
    const request = indexedDB.open("better-exl-workspace", 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      db.createObjectStore("projects", { keyPath: "id" });
      const history = db.createObjectStore("revisions", {
        keyPath: ["projectId", "version"],
      });
      history.createIndex("project", "projectId");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(
        Error(
          "Browser storage is unavailable. Allow site storage, or use the local edition.",
        ),
      );
    request.onblocked = () =>
      reject(
        Error(
          "Close other Better Exl tabs, then refresh to finish a storage update.",
        ),
      );
  });
  const req = (r) =>
    new Promise((resolve, reject) => {
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  function validateProject(p) {
    if (
      !p ||
      typeof p.name !== "string" ||
      !p.name.trim() ||
      p.name.length > 200
    )
      throw Error("Use an experiment name of 1–200 characters.");
    if ((p.formatVersion ?? 1) !== 1)
      throw Error("Unsupported project format version.");
    if (!Array.isArray(p.sheets) || !p.sheets.length || p.sheets.length > 30)
      throw Error("An experiment needs 1–30 datasets.");
    const ids = new Set();
    for (const s of p.sheets) {
      if (!s.id || ids.has(s.id)) throw Error("Dataset IDs must be unique.");
      ids.add(s.id);
      if (
        !Array.isArray(s.columns) ||
        !s.columns.length ||
        s.columns.length > 40 ||
        !Array.isArray(s.rows) ||
        s.rows.length > 20000
      )
        throw Error("Use 1–40 columns and at most 20,000 rows per dataset.");
      if (
        !s.plot ||
        !s.fit ||
        !s.theory ||
        !s.rows.every(
          (r) => r && typeof r.values === "object" && r.values !== null,
        )
      )
        throw Error("This file is not a complete Better Exl project.");
    }
  }
  async function saveProject(project, isNew = false) {
    validateProject(project);
    const db = await database;
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(
        ["projects", "revisions"],
        "readwrite",
      );
      const projects = transaction.objectStore("projects");
      let saved, conflict;
      const current = projects.get(project.id);
      current.onsuccess = () => {
        if (
          !isNew &&
          (!current.result || current.result.version !== project.version)
        ) {
          conflict = Error(
            "A newer revision exists in another tab. Export these edits as a backup, then reload. Nothing was overwritten.",
          );
          transaction.abort();
          return;
        }
        saved = {
          ...clone(project),
          formatVersion: 1,
          version: (project.version || 0) + 1,
          updated: new Date().toISOString(),
        };
        projects.put(saved);
        transaction.objectStore("revisions").put({
          projectId: saved.id,
          version: saved.version,
          created: saved.updated,
          body: saved,
        });
      };
      transaction.oncomplete = () => resolve(saved);
      transaction.onerror = () =>
        reject(
          Error(
            "Could not save in this browser. Export a project backup; site storage may be full.",
          ),
        );
      transaction.onabort = () =>
        reject(
          conflict ||
            Error("Saving was interrupted. Export a backup and retry."),
        );
    });
  }
  let worker,
    workerReady,
    sequence = 0,
    waiting = new Map(),
    status = { message: "Analysis tools load when you need them", percent: 0 };
  const announce = (next) => {
    status = next;
    window.dispatchEvent(
      new CustomEvent("better-exl-engine", { detail: next }),
    );
  };
  function workerCall(operation, payload = {}) {
    if (!worker) {
      worker = new Worker(new URL("worker.js", root));
      worker.onmessage = ({ data }) => {
        if (data.type === "progress") {
          announce(data);
          return;
        }
        const pending = waiting.get(data.id);
        if (!pending) return;
        waiting.delete(data.id);
        clearTimeout(pending.timer);
        if (data.error) pending.reject(Error(data.error));
        else pending.resolve(data.result);
      };
      worker.onerror = () =>
        failWorker(
          "Analysis tools could not load. Check your connection and choose Retry analysis. Your saved experiments are still available.",
        );
    }
    return new Promise((resolve, reject) => {
      const id = ++sequence;
      const timer = setTimeout(
        () =>
          failWorker(
            "This calculation took too long. Your data is saved; retry with fewer rows or simpler initial guesses.",
          ),
        180000,
      );
      waiting.set(id, { resolve, reject, timer });
      worker.postMessage({ id, operation, payload });
    });
  }
  function failWorker(message) {
    worker?.terminate();
    worker = null;
    workerReady = null;
    for (const pending of waiting.values()) {
      clearTimeout(pending.timer);
      pending.reject(Error(message));
    }
    waiting.clear();
    announce({ message, percent: 0, error: true });
  }
  function ensureReady() {
    if (!workerReady)
      workerReady = workerCall("ready").catch((error) => {
        failWorker(error.message);
        throw error;
      });
    return workerReady;
  }
  async function engine(operation, payload) {
    await ensureReady();
    return workerCall(operation, payload);
  }
  async function request(path, method = "GET", body) {
    const route = path.replace(/^\/api\//, "");
    if (route === "config") return (await seedPromise).config;
    if (route === "template") {
      const source = (await seedPromise).templates[body.id];
      if (!source) throw Error("Template not found.");
      return { ...clone(source), id: crypto.randomUUID() };
    }
    if (route === "projects" && method === "GET") {
      const db = await database,
        rows = await req(
          db.transaction("projects").objectStore("projects").getAll(),
        );
      return rows
        .map(({ id, name, updated, version }) => ({
          id,
          name,
          updated,
          version,
        }))
        .sort((a, b) => b.updated.localeCompare(a.updated));
    }
    if (route === "projects" && method === "POST") {
      const seed = await seedPromise;
      const p = body.demo
        ? clone(seed.demo)
        : body.project
          ? clone(body.project)
          : {
              name: body.name || "Untitled experiment",
              objective: "",
              apparatus: "",
              notes: "",
              sheets: [clone(seed.templates[body.template || "blank"])],
              log: [],
            };
      p.id = crypto.randomUUID();
      p.version = 0;
      p.created = new Date().toISOString();
      p.log ??= [];
      return saveProject(p, true);
    }
    const match = route.match(
      /^projects\/([^/]+)(?:\/revisions(?:\/(\d+))?)?$/,
    );
    if (match) {
      const id = match[1],
        db = await database;
      if (method === "PUT") {
        if (id !== body.id) throw Error("Experiment ID does not match.");
        return saveProject(body);
      }
      if (route.includes("/revisions")) {
        const store = db.transaction("revisions").objectStore("revisions");
        if (match[2]) {
          const r = await req(store.get([id, Number(match[2])]));
          if (!r) throw Error("Revision not found.");
          return r.body;
        }
        return new Promise((resolve, reject) => {
          const rows = [],
            cursor = store.openCursor(
              IDBKeyRange.bound([id, 0], [id, Number.MAX_SAFE_INTEGER]),
              "prev",
            );
          cursor.onsuccess = () => {
            const item = cursor.result;
            if (!item || rows.length >= 200) {
              resolve(rows);
              return;
            }
            rows.push({
              version: item.value.version,
              created: item.value.created,
            });
            item.continue();
          };
          cursor.onerror = () => reject(cursor.error);
        });
      }
      const p = await req(
        db.transaction("projects").objectStore("projects").get(id),
      );
      if (!p) throw Error("Experiment not found.");
      return p;
    }
    if (route === "import") {
      const file = body.get("file");
      if (!file) throw Error("Choose a file.");
      if (file.size > 24 * 1024 * 1024)
        throw Error("Use a file smaller than 24 MB.");
      const bytes = new Uint8Array(await file.arrayBuffer());
      let binary = "";
      for (let i = 0; i < bytes.length; i += 32768)
        binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
      return engine("import", {
        filename: file.name,
        data: btoa(binary),
        header: Number(body.get("header") || 0),
        delimiter: body.get("delimiter") || "auto",
        decimalComma: body.get("decimalComma") === "true",
        tab: body.get("tab") || "",
      });
    }
    return engine(route, body);
  }
  window.BetterExlWeb = {
    request,
    engine,
    status: () => status,
    warmup: () => ensureReady().catch(() => {}),
    retry: () => {
      failWorker("Restarting analysis tools");
      announce({ message: "Restarting analysis tools", percent: 0 });
      return ensureReady();
    },
    storageInfo: () => navigator.storage?.estimate(),
  };
})();
