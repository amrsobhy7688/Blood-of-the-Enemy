const fs = require("node:fs");
const path = require("node:path");
const { loadArchive, validateArchive } = require("./validate-data");

function copyDir(from, to) {
  if (!fs.existsSync(from)) return;
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, entry.name);
    const dest = path.join(to, entry.name);
    if (entry.isDirectory()) copyDir(src, dest);
    else fs.copyFileSync(src, dest);
  }
}

function writeFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

function renderArchiveBundle(archive) {
  const json = JSON.stringify(archive).replace(/</g, "\\u003c");
  return `window.BOTE_ARCHIVE = ${json};\n`;
}

function renderIndex() {
  return `<!DOCTYPE html>
<html lang="en" data-theme="bloodglass" data-fonts="bloodglass" data-density="codex">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
<title>Blood of the Enemy — Campaign Codex</title>

<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500&family=EB+Garamond:ital,wght@0,400;0,500;0,600;1,400&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="src/styles.css">

<script src="assets/vendor/react.production.min.js" crossorigin="anonymous"></script>
<script src="assets/vendor/react-dom.production.min.js" crossorigin="anonymous"></script>
<script src="src/runtime-check.js"></script>
</head>
<body>

<div id="root"></div>
<noscript><div style="position:fixed;left:16px;right:16px;bottom:16px;background:#1b1212;color:#ffd7d7;border:1px solid #7a2d2d;border-radius:12px;padding:14px 16px;font:13px/1.5 system-ui, sans-serif;z-index:99999">This dashboard needs JavaScript enabled.</div></noscript>

<script src="data/archive.js"></script>
<script src="src/data-loader.js"></script>
<script src="src/browser-validate.js"></script>
<script src="src/error-overlay.js"></script>
<script src="src/app.js"></script>
</body>
</html>
`;
}

function buildDashboard({ root = process.cwd(), outDir = path.join(root, "public") } = {}) {
  const archive = loadArchive(root);
  const issues = validateArchive(archive);
  if (issues.length) {
    throw new Error(`Archive validation failed:\n${issues.map(issue => `- ${issue}`).join("\n")}`);
  }

  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });

  writeFile(path.join(outDir, "index.html"), renderIndex());
  writeFile(path.join(outDir, "data", "archive.js"), renderArchiveBundle(archive));
  copyDir(path.join(root, "src"), path.join(outDir, "src"));
  copyDir(path.join(root, "assets"), path.join(outDir, "assets"));

  return outDir;
}

if (require.main === module) {
  const outDir = buildDashboard();
  console.log(`Built dashboard at ${path.relative(process.cwd(), outDir) || outDir}`);
}

module.exports = {
  buildDashboard
};
