(function () {
  const archive = window.BOTE_ARCHIVE || {};
  const data = archive.data || {};
  const transcripts = archive.transcripts || {};

  const INDEX = {};
  const registerAll = (arr, kind) => (arr || []).forEach(x => {
    INDEX[x.id] = { ...x, kind };
  });

  registerAll(data.pcs, "pc");
  registerAll(data.npcs, "npc");
  registerAll(data.places, "place");
  registerAll(data.factions, "faction");
  registerAll(data.items, "item");
  registerAll(data.terms, "term");
  registerAll(data.sessions, "session");
  registerAll(data.hooks, "hook");

  const NAME_TO_ID = {};
  const AUTO_LINK_STOPWORDS = new Set([
    "general",
    "captain",
    "lady",
    "elder",
    "auditor",
    "former",
    "woman",
    "man",
    "the"
  ]);
  const register = (name, id) => {
    if (!name) return;
    const k = name.toLowerCase();
    if (AUTO_LINK_STOPWORDS.has(k)) return;
    if (!NAME_TO_ID[k]) NAME_TO_ID[k] = id;
  };

  Object.values(INDEX).forEach(x => {
    if (x.kind === "session" || x.kind === "hook") return;
    register(x.name, x.id);
    if (x.alt) register(x.alt, x.id);
    if (x.kind === "pc" || x.kind === "npc") {
      const first = x.name.split(/\s+/)[0];
      if (first.length >= 4 && !AUTO_LINK_STOPWORDS.has(first.toLowerCase())) register(first, x.id);
    }
  });

  window.BOTE = { data, INDEX, NAME_TO_ID, transcripts };
})();
