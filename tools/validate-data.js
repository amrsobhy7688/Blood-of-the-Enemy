const fs = require("node:fs");
const path = require("node:path");

const ENTITY_GROUPS = ["pcs", "npcs", "places", "factions", "items", "terms"];
const TOKEN_RE = /\{([a-zA-Z0-9]+)\}/g;

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function loadArchive(root = process.cwd()) {
  const dataDir = path.join(root, "data");
  const campaign = readJson(path.join(dataDir, "campaign.json"));
  const sessionDir = path.join(dataDir, "sessions");
  const transcriptDir = path.join(dataDir, "transcripts");
  const sessionFiles = fs.existsSync(sessionDir)
    ? fs.readdirSync(sessionDir).filter(name => name.endsWith(".json")).sort()
    : [];

  const sessions = sessionFiles.map(file => readJson(path.join(sessionDir, file)));
  const transcripts = {};
  if (fs.existsSync(transcriptDir)) {
    for (const file of fs.readdirSync(transcriptDir).filter(name => name.endsWith(".txt")).sort()) {
      transcripts[path.basename(file, ".txt")] = fs.readFileSync(path.join(transcriptDir, file), "utf8");
    }
  }

  return {
    data: {
      ...campaign,
      sessions
    },
    transcripts
  };
}

function collectIds(data) {
  const ids = new Map();
  const issues = [];
  for (const group of [...ENTITY_GROUPS, "sessions", "hooks"]) {
    for (const item of data[group] || []) {
      if (!item || !item.id) {
        issues.push(`${group}: item is missing id`);
        continue;
      }
      if (ids.has(item.id)) {
        issues.push(`${group}: duplicate id "${item.id}" also used in ${ids.get(item.id)}`);
      } else {
        ids.set(item.id, group);
      }
    }
  }
  return { ids, issues };
}

function scanTokens(value, visit) {
  if (typeof value === "string") {
    let match;
    TOKEN_RE.lastIndex = 0;
    while ((match = TOKEN_RE.exec(value)) !== null) visit(match[1]);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach(item => scanTokens(item, visit));
    return;
  }
  if (value && typeof value === "object") {
    Object.values(value).forEach(item => scanTokens(item, visit));
  }
}

function validateArchive(archive) {
  const issues = [];
  const data = archive.data || {};
  const transcripts = archive.transcripts || {};
  const { ids, issues: idIssues } = collectIds(data);
  issues.push(...idIssues);

  for (const group of [...ENTITY_GROUPS, "sessions", "hooks"]) {
    for (const item of data[group] || []) {
      scanTokens(item, id => {
        if (!ids.has(id)) issues.push(`${group}.${item.id}: broken reference "{${id}}"`);
      });
    }
  }

  for (const session of data.sessions || []) {
    if (!session.num) issues.push(`sessions.${session.id}: missing num`);
    if (!session.title) issues.push(`sessions.${session.id}: missing title`);
    if (!session.recap) issues.push(`sessions.${session.id}: missing recap`);
    if (!Object.prototype.hasOwnProperty.call(transcripts, session.id)) {
      issues.push(`sessions.${session.id}: missing transcript file data/transcripts/${session.id}.txt`);
    }
  }

  for (const hook of data.hooks || []) {
    for (const tag of hook.tags || []) {
      if (!ids.has(tag)) issues.push(`hooks.${hook.id}: broken tag "${tag}"`);
    }
  }

  return issues;
}

if (require.main === module) {
  const archive = loadArchive(process.cwd());
  const issues = validateArchive(archive);
  if (issues.length) {
    console.error(issues.map(issue => `- ${issue}`).join("\n"));
    process.exit(1);
  }
  console.log("Archive data validated.");
}

module.exports = {
  loadArchive,
  validateArchive
};
