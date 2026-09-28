/* IndexedDB persistence, revision isolation and conflicting tab regression checks.
 * npm install --no-save fake-indexeddb@6.2.4
 */
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const assert = require("node:assert/strict");
const { webcrypto } = require("node:crypto");
const { indexedDB, IDBKeyRange } = require(
  process.env.FAKE_IDB_ROOT || "fake-indexeddb",
);
const root = path.resolve(__dirname, "..");
const seed = JSON.parse(
  fs.readFileSync(path.join(root, "dist/assets/seed.json")),
);
function context() {
  const window = { dispatchEvent() {} };
  vm.runInNewContext(
    fs.readFileSync(path.join(root, "web/client.js"), "utf8"),
    {
      window,
      indexedDB,
      IDBKeyRange,
      URL,
      crypto: webcrypto,
      document: {
        currentScript: {
          src: "https://example.test/Better-Exl/assets/client.js",
        },
      },
      fetch: async () => ({ ok: true, json: async () => seed }),
      navigator: {},
      setTimeout,
      clearTimeout,
    },
  );
  return window.BetterExlWeb.request;
}
(async () => {
  const a = context(),
    b = context();
  let p = await a("/api/projects", "POST", { name: "Persistence check" });
  const t1 = await a("/api/template", "POST", { id: "blank" });
  const t2 = await a("/api/template", "POST", { id: "blank" });
  assert.notEqual(t1.id, t2.id);
  p.sheets.push(t1, t2);
  p.notes = "Recorded before reload";
  p = await a("/api/projects/" + p.id, "PUT", p);
  assert.equal(p.version, 2);
  assert.equal((await b("/api/projects/" + p.id)).notes, p.notes);
  const stale = structuredClone(p);
  p.notes = "Latest revision";
  p = await b("/api/projects/" + p.id, "PUT", p);
  await assert.rejects(
    a("/api/projects/" + p.id, "PUT", stale),
    /newer revision/,
  );
  assert.equal((await a("/api/projects/" + p.id)).notes, "Latest revision");
  assert.equal(
    (await a("/api/projects/" + p.id + "/revisions/2")).notes,
    "Recorded before reload",
  );
  assert.equal((await a("/api/projects/" + p.id + "/revisions")).length, 3);
  const invalid = structuredClone(p);
  invalid.sheets.push(invalid.sheets[0]);
  await assert.rejects(a("/api/projects/" + p.id, "PUT", invalid), /unique/);
  assert.equal((await b("/api/projects/" + p.id)).version, 3);
  assert.equal((await b("/api/projects")).length, 1);
  await assert.rejects(
    a("/api/template", "POST", { id: "missing" }),
    /not found/,
  );
  console.log("11 browser storage assertions passed.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
