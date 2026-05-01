// Shared components: cross-link Ref, Popover, AutoLink parser, Dossier helpers
// Exposes: Ref, Popover, AutoLink, renderText, findDossierFor, RelationshipGraph, StatusPill

const {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback
} = React;
const INDEX = window.BOTE.INDEX;
const NAME_TO_ID = window.BOTE.NAME_TO_ID;
const DATA = window.BOTE.data;
const TRANSCRIPTS = window.BOTE.transcripts || {};

// ────────────────────────────────────────────────────────────
// renderText: turn a string like "with {caspian} and {flame}" into React nodes
// Splits on {id} tokens and on auto-linkable proper nouns.
// ────────────────────────────────────────────────────────────

// Build auto-link regex from all registered names (longest first)
const AUTO_NAMES = Object.keys(NAME_TO_ID).filter(name => name.length >= 4).sort((a, b) => b.length - a.length);
const escapeRegex = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// Escape names for regex, join, bound with word boundaries (including apostrophe handling)
const AUTO_RE = AUTO_NAMES.length ? new RegExp(`\\b(${AUTO_NAMES.map(escapeRegex).join("|")})\\b`, "gi") : null;
function entityName(ent) {
  return ent?.name || ent?.title || ent?.id || "Unknown";
}
function plainText(text) {
  if (!text) return "";
  return text.replace(/\{([a-zA-Z0-9]+)\}/g, (_, id) => INDEX[id] ? entityName(INDEX[id]) : id);
}
function renderText(text, {
  autoLink = true,
  key = "t",
  onOpen,
  onNavigate
} = {}) {
  if (!text) return null;
  // Step 1: split on explicit {id} tokens
  const parts = [];
  const tokenRe = /\{([a-zA-Z0-9]+)\}/g;
  let last = 0,
    m;
  while ((m = tokenRe.exec(text)) !== null) {
    if (m.index > last) parts.push({
      type: "text",
      content: text.slice(last, m.index)
    });
    parts.push({
      type: "ref",
      id: m[1]
    });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({
    type: "text",
    content: text.slice(last)
  });

  // Step 2: for each text part, auto-link proper nouns
  const out = [];
  let i = 0;
  for (const p of parts) {
    if (p.type === "ref") {
      const ent = INDEX[p.id];
      if (ent) {
        out.push(/*#__PURE__*/React.createElement(Ref, {
          key: `${key}-${i++}`,
          id: p.id,
          onOpen: onOpen,
          onNavigate: onNavigate
        }, entityName(ent)));
      } else {
        out.push(/*#__PURE__*/React.createElement("span", {
          key: `${key}-${i++}`
        }, p.id));
      }
      continue;
    }
    if (!autoLink) {
      out.push(/*#__PURE__*/React.createElement("span", {
        key: `${key}-${i++}`
      }, p.content));
      continue;
    }
    let lastIdx = 0;
    let match;
    if (!AUTO_RE) {
      out.push(/*#__PURE__*/React.createElement("span", {
        key: `${key}-${i++}`
      }, p.content));
      continue;
    }
    AUTO_RE.lastIndex = 0;
    while ((match = AUTO_RE.exec(p.content)) !== null) {
      if (match.index > lastIdx) {
        out.push(/*#__PURE__*/React.createElement("span", {
          key: `${key}-${i++}`
        }, p.content.slice(lastIdx, match.index)));
      }
      const id = NAME_TO_ID[match[0].toLowerCase()];
      out.push(/*#__PURE__*/React.createElement(Ref, {
        key: `${key}-${i++}`,
        id: id,
        onOpen: onOpen,
        onNavigate: onNavigate
      }, match[0]));
      lastIdx = match.index + match[0].length;
    }
    if (lastIdx < p.content.length) {
      out.push(/*#__PURE__*/React.createElement("span", {
        key: `${key}-${i++}`
      }, p.content.slice(lastIdx)));
    }
  }
  return out;
}

// ────────────────────────────────────────────────────────────
// Ref — cross-link button that triggers a popover
// ────────────────────────────────────────────────────────────

function Ref({
  id,
  children,
  onOpen,
  onNavigate
}) {
  const ent = INDEX[id];
  const kind = ent?.kind || "term";
  const ref = useRef(null);
  return /*#__PURE__*/React.createElement("button", {
    ref: ref,
    className: "ref",
    "data-kind": kind,
    "data-ref-id": id,
    onClick: e => {
      e.stopPropagation();
      if (!ent) return;
      if (onNavigate) onNavigate(id);else if (onOpen) onOpen(id, ref.current);
    }
  }, children);
}

// ────────────────────────────────────────────────────────────
// Popover layer (portals into window.__popoverLayer)
// ────────────────────────────────────────────────────────────

function Popover({
  state,
  onClose,
  onNavigate
}) {
  const ref = useRef(null);
  useEffect(() => {
    if (!state) return;
    const onClick = e => {
      if (ref.current && !ref.current.contains(e.target) && !e.target.closest(".ref")) {
        onClose();
      }
    };
    const onEsc = e => {
      if (e.key === "Escape") onClose();
    };
    const onScroll = () => onClose();
    setTimeout(() => document.addEventListener("mousedown", onClick), 0);
    document.addEventListener("keydown", onEsc);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onEsc);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [state, onClose]);
  if (!state) return null;
  const ent = INDEX[state.id];
  if (!ent) return null;

  // Position: anchor around the triggering element, keep onscreen
  const rect = state.rect;
  const pw = 340,
    ph = 280;
  let top = rect.bottom + 8;
  let left = rect.left;
  if (left + pw > window.innerWidth - 16) left = window.innerWidth - pw - 16;
  if (left < 16) left = 16;
  if (top + ph > window.innerHeight - 16) top = rect.top - ph - 8;
  if (top < 16) top = 16;
  const kindLabel = {
    pc: "Player Character",
    npc: "NPC",
    place: "Place",
    faction: "Faction",
    item: "Item",
    term: "Glossary"
  }[ent.kind] || ent.kind;
  const facts = (ent.facts || []).slice(0, 3);
  return /*#__PURE__*/React.createElement("div", {
    className: "popover-layer"
  }, /*#__PURE__*/React.createElement("div", {
    ref: ref,
    className: "popover",
    style: {
      top,
      left
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "popover-kind"
  }, kindLabel), /*#__PURE__*/React.createElement("div", {
    className: "popover-name"
  }, entityName(ent)), ent.alt && /*#__PURE__*/React.createElement("div", {
    className: "popover-alt"
  }, "\u201C", ent.alt, "\u201D"), /*#__PURE__*/React.createElement("div", {
    className: "popover-body"
  }, renderText(firstParagraph(ent.body || ent.role || ""), {
    autoLink: false,
    onNavigate: onNavigate
  })), facts.length > 0 && /*#__PURE__*/React.createElement("ul", {
    className: "popover-facts"
  }, facts.map(([k, v], i) => /*#__PURE__*/React.createElement("li", {
    key: i
  }, /*#__PURE__*/React.createElement("span", {
    className: "k"
  }, k), /*#__PURE__*/React.createElement("span", null, renderText(v, {
    autoLink: false,
    onNavigate: onNavigate
  }))))), (ent.kind === "pc" || ent.kind === "npc" || ent.kind === "place" || ent.kind === "faction" || ent.kind === "item" || ent.kind === "term" || ent.kind === "session" || ent.kind === "hook") && /*#__PURE__*/React.createElement("button", {
    className: "popover-cta",
    onClick: () => onNavigate(state.id)
  }, "Open full entry \u2192")));
}
function firstParagraph(t) {
  if (!t) return "";
  const para = t.split(/\n\n/)[0];
  if (para.length < 180) return para;
  // Trim to 180 chars at word boundary
  return para.slice(0, 180).replace(/\s\S*$/, "") + "…";
}

// ────────────────────────────────────────────────────────────
// StatusPill
// ────────────────────────────────────────────────────────────

function StatusPill({
  status,
  label
}) {
  return /*#__PURE__*/React.createElement("span", {
    className: "pill",
    "data-status": status
  }, label || status);
}

// ────────────────────────────────────────────────────────────
// Relationship graph — simple radial SVG
// ────────────────────────────────────────────────────────────

function RelationshipGraph({
  entity,
  onOpen
}) {
  const rawRels = entity.relationships || entity.rel || [];
  const seenRelIds = new Set();
  const rels = rawRels.filter(([toId]) => {
    if (!toId || toId === entity.id || !INDEX[toId] || seenRelIds.has(toId)) return false;
    seenRelIds.add(toId);
    return true;
  });
  if (!rels.length) return null;
  const W = 760,
    H = 700;
  const cx = W / 2,
    cy = H / 2;
  const n = rels.length;
  const r = Math.max(238, Math.min(258, 184 + n * 12));
  const angleStep = Math.PI * 2 / n;
  const startAngle = -Math.PI / 2;

  function readableName(raw) {
    return (raw || "Unknown").replace(/[()]/g, " ").replace(/\s+/g, " ").trim();
  }
  function wrapWords(raw, maxChars) {
    const words = readableName(raw).split(" ").filter(Boolean);
    const lines = [];
    let line = "";
    words.forEach(word => {
      if (!line) {
        line = word;
        return;
      }
      if (`${line} ${word}`.length <= maxChars) {
        line = `${line} ${word}`;
      } else {
        lines.push(line);
        line = word;
      }
    });
    if (line) lines.push(line);
    return lines.length ? lines : ["Unknown"];
  }
  function wrapNameForCircle(raw) {
    const words = readableName(raw).split(" ").filter(Boolean);
    if (!words.length) return ["Unknown"];
    if (words.length <= 2) return words;
    if (words.length === 3) return [words.slice(0, 2).join(" "), words[2]];
    if (words.length === 4) return [words.slice(0, 2).join(" "), words.slice(2).join(" ")];
    const splitAt = Math.ceil(words.length / 2);
    return [words.slice(0, splitAt).join(" "), words.slice(splitAt).join(" ")];
  }
  function nodeCircle(ent) {
    const lines = wrapNameForCircle(ent?.name || ent?.title || "Unknown");
    const kind = readableName(ent?.kind || "").toUpperCase();
    const maxLen = Math.max(...lines.map(line => line.length), kind.length, 4);
    const radius = Math.max(58, Math.min(72, Math.max(lines.length * 8.6 + 20, maxLen * 3.9 + 28)));
    const labelSize = lines.length >= 3 ? 14 : 16.4;
    const lineGap = lines.length >= 3 ? 15.2 : 16.6;
    return {
      lines,
      kind,
      radius,
      labelSize,
      lineGap
    };
  }
  const centerNode = nodeCircle(entity);

  // Normalize and split a relationship note into at most two balanced lines.
  // Handles all separator styles found in the data: · / — ; {refs} (parens)
  function splitLabel(raw) {
    const s = (raw || "").replace(/\{[^}]+\}/g, " ") // {entity} refs → space
    .replace(/\([^)]*\)/g, " ") // (parentheticals) → space
    .replace(/[·—;\/]/g, " ") // separator characters → space
    .replace(/\s+/g, " ").trim().toUpperCase();
    const words = s.split(" ").filter(Boolean);
    if (words.length === 0) return ["", null];
    if (words.length === 1) return [words[0], null];
    // Pick the word-boundary split that balances both lines by character length
    let best = 1,
      minDiff = Infinity;
    for (let i = 1; i < words.length; i++) {
      const diff = Math.abs(words.slice(0, i).join(" ").length - words.slice(i).join(" ").length);
      if (diff < minDiff) {
        minDiff = diff;
        best = i;
      }
    }
    const line1 = words.slice(0, best).join(" ");
    const line2 = words.slice(best).join(" ");
    // If line2 is just punctuation or a single letter, absorb it
    if (line2.length <= 1) return [`${line1} ${line2}`.trim(), null];
    return [line1, line2];
  }
  return /*#__PURE__*/React.createElement("div", {
    className: "relgraph"
  }, /*#__PURE__*/React.createElement("div", {
    className: "relgraph-title"
  }, "\u25C7 Relationships"), /*#__PURE__*/React.createElement("svg", {
    viewBox: `0 0 ${W} ${H}`,
    preserveAspectRatio: "xMidYMid meet"
  }, /*#__PURE__*/React.createElement("defs", null, /*#__PURE__*/React.createElement("radialGradient", {
    id: "relNodeGrad",
    cx: "50%",
    cy: "50%",
    r: "50%"
  }, /*#__PURE__*/React.createElement("stop", {
    offset: "0%",
    stopColor: "rgba(192,132,255,1)",
    stopOpacity: "0.32"
  }), /*#__PURE__*/React.createElement("stop", {
    offset: "100%",
    stopColor: "rgba(192,132,255,1)",
    stopOpacity: "0"
  })), /*#__PURE__*/React.createElement("radialGradient", {
    id: "relCenterGlow",
    cx: "50%",
    cy: "50%",
    r: "50%"
  }, /*#__PURE__*/React.createElement("stop", {
    offset: "0%",
    stopColor: "rgba(192,132,255,1)",
    stopOpacity: "0.5"
  }), /*#__PURE__*/React.createElement("stop", {
    offset: "100%",
    stopColor: "rgba(192,132,255,1)",
    stopOpacity: "0"
  }))), rels.map(([toId], i) => {
    const a = startAngle + i * angleStep;
    const x = cx + r * Math.cos(a);
    const y = cy + r * Math.sin(a);
    return /*#__PURE__*/React.createElement("line", {
      key: i,
      x1: cx,
      y1: cy,
      x2: x,
      y2: y,
      className: "relgraph-edge",
      strokeDasharray: "3,5",
      style: {
        opacity: 0,
        animation: `relEdgeFade 0.5s ease-out ${0.04 + i * 0.06}s forwards`
      }
    });
  }), rels.map(([toId, note], i) => {
    const a = startAngle + i * angleStep;
    const lx = cx + r * 0.5 * Math.cos(a);
    const ly = cy + r * 0.5 * Math.sin(a);
    const [line1, line2] = splitLabel(note);
    const labelDelay = `${0.28 + i * 0.06}s`;
    const labelLines = [line1 || "RELATED", line2].filter(Boolean);
    const labelWidth = Math.max(64, Math.min(144, Math.max(...labelLines.map(line => line.length), 4) * 6.1 + 22));
    const labelHeight = line2 ? 30 : 22;
    return /*#__PURE__*/React.createElement("g", {
      key: i,
      className: "relgraph-edge-label",
      transform: `translate(${lx}, ${ly})`,
      style: {
        opacity: 0,
        transformOrigin: `${lx}px ${ly}px`,
        animation: `relLabelFade 0.35s ease-out ${labelDelay} forwards`
      }
    }, /*#__PURE__*/React.createElement("text", {
      textAnchor: "middle",
      dominantBaseline: "middle",
      fontSize: line2 ? "7.5" : "8.5"
    }, /*#__PURE__*/React.createElement("tspan", {
      x: "0",
      dy: line2 ? "-4" : "0"
    }, line1), line2 && /*#__PURE__*/React.createElement("tspan", {
      x: "0",
      dy: "10"
    }, line2)));
  }), /*#__PURE__*/React.createElement("circle", {
    cx: cx,
    cy: cy,
    r: "54",
    fill: "url(#relCenterGlow)",
    style: {
      animation: "relGlowPulse 3.2s ease-in-out infinite"
    }
  }), /*#__PURE__*/React.createElement("g", {
    transform: `translate(${cx}, ${cy})`
  }, /*#__PURE__*/React.createElement("g", {
    style: {
      opacity: 0,
      animation: "relNodeIn 0.4s ease-out 0s forwards"
    }
  }, /*#__PURE__*/React.createElement("circle", {
    cx: "0",
    cy: "0",
    r: centerNode.radius,
    fill: "var(--bg-raised)",
    stroke: "rgba(192,132,255,.82)",
    strokeWidth: "1.5",
    className: "relgraph-node-ring"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "0",
    cy: "0",
    r: centerNode.radius - 1,
    fill: "url(#relNodeGrad)"
  }), /*#__PURE__*/React.createElement("text", {
    textAnchor: "middle",
    dominantBaseline: "middle",
    className: "relgraph-node-label",
    style: {
      fontSize: centerNode.labelSize
    }
  }, centerNode.lines.map((line, idx) => /*#__PURE__*/React.createElement("tspan", {
    key: idx,
    x: "0",
    dy: idx === 0 ? `${-(centerNode.lines.length - 1) * centerNode.lineGap / 2}` : centerNode.lineGap
  }, line))), /*#__PURE__*/React.createElement("text", {
    y: centerNode.radius - 13,
    textAnchor: "middle",
    className: "relgraph-node-caption",
    style: {
      fontSize: 8.5
    }
  }, centerNode.kind))), rels.map(([toId, note], i) => {
    const ent = INDEX[toId];
    if (!ent) return null;
    const a = startAngle + i * angleStep;
    const x = cx + r * Math.cos(a);
    const y = cy + r * Math.sin(a);
    const nodeDelay = `${0.12 + i * 0.07}s`;
    const node = nodeCircle(ent);
    return /*#__PURE__*/React.createElement("g", {
      key: i,
      transform: `translate(${x}, ${y})`
    }, /*#__PURE__*/React.createElement("g", {
      className: "relgraph-node-inner",
      onClick: e => onOpen && onOpen(toId, e.currentTarget.closest("g").getBoundingClientRect()),
      style: {
        transformOrigin: "0 0",
        opacity: 0,
        animation: `relNodeIn 0.4s ease-out ${nodeDelay} forwards`
      }
    }, /*#__PURE__*/React.createElement("circle", {
      cx: "0",
      cy: "0",
      r: node.radius,
      fill: "var(--bg-1)",
      stroke: "rgba(216,192,146,.28)",
      strokeWidth: "1",
      className: "relgraph-node-ring"
    }), /*#__PURE__*/React.createElement("circle", {
      cx: "0",
      cy: "0",
      r: node.radius - 1,
      fill: "url(#relNodeGrad)"
    }), /*#__PURE__*/React.createElement("text", {
      textAnchor: "middle",
      dominantBaseline: "middle",
      className: "relgraph-node-label",
      style: {
        fontSize: node.labelSize
      }
    }, node.lines.map((line, idx) => /*#__PURE__*/React.createElement("tspan", {
      key: idx,
      x: "0",
      dy: idx === 0 ? `${-(node.lines.length - 1) * node.lineGap / 2}` : node.lineGap
    }, line))), /*#__PURE__*/React.createElement("text", {
      y: node.radius - 13,
      textAnchor: "middle",
      className: "relgraph-node-caption",
      style: {
        fontSize: 8.5
      }
    }, node.kind)));
  })));
}
Object.assign(window, {
  Ref,
  Popover,
  StatusPill,
  RelationshipGraph,
  renderText,
  firstParagraph
});
function SearchIcon() {
  return /*#__PURE__*/React.createElement("svg", {
    width: "14",
    height: "14",
    viewBox: "0 0 20 20",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.8",
    strokeLinecap: "round",
    "aria-hidden": "true"
  }, /*#__PURE__*/React.createElement("circle", {
    cx: "8",
    cy: "8",
    r: "6"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M13 13 L17 17"
  }));
}

// Core tab registry and shared labels used by the reshaped Bloodglass shell.
// These were kept explicit so the locked visual theme no longer depends on the old tweak system.
const TABS = [{
  id: "recaps",
  label: "Recaps"
}, {
  id: "notes",
  label: "Session Notes"
}, {
  id: "timeline",
  label: "Timeline"
}, {
  id: "compendium",
  label: "Compendium"
}, {
  id: "hooks",
  label: "Hooks & Missions"
}];
const CMP_SECTIONS = [{
  id: "characters",
  label: "Characters",
  getList: () => [...DATA.pcs, ...DATA.npcs]
}, {
  id: "places",
  label: "Places",
  getList: () => DATA.places
}, {
  id: "factions",
  label: "Factions",
  getList: () => DATA.factions
}, {
  id: "items",
  label: "Items",
  getList: () => DATA.items
}, {
  id: "terms",
  label: "Lore",
  getList: () => DATA.terms
}];
function kindLabel(k) {
  return {
    pc: "Player Character",
    npc: "Non-Player Character",
    place: "Place",
    faction: "Faction / Order",
    item: "Item / Artifact",
    term: "Glossary / Concept",
    session: "Session",
    hook: "Hook / Mission"
  }[k] || k;
}
function bodyMentions(text, entity) {
  if (!text || !entity) return false;
  const blob = String(text).toLowerCase();
  if (String(text).includes("{" + entity.id + "}")) return true;
  if (entity.name && blob.includes(String(entity.name).toLowerCase())) return true;
  if (entity.alt && blob.includes(String(entity.alt).toLowerCase())) return true;
  return false;
}
function fuzzyScore(hay, needle) {
  if (!needle) return 0;
  if (!hay) return 0;
  if (hay === needle) return 100;
  if (hay.startsWith(needle)) return 60 + needle.length / Math.max(1, hay.length) * 10;
  if (hay.includes(needle)) return 40 + needle.length / Math.max(1, hay.length) * 10;
  let hi = 0,
    ni = 0,
    hits = 0,
    lastHit = -1,
    gapPenalty = 0;
  while (hi < hay.length && ni < needle.length) {
    if (hay[hi] === needle[ni]) {
      if (lastHit >= 0) gapPenalty += (hi - lastHit - 1) * 0.2;
      lastHit = hi;
      hits++;
      ni++;
    }
    hi++;
  }
  if (ni !== needle.length) return 0;
  return Math.max(0, 20 + hits - gapPenalty);
}
function CmdK({
  open,
  onClose,
  onPick
}) {
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const CORPUS = useMemo(() => {
    const items = [];
    for (const p of DATA.pcs) items.push({
      id: p.id,
      kind: "pc",
      name: p.name,
      alt: p.alt,
      hint: p.role
    });
    for (const n of DATA.npcs) items.push({
      id: n.id,
      kind: "npc",
      name: n.name,
      alt: n.alt,
      hint: n.role
    });
    for (const p of DATA.places) items.push({
      id: p.id,
      kind: "place",
      name: p.name,
      alt: p.alt,
      hint: p.region
    });
    for (const f of DATA.factions) items.push({
      id: f.id,
      kind: "faction",
      name: f.name,
      alt: f.alt,
      hint: f.deity
    });
    for (const i of DATA.items) items.push({
      id: i.id,
      kind: "item",
      name: i.name,
      alt: i.alt,
      hint: i.type
    });
    for (const t of DATA.terms) items.push({
      id: t.id,
      kind: "term",
      name: t.name,
      alt: t.alt,
      hint: "glossary"
    });
    for (const s of DATA.sessions) {
      const blob = [s.recap, ...(s.scenes || []).flatMap(sc => [sc.title, sc.loc, ...(sc.atmosphere || []), ...(sc.prose || []), ...(sc.reveals || []), ...(sc.consequences || [])]), ...(s.beats || []).flatMap(b => [b.title, b.loc, b.body]), TRANSCRIPTS[s.id]].filter(Boolean).join(" ");
      items.push({
        id: "session:" + s.id,
        kind: "session",
        name: s.num + " — " + s.title,
        hint: s.arc,
        blob
      });
    }
    for (const h of DATA.hooks) items.push({
      id: "hook:" + h.id,
      kind: "hook",
      name: plainText(h.title),
      hint: h.lane,
      blob: `${plainText(h.title)} ${plainText(h.body)}`
    });
    return items;
  }, []);
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return CORPUS.slice(0, 40);
    const scored = [];
    for (const it of CORPUS) {
      const s = fuzzyScore(String(it.name || "").toLowerCase(), q) + (it.alt ? fuzzyScore(String(it.alt).toLowerCase(), q) * 0.5 : 0) + (it.hint ? fuzzyScore(String(it.hint).toLowerCase(), q) * 0.2 : 0) + (it.blob ? fuzzyScore(String(it.blob).toLowerCase(), q) * 0.12 : 0);
      if (s > 0) scored.push({
        it,
        s
      });
    }
    scored.sort((a, b) => b.s - a.s);
    return scored.slice(0, 50).map(x => x.it);
  }, [query, CORPUS]);
  const activeResult = results[activeIdx];
  const activeOptionId = activeResult ? `cmdk-option-${String(activeResult.id).replace(/[^a-zA-Z0-9_-]/g, "-")}` : undefined;
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 30);
      setQuery("");
      setActiveIdx(0);
    }
  }, [open]);
  useEffect(() => {
    setActiveIdx(0);
  }, [query]);
  useEffect(() => {
    if (!open) return;
    const onKey = e => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIdx(i => Math.min(results.length - 1, i + 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIdx(i => Math.max(0, i - 1));
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (results[activeIdx]) onPick(results[activeIdx]);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, results, activeIdx, onClose, onPick]);
  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.querySelector(".cmdk-item.active");
    if (!el) return;
    const c = listRef.current;
    const elTop = el.offsetTop;
    const elBot = elTop + el.offsetHeight;
    if (elTop < c.scrollTop) c.scrollTop = elTop - 8;else if (elBot > c.scrollTop + c.clientHeight) c.scrollTop = elBot - c.clientHeight + 8;
  }, [activeIdx]);
  if (!open) return null;
  return /*#__PURE__*/React.createElement("div", {
    className: "cmdk-overlay",
    onClick: e => {
      if (e.target === e.currentTarget) onClose();
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "cmdk",
    role: "dialog",
    "aria-modal": "true",
    "aria-label": "Search the Codex"
  }, /*#__PURE__*/React.createElement("input", {
    ref: inputRef,
    className: "cmdk-input",
    "aria-label": "Search characters, places, sessions, and hooks",
    "aria-controls": "cmdk-results",
    "aria-activedescendant": activeOptionId,
    role: "combobox",
    "aria-expanded": "true",
    "aria-autocomplete": "list",
    placeholder: "Search anything \u2014 characters, places, sessions, hooks\u2026",
    value: query,
    onChange: e => setQuery(e.target.value)
  }), /*#__PURE__*/React.createElement("div", {
    id: "cmdk-results",
    className: "cmdk-list",
    ref: listRef,
    role: "listbox",
    "aria-label": "Search results"
  }, results.length === 0 ? /*#__PURE__*/React.createElement("div", {
    className: "cmdk-empty"
  }, "Nothing found. The archive keeps its silence.") : results.map((it, i) => /*#__PURE__*/React.createElement("div", {
    key: it.id,
    id: `cmdk-option-${String(it.id).replace(/[^a-zA-Z0-9_-]/g, "-")}`,
    role: "option",
    "aria-selected": i === activeIdx,
    className: "cmdk-item" + (i === activeIdx ? " active" : ""),
    onMouseEnter: () => setActiveIdx(i),
    onClick: () => onPick(it)
  }, /*#__PURE__*/React.createElement("span", {
    className: "cmdk-item-kind"
  }, kindLabel(it.kind)), /*#__PURE__*/React.createElement("span", {
    className: "cmdk-item-name"
  }, it.name), /*#__PURE__*/React.createElement("span", {
    className: "cmdk-item-hint"
  }, it.hint || "")))), /*#__PURE__*/React.createElement("div", {
    className: "cmdk-footer"
  }, /*#__PURE__*/React.createElement("span", null, "\u2191\u2193 navigate \xB7 \u21B5 open \xB7 Esc close"), /*#__PURE__*/React.createElement("span", null, results.length, " results"))));
}

// ────────────────────────────────────────────────────────────
// Bloodglass Codex layout override
// Locks the dashboard into one visual system and reshapes every tab.
// ────────────────────────────────────────────────────────────

function bgText(value) {
  if (!value) return "";
  return String(value);
}
function clipText(value, n = 180) {
  const txt = bgText(value).replace(/\s+/g, " ").trim();
  if (txt.length <= n) return txt;
  return txt.slice(0, n).replace(/\s+\S*$/, "") + "…";
}
function entityInitial(ent) {
  if (!ent) return "✦";
  const words = entityName(ent).replace(/^the\s+/i, "").split(/\s+/).filter(Boolean);
  if (!words.length) return "✦";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}
function sessionEntries(s) {
  const source = s.summaryScenes?.length ? s.summaryScenes : s.scenes?.length ? s.scenes : null;
  return source ? source.map(sc => ({
    title: sc.title,
    loc: sc.loc,
    body: sc.prose && sc.prose.join(" ") || sc.atmosphere && sc.atmosphere.join(" ") || "",
    atmosphere: sc.atmosphere || [],
    prose: sc.prose || [],
    reveals: sc.reveals || [],
    consequences: sc.consequences || []
  })) : (s.beats || []).map(b => ({
    ...b,
    prose: [b.body],
    atmosphere: [],
    reveals: [],
    consequences: []
  }));
}
function timelineEntries(s) {
  const source = s.timeline?.length ? s.timeline : s.summaryScenes?.length ? s.summaryScenes : s.scenes?.length ? s.scenes : s.beats || [];
  return source.map(entry => ({
    title: entry.title,
    loc: entry.loc,
    body: entry.body || [...(entry.prose || []), ...(entry.atmosphere || []), ...(entry.reveals || []), ...(entry.consequences || [])].filter(Boolean).join(" ") || s.recap
  }));
}
function collectEntityIds(text, max = 7) {
  const out = [];
  const seen = new Set();
  const add = id => {
    if (INDEX[id] && !seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  };
  bgText(text).replace(/\{([^}]+)\}/g, (_, id) => {
    add(id);
    return _;
  });
  if (out.length < max) {
    Object.keys(INDEX).forEach(id => {
      if (out.length >= max) return;
      const ent = INDEX[id];
      const name = entityName(ent);
      if (!name || seen.has(id)) return;
      if (bgText(text).toLowerCase().includes(name.toLowerCase())) add(id);
    });
  }
  return out.slice(0, max);
}
function sessionMentionIds(s, max = 8) {
  const blob = [s.title, s.arc, s.when, s.recap, s.hookCredit, ...(s.beats || []).map(b => b.body), ...(s.scenes || []).flatMap(sc => [sc.title, sc.loc, ...(sc.prose || []), ...(sc.reveals || []), ...(sc.consequences || [])])].join(" ");
  return collectEntityIds(blob, max);
}
function allSessionClues(s, max = 7) {
  const entries = sessionEntries(s);
  const clues = entries.flatMap(e => [...(e.reveals || []), ...(e.consequences || [])]);
  return clues.slice(0, max);
}
function resonanceForIndex(i) {
  return [74, 62, 86, 55, 90, 68, 78, 58][i % 8];
}
function PageHead({
  title,
  subtitle,
  kicker
}) {
  return /*#__PURE__*/React.createElement("header", {
    className: "page-head"
  }, kicker && /*#__PURE__*/React.createElement("div", {
    className: "page-kicker"
  }, kicker), /*#__PURE__*/React.createElement("h1", {
    className: "page-title"
  }, title));
}
function BloodPanel({
  title,
  action,
  children,
  className = ""
}) {
  return /*#__PURE__*/React.createElement("section", {
    className: `blood-frame side-panel ${className}`
  }, title && /*#__PURE__*/React.createElement("div", {
    className: "panel-head"
  }, /*#__PURE__*/React.createElement("div", {
    className: "panel-title"
  }, title), action && /*#__PURE__*/React.createElement("div", {
    className: "panel-action"
  }, action)), children);
}
function Sigil({
  ent,
  children,
  className = "sigil-dot"
}) {
  return /*#__PURE__*/React.createElement("span", {
    className: className
  }, /*#__PURE__*/React.createElement("span", null, children || entityInitial(ent)));
}
function EntitySigil({
  ent,
  className = "entity-sigil"
}) {
  return /*#__PURE__*/React.createElement("span", {
    className: className
  }, entityInitial(ent));
}
function EntityButton({
  id,
  onOpen,
  onNavigate,
  className = "entity-row",
  note,
  count,
  actionLabel
}) {
  const ent = INDEX[id];
  if (!ent) return null;
  const handleClick = e => {
    e.stopPropagation();
    if (onNavigate) onNavigate(id);else if (onOpen) onOpen(id, e.currentTarget);
  };
  return /*#__PURE__*/React.createElement("button", {
    className: className,
    onClick: handleClick
  }, /*#__PURE__*/React.createElement(EntitySigil, {
    ent: ent
  }), /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement("span", {
    className: "row-title"
  }, entityName(ent)), note && /*#__PURE__*/React.createElement("span", {
    className: "row-sub"
  }, plainText(String(note))), !note && /*#__PURE__*/React.createElement("span", {
    className: "row-sub"
  }, kindLabel(ent.kind))), (count !== undefined || actionLabel) && /*#__PURE__*/React.createElement("span", {
    className: "row-count"
  }, count !== undefined ? count : actionLabel));
}
function MentionIcons({
  ids,
  onOpen,
  onNavigate
}) {
  if (!ids?.length) return null;
  return /*#__PURE__*/React.createElement("div", {
    className: "linked-icons"
  }, ids.map(id => {
    const ent = INDEX[id];
    if (!ent) return null;
    return /*#__PURE__*/React.createElement("button", {
      key: id,
      className: "link-icon",
      title: `Open ${entityName(ent)}`,
      "aria-label": `Open ${entityName(ent)}`,
      onClick: e => {
        e.stopPropagation();
        if (onNavigate) onNavigate(id);else if (onOpen) onOpen(id, e.currentTarget);
      }
    }, entityInitial(ent));
  }));
}
function Chip({
  children
}) {
  return /*#__PURE__*/React.createElement("span", {
    className: "chip"
  }, children);
}
function MiniSpark({
  width = 58
}) {
  const points = Array.from({
    length: 14
  }, (_, i) => `${i * (width / 13)},${24 - i * 17 % 19}`).join(" ");
  return /*#__PURE__*/React.createElement("svg", {
    width: width,
    height: "30",
    viewBox: `0 0 ${width} 30`,
    "aria-hidden": "true"
  }, /*#__PURE__*/React.createElement("polyline", {
    points: points,
    fill: "none",
    stroke: "var(--aether)",
    strokeWidth: "1.4",
    opacity: ".8"
  }), /*#__PURE__*/React.createElement("path", {
    d: `M0 25 L${width} 25`,
    stroke: "rgba(216,192,146,.18)"
  }));
}
function QuoteList({
  quotes,
  onOpen,
  onNavigate
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "quote-list"
  }, quotes.filter(Boolean).slice(0, 5).map((q, i) => /*#__PURE__*/React.createElement("button", {
    className: "quote-row quote-button",
    key: i,
    disabled: !q.sessionId || !onNavigate,
    onClick: () => q.sessionId && onNavigate && onNavigate("notes", q.sessionId)
  }, "\u201C", plainText(String(q.text || q)), "\u201D", q.credit && /*#__PURE__*/React.createElement("span", {
    className: "quote-credit"
  }, plainText(String(q.credit))))));
}
function TopReferenced({
  onOpen,
  onNavigate
}) {
  const counts = {};
  DATA.sessions.forEach(s => sessionMentionIds(s, 20).forEach(id => {
    counts[id] = (counts[id] || 0) + 1;
  }));
  const rows = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);
  return /*#__PURE__*/React.createElement("div", {
    className: "entity-list"
  }, rows.map(([id, count]) => /*#__PURE__*/React.createElement(EntityButton, {
    key: id,
    id: id,
    onOpen: onOpen,
    onNavigate: onNavigate,
    count: count,
    actionLabel: onNavigate ? "open" : undefined
  })));
}
function LeftFilters({
  onOpen,
  onNavigate
}) {
  const sessions = DATA.sessions.slice().reverse();
  const sessionPlaceIds = [];
  const sessionFactionIds = [];
  const addUnique = (arr, id) => {
    if (INDEX[id] && !arr.includes(id)) arr.push(id);
  };
  DATA.sessions.forEach(s => sessionMentionIds(s, 30).forEach(id => {
    if (INDEX[id]?.kind === "place") addUnique(sessionPlaceIds, id);
    if (INDEX[id]?.kind === "faction") addUnique(sessionFactionIds, id);
  }));
  return /*#__PURE__*/React.createElement("div", {
    className: "side-stack"
  }, /*#__PURE__*/React.createElement(BloodPanel, {
    title: "Sessions",
    action: `${sessions.length}`
  }, /*#__PURE__*/React.createElement("div", {
    className: "filter-list"
  }, sessions.map((s, i) => /*#__PURE__*/React.createElement("button", {
    key: s.id,
    className: "filter-row",
    onClick: () => onNavigate && onNavigate("notes", s.id)
  }, /*#__PURE__*/React.createElement(Sigil, null, String(s.num).match(/\d+/)?.[0] || i + 1), /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement("span", {
    className: "row-title"
  }, s.num), /*#__PURE__*/React.createElement("span", {
    className: "row-sub"
  }, s.title)), /*#__PURE__*/React.createElement("span", {
    className: "row-count"
  }, "\u203A"))))), /*#__PURE__*/React.createElement(BloodPanel, {
    title: "Referenced Places",
    action: `${sessionPlaceIds.length}`
  }, /*#__PURE__*/React.createElement("div", {
    className: "filter-list"
  }, sessionPlaceIds.slice(0, 7).map(id => /*#__PURE__*/React.createElement(EntityButton, {
    key: id,
    id: id,
    onOpen: onOpen,
    onNavigate: onNavigate,
    note: INDEX[id]?.region || kindLabel(INDEX[id]?.kind),
    actionLabel: "open"
  })))), /*#__PURE__*/React.createElement(BloodPanel, {
    title: "Referenced Factions",
    action: `${sessionFactionIds.length}`
  }, /*#__PURE__*/React.createElement("div", {
    className: "filter-list"
  }, sessionFactionIds.slice(0, 7).map(id => /*#__PURE__*/React.createElement(EntityButton, {
    key: id,
    id: id,
    onOpen: onOpen,
    onNavigate: onNavigate,
    note: INDEX[id]?.deity || kindLabel(INDEX[id]?.kind),
    actionLabel: "open"
  })))));
}
function RecapsTab({
  onOpen,
  onNavigate
}) {
  const sessions = DATA.sessions.slice().reverse();
  const openHooks = DATA.hooks.filter(h => h.lane !== "completed");
  const echoes = sessions.filter(s => s.hookQuote).map(s => ({
    text: bgText(s.hookQuote).replace(/^“|”$/g, ""),
    credit: s.hookCredit || s.num,
    sessionId: s.id
  }));
  return /*#__PURE__*/React.createElement("div", {
    className: "container"
  }, /*#__PURE__*/React.createElement(PageHead, {
    title: "Recaps",
    subtitle: "Session archive",
    kicker: DATA.meta.currentArc
  }), /*#__PURE__*/React.createElement("div", {
    className: "blood-page"
  }, /*#__PURE__*/React.createElement(LeftFilters, {
    onOpen: onOpen,
    onNavigate: onNavigate
  }), /*#__PURE__*/React.createElement("section", {
    className: "codex-main"
  }, /*#__PURE__*/React.createElement("div", {
    className: "recap-tools"
  }, /*#__PURE__*/React.createElement("span", {
    className: "row-count"
  }, sessions.length, " recaps found"), /*#__PURE__*/React.createElement("span", null, "Newest first")), /*#__PURE__*/React.createElement("div", {
    className: "recap-grid"
  }, sessions.map((s, i) => {
    const ids = sessionMentionIds(s, 4);
    return /*#__PURE__*/React.createElement("article", {
      key: s.id,
      className: "blood-frame recap-card",
      onClick: () => onNavigate && onNavigate("notes", s.id)
    }, /*#__PURE__*/React.createElement("div", {
      className: "recap-art"
    }, /*#__PURE__*/React.createElement("span", null, String(s.num).match(/\d+/)?.[0] || "✦")), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
      className: "recap-meta"
    }, s.num, " \xB7 ", renderText(s.when, {
      onOpen
    })), /*#__PURE__*/React.createElement("h2", {
      className: "recap-title"
    }, s.title), /*#__PURE__*/React.createElement("p", {
      className: "recap-text"
    }, renderText(s.recap, {
      onOpen
    })), /*#__PURE__*/React.createElement("div", {
      className: "chip-row"
    }, ids.map(id => /*#__PURE__*/React.createElement(Chip, {
      key: id
    }, INDEX[id] ? entityName(INDEX[id]) : id)))));
  }))), /*#__PURE__*/React.createElement("div", {
    className: "side-stack"
  }, /*#__PURE__*/React.createElement(BloodPanel, {
    title: "Most Referenced"
  }, /*#__PURE__*/React.createElement(TopReferenced, {
    onOpen: onOpen,
    onNavigate: onNavigate
  })), /*#__PURE__*/React.createElement(BloodPanel, {
    title: "Unresolved Hooks",
    action: `${openHooks.length}`
  }, openHooks.slice(0, 6).map(h => {
    const target = (h.tags || []).find(id => INDEX[id]);
    return /*#__PURE__*/React.createElement("button", {
      className: "question-row question-button",
      key: h.id,
      disabled: !target,
      onClick: () => target && onNavigate && onNavigate(target)
    }, /*#__PURE__*/React.createElement("span", {
      className: "row-title"
    }, plainText(h.title)), /*#__PURE__*/React.createElement("span", {
      className: "row-sub"
    }, (h.tags || []).map(id => INDEX[id] ? entityName(INDEX[id]) : id).join(" · ")));
  })), /*#__PURE__*/React.createElement(BloodPanel, {
    title: "Session Echoes"
  }, /*#__PURE__*/React.createElement(QuoteList, {
    quotes: echoes,
    onOpen: onOpen,
    onNavigate: onNavigate
  })))));
}
function NotesTab({
  onOpen,
  onNavigate,
  focusSessionId
}) {
  const latestId = DATA.sessions[DATA.sessions.length - 1].id;
  const [active, setActive] = useState(focusSessionId || latestId);
  const [expandedSessionId, setExpandedSessionId] = useState(null);
  useEffect(() => {
    if (focusSessionId) {
      setActive(focusSessionId);
      setExpandedSessionId(null);
    }
  }, [focusSessionId]);
  const selected = DATA.sessions.find(s => s.id === active) || DATA.sessions[DATA.sessions.length - 1];
  const clues = allSessionClues(selected, 10);
  const mentions = sessionMentionIds(selected, 10);
  const relatedHooks = DATA.hooks.filter(h => (h.tags || []).some(id => mentions.includes(id))).slice(0, 6);
  const displaySessions = DATA.sessions.slice().reverse();
  const sessionBadge = s => String(s.num || "").replace(/^Session\s*/i, "") || "?";
  const selectSession = id => {
    setActive(id);
    setExpandedSessionId(null);
  };
  const toggleSession = id => {
    setActive(id);
    setExpandedSessionId(expandedSessionId === id ? null : id);
  };
  const renderSessionCard = s => {
    const sessionIsExpanded = expandedSessionId === s.id;
    const cardEntries = sessionEntries(s);
    const transcriptText = TRANSCRIPTS[s.id] || "";
    return /*#__PURE__*/React.createElement("article", {
      key: s.id,
      className: `blood-frame notes-overview-card${sessionIsExpanded ? " notes-overview-open" : ""}`,
      role: "button",
      tabIndex: 0,
      "aria-expanded": sessionIsExpanded,
      onClick: () => toggleSession(s.id),
      onKeyDown: e => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          toggleSession(s.id);
        }
      }
    }, /*#__PURE__*/React.createElement("div", {
      className: "recap-meta"
    }, s.num, " \xB7 ", renderText(s.when, {
      onOpen
    })), /*#__PURE__*/React.createElement("h2", {
      className: "recap-title"
    }, s.title), /*#__PURE__*/React.createElement("p", {
      className: "notes-card-recap"
    }, renderText(sessionIsExpanded ? s.recap : clipText(s.recap, 360), {
      onOpen
    })), /*#__PURE__*/React.createElement("div", {
      className: "notes-expand-cue"
    }, sessionIsExpanded ? "Collapse session" : "Expand session", " \xB7 ", cardEntries.length, " scenes", transcriptText ? " \xB7 Transcript ready" : ""), sessionIsExpanded && s.hookQuote && /*#__PURE__*/React.createElement("blockquote", {
      className: "bs-pull",
      style: {
        marginBottom: 0
      }
    }, renderText(s.hookQuote, {
      onOpen
    }), /*#__PURE__*/React.createElement("span", {
      className: "bs-pull-credit"
    }, renderText(s.hookCredit, {
      onOpen
    }))), sessionIsExpanded && /*#__PURE__*/React.createElement("div", {
      className: "scene-timeline"
    }, cardEntries.map((e, i) => /*#__PURE__*/React.createElement("article", {
      key: i,
      className: "blood-frame scene-row"
    }, /*#__PURE__*/React.createElement("div", {
      className: "scene-num"
    }, String(i + 1).padStart(2, "0")), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h3", {
      className: "scene-title"
    }, e.title), e.loc && /*#__PURE__*/React.createElement("div", {
      className: "scene-loc"
    }, renderText(e.loc, {
      onOpen
    })), /*#__PURE__*/React.createElement("div", {
      className: "scene-copy"
    }, (e.prose?.length ? e.prose : [e.body]).filter(Boolean).map((p, j) => /*#__PURE__*/React.createElement("p", {
      key: j
    }, renderText(p, {
      onOpen
    })))), e.atmosphere?.length || e.reveals?.length || e.consequences?.length ? /*#__PURE__*/React.createElement("div", {
      className: "scene-bullets"
    }, [...(e.atmosphere || []), ...(e.reveals || []), ...(e.consequences || [])].slice(0, 10).map((b, j) => /*#__PURE__*/React.createElement("div", {
      className: "scene-bullet",
      key: j
    }, /*#__PURE__*/React.createElement("span", {
      className: "scene-bullet-text"
    }, renderText(b, {
      onOpen
    }))))) : null)))), sessionIsExpanded && transcriptText && /*#__PURE__*/React.createElement("details", {
      className: "transcript-shell",
      onClick: e => e.stopPropagation()
    }, /*#__PURE__*/React.createElement("summary", null, /*#__PURE__*/React.createElement("span", null, "Expanded cleaned transcript record"), /*#__PURE__*/React.createElement("span", {
      className: "transcript-meta"
    }, "Open full text")), /*#__PURE__*/React.createElement("div", {
      className: "transcript-note"
    }, "Use this as the uncompressed source layer for the session."), /*#__PURE__*/React.createElement("div", {
      className: "transcript-raw"
    }, renderText(transcriptText, {
      onOpen
    }))));
  };
  return /*#__PURE__*/React.createElement("div", {
    className: "container"
  }, /*#__PURE__*/React.createElement(PageHead, {
    title: "Session Notes",
    subtitle: "",
    kicker: selected.num
  }), /*#__PURE__*/React.createElement("div", {
    className: "blood-page notes-page"
  }, /*#__PURE__*/React.createElement("aside", {
    className: "side-stack"
  }, /*#__PURE__*/React.createElement(BloodPanel, {
    title: "Sessions",
    action: "Select"
  }, DATA.sessions.slice().reverse().map((s, i) => /*#__PURE__*/React.createElement("button", {
    key: s.id,
    className: "session-pick",
    "aria-selected": selected.id === s.id,
    onClick: () => selectSession(s.id)
  }, /*#__PURE__*/React.createElement(Sigil, null, sessionBadge(s)), /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement("span", {
    className: "row-title"
  }, s.num), /*#__PURE__*/React.createElement("span", {
    className: "row-sub"
  }, s.title)), /*#__PURE__*/React.createElement("span", {
    className: "row-count"
  }, selected.id === s.id ? "OPEN" : "")))), /*#__PURE__*/React.createElement(BloodPanel, {
    title: "Session Links",
    action: `${mentions.length}`
  }, /*#__PURE__*/React.createElement("div", {
    className: "filter-list"
  }, mentions.slice(0, 8).map(id => /*#__PURE__*/React.createElement(EntityButton, {
    key: id,
    id: id,
    onOpen: onOpen,
    onNavigate: onNavigate,
    actionLabel: "open"
  }))))), /*#__PURE__*/React.createElement("section", {
    className: "codex-main"
  }, displaySessions.map(renderSessionCard)), /*#__PURE__*/React.createElement("div", {
    className: "side-stack"
  }, /*#__PURE__*/React.createElement(BloodPanel, {
    title: "Key Clues",
    action: `${clues.length}`
  }, clues.length ? clues.map((c, i) => /*#__PURE__*/React.createElement("div", {
    className: "question-row",
    key: i
  }, "\u2726 ", renderText(c, {
    onOpen
  }))) : /*#__PURE__*/React.createElement("div", {
    className: "question-row"
  }, "No explicit clue list for this session. Read the scene text for embedded signals.")), /*#__PURE__*/React.createElement(BloodPanel, {
    title: "Named Entities",
    action: `${mentions.length}`
  }, /*#__PURE__*/React.createElement("div", {
    className: "entity-list"
  }, mentions.map(id => /*#__PURE__*/React.createElement(EntityButton, {
    key: id,
    id: id,
    onOpen: onOpen,
    onNavigate: onNavigate,
    actionLabel: "open"
  })))), /*#__PURE__*/React.createElement(BloodPanel, {
    title: "Related Hooks",
    action: `${relatedHooks.length}`
  }, relatedHooks.length ? relatedHooks.map(h => {
    const target = (h.tags || []).find(id => INDEX[id]);
    return /*#__PURE__*/React.createElement("button", {
      className: "question-row question-button",
      key: h.id,
      disabled: !target,
      onClick: () => target && onNavigate && onNavigate(target)
    }, /*#__PURE__*/React.createElement("span", {
      className: "row-title"
    }, plainText(h.title)), /*#__PURE__*/React.createElement("span", {
      className: "row-sub"
    }, h.lane, " \xB7 ", h.urgency));
  }) : /*#__PURE__*/React.createElement("div", {
    className: "question-row"
  }, "No hook is directly tagged to the current named entities.")))));
}
function TimelineTab({
  onOpen,
  onNavigate
}) {
  const discoveredIds = [];
  const addUnique = id => {
    if (INDEX[id] && !discoveredIds.includes(id)) discoveredIds.push(id);
  };
  DATA.sessions.slice().reverse().forEach(s => sessionMentionIds(s, 20).forEach(addUnique));
  const echoes = DATA.sessions.filter(s => s.hookQuote).map(s => ({
    text: bgText(s.hookQuote).replace(/^“|”$/g, ""),
    credit: s.hookCredit || s.num,
    sessionId: s.id
  }));
  const sessionGroups = DATA.sessions.map((s, sessionIndex) => {
    const entries = timelineEntries(s);
    return {
      session: s,
      sessionIndex,
      events: entries.map((entry, eventIndex) => {
        const body = entry.body || s.recap;
        const mentionIds = collectEntityIds([entry.title, entry.loc, body].filter(Boolean).join(" "), 4);
        return {
          eventIndex,
          title: entry.title || `Event ${eventIndex + 1}`,
          loc: entry.loc || s.when || s.arc,
          body,
          mentionIds
        };
      })
    };
  });
  return /*#__PURE__*/React.createElement("div", {
    className: "container"
  }, /*#__PURE__*/React.createElement(PageHead, {
    title: "Timeline",
    subtitle: "Important events across the campaign",
    kicker: "Chronology"
  }), /*#__PURE__*/React.createElement("div", {
    className: "blood-page timeline-page"
  }, /*#__PURE__*/React.createElement("aside", {
    className: "side-stack"
  }, /*#__PURE__*/React.createElement(BloodPanel, {
    title: "Recent Session Links",
    action: `${discoveredIds.length}`
  }, /*#__PURE__*/React.createElement("div", {
    className: "entity-list"
  }, discoveredIds.slice(0, 7).map(id => /*#__PURE__*/React.createElement(EntityButton, {
    key: id,
    id: id,
    onOpen: onOpen,
    onNavigate: onNavigate,
    note: clipText(INDEX[id].body || INDEX[id].role || INDEX[id].region, 54),
    actionLabel: "open"
  })))), /*#__PURE__*/React.createElement(BloodPanel, {
    title: "Timeline Index"
  }, DATA.sessions.map((s, i) => /*#__PURE__*/React.createElement("button", {
    className: "filter-row",
    key: s.id,
    onClick: () => onNavigate && onNavigate("notes", s.id)
  }, /*#__PURE__*/React.createElement(Sigil, null, String(i + 1).padStart(2, "0")), /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement("span", {
    className: "row-title"
  }, s.num), /*#__PURE__*/React.createElement("span", {
    className: "row-sub"
  }, s.title)), /*#__PURE__*/React.createElement("span", {
    className: "row-count"
  }, "\u203A"))))), /*#__PURE__*/React.createElement("section", {
    className: "codex-main"
  }, /*#__PURE__*/React.createElement("div", {
    className: "timeline-spine",
    "aria-label": "Campaign event timeline"
  }, sessionGroups.map(group => {
    const s = group.session;
    const sessionNo = String(group.sessionIndex + 1).padStart(2, "0");
    return /*#__PURE__*/React.createElement("section", {
      key: s.id,
      className: "timeline-session",
      "aria-labelledby": `timeline-session-${s.id}`
    }, /*#__PURE__*/React.createElement("div", {
      className: "timeline-session-break"
    }, /*#__PURE__*/React.createElement("span", {
      className: "timeline-session-knot"
    }, sessionNo), /*#__PURE__*/React.createElement("div", {
      className: "timeline-session-copy"
    }, /*#__PURE__*/React.createElement("div", {
      className: "timeline-session-label"
    }, s.num, " \xB7 ", s.when || s.arc), /*#__PURE__*/React.createElement("h2", {
      id: `timeline-session-${s.id}`
    }, s.title), /*#__PURE__*/React.createElement("p", null, renderText(clipText(s.recap, 150), {
      onOpen
    }))), /*#__PURE__*/React.createElement("button", {
      className: "timeline-session-open",
      onClick: () => onNavigate && onNavigate("notes", s.id)
    }, group.events.length, " events \u00B7 Open notes")), /*#__PURE__*/React.createElement("div", {
      className: "timeline-events"
    }, group.events.map(event => {
      const side = event.eventIndex % 2 === 0 ? "left" : "right";
      return /*#__PURE__*/React.createElement("article", {
        key: `${s.id}-${event.eventIndex}`,
        className: `timeline-event timeline-event-${side} timeline-clickable`,
        tabIndex: 0,
        "aria-label": `${s.num}: ${plainText(event.title)}`
      }, /*#__PURE__*/React.createElement("div", {
        className: "timeline-event-stem",
        "aria-hidden": "true"
      }), /*#__PURE__*/React.createElement("div", {
        className: "timeline-event-dot",
        "aria-hidden": "true"
      }), /*#__PURE__*/React.createElement("div", {
        className: "timeline-event-summary"
      }, /*#__PURE__*/React.createElement("div", {
        className: "timeline-index"
      }, s.num, " \xB7 Event ", event.eventIndex + 1), /*#__PURE__*/React.createElement("h3", {
        className: "timeline-title"
      }, event.title)), /*#__PURE__*/React.createElement("div", {
        className: "timeline-event-detail"
      }, event.loc && /*#__PURE__*/React.createElement("div", {
        className: "timeline-date"
      }, renderText(event.loc, {
        autoLink: false,
        onOpen
      })), /*#__PURE__*/React.createElement("div", {
        className: "timeline-body"
      }, renderText(event.body, {
        onOpen
      })), event.mentionIds.length > 0 && /*#__PURE__*/React.createElement("div", {
        className: "timeline-event-links"
      }, event.mentionIds.map(id => /*#__PURE__*/React.createElement("button", {
        key: id,
        className: "timeline-event-chip",
        onClick: e => {
          e.stopPropagation();
          onNavigate && onNavigate(id);
        }
      }, entityName(INDEX[id])))), /*#__PURE__*/React.createElement("button", {
        className: "timeline-event-open",
        onClick: () => onNavigate && onNavigate("notes", s.id)
      }, "Open full notes")));
    })));
  }))), /*#__PURE__*/React.createElement("div", {
    className: "side-stack"
  }, /*#__PURE__*/React.createElement(BloodPanel, {
    title: "Cross-Linked Entities"
  }, /*#__PURE__*/React.createElement(TopReferenced, {
    onOpen: onOpen,
    onNavigate: onNavigate
  })), /*#__PURE__*/React.createElement(BloodPanel, {
    title: "Session Echoes"
  }, /*#__PURE__*/React.createElement(QuoteList, {
    quotes: echoes,
    onOpen: onOpen,
    onNavigate: onNavigate
  })))));
}
function sectionList(section) {
  const sec = CMP_SECTIONS.find(s => s.id === section) || CMP_SECTIONS[0];
  return sec.getList();
}
function CompendiumTab({
  onOpen,
  onNavigate,
  initialSection,
  focusId,
  onClearFocus
}) {
  const [section, setSection] = useState(initialSection || "characters");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  useEffect(() => {
    if (initialSection) setSection(initialSection);
  }, [initialSection]);
  if (focusId && INDEX[focusId]) return /*#__PURE__*/React.createElement(DossierPage, {
    entity: INDEX[focusId],
    onOpen: onOpen,
    onBack: onClearFocus,
    onNavigate: onNavigate
  });
  const list = sectionList(section);
  const q = query.trim().toLowerCase();
  const filtered = q ? list.filter(x => [entityName(x), x.alt, x.role, x.body, x.region, x.type].filter(Boolean).join(" ").toLowerCase().includes(q)) : list;
  const selected = INDEX[selectedId] && filtered.includes(INDEX[selectedId]) ? INDEX[selectedId] : filtered[0];
  const related = selected ? [...(selected.relationships || selected.rel || [])].slice(0, 5).map(([id]) => id).filter(id => INDEX[id]) : [];
  return /*#__PURE__*/React.createElement("div", {
    className: "container"
  }, /*#__PURE__*/React.createElement(PageHead, {
    title: "Compendium",
    subtitle: "Characters, Places, Factions, Items",
    kicker: "Archive"
  }), /*#__PURE__*/React.createElement("div", {
    className: "blood-page cmp-layout"
  }, /*#__PURE__*/React.createElement("aside", {
    className: "side-stack"
  }, /*#__PURE__*/React.createElement(BloodPanel, {
    title: "Browse"
  }, /*#__PURE__*/React.createElement("div", {
    className: "cmp-toolbar"
  }, /*#__PURE__*/React.createElement("div", {
    className: "cmp-tabs",
    role: "tablist"
  }, CMP_SECTIONS.map(s => /*#__PURE__*/React.createElement("button", {
    key: s.id,
    className: "cmp-tab",
    "aria-selected": section === s.id,
    onClick: () => {
      setSection(s.id);
      setSelectedId(null);
    }
  }, s.label, /*#__PURE__*/React.createElement("span", {
    className: "row-count"
  }, s.getList().length)))), /*#__PURE__*/React.createElement("input", {
    className: "cmp-search",
    value: query,
    onChange: e => setQuery(e.target.value),
    placeholder: `Search ${section}…`
  }))), /*#__PURE__*/React.createElement(BloodPanel, {
    title: "Entries",
    action: `${filtered.length} shown`
  }, /*#__PURE__*/React.createElement("div", {
    className: "entity-list"
  }, filtered.map(ent => /*#__PURE__*/React.createElement("button", {
    key: ent.id,
    className: "entity-row",
    "aria-selected": selected?.id === ent.id,
    onClick: () => onNavigate && onNavigate(ent.id)
  }, /*#__PURE__*/React.createElement(EntitySigil, {
    ent: ent
  }), /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement("span", {
    className: "row-title"
  }, entityName(ent)), /*#__PURE__*/React.createElement("span", {
    className: "row-sub"
  }, ent.role || ent.region || ent.type || kindLabel(ent.kind))), /*#__PURE__*/React.createElement("span", {
    className: "row-count"
  }, "open")))))), /*#__PURE__*/React.createElement("section", {
    className: "codex-main"
  }, selected ? /*#__PURE__*/React.createElement("article", {
    className: "blood-frame cmp-feature cmp-clickable",
    role: "button",
    tabIndex: 0,
    onClick: () => onNavigate && onNavigate(selected.id),
    onKeyDown: e => {
      if ((e.key === "Enter" || e.key === " ") && onNavigate) {
        e.preventDefault();
        onNavigate(selected.id);
      }
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(EntitySigil, {
    ent: selected,
    className: "big-sigil"
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "recap-meta"
  }, kindLabel(selected.kind)), /*#__PURE__*/React.createElement("h2", null, entityName(selected)), selected.alt && /*#__PURE__*/React.createElement("div", {
    className: "dossier-alt"
  }, "\u201C", selected.alt, "\u201D"), selected.role && /*#__PURE__*/React.createElement("div", {
    className: "dossier-role-big"
  }, renderText(selected.role, {
    onOpen
  })), /*#__PURE__*/React.createElement("p", {
    style: {
      color: "var(--ink-1)",
      lineHeight: 1.65
    }
  }, renderText(firstParagraph(selected.body || selected.role || ""), {
    onOpen
  })), /*#__PURE__*/React.createElement("div", {
    className: "chip-row"
  }, (selected.facts || []).slice(0, 5).map(([k, v]) => /*#__PURE__*/React.createElement(Chip, {
    key: k
  }, k, ": ", clipText(String(v).replace(/\{[^}]+\}/g, ""), 24)))), /*#__PURE__*/React.createElement("span", {
    className: "icon-btn",
    "aria-hidden": "true",
    style: {
      marginTop: "1rem"
    }
  }, "Open full entry \u203A"))) : /*#__PURE__*/React.createElement(BloodPanel, null, "No matching entries."), /*#__PURE__*/React.createElement("div", {
    className: "cmp-grid"
  }, filtered.map(ent => /*#__PURE__*/React.createElement("article", {
    key: ent.id,
    className: "blood-frame cmp-card cmp-clickable",
    role: "button",
    tabIndex: 0,
    "aria-selected": selected?.id === ent.id,
    onClick: () => onNavigate && onNavigate(ent.id),
    onKeyDown: e => {
      if ((e.key === "Enter" || e.key === " ") && onNavigate) {
        e.preventDefault();
        onNavigate(ent.id);
      }
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "cmp-card-title"
  }, entityName(ent)), /*#__PURE__*/React.createElement("div", {
    className: "cmp-card-sub"
  }, ent.role || ent.region || ent.type || kindLabel(ent.kind)), /*#__PURE__*/React.createElement("div", {
    className: "cmp-card-body"
  }, renderText(firstParagraph(ent.body || ""), {
    onOpen
  })), /*#__PURE__*/React.createElement("span", {
    className: "cmp-open-link",
    "aria-hidden": "true"
  }, "Open full entry"))))), /*#__PURE__*/React.createElement("div", {
    className: "side-stack"
  }, /*#__PURE__*/React.createElement(BloodPanel, {
    title: "Related Entries",
    action: "Open dossier"
  }, /*#__PURE__*/React.createElement("div", {
    className: "entity-list"
  }, (related.length ? related : ["caspian", "zaren", "mara", "mervel"]).filter(id => INDEX[id]).map(id => /*#__PURE__*/React.createElement(EntityButton, {
    key: id,
    id: id,
    onOpen: onOpen,
    onNavigate: onNavigate,
    actionLabel: "open"
  })))), /*#__PURE__*/React.createElement(BloodPanel, {
    title: "Active Cross-Links",
    action: "Direct links"
  }, /*#__PURE__*/React.createElement("div", {
    className: "mini-list"
  }, (related.length ? related : ["penance", "construct", "flame"]).filter(id => INDEX[id]).slice(0, 4).map(id => /*#__PURE__*/React.createElement("button", {
    className: "mini-row",
    key: id,
    onClick: e => {
      e.stopPropagation();
      onNavigate && onNavigate(id);
    }
  }, /*#__PURE__*/React.createElement(EntitySigil, {
    ent: INDEX[id]
  }), /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement("span", {
    className: "row-title"
  }, entityName(INDEX[id])), /*#__PURE__*/React.createElement("span", {
    className: "row-sub"
  }, kindLabel(INDEX[id].kind))), /*#__PURE__*/React.createElement("span", {
    className: "row-count"
  }, "open"))))))));
}
function DossierPage({
  entity,
  onOpen,
  onBack,
  onNavigate
}) {
  const e = entity;
  const facts = e.facts || [];
  const rels = e.relationships || e.rel || [];
  const appearsIn = DATA.sessions.filter(s => bodyMentions([s.recap, s.title, ...(s.beats || []).map(b => b.body), ...(s.scenes || []).flatMap(sc => [sc.title, sc.loc, ...(sc.prose || [])])].join(" "), e));
  return /*#__PURE__*/React.createElement("div", {
    className: "container"
  }, /*#__PURE__*/React.createElement("button", {
    className: "dossier-back",
    onClick: onBack
  }, "\u2039 Back to compendium"), /*#__PURE__*/React.createElement("div", {
    className: "blood-page dossier-page-new"
  }, /*#__PURE__*/React.createElement("aside", {
    className: "side-stack"
  }, /*#__PURE__*/React.createElement(BloodPanel, {
    title: "Dossier Sigil"
  }, /*#__PURE__*/React.createElement(EntitySigil, {
    ent: e,
    className: "big-sigil"
  }), /*#__PURE__*/React.createElement("ul", {
    className: "dossier-facts"
  }, e.status && /*#__PURE__*/React.createElement("li", null, /*#__PURE__*/React.createElement("span", {
    className: "k"
  }, "Status"), /*#__PURE__*/React.createElement("span", {
    className: "v"
  }, /*#__PURE__*/React.createElement(StatusPill, {
    status: e.status
  }))), e.player && /*#__PURE__*/React.createElement("li", null, /*#__PURE__*/React.createElement("span", {
    className: "k"
  }, "Player"), /*#__PURE__*/React.createElement("span", {
    className: "v"
  }, e.player)), e.class && /*#__PURE__*/React.createElement("li", null, /*#__PURE__*/React.createElement("span", {
    className: "k"
  }, "Class"), /*#__PURE__*/React.createElement("span", {
    className: "v"
  }, e.class)), e.region && /*#__PURE__*/React.createElement("li", null, /*#__PURE__*/React.createElement("span", {
    className: "k"
  }, "Region"), /*#__PURE__*/React.createElement("span", {
    className: "v"
  }, renderText(e.region, {
    onOpen
  }))), e.type && /*#__PURE__*/React.createElement("li", null, /*#__PURE__*/React.createElement("span", {
    className: "k"
  }, "Type"), /*#__PURE__*/React.createElement("span", {
    className: "v"
  }, e.type)), e.holder && /*#__PURE__*/React.createElement("li", null, /*#__PURE__*/React.createElement("span", {
    className: "k"
  }, "Held by"), /*#__PURE__*/React.createElement("span", {
    className: "v"
  }, renderText(e.holder, {
    onOpen
  }))), e.deity && /*#__PURE__*/React.createElement("li", null, /*#__PURE__*/React.createElement("span", {
    className: "k"
  }, "Aligned"), /*#__PURE__*/React.createElement("span", {
    className: "v"
  }, renderText(e.deity, {
    onOpen
  }))), facts.map(([k, v], i) => /*#__PURE__*/React.createElement("li", {
    key: i
  }, /*#__PURE__*/React.createElement("span", {
    className: "k"
  }, k), /*#__PURE__*/React.createElement("span", {
    className: "v"
  }, renderText(v, {
    onOpen
  }))))))), /*#__PURE__*/React.createElement("section", {
    className: "blood-frame dossier-main"
  }, /*#__PURE__*/React.createElement("div", {
    className: "recap-meta"
  }, kindLabel(e.kind)), /*#__PURE__*/React.createElement("h1", null, entityName(e)), e.alt && /*#__PURE__*/React.createElement("div", {
    className: "dossier-alt"
  }, "\u201C", e.alt, "\u201D"), e.role && /*#__PURE__*/React.createElement("div", {
    className: "dossier-role-big"
  }, renderText(e.role, {
    onOpen
  })), /*#__PURE__*/React.createElement("div", {
    className: "dossier-prose"
  }, (e.body || "").split(/\n\n/).map((p, i) => /*#__PURE__*/React.createElement("p", {
    key: i
  }, renderText(p, {
    onOpen
  })))), rels.length > 0 && /*#__PURE__*/React.createElement(RelationshipGraph, {
    entity: e,
    onOpen: id => onNavigate && onNavigate(id)
  })), /*#__PURE__*/React.createElement("div", {
    className: "side-stack"
  }, /*#__PURE__*/React.createElement(BloodPanel, {
    title: "Related Entries",
    action: "Open dossier"
  }, /*#__PURE__*/React.createElement("div", {
    className: "entity-list"
  }, rels.slice(0, 6).filter(([id]) => INDEX[id]).map(([id, note]) => /*#__PURE__*/React.createElement(EntityButton, {
    key: id,
    id: id,
    onOpen: onOpen,
    onNavigate: onNavigate,
    note: note,
    actionLabel: "open"
  })))), /*#__PURE__*/React.createElement(BloodPanel, {
    title: "Appears In",
    action: `${appearsIn.length}`
  }, appearsIn.slice(0, 6).map(s => /*#__PURE__*/React.createElement("button", {
    key: s.id,
    className: "entity-row",
    onClick: () => onNavigate && onNavigate("notes", s.id)
  }, /*#__PURE__*/React.createElement(Sigil, null, String(s.num).match(/\d+/)?.[0] || "S"), /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement("span", {
    className: "row-title"
  }, s.num), /*#__PURE__*/React.createElement("span", {
    className: "row-sub"
  }, s.title)), /*#__PURE__*/React.createElement("span", {
    className: "row-count"
  }, "\u203A")))))));
}
function HooksTab({
  onOpen,
  onNavigate
}) {
  const immediate = DATA.hooks.filter(h => h.lane !== "completed" && h.urgency === "high");
  const active = DATA.hooks.filter(h => h.lane === "active" && h.urgency !== "high");
  const whispered = DATA.hooks.filter(h => h.lane === "whispered");
  const completed = DATA.hooks.filter(h => h.lane === "completed");
  const lanes = [{
    id: "immediate",
    label: "Immediate",
    hooks: immediate
  }, {
    id: "active",
    label: "Active",
    hooks: active
  }, {
    id: "whispered",
    label: "Whispered",
    hooks: whispered
  }, {
    id: "completed",
    label: "Resolved",
    hooks: completed
  }];
  const tagCounts = {};
  DATA.hooks.filter(h => h.lane !== "completed").forEach(h => (h.tags || []).forEach(id => {
    if (INDEX[id]) tagCounts[id] = (tagCounts[id] || 0) + 1;
  }));
  const tagRows = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]).slice(0, 7);
  const sessionEchoes = DATA.sessions.filter(s => s.hookQuote).slice().reverse().map(s => ({
    text: bgText(s.hookQuote).replace(/^“|”$/g, ""),
    credit: s.hookCredit || s.num,
    sessionId: s.id
  }));
  return /*#__PURE__*/React.createElement("div", {
    className: "container"
  }, /*#__PURE__*/React.createElement(PageHead, {
    title: "Hooks & Missions",
    subtitle: "Unresolved leads and completed threads",
    kicker: DATA.meta.status
  }), /*#__PURE__*/React.createElement("div", {
    className: "blood-page hooks-page"
  }, /*#__PURE__*/React.createElement("section", {
    className: "codex-main"
  }, /*#__PURE__*/React.createElement("div", {
    className: "mission-board"
  }, lanes.map(l => /*#__PURE__*/React.createElement("div", {
    key: l.id,
    className: "blood-frame mission-column",
    "data-lane": l.id
  }, /*#__PURE__*/React.createElement("div", {
    className: "mission-column-title"
  }, "\u2727 ", l.label, " ", /*#__PURE__*/React.createElement("span", {
    className: "row-count"
  }, l.hooks.length)), l.hooks.map((h, i) => {
    const target = (h.tags || []).find(id => INDEX[id]);
    return /*#__PURE__*/React.createElement("div", {
      key: h.id,
      className: "blood-frame mission-card mission-clickable",
      role: "button",
      tabIndex: target ? 0 : -1,
      "aria-disabled": !target,
      "aria-label": plainText(h.title),
      onClick: () => target && onNavigate && onNavigate(target),
      onKeyDown: e => {
        if (target && (e.key === "Enter" || e.key === " ") && onNavigate) {
          e.preventDefault();
          onNavigate(target);
        }
      }
    }, /*#__PURE__*/React.createElement("h3", null, plainText(h.title)), /*#__PURE__*/React.createElement("p", null, plainText(h.body)), h.urgency && h.urgency !== "—" && /*#__PURE__*/React.createElement("div", {
      className: "priority-stars"
    }, "Priority: ", h.urgency), /*#__PURE__*/React.createElement(MentionIcons, {
      ids: h.tags || [],
      onOpen: onOpen,
      onNavigate: onNavigate
    }));
  }))))), /*#__PURE__*/React.createElement("div", {
    className: "side-stack"
  }, /*#__PURE__*/React.createElement(BloodPanel, {
    title: "Open Thread Tags",
    action: `${tagRows.length}`
  }, /*#__PURE__*/React.createElement("div", {
    className: "entity-list"
  }, tagRows.map(([id, count]) => /*#__PURE__*/React.createElement(EntityButton, {
    key: id,
    id: id,
    onOpen: onOpen,
    onNavigate: onNavigate,
    count: count,
    actionLabel: "open"
  })))), /*#__PURE__*/React.createElement(BloodPanel, {
    title: "High Priority",
    action: `${immediate.length}`
  }, immediate.map(h => {
    const target = (h.tags || []).find(id => INDEX[id]);
    return /*#__PURE__*/React.createElement("button", {
      className: "question-row question-button",
      key: h.id,
      disabled: !target,
      onClick: () => target && onNavigate && onNavigate(target)
    }, /*#__PURE__*/React.createElement("span", {
      className: "row-title"
    }, plainText(h.title)), /*#__PURE__*/React.createElement("span", {
      className: "row-sub"
    }, (h.tags || []).map(id => INDEX[id] ? entityName(INDEX[id]) : id).join(" · ")));
  })), /*#__PURE__*/React.createElement(BloodPanel, {
    title: "Session Echoes"
  }, /*#__PURE__*/React.createElement(QuoteList, {
    quotes: sessionEchoes,
    onOpen: onOpen,
    onNavigate: onNavigate
  })))));
}
function Hero({
  onNavigate,
  onOpen
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "container"
  }, /*#__PURE__*/React.createElement(PageHead, {
    title: "Codex",
    subtitle: "Blood of the Enemy",
    kicker: DATA.meta.status
  }));
}
function BrandSigil() {
  return /*#__PURE__*/React.createElement("svg", {
    className: "brand-sigil",
    viewBox: "0 0 64 64",
    "aria-hidden": "true"
  }, /*#__PURE__*/React.createElement("defs", null, /*#__PURE__*/React.createElement("radialGradient", {
    id: "bloodglassBrand",
    cx: "50%",
    cy: "50%",
    r: "50%"
  }, /*#__PURE__*/React.createElement("stop", {
    offset: "0%",
    stopColor: "var(--ink-0)",
    stopOpacity: ".95"
  }), /*#__PURE__*/React.createElement("stop", {
    offset: "42%",
    stopColor: "var(--aether)",
    stopOpacity: ".55"
  }), /*#__PURE__*/React.createElement("stop", {
    offset: "100%",
    stopColor: "var(--aether)",
    stopOpacity: "0"
  }))), /*#__PURE__*/React.createElement("circle", {
    cx: "32",
    cy: "32",
    r: "30",
    fill: "url(#bloodglassBrand)",
    opacity: ".35"
  }), /*#__PURE__*/React.createElement("g", {
    fill: "none",
    stroke: "var(--gold)",
    strokeWidth: "1.2",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M32 3 L39 24 L61 32 L39 40 L32 61 L25 40 L3 32 L25 24 Z"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M32 13 L36 28 L51 32 L36 36 L32 51 L28 36 L13 32 L28 28 Z",
    stroke: "var(--aether)"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "32",
    cy: "32",
    r: "7"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M9 16 L22 21 M55 15 L43 22 M12 51 L24 42 M51 52 L42 42",
    opacity: ".6"
  })));
}
function applyTweaks() {
  const root = document.documentElement;
  root.setAttribute("data-theme", "bloodglass");
  root.setAttribute("data-fonts", "bloodglass");
  root.setAttribute("data-density", "codex");
}
function TweaksPanel() {
  return null;
}
function App() {
  const [tab, setTab] = useState(() => {
    const urlTab = new URLSearchParams(window.location.search).get("tab");
    if (urlTab && TABS.some(t => t.id === urlTab)) return urlTab;
    try {
      return localStorage.getItem("bote:tab") || "recaps";
    } catch {
      return "recaps";
    }
  });
  const [focusDossier, setFocusDossier] = useState(null);
  const [focusSession, setFocusSession] = useState(null);
  const [cmpSection, setCmpSection] = useState("characters");
  const [popover, setPopover] = useState(null);
  const [cmdkOpen, setCmdkOpen] = useState(false);
  useEffect(() => {
    applyTweaks();
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem("bote:tab", tab);
    } catch {}
  }, [tab]);
  useEffect(() => {
    if (tab !== "compendium") setFocusDossier(null);
    if (tab !== "notes") setFocusSession(null);
    setPopover(null);
  }, [tab]);
  useEffect(() => {
    const onKey = e => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCmdkOpen(o => !o);
      } else if (e.key === "/" && !["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName)) {
        e.preventDefault();
        setCmdkOpen(true);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
  const openPopover = useCallback((id, anchor) => {
    if (!id || !INDEX[id]) return;
    const rect = anchor?.getBoundingClientRect ? anchor.getBoundingClientRect() : anchor || {
      top: window.innerHeight / 2,
      bottom: window.innerHeight / 2,
      left: window.innerWidth / 2
    };
    setPopover({
      id,
      rect
    });
  }, []);
  const closePopover = () => setPopover(null);
  const navigateToEntity = useCallback(id => {
    closePopover();
    const ent = INDEX[id];
    if (!ent) return;
    if (ent.kind === "session") {
      setTab("notes");
      setFocusSession(id);
      window.scrollTo({
        top: 0
      });
      return;
    }
    if (ent.kind === "hook") {
      setTab("hooks");
      window.scrollTo({
        top: 0
      });
      return;
    }
    const kindToSection = {
      pc: "characters",
      npc: "characters",
      place: "places",
      faction: "factions",
      item: "items",
      term: "terms"
    };
    const section = kindToSection[ent.kind];
    if (section) {
      setCmpSection(section);
      setTab("compendium");
      setFocusDossier(id);
      window.scrollTo({
        top: 0
      });
    }
  }, []);
  const navigate = useCallback((target, extra) => {
    closePopover();
    if (target === "notes") {
      setTab("notes");
      if (extra) setFocusSession(extra);
      window.scrollTo({
        top: 0
      });
      return;
    }
    if (typeof target === "string" && target.startsWith("notes:")) {
      setTab("notes");
      setFocusSession(target.slice(6));
      window.scrollTo({
        top: 0
      });
      return;
    }
    if (TABS.find(t => t.id === target)) {
      setTab(target);
      setFocusDossier(null);
      setFocusSession(null);
      window.scrollTo({
        top: 0
      });
      return;
    }
    if (INDEX[target]) navigateToEntity(target);
  }, [navigateToEntity]);
  const onCmdKPick = it => {
    setCmdkOpen(false);
    if (it.id.startsWith("session:")) navigate("notes:" + it.id.slice(8));else if (it.id.startsWith("hook:")) {
      setTab("hooks");
      window.scrollTo({
        top: 0
      });
    } else navigateToEntity(it.id);
  };
  return /*#__PURE__*/React.createElement("div", {
    className: "shell"
  }, /*#__PURE__*/React.createElement("header", {
    className: "header"
  }, /*#__PURE__*/React.createElement("div", {
    className: "header-inner"
  }, /*#__PURE__*/React.createElement("div", {
    className: "brand"
  }, /*#__PURE__*/React.createElement(BrandSigil, null), /*#__PURE__*/React.createElement("div", {
    className: "brand-wordmark"
  }, /*#__PURE__*/React.createElement("div", {
    className: "brand-sub"
  }, "Blood of the Enemy"), /*#__PURE__*/React.createElement("div", {
    className: "brand-title"
  }, ["C", "O", "D", "E", "X"].map(letter => /*#__PURE__*/React.createElement("span", {
    key: letter
  }, letter))))), /*#__PURE__*/React.createElement("div", {
    className: "header-spacer"
  })), /*#__PURE__*/React.createElement("nav", {
    className: "tabs",
    role: "tablist"
  }, /*#__PURE__*/React.createElement("div", {
    className: "tabs-inner"
  }, TABS.map(t => /*#__PURE__*/React.createElement("button", {
    key: t.id,
    id: `tab-${t.id}`,
    className: "tab-btn",
    role: "tab",
    "aria-selected": tab === t.id,
    "aria-controls": `panel-${t.id}`,
    onClick: () => {
      setTab(t.id);
      setFocusDossier(null);
      setFocusSession(null);
      window.scrollTo({
        top: 0
      });
    }
  }, t.label))), /*#__PURE__*/React.createElement("button", {
    className: "search-btn nav-search-btn",
    onClick: () => setCmdkOpen(true),
    "aria-label": "Search"
  }, /*#__PURE__*/React.createElement(SearchIcon, null), /*#__PURE__*/React.createElement("span", {
    className: "search-label"
  }, "Search the Codex\u2026"), /*#__PURE__*/React.createElement("kbd", null, "\u2318K")))), /*#__PURE__*/React.createElement("main", {
    role: "tabpanel",
    id: `panel-${tab}`,
    "aria-labelledby": `tab-${tab}`
  }, tab === "recaps" && /*#__PURE__*/React.createElement(RecapsTab, {
    onOpen: openPopover,
    onNavigate: navigate
  }), tab === "notes" && /*#__PURE__*/React.createElement(NotesTab, {
    onOpen: openPopover,
    onNavigate: navigate,
    focusSessionId: focusSession
  }), tab === "timeline" && /*#__PURE__*/React.createElement(TimelineTab, {
    onOpen: openPopover,
    onNavigate: navigate
  }), tab === "compendium" && /*#__PURE__*/React.createElement(CompendiumTab, {
    onOpen: openPopover,
    onNavigate: navigate,
    initialSection: cmpSection,
    focusId: focusDossier,
    onClearFocus: () => setFocusDossier(null)
  }), tab === "hooks" && /*#__PURE__*/React.createElement(HooksTab, {
    onOpen: openPopover,
    onNavigate: navigate
  })), /*#__PURE__*/React.createElement(Popover, {
    state: popover,
    onClose: closePopover,
    onNavigate: navigateToEntity
  }), /*#__PURE__*/React.createElement(CmdK, {
    open: cmdkOpen,
    onClose: () => setCmdkOpen(false),
    onPick: onCmdKPick
  }));
}
Object.assign(window, {
  App,
  RecapsTab,
  NotesTab,
  TimelineTab,
  CompendiumTab,
  DossierPage,
  HooksTab,
  Hero,
  BrandSigil,
  CmdK,
  applyTweaks,
  TweaksPanel
});

// Mount
const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(/*#__PURE__*/React.createElement(App, null));
