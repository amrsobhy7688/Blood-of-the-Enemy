(function(){
  try {
    const { data, INDEX } = window.BOTE || {};
    if (!data || !INDEX) return;
    const tokenRe = /\{([a-zA-Z0-9]+)\}/g;
    const groups = ["pcs","npcs","places","factions","items","terms","sessions","hooks"];
    const issues = [];
    const scan = (value, path) => {
      if (typeof value === "string") {
        let m;
        while ((m = tokenRe.exec(value)) !== null) {
          if (!INDEX[m[1]]) issues.push(`Missing ref ${m[1]} at ${path}`);
        }
        tokenRe.lastIndex = 0;
      } else if (Array.isArray(value)) {
        value.forEach((item, i) => scan(item, `${path}[${i}]`));
      } else if (value && typeof value === "object") {
        Object.entries(value).forEach(([k, v]) => scan(v, `${path}.${k}`));
      }
    };
    const checkId = (id, path) => {
      if (id && !INDEX[id]) issues.push(`Missing linked id ${id} at ${path}`);
    };
    groups.forEach(group => (data[group] || []).forEach((entry, i) => {
      const path = `${group}[${i}]`;
      scan(entry, path);
      (entry.relationships || entry.rel || []).forEach((rel, j) => checkId(rel?.[0], `${path}.relationships[${j}]`));
      (entry.tags || []).forEach((id, j) => checkId(id, `${path}.tags[${j}]`));
    }));
    if (issues.length) console.warn("[BOTE QA] Broken references detected", issues);
    else console.log("[BOTE QA] Reference validation passed.");
  } catch (err) {
    console.warn("[BOTE QA] Validation failed", err);
  }
})();
