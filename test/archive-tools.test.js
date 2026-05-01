const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { loadArchive, validateArchive } = require("../tools/validate-data");
const { buildDashboard } = require("../tools/build-dashboard");

test("current archive data validates without broken references", () => {
  const archive = loadArchive(path.join(__dirname, ".."));
  const issues = validateArchive(archive);
  assert.deepEqual(issues, []);
});

test("validator catches a broken explicit crosslink", () => {
  const archive = loadArchive(path.join(__dirname, ".."));
  archive.data.pcs[0].body += " {definitelymissingentity}";

  const issues = validateArchive(archive);

  assert.ok(
    issues.some(issue => issue.includes("definitelymissingentity")),
    `expected broken reference issue, got ${JSON.stringify(issues)}`
  );
});

test("build emits a static dashboard from modular source files", () => {
  const root = path.join(__dirname, "..");
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "bote-build-"));

  buildDashboard({ root, outDir });

  assert.ok(fs.existsSync(path.join(outDir, "index.html")));
  assert.ok(fs.existsSync(path.join(outDir, "src", "styles.css")));
  assert.ok(fs.existsSync(path.join(outDir, "src", "app.js")));
  assert.ok(fs.existsSync(path.join(outDir, "data", "archive.js")));

  const html = fs.readFileSync(path.join(outDir, "index.html"), "utf8");
  assert.match(html, /<link rel="stylesheet" href="src\/styles\.css">/);
  assert.match(html, /<script src="data\/archive\.js"><\/script>/);
  assert.match(html, /<script src="src\/app\.js"><\/script>/);
});
